/**
 * 物料查询 · AI 识图云函数
 *
 * 作用：接收小程序上传的物料照片，调用「OpenAI 兼容」的视觉大模型，
 *       把照片中的物料号 / 名称 / 型号 / 品牌等信息识别成结构化字段返回。
 *
 * 调用方式（小程序端）：
 *   wx.cloud.callFunction({
 *     name: 'ai-material',
 *     data: { action: 'recognize', fileID: 'cloud://xxx.jpg' }   // 或 image: '<base64>'
 *   })
 *
 * 返回：
 *   { ok: true,  data: { code, name, series, mtype, model, brand, location, keywords, rawText, confidence } }
 *   { ok: false, code: 'NO_AI_KEY' | 'NO_IMAGE' | 'DOWNLOAD_FAILED' | 'MODEL_HTTP_ERROR' | 'TIMEOUT' | 'BAD_MODEL_OUTPUT', message }
 *
 * 环境变量（在云函数控制台「配置」里设置，切勿写进代码或仓库）：
 *   AI_API_KEY  必填，视觉模型的 API Key
 *   AI_BASE_URL 可选，默认 https://open.bigmodel.cn/api/paas/v4（智谱）
 *   AI_MODEL    可选，默认 glm-4v-flash（免费视觉模型）；也可换 qwen-vl 等兼容模型
 */

const cloud = require('wx-server-sdk');

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_MODEL = 'glm-4v-flash';
const REQUEST_TIMEOUT = 30000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB，超出直接拒绝，避免无谓的费用与超时

const SYSTEM_PROMPT = [
  '你是仓库物料识别助手。用户会发来一张物料照片（物料本体、铭牌、标签或条码均可）。',
  '请完成两件事：',
  '1. 转录照片中可见的全部文字到 rawText，特别注意物料号/料号/编号、名称、型号规格、品牌厂家、序列号；',
  '2. 根据画面内容推断结构化字段，无法确定的字段留空字符串，绝对不要编造。',
  '只输出 JSON，不要输出任何解释或 Markdown 代码块以外的内容，格式如下：',
  '{',
  '  "code": "物料号/料号，没有则为空字符串",',
  '  "name": "物料名称",',
  '  "series": "系列/大类",',
  '  "mtype": "类型/小类",',
  '  "model": "型号/规格",',
  '  "brand": "品牌/厂家",',
  '  "location": "照片中出现的库位/位置文字，没有则为空字符串",',
  '  "keywords": ["3-6 个有助于检索的关键词，如材质、电压等级、结构特征"],',
  '  "rawText": "照片中识别到的文字转录",',
  '  "confidence": 0 到 1 之间的小数，表示对整体识别的信心',
  '}'
].join('\n');

const https = require('https');
const { URL } = require('url');

/** 极简 https POST（JSON），带超时；云函数零第三方依赖 */
function postJSON(urlString, headers, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (e) {
      reject(new Error('AI_BASE_URL 不是合法 URL'));
      return;
    }
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers
      },
      timeout: timeoutMs
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode || 0, text });
      });
    });
    req.on('timeout', () => req.destroy(new Error('TIMEOUT')));
    req.on('error', err => reject(err));
    req.write(body);
    req.end();
  });
}

/** 从模型输出里抠出 JSON：容忍 ```json 围栏与前后废话 */
function extractJSON(content) {
  const text = String(content || '').trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

function normalizeResult(parsed, fallbackText) {
  const data = parsed && typeof parsed === 'object' ? parsed : {};
  const str = v => (v == null ? '' : String(v).trim());
  const keywords = Array.isArray(data.keywords)
    ? data.keywords.map(str).filter(Boolean).slice(0, 8)
    : [];
  let confidence = Number(data.confidence);
  if (!isFinite(confidence) || confidence < 0 || confidence > 1) confidence = 0;
  return {
    code: str(data.code),
    name: str(data.name),
    series: str(data.series),
    mtype: str(data.mtype),
    model: str(data.model),
    brand: str(data.brand),
    location: str(data.location),
    keywords,
    rawText: str(data.rawText) || str(fallbackText),
    confidence
  };
}

exports.main = async (event = {}) => {
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

  const action = event.action || 'recognize';
  if (action !== 'recognize') {
    return { ok: false, code: 'BAD_ACTION', message: `不支持的动作：${action}` };
  }

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      code: 'NO_AI_KEY',
      message: '云函数未配置 AI_API_KEY，请在云开发控制台为该云函数配置环境变量后重试'
    };
  }

  // 1. 取图片 base64
  let base64 = '';
  let mime = 'image/jpeg';
  if (event.fileID) {
    try {
      const res = await cloud.downloadFile({ fileID: event.fileID });
      const buffer = res.fileContent;
      if (!buffer || !buffer.length) {
        return { ok: false, code: 'DOWNLOAD_FAILED', message: '云存储文件为空或已删除' };
      }
      if (buffer.length > MAX_IMAGE_BYTES) {
        return { ok: false, code: 'IMAGE_TOO_LARGE', message: '图片超过 4MB，请压缩后重试' };
      }
      base64 = buffer.toString('base64');
    } catch (e) {
      return { ok: false, code: 'DOWNLOAD_FAILED', message: '下载云存储图片失败：' + (e.message || e) };
    }
  } else if (event.image) {
    base64 = String(event.image).replace(/^data:image\/\w+;base64,/, '');
    if (!base64) {
      return { ok: false, code: 'NO_IMAGE', message: '图片内容为空' };
    }
    if (base64.length * 0.75 > MAX_IMAGE_BYTES) {
      return { ok: false, code: 'IMAGE_TOO_LARGE', message: '图片超过 4MB，请压缩后重试' };
    }
  } else {
    return { ok: false, code: 'NO_IMAGE', message: '缺少参数：fileID 或 image' };
  }

  // 2. 调用视觉模型（OpenAI 兼容 chat/completions）
  const baseURL = (process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = process.env.AI_MODEL || DEFAULT_MODEL;
  const payload = {
    model,
    temperature: 0.1,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          { type: 'text', text: '请识别这张物料照片，按系统要求输出 JSON。' }
        ]
      }
    ]
  };

  let response;
  try {
    response = await postJSON(
      `${baseURL}/chat/completions`,
      { Authorization: `Bearer ${apiKey}` },
      payload,
      REQUEST_TIMEOUT
    );
  } catch (e) {
    if (e && e.message === 'TIMEOUT') {
      return { ok: false, code: 'TIMEOUT', message: '模型响应超时（30s），请重试或更换更清晰的图片' };
    }
    return { ok: false, code: 'NETWORK_ERROR', message: '调用模型服务失败：' + (e.message || e) };
  }

  if (response.status < 200 || response.status >= 300) {
    let detail = response.text.slice(0, 300);
    try {
      const errJson = JSON.parse(response.text);
      if (errJson && errJson.error && errJson.error.message) detail = errJson.error.message;
    } catch (e) { /* 保留原文 */ }
    return {
      ok: false,
      code: 'MODEL_HTTP_ERROR',
      message: `模型服务返回 ${response.status}：${detail}`
    };
  }

  let content = '';
  try {
    const json = JSON.parse(response.text);
    content = json.choices && json.choices[0] && json.choices[0].message
      ? (json.choices[0].message.content || '')
      : '';
  } catch (e) {
    return { ok: false, code: 'BAD_MODEL_OUTPUT', message: '模型返回内容无法解析：' + response.text.slice(0, 200) };
  }

  const parsed = extractJSON(content);
  if (!parsed) {
    // 模型没按 JSON 输出：把原文交回去，前端仍可展示并人工填写
    return { ok: true, data: normalizeResult(null, content), parseFailed: true };
  }
  return { ok: true, data: normalizeResult(parsed, content) };
};

// 暴露内部纯函数供离线自测（云函数平台只使用 exports.main，无副作用）
module.exports.extractJSON = extractJSON;
module.exports.normalizeResult = normalizeResult;

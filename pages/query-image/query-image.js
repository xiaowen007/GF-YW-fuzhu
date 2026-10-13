const materials = require('../../utils/materials.js');
const roles = require('../../utils/material-roles.js');

const HISTORY_KEY = 'material_ai_history';
const HISTORY_LIMIT = 10;

function readHistory() {
  try {
    return wx.getStorageSync(HISTORY_KEY) || [];
  } catch (e) {
    return [];
  }
}

function writeHistory(list) {
  wx.setStorageSync(HISTORY_KEY, list);
  return list;
}

/** 用识别结果拼出的检索关键词（名称 + 型号 + 关键词 chips） */
function buildKeyword(result) {
  if (!result) return '';
  return [result.name, result.model].concat(result.keywords || []).filter(Boolean).join(' ');
}

Page({
  data: {
    imagePath: '',
    recognizing: false,
    recognizeTip: '',
    result: null,
    parseFailed: false,
    showRaw: false,
    keywordInput: '',
    matched: [],
    matchedTotal: 0,
    history: [],
    canWrite: false,
    cloudReady: false
  },

  onLoad() {
    const app = getApp();
    this.setData({
      canWrite: roles.canWrite(),
      cloudReady: !!(app && app.globalData && app.globalData.cloudInitialized),
      history: readHistory()
    });
  },

  onShow() {
    this.setData({ canWrite: roles.canWrite() });
  },

  onUnload() {
    if (this.preMatchTimer) clearTimeout(this.preMatchTimer);
  },

  // =================== 选图 ===================

  async chooseImage(e) {
    const source = e.currentTarget.dataset.source; // camera | album
    try {
      const res = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: [source],
        sizeType: ['compressed']
      });
      const file = res.tempFiles && res.tempFiles[0];
      if (!file) return;
      wx.showLoading({ title: '处理图片中', mask: true });
      const compressed = await materials.compressImage(file.tempFilePath);
      wx.hideLoading();
      this.setData({
        imagePath: compressed,
        result: null,
        parseFailed: false,
        matched: [],
        matchedTotal: 0
      });
    } catch (err) {
      wx.hideLoading();
      // 用户取消选择不提示
    }
  },

  clearImage() {
    this.setData({ imagePath: '', result: null, parseFailed: false, matched: [], matchedTotal: 0 });
  },

  // =================== AI 识别 ===================

  async recognize() {
    if (!this.data.imagePath || this.data.recognizing) return;
    this.setData({
      recognizing: true,
      recognizeTip: '正在准备图片…',
      result: null,
      parseFailed: false,
      matched: [],
      matchedTotal: 0
    });
    try {
      const payload = await this.buildRequest();
      this.setData({ recognizeTip: 'AI 识别中，通常需要 3-15 秒…' });
      const res = await wx.cloud.callFunction({
        name: 'ai-material',
        data: Object.assign({ action: 'recognize' }, payload)
      });
      const body = res && res.result;
      if (!body || body.ok !== true) {
        this.showRecognizeError(body);
        return;
      }
      this.applyResult(body.data, !!body.parseFailed);
    } catch (err) {
      const msg = (err && err.message) || '';
      if (!this.data.cloudReady || /cloud|init|env/i.test(msg)) {
        wx.showModal({
          title: '无法调用云函数',
          content: 'AI 识图依赖微信云开发。请到「设置-云端同步」填写云环境 ID 并上传部署 ai-material 云函数；未配置前也可先在下方手动填写字段查询物料。',
          showCancel: false
        });
      } else {
        wx.showToast({ title: '识别失败：' + msg, icon: 'none' });
      }
    } finally {
      this.setData({ recognizing: false, recognizeTip: '' });
    }
  },

  /** 优先上传云存储换 fileID 调云函数；未配云环境或上传失败时降级直接传 base64 */
  async buildRequest() {
    if (this.data.cloudReady) {
      try {
        this.setData({ recognizeTip: '正在上传图片…' });
        const ext = /\.png/i.test(this.data.imagePath) ? 'png' : 'jpg';
        const up = await wx.cloud.uploadFile({
          cloudPath: `material-ai/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
          filePath: this.data.imagePath
        });
        if (up && up.fileID) return { fileID: up.fileID };
      } catch (e) {
        // 云存储不可用（未开通 / 无权限）时降级 base64
      }
    }
    const base64 = await this.readBase64(this.data.imagePath);
    if (!base64) throw new Error('读取图片失败');
    // 云函数单次调用体上限约 1MB，base64 会膨胀 1/3，超限直接提示换图
    if (base64.length * 0.75 > 900 * 1024) {
      throw new Error('图片过大（超过约 900KB），请裁剪或更换更小的图片');
    }
    return { image: base64 };
  },

  readBase64(filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath,
        encoding: 'base64',
        success: r => resolve(r.data),
        fail: reject
      });
    });
  },

  applyResult(data, parseFailed) {
    const result = {
      code: (data && data.code) || '',
      name: (data && data.name) || '',
      series: (data && data.series) || '',
      mtype: (data && data.mtype) || '',
      model: (data && data.model) || '',
      brand: (data && data.brand) || '',
      location: (data && data.location) || '',
      keywords: ((data && data.keywords) || []).slice(0, 8),
      rawText: (data && data.rawText) || '',
      confidence: data && typeof data.confidence === 'number' ? data.confidence : 0
    };
    this.setData({ result, parseFailed: !!parseFailed });
    this.runPreMatch(result);
    this.saveHistory(result);
  },

  showRecognizeError(body) {
    const code = body && body.code;
    const messages = {
      NO_AI_KEY: '云函数未配置 AI_API_KEY。请在微信云开发控制台 → 云函数 ai-material → 配置 中新增环境变量 AI_API_KEY（视觉模型密钥，如智谱 glm-4v-flash）。',
      NO_IMAGE: '没有收到图片，请重新选择后再试',
      IMAGE_TOO_LARGE: '图片过大，请更换更小的图片',
      TIMEOUT: '模型响应超时（30 秒），请重试或换更清晰的图片',
      MODEL_HTTP_ERROR: (body && body.message) || '模型服务返回异常，请检查密钥与模型名',
      BAD_MODEL_OUTPUT: '模型返回内容无法解析，请重试'
    };
    const content = messages[code] || (body && body.message) || '识别失败，请稍后重试';
    wx.showModal({ title: code === 'NO_AI_KEY' ? '需要配置 AI 密钥' : '识别失败', content, showCancel: false });
  },

  // =================== 结果修正与匹配 ===================

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`result.${field}`]: e.detail.value });
    if (this.preMatchTimer) clearTimeout(this.preMatchTimer);
    this.preMatchTimer = setTimeout(() => this.runPreMatch(), 400);
  },

  onKeywordInput(e) {
    this.setData({ keywordInput: e.detail.value });
  },

  addKeyword() {
    const kw = (this.data.keywordInput || '').trim();
    if (!kw || !this.data.result) return;
    const keywords = (this.data.result.keywords || []).slice();
    if (keywords.indexOf(kw) < 0) keywords.push(kw);
    this.setData({ 'result.keywords': keywords, keywordInput: '' });
    this.runPreMatch();
  },

  removeKeyword(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const keywords = (this.data.result.keywords || []).slice();
    keywords.splice(idx, 1);
    this.setData({ 'result.keywords': keywords });
    this.runPreMatch();
  },

  toggleRaw() {
    this.setData({ showRaw: !this.data.showRaw });
  },

  runPreMatch(result) {
    const r = result || this.data.result;
    if (!r) return;
    const matched = materials.smartSearch(buildKeyword(r), {
      code: r.code,
      brand: r.brand,
      model: r.model,
      location: r.location,
      series: r.series,
      mtype: r.mtype,
      pageSize: 5
    });
    this.setData({ matched: matched.list, matchedTotal: matched.total });
  },

  queryMatch() {
    const r = this.data.result;
    if (!r) return;
    const params = [];
    const keyword = buildKeyword(r);
    if (keyword) params.push(`keyword=${encodeURIComponent(keyword)}`);
    if (r.code) params.push(`code=${encodeURIComponent(r.code)}`);
    if (r.brand) params.push(`brand=${encodeURIComponent(r.brand)}`);
    if (r.model) params.push(`model=${encodeURIComponent(r.model)}`);
    if (r.location) params.push(`location=${encodeURIComponent(r.location)}`);
    if (r.series) params.push(`series=${encodeURIComponent(r.series)}`);
    if (r.mtype) params.push(`mtype=${encodeURIComponent(r.mtype)}`);
    if (!params.length) {
      wx.showToast({ title: '请先识别或填写字段', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/query-list/query-list?${params.join('&')}` });
  },

  /** 把识别结果直接存为新物料（物料号已存在则引导去详情） */
  saveAsMaterial() {
    if (!this.data.canWrite) {
      wx.showToast({ title: '需要维护员权限', icon: 'none' });
      return;
    }
    const r = this.data.result;
    if (!r) return;
    if (!r.code.trim()) {
      wx.showToast({ title: '请先填写物料号', icon: 'none' });
      return;
    }
    if (!r.name.trim() && !r.model.trim()) {
      wx.showToast({ title: '请填写名称或型号', icon: 'none' });
      return;
    }
    const existing = materials.getMaterialByCode(r.code.trim());
    if (existing) {
      wx.showModal({
        title: '物料已存在',
        content: `物料号 ${r.code} 已在库中，是否直接打开该物料？`,
        confirmText: '打开',
        success: s => {
          if (s.confirm) {
            wx.navigateTo({ url: `/pages/material-detail/material-detail?id=${existing.id}` });
          }
        }
      });
      return;
    }
    const remark = [r.rawText].concat(r.keywords || []).filter(Boolean).join(' ').slice(0, 500);
    const added = materials.addMaterial({
      code: r.code,
      name: r.name,
      series: r.series,
      mtype: r.mtype,
      model: r.model,
      brand: r.brand,
      location: r.location,
      remark
    });
    if (!added.ok) {
      wx.showToast({ title: added.message, icon: 'none' });
      return;
    }
    wx.showToast({ title: '已入库', icon: 'success' });
    setTimeout(() => {
      wx.navigateTo({ url: `/pages/material-detail/material-detail?id=${added.material.id}` });
    }, 500);
  },

  onMatchedTap(e) {
    const id = e.detail.id;
    materials.addRecent(id);
    wx.navigateTo({ url: `/pages/material-detail/material-detail?id=${id}` });
  },

  // =================== 识别历史 ===================

  async saveHistory(result) {
    let savedImage = '';
    try {
      const saved = await wx.saveFile({ tempFilePath: this.data.imagePath });
      savedImage = saved.savedFilePath || '';
    } catch (e) {
      savedImage = this.data.imagePath;
    }
    const entry = {
      id: `ai_${Date.now().toString(36)}`,
      time: new Date().toISOString(),
      image: savedImage,
      result,
      matchedTotal: this.data.matchedTotal
    };
    const list = readHistory().filter(h => h.id !== entry.id);
    list.unshift(entry);
    const next = list.slice(0, HISTORY_LIMIT);
    writeHistory(next);
    this.setData({ history: next });
  },

  openHistory(e) {
    const id = e.currentTarget.dataset.id;
    const item = readHistory().find(h => h.id === id);
    if (!item) return;
    this.setData({
      result: item.result,
      imagePath: item.image || '',
      parseFailed: false,
      matched: [],
      matchedTotal: 0
    });
    this.runPreMatch();
  },

  clearHistory() {
    wx.showModal({
      title: '清空识别历史',
      content: '仅清空本机的识别记录，不影响物料数据',
      confirmText: '清空',
      confirmColor: '#FF5B5B',
      success: res => {
        if (!res.confirm) return;
        writeHistory([]);
        this.setData({ history: [] });
      }
    });
  }
});

/**
 * 小程序码云函数
 *
 * 作用：调用微信 openapi.wxacode.getUnlimited 生成小程序码（无上限，可带场景值），
 *       存入云存储后返回临时链接，供设置页展示 / 保存 / 分享。
 *
 * 调用方式（小程序端）：
 *   wx.cloud.callFunction({
 *     name: 'getMiniProgramCode',
 *     data: { scene: 'query', page: 'pages/query/query', width: 280 }
 *   })
 *
 * 返回：
 *   { ok: true, url: '<临时链接>', fileID: '<云文件ID>' }
 *   { ok: false, code: 'EMPTY' | 'OPENAPI_ERROR' | 'CALL_FAILED', message }
 *
 * 注意：page 必须是已发布的小程序页面路径；scene 长度不超过 32 字符。
 * 云函数需在微信开发者工具里「上传并部署（云端安装依赖）」。
 */

const cloud = require('wx-server-sdk');

const DEFAULT_PAGE = 'pages/query/query';
const DEFAULT_SCENE = 'query';

exports.main = async (event = {}) => {
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

  const page = String(event.page || DEFAULT_PAGE);
  const scene = String(event.scene || DEFAULT_SCENE).slice(0, 32);
  const width = Math.min(1280, Math.max(100, Number(event.width) || 280));

  try {
    // 1. 生成小程序码（Buffer）
    const res = await cloud.openapi.wxacode.getUnlimited({
      scene,
      page,
      width,
      checkColor: false,
      hyaline: true
    });
    const buffer = res && res.buffer;
    if (!buffer || !buffer.length) {
      const errCode = res && res.errCode;
      return {
        ok: false,
        code: 'OPENAPI_ERROR',
        message: errCode
          ? `小程序码生成失败（errCode ${errCode}），请确认 page 已发布且云开发环境正常`
          : '小程序码生成失败：返回为空'
      };
    }

    // 2. 上传云存储
    const cloudPath = `miniprogram-code/${page.replace(/\//g, '_')}_${scene}_${Date.now()}.png`;
    const up = await cloud.uploadFile({ cloudPath, fileContent: buffer });
    if (!up || !up.fileID) {
      return { ok: false, code: 'CALL_FAILED', message: '云存储上传失败' };
    }

    // 3. 换取临时链接（失败则退回 fileID，前端 <image> 也支持 cloud:// 地址）
    let url = up.fileID;
    try {
      const temp = await cloud.getTempFileURL({ fileList: [up.fileID] });
      const first = temp && temp.fileList && temp.fileList[0];
      if (first && first.tempFileURL) url = first.tempFileURL;
    } catch (e) {
      // 忽略：用 fileID 兜底
    }

    return { ok: true, url, fileID: up.fileID };
  } catch (e) {
    return {
      ok: false,
      code: 'CALL_FAILED',
      message: (e && e.message) || String(e)
    };
  }
};

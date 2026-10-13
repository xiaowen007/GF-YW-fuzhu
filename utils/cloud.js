const DB_COLLECTIONS = {
  scanRecords: 'scan_records',
  generateRecords: 'generate_records',
  inventory: 'inventory_items',
  settings: 'user_settings'
};

function isCloudReady() {
  return getApp().globalData.cloudInitialized;
}

function db() {
  return wx.cloud.database();
}

function ensureCloud() {
  if (!isCloudReady()) {
    throw new Error('云开发未初始化，请先在设置中配置云环境 ID');
  }
}

// =================== 通用同步 ===================
async function syncToCloud(localKey, collectionName, mapFn) {
  ensureCloud();
  const list = wx.getStorageSync(localKey) || [];
  const docs = list.map(mapFn);
  const openid = await getOpenId();

  // 简单全量覆盖：先删后插
  const existing = await db().collection(collectionName).where({ _openid: openid }).get();
  for (const doc of existing.data) {
    await db().collection(collectionName).doc(doc._id).remove();
  }

  for (const doc of docs) {
    await db().collection(collectionName).add({ data: { ...doc, _openid: openid } });
  }
}

async function syncFromCloud(collectionName, localKey, transformFn = d => d) {
  ensureCloud();
  const openid = await getOpenId();
  const res = await db().collection(collectionName).where({ _openid: openid }).get();
  const list = res.data.map(transformFn);
  wx.setStorageSync(localKey, list);
  return list;
}

function getOpenId() {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'login',
      success: res => resolve(res.result.openid),
      fail: reject
    });
  });
}

// =================== 数据同步封装 ===================
async function syncAllToCloud() {
  const storage = require('./storage.js');
  await syncToCloud('scan_records', DB_COLLECTIONS.scanRecords, r => ({
    id: r.id,
    type: r.type,
    code: r.code,
    result: r.result,
    scanType: r.scanType,
    quantity: r.quantity,
    amount: r.amount,
    weight: r.weight,
    createdAt: r.createdAt,
    remark: r.remark
  }));
  await syncToCloud('generate_records', DB_COLLECTIONS.generateRecords, r => ({
    id: r.id,
    type: r.type,
    content: r.content,
    createdAt: r.createdAt
  }));
  await syncToCloud('inventory_items', DB_COLLECTIONS.inventory, r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    quantity: r.quantity,
    threshold: r.threshold,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }));
  await syncToCloud('app_settings', DB_COLLECTIONS.settings, s => ({
    settings: s,
    updatedAt: new Date().toISOString()
  }));
}

async function syncAllFromCloud() {
  await syncFromCloud(DB_COLLECTIONS.scanRecords, 'scan_records');
  await syncFromCloud(DB_COLLECTIONS.generateRecords, 'generate_records');
  await syncFromCloud(DB_COLLECTIONS.inventory, 'inventory_items');
  const settingsRes = await db().collection(DB_COLLECTIONS.settings).limit(1).get();
  if (settingsRes.data.length) {
    wx.setStorageSync('app_settings', settingsRes.data[0].settings);
  }
}

// =================== 文件上传（云盘） ===================
async function uploadFile(filePath, cloudPath) {
  ensureCloud();
  const res = await wx.cloud.uploadFile({
    cloudPath,
    filePath
  });
  return res.fileID;
}

async function downloadFile(fileID) {
  ensureCloud();
  const res = await wx.cloud.downloadFile({ fileID });
  return res.tempFilePath;
}

module.exports = {
  isCloudReady,
  syncAllToCloud,
  syncAllFromCloud,
  uploadFile,
  downloadFile,
  DB_COLLECTIONS
};

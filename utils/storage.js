const SCAN_RECORDS_KEY = 'scan_records';
const GENERATE_RECORDS_KEY = 'generate_records';
const INVENTORY_KEY = 'inventory_items';
const BATCH_FILES_KEY = 'batch_files';
const INVENTORY_SHEETS_KEY = 'inventory_sheets';
const RECYCLE_BIN_KEY = 'recycle_bin';

function getNow() {
  const now = new Date();
  return now.toISOString();
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const M = (d.getMonth() + 1).toString().padStart(2, '0');
  const D = d.getDate().toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${M}-${D} ${h}:${m}`;
}

function uuid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
}

// =================== 扫码记录 ===================
function getScanRecords() {
  try {
    return wx.getStorageSync(SCAN_RECORDS_KEY) || [];
  } catch (e) {
    return [];
  }
}

function addScanRecord(data) {
  const records = getScanRecords();
  const record = {
    id: uuid(),
    type: data.type || 'single',
    code: data.code || '',
    result: data.result || data.code || '',
    scanType: data.scanType || 'QR_CODE',
    quantity: data.quantity || 1,
    amount: data.amount || null,
    weight: data.weight || null,
    createdAt: getNow(),
    remark: data.remark || ''
  };
  records.unshift(record);
  wx.setStorageSync(SCAN_RECORDS_KEY, records);
  return record;
}

function addScanRecords(list) {
  const records = getScanRecords();
  const newRecords = list.map(item => ({
    id: uuid(),
    type: item.type || 'batch',
    code: item.code || '',
    result: item.result || item.code || '',
    scanType: item.scanType || 'QR_CODE',
    quantity: item.quantity || 1,
    createdAt: getNow(),
    remark: item.remark || ''
  }));
  records.unshift(...newRecords);
  wx.setStorageSync(SCAN_RECORDS_KEY, records);
  return newRecords;
}

function deleteScanRecord(id) {
  const records = getScanRecords().filter(r => r.id !== id);
  wx.setStorageSync(SCAN_RECORDS_KEY, records);
}

function clearScanRecords() {
  wx.removeStorageSync(SCAN_RECORDS_KEY);
}

// =================== 生成记录 ===================
function getGenerateRecords() {
  try {
    return wx.getStorageSync(GENERATE_RECORDS_KEY) || [];
  } catch (e) {
    return [];
  }
}

function addGenerateRecord(data) {
  const records = getGenerateRecords();
  const record = {
    id: uuid(),
    type: data.type || 'qrcode',
    content: data.content || '',
    createdAt: getNow()
  };
  records.unshift(record);
  wx.setStorageSync(GENERATE_RECORDS_KEY, records);
  return record;
}

function deleteGenerateRecord(id) {
  const records = getGenerateRecords().filter(r => r.id !== id);
  wx.setStorageSync(GENERATE_RECORDS_KEY, records);
}

function clearGenerateRecords() {
  wx.removeStorageSync(GENERATE_RECORDS_KEY);
}

// =================== 库存物料 ===================
function getInventory() {
  try {
    return wx.getStorageSync(INVENTORY_KEY) || [];
  } catch (e) {
    return [];
  }
}

function addOrUpdateInventory(item) {
  const list = getInventory();
  const idx = list.findIndex(i => i.code === item.code);
  if (idx >= 0) {
    list[idx].quantity = (list[idx].quantity || 0) + (item.quantity || 1);
    list[idx].updatedAt = getNow();
    if (item.name) list[idx].name = item.name;
  } else {
    list.unshift({
      id: uuid(),
      code: item.code,
      name: item.name || item.code,
      quantity: item.quantity || 1,
      threshold: item.threshold || 10,
      createdAt: getNow(),
      updatedAt: getNow()
    });
  }
  wx.setStorageSync(INVENTORY_KEY, list);
  return list;
}

function updateInventoryItem(id, updates) {
  const list = getInventory();
  const idx = list.findIndex(i => i.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...updates, updatedAt: getNow() };
    wx.setStorageSync(INVENTORY_KEY, list);
  }
  return list;
}

function deleteInventoryItem(id) {
  const list = getInventory().filter(i => i.id !== id);
  wx.setStorageSync(INVENTORY_KEY, list);
  return list;
}

function clearInventory() {
  wx.removeStorageSync(INVENTORY_KEY);
}

// =================== 批量扫码文件 ===================
function getBatchFiles() {
  try {
    return wx.getStorageSync(BATCH_FILES_KEY) || [];
  } catch (e) {
    return [];
  }
}

function createBatchFile(name) {
  const files = getBatchFiles();
  const file = {
    id: uuid(),
    name: name || `批量扫码_${formatDate(getNow())}`,
    count: 0,
    pinned: false,
    createdAt: getNow(),
    updatedAt: getNow(),
    records: []
  };
  files.unshift(file);
  wx.setStorageSync(BATCH_FILES_KEY, files);
  return file;
}

function getBatchFile(id) {
  return getBatchFiles().find(f => f.id === id);
}

function updateBatchFile(id, updates) {
  const files = getBatchFiles();
  const idx = files.findIndex(f => f.id === id);
  if (idx >= 0) {
    files[idx] = { ...files[idx], ...updates, updatedAt: getNow() };
    wx.setStorageSync(BATCH_FILES_KEY, files);
  }
  return files;
}

function renameBatchFile(id, name) {
  return updateBatchFile(id, { name });
}

function togglePinBatchFile(id) {
  const files = getBatchFiles();
  const idx = files.findIndex(f => f.id === id);
  if (idx >= 0) {
    files[idx].pinned = !files[idx].pinned;
    wx.setStorageSync(BATCH_FILES_KEY, files);
  }
  return files;
}

function deleteBatchFile(id) {
  const files = getBatchFiles();
  const file = files.find(f => f.id === id);
  if (file) {
    addToRecycleBin({ type: 'batch_file', data: file });
  }
  const list = files.filter(f => f.id !== id);
  wx.setStorageSync(BATCH_FILES_KEY, list);
  return list;
}

function addRecordsToBatchFile(id, records) {
  const files = getBatchFiles();
  const idx = files.findIndex(f => f.id === id);
  if (idx >= 0) {
    const newRecords = records.map(r => ({
      id: uuid(),
      code: r.code || '',
      scanType: r.scanType || 'QR_CODE',
      createdAt: getNow()
    }));
    files[idx].records.unshift(...newRecords);
    files[idx].count = files[idx].records.length;
    files[idx].updatedAt = getNow();
    wx.setStorageSync(BATCH_FILES_KEY, files);
  }
  return files;
}

function clearBatchFiles() {
  wx.removeStorageSync(BATCH_FILES_KEY);
}

// =================== 盘点单 ===================
function getInventorySheets() {
  try {
    return wx.getStorageSync(INVENTORY_SHEETS_KEY) || [];
  } catch (e) {
    return [];
  }
}

function createInventorySheet(name) {
  const sheets = getInventorySheets();
  const sheet = {
    id: uuid(),
    name: name || `盘点单_${formatDate(getNow())}`,
    status: 'pending',
    total: 0,
    scanned: 0,
    pinned: false,
    createdAt: getNow(),
    updatedAt: getNow(),
    items: []
  };
  sheets.unshift(sheet);
  wx.setStorageSync(INVENTORY_SHEETS_KEY, sheets);
  return sheet;
}

function getInventorySheet(id) {
  return getInventorySheets().find(s => s.id === id);
}

function updateInventorySheet(id, updates) {
  const sheets = getInventorySheets();
  const idx = sheets.findIndex(s => s.id === id);
  if (idx >= 0) {
    sheets[idx] = { ...sheets[idx], ...updates, updatedAt: getNow() };
    wx.setStorageSync(INVENTORY_SHEETS_KEY, sheets);
  }
  return sheets;
}

function renameInventorySheet(id, name) {
  return updateInventorySheet(id, { name });
}

function togglePinInventorySheet(id) {
  const sheets = getInventorySheets();
  const idx = sheets.findIndex(s => s.id === id);
  if (idx >= 0) {
    sheets[idx].pinned = !sheets[idx].pinned;
    wx.setStorageSync(INVENTORY_SHEETS_KEY, sheets);
  }
  return sheets;
}

function deleteInventorySheet(id) {
  const sheets = getInventorySheets();
  const sheet = sheets.find(s => s.id === id);
  if (sheet) {
    addToRecycleBin({ type: 'inventory_sheet', data: sheet });
  }
  const list = sheets.filter(s => s.id !== id);
  wx.setStorageSync(INVENTORY_SHEETS_KEY, list);
  return list;
}

function addItemsToInventorySheet(id, items) {
  const sheets = getInventorySheets();
  const idx = sheets.findIndex(s => s.id === id);
  if (idx >= 0) {
    const newItems = items.map(item => ({
      id: uuid(),
      code: item.code || '',
      name: item.name || item.code,
      quantity: item.quantity || 1,
      createdAt: getNow()
    }));
    sheets[idx].items.unshift(...newItems);
    sheets[idx].scanned = sheets[idx].items.length;
    sheets[idx].updatedAt = getNow();
    wx.setStorageSync(INVENTORY_SHEETS_KEY, sheets);
  }
  return sheets;
}

function clearInventorySheets() {
  wx.removeStorageSync(INVENTORY_SHEETS_KEY);
}

// =================== 回收站 ===================
function getRecycleBin() {
  try {
    return wx.getStorageSync(RECYCLE_BIN_KEY) || [];
  } catch (e) {
    return [];
  }
}

function addToRecycleBin(item) {
  const bin = getRecycleBin();
  bin.unshift({
    id: uuid(),
    type: item.type,
    data: item.data,
    deletedAt: getNow()
  });
  wx.setStorageSync(RECYCLE_BIN_KEY, bin);
  return bin;
}

function restoreFromRecycleBin(id) {
  const bin = getRecycleBin();
  const idx = bin.findIndex(i => i.id === id);
  if (idx < 0) return bin;
  const record = bin[idx];
  const files = getBatchFiles();
  const sheets = getInventorySheets();
  if (record.type === 'batch_file') {
    files.unshift(record.data);
    wx.setStorageSync(BATCH_FILES_KEY, files);
  } else if (record.type === 'inventory_sheet') {
    sheets.unshift(record.data);
    wx.setStorageSync(INVENTORY_SHEETS_KEY, sheets);
  }
  const list = bin.filter(i => i.id !== id);
  wx.setStorageSync(RECYCLE_BIN_KEY, list);
  return list;
}

function clearRecycleBin() {
  wx.removeStorageSync(RECYCLE_BIN_KEY);
}

// =================== 导出 ===================
function exportAllData() {
  return {
    scanRecords: getScanRecords(),
    generateRecords: getGenerateRecords(),
    inventory: getInventory(),
    batchFiles: getBatchFiles(),
    inventorySheets: getInventorySheets(),
    recycleBin: getRecycleBin(),
    settings: wx.getStorageSync('app_settings') || {},
    exportedAt: getNow()
  };
}

module.exports = {
  getScanRecords,
  addScanRecord,
  addScanRecords,
  deleteScanRecord,
  clearScanRecords,
  getGenerateRecords,
  addGenerateRecord,
  deleteGenerateRecord,
  clearGenerateRecords,
  getInventory,
  addOrUpdateInventory,
  updateInventoryItem,
  deleteInventoryItem,
  clearInventory,
  // 批量文件
  getBatchFiles,
  createBatchFile,
  getBatchFile,
  updateBatchFile,
  renameBatchFile,
  togglePinBatchFile,
  deleteBatchFile,
  addRecordsToBatchFile,
  clearBatchFiles,
  // 盘点单
  getInventorySheets,
  createInventorySheet,
  getInventorySheet,
  updateInventorySheet,
  renameInventorySheet,
  togglePinInventorySheet,
  deleteInventorySheet,
  addItemsToInventorySheet,
  clearInventorySheets,
  // 回收站
  getRecycleBin,
  restoreFromRecycleBin,
  clearRecycleBin,
  // 通用
  exportAllData,
  formatDate,
  uuid,
  getNow
};

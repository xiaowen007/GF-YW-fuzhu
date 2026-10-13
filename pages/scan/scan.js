const storage = require('../../utils/storage.js');

const MODE_CONFIG = {
  single: { title: '单次扫码', desc: '识别后自动保存并进入详情' },
  continuous: { title: '连续扫码', desc: '连续识别，结果自动累计' },
  batch: { title: '批量扫码', desc: '批量扫描后统一保存' },
  image: { title: '图片批量解码', desc: '从相册导入图片识别条码' },
  inventory: { title: '扫码录入库存', desc: '扫描物料条码录入或增加库存' }
};

Page({
  data: {
    mode: 'single',
    modeTitle: '单次扫码',
    modeDesc: '',
    showCamera: true,
    results: [],
    images: [],
    decodeResults: []
  },

  onLoad(options) {
    const mode = options.mode || 'single';
    const config = MODE_CONFIG[mode] || MODE_CONFIG.single;
    wx.setNavigationBarTitle({ title: config.title });
    this.setData({
      mode,
      modeTitle: config.title,
      modeDesc: config.desc
    });
  },

  onScanCode(e) {
    const { type, result } = e.detail;
    if (!result) return;

    if (this.data.mode === 'single') {
      storage.addScanRecord({ code: result, scanType: type, type: 'single' });
      wx.showModal({
        title: '识别成功',
        content: result,
        showCancel: false,
        success: () => wx.navigateBack()
      });
      return;
    }

    if (this.data.mode === 'inventory') {
      storage.addOrUpdateInventory({ code: result, quantity: 1 });
      wx.showToast({ title: '库存已更新', icon: 'success' });
      return;
    }

    // continuous / batch
    const exists = this.data.results.some(r => r.code === result);
    if (exists) {
      wx.showToast({ title: '已存在', icon: 'none' });
      return;
    }
    const newItem = { id: storage.uuid(), code: result, scanType: type };
    this.setData({ results: [newItem, ...this.data.results] });
    wx.showToast({ title: '已识别', icon: 'success' });
  },

  scanWithSystem() {
    wx.scanCode({
      success: (res) => {
        this.onScanCode({ detail: { type: res.scanType, result: res.result } });
      }
    });
  },

  toggleCamera() {
    this.setData({ showCamera: !this.data.showCamera });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        const images = res.tempFiles.map(f => f.tempFilePath);
        this.setData({ images });
        this.decodeImages(images);
      }
    });
  },

  decodeImages(images) {
    // 小程序无原生图片条码识别 API，这里用系统扫码兜底展示流程
    const decodeResults = images.map((img, idx) => ({
      id: storage.uuid(),
      code: `图片${idx + 1}_待识别`,
      type: 'IMAGE',
      path: img
    }));
    this.setData({ decodeResults });
    wx.showModal({
      title: '提示',
      content: '图片批量解码需要接入后端OCR/条码识别服务，当前为演示占位。',
      showCancel: false
    });
  },

  clearResults() {
    this.setData({ results: [] });
  },

  saveResults() {
    if (this.data.results.length === 0) {
      wx.showToast({ title: '没有可保存的结果', icon: 'none' });
      return;
    }
    storage.addScanRecords(this.data.results.map(r => ({ code: r.code, scanType: r.scanType, type: this.data.mode })));
    wx.showToast({ title: '保存成功', icon: 'success' });
    this.setData({ results: [] });
    setTimeout(() => wx.navigateBack(), 800);
  }
});

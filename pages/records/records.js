const storage = require('../../utils/storage.js');

Page({
  data: {
    type: 'scan',
    pageTitle: '扫码记录',
    records: []
  },

  onLoad(options) {
    const type = options.type || 'scan';
    this.setData({
      type,
      pageTitle: type === 'generate' ? '生成记录' : '扫码记录'
    });
    wx.setNavigationBarTitle({ title: this.data.pageTitle });
  },

  onShow() {
    this.loadRecords();
  },

  loadRecords() {
    let records = [];
    if (this.data.type === 'generate') {
      records = storage.getGenerateRecords();
    } else {
      records = storage.getScanRecords();
    }
    this.setData({ records });
  },

  deleteRecord(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.type === 'generate') {
      storage.deleteGenerateRecord(id);
    } else {
      storage.deleteScanRecord(id);
    }
    this.loadRecords();
  },

  clearAll() {
    wx.showModal({
      title: '确认清空',
      content: '清空后无法恢复，是否继续？',
      success: (res) => {
        if (res.confirm) {
          if (this.data.type === 'generate') {
            storage.clearGenerateRecords();
          } else {
            storage.clearScanRecords();
          }
          this.loadRecords();
        }
      }
    });
  }
});

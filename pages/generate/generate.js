const storage = require('../../utils/storage.js');

Page({
  data: {
    type: 'qrcode',
    content: '',
    generated: false,
    qrImage: '',
    quickTags: ['https://', 'SN', 'ITEM-', 'WMS-', 'TEMP-']
  },

  onLoad(options) {
    if (options.type === 'barcode' || options.type === 'qrcode') {
      this.setData({ type: options.type });
    }
  },

  switchType(e) {
    this.setData({ type: e.currentTarget.dataset.type, generated: false });
  },

  onInput(e) {
    this.setData({ content: e.detail.value });
  },

  fillTag(e) {
    this.setData({ content: this.data.content + e.currentTarget.dataset.text });
  },

  generate() {
    const { content, type } = this.data;
    if (!content.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    if (type === 'qrcode') {
      // 使用微信小程序二维码生成 API（服务端能力）或占位图
      this.setData({
        generated: true,
        qrImage: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(content)}`
      });
    } else {
      this.setData({ generated: true });
    }
  },

  saveRecord() {
    if (!this.data.generated) return;
    storage.addGenerateRecord({ type: this.data.type, content: this.data.content });
    wx.showToast({ title: '保存成功', icon: 'success' });
  }
});

Page({
  data: {
    labelA: '',
    labelB: '',
    match: null
  },

  onInputA(e) {
    this.setData({ labelA: e.detail.value, match: null });
  },

  onInputB(e) {
    this.setData({ labelB: e.detail.value, match: null });
  },

  scanA() {
    this.scan('labelA');
  },

  scanB() {
    this.scan('labelB');
  },

  scan(field) {
    wx.scanCode({
      success: (res) => {
        this.setData({ [field]: res.result, match: null });
      }
    });
  },

  compare() {
    const { labelA, labelB } = this.data;
    if (!labelA || !labelB) {
      wx.showToast({ title: '请先输入两个标签', icon: 'none' });
      return;
    }
    this.setData({ match: labelA.trim() === labelB.trim() });
  },

  reset() {
    this.setData({ labelA: '', labelB: '', match: null });
  }
});

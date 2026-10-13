const storage = require('../../utils/storage.js');

Page({
  data: {
    currentCode: '',
    currentQuantity: '1',
    currentPrice: '',
    currentWeight: '',
    items: [],
    scanCount: 0,
    totalQuantity: 0,
    totalAmount: 0
  },

  onCodeInput(e) { this.setData({ currentCode: e.detail.value }); },
  onQuantityInput(e) { this.setData({ currentQuantity: e.detail.value }); },
  onPriceInput(e) { this.setData({ currentPrice: e.detail.value }); },
  onWeightInput(e) { this.setData({ currentWeight: e.detail.value }); },

  scanCode() {
    wx.scanCode({
      success: (res) => {
        this.setData({ currentCode: res.result });
      }
    });
  },

  addItem() {
    const quantity = parseFloat(this.data.currentQuantity) || 0;
    const price = parseFloat(this.data.currentPrice) || 0;
    const weight = parseFloat(this.data.currentWeight) || 0;
    const amount = quantity * price;

    const item = {
      id: storage.uuid(),
      code: this.data.currentCode,
      quantity,
      price,
      weight,
      amount,
      createdAt: storage.getNow()
    };

    const items = [item, ...this.data.items];
    this.updateSummary(items);
    this.setData({
      items,
      currentCode: '',
      currentQuantity: '1',
      currentPrice: '',
      currentWeight: ''
    });

    storage.addScanRecord({
      code: item.code || '手动录入',
      type: 'accumulate',
      quantity,
      amount,
      weight,
      remark: `累加：数量${quantity} 金额${amount.toFixed(2)}`
    });
  },

  updateSummary(items) {
    const scanCount = items.length;
    const totalQuantity = items.reduce((s, i) => s + i.quantity, 0);
    const totalAmount = items.reduce((s, i) => s + i.amount, 0);
    this.setData({ scanCount, totalQuantity, totalAmount });
  },

  clearAll() {
    this.setData({ items: [], scanCount: 0, totalQuantity: 0, totalAmount: 0 });
  }
});

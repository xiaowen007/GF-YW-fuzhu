const storage = require('../../utils/storage.js');

const ACTION_WIDTH = 360;
const THRESHOLD = 120;

Page({
  data: {
    sheets: [],
    allSheets: [],
    sortDesc: true,
    refreshing: false,
    actionWidth: ACTION_WIDTH,
    startX: 0,
    currentIndex: -1
  },

  onShow() {
    this.loadSheets();
  },

  onPullDownRefresh() {
    this.loadSheets();
    wx.stopPullDownRefresh();
  },

  onRefresh() {
    this.setData({ refreshing: true });
    this.loadSheets();
    setTimeout(() => this.setData({ refreshing: false }), 500);
  },

  loadSheets() {
    let sheets = storage.getInventorySheets();
    sheets = this.sortSheets(sheets);
    sheets = sheets.map(s => ({
      ...s,
      statusText: s.status === 'done' ? '已盘' : '待盘',
      updatedAt: storage.formatDate(s.updatedAt)
    }));
    this.setData({ allSheets: sheets, sheets });
  },

  sortSheets(sheets) {
    const pinned = sheets.filter(s => s.pinned);
    const others = sheets.filter(s => !s.pinned);
    const sortFn = (a, b) => this.data.sortDesc
      ? new Date(b.createdAt) - new Date(a.createdAt)
      : new Date(a.createdAt) - new Date(b.createdAt);
    return [...pinned.sort(sortFn), ...others.sort(sortFn)];
  },

  toggleSort() {
    this.setData({ sortDesc: !this.data.sortDesc }, () => this.loadSheets());
  },

  openTutorial() {
    wx.showModal({
      title: '扫码盘点教程',
      content: '1. 点击底部「+」新建盘点单\n2. 扫描物料条码录入数量\n3. 盘点完成后查看统计',
      showCancel: false
    });
  },

  goPending() {
    const pending = this.data.sheets.filter(s => s.status === 'pending');
    if (pending.length === 0) {
      wx.showToast({ title: '暂无待盘数据', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/scan/scan?mode=inventory&sheetId=${pending[0].id}` });
  },

  goStats() {
    const total = this.data.sheets.reduce((s, i) => s + i.total, 0);
    const scanned = this.data.sheets.reduce((s, i) => s + i.scanned, 0);
    wx.showModal({
      title: '盘点统计',
      content: `盘点单总数：${this.data.sheets.length}\n待盘物料：${total - scanned}\n已盘物料：${scanned}`,
      showCancel: false
    });
  },

  createSheet() {
    wx.showModal({
      title: '新建盘点单',
      content: '',
      editable: true,
      placeholderText: '请输入盘点单名称',
      success: (res) => {
        if (res.confirm) {
          storage.createInventorySheet(res.content);
          this.loadSheets();
        }
      }
    });
  },

  // 左滑操作
  touchStart(e) {
    const index = e.currentTarget.dataset.index;
    const sheets = this.data.sheets.map((s, i) => ({ ...s, translateX: i === this.data.currentIndex ? s.translateX : 0 }));
    this.setData({ startX: e.touches[0].clientX, currentIndex: index, sheets });
  },

  touchMove(e) {
    const moveX = e.touches[0].clientX;
    const deltaX = this.data.startX - moveX;
    if (deltaX > 0) {
      const translateX = Math.min(deltaX, ACTION_WIDTH);
      const sheets = this.data.sheets.map((s, i) => i === this.data.currentIndex ? { ...s, translateX } : s);
      this.setData({ sheets });
    }
  },

  touchEnd() {
    const sheets = this.data.sheets.map((s, i) => {
      if (i === this.data.currentIndex) {
        const x = s.translateX || 0;
        return { ...s, translateX: x > THRESHOLD ? ACTION_WIDTH : 0 };
      }
      return s;
    });
    this.setData({ sheets });
  },

  resetSwipe() {
    const sheets = this.data.sheets.map(s => ({ ...s, translateX: 0 }));
    this.setData({ sheets, currentIndex: -1 });
  },

  pinSheet(e) {
    storage.togglePinInventorySheet(e.currentTarget.dataset.id);
    this.resetSwipe();
    this.loadSheets();
  },

  renameSheet(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '重命名',
      content: name,
      editable: true,
      success: (res) => {
        if (res.confirm && res.content) {
          storage.renameInventorySheet(id, res.content);
          this.loadSheets();
        }
      }
    });
    this.resetSwipe();
  },

  deleteSheet(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除后可在「设置-数据回收」中恢复',
      success: (res) => {
        if (res.confirm) {
          storage.deleteInventorySheet(id);
          this.loadSheets();
        }
      }
    });
    this.resetSwipe();
  }
});

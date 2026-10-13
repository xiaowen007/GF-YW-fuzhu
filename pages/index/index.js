Page({
  data: {
    features: [
      { icon: '⊞', title: '单次扫码', desc: '识别后进入详情', bg: 'linear-gradient(135deg, #C56BF3 0%, #9A4DFF 100%)', url: '/pages/scan/scan?mode=single' },
      { icon: '⇄', title: '连续扫码', desc: '适合高频操作', bg: 'linear-gradient(135deg, #00C853 0%, #009624 100%)', url: '/pages/scan/scan?mode=continuous' },
      { icon: '∞', title: '标签比对', desc: '双标签自动比对', bg: 'linear-gradient(135deg, #FFB300 0%, #FF8F00 100%)', url: '/pages/compare/compare' },
      { icon: '✉', title: '图片批量解码', desc: '导入图片识别', bg: 'linear-gradient(135deg, #29B6F6 0%, #0288D1 100%)', url: '/pages/scan/scan?mode=image' },
      { icon: '▤', title: '扫码累加', desc: '重量数量金额汇总', bg: 'linear-gradient(135deg, #26A69A 0%, #00897B 100%)', url: '/pages/accumulate/accumulate' },
      { icon: '☰', title: '单次扫码记录', desc: '查看单次扫码历史', bg: 'linear-gradient(135deg, #78909C 0%, #546E7A 100%)', url: '/pages/records/records?type=scan' },
      { icon: '▌', title: '条形码生成', desc: '支持自定义内容', bg: 'linear-gradient(135deg, #7C4DFF 0%, #536DFE 100%)', url: '/pages/generate/generate?type=barcode' },
      { icon: '⊕', title: '二维码生成', desc: '适合链接与文本', bg: 'linear-gradient(135deg, #FF6E40 0%, #FF3D00 100%)', url: '/pages/generate/generate?type=qrcode' }
    ],
    queryStat: { total: 0, photos: 0 }
  },

  onLoad() {
    // 首页加载可检查云同步
    this.loadQueryStat();
  },

  onShow() {
    this.loadQueryStat();
  },

  loadQueryStat() {
    try {
      const materials = require('../../utils/materials.js');
      const all = materials.getMaterials();
      this.setData({
        queryStat: {
          total: all.length,
          photos: all.reduce((sum, m) => sum + (m.photos ? m.photos.length : 0), 0)
        }
      });
    } catch (e) {
      // 物料查询模块异常不影响首页其他功能
    }
  },

  onFeatureTap(e) {
    const item = e.currentTarget.dataset.item;
    if (item && item.url) {
      wx.navigateTo({ url: item.url });
    }
  },

  openQuery() {
    wx.navigateTo({ url: '/pages/query/query' });
  },

  openQueryImage() {
    wx.navigateTo({ url: '/pages/query-image/query-image' });
  },

  openQueryFavorites() {
    wx.navigateTo({ url: '/pages/query-list/query-list?mode=favorite' });
  },

  openQueryImport() {
    wx.navigateTo({ url: '/pages/query-import/query-import' });
  },

  goToGenerateRecords() {
    wx.navigateTo({ url: '/pages/records/records?type=generate' });
  }
});

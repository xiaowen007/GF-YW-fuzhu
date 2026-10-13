const materials = require('../../utils/materials.js');
const roles = require('../../utils/material-roles.js');

const PREVIEW_LIMIT = 5;

Page({
  data: {
    keyword: '',
    preview: [],
    previewTotal: 0,
    showPreview: false,
    series: [],
    types: [],
    recent: [],
    favoriteCount: 0,
    totalCount: 0,
    photoCount: 0,
    canWrite: false,
    roleText: '只读成员',
    searchHistory: []
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const all = materials.getMaterials();
    const series = materials.listSeries();
    const types = materials.listTypes();
    this.setData({
      series,
      types,
      recent: materials.decorateList(materials.getRecentMaterials()).slice(0, 10),
      favoriteCount: materials.getFavorites().length,
      totalCount: all.length,
      photoCount: all.reduce((sum, m) => sum + (m.photos ? m.photos.length : 0), 0),
      canWrite: roles.canWrite(),
      roleText: roles.roleText(roles.getMyRole()),
      searchHistory: materials.getSearchHistory()
    });
    if (this.data.keyword) this.runSearch(this.data.keyword);
  },

  onKeywordInput(e) {
    const keyword = e.detail.value;
    this.setData({ keyword });
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.runSearch(keyword), 250);
  },

  onClearKeyword() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.setData({ keyword: '', preview: [], previewTotal: 0, showPreview: false });
  },

  runSearch(keyword) {
    const key = (keyword || '').trim();
    if (!key) {
      this.setData({ preview: [], previewTotal: 0, showPreview: false });
      return;
    }
    const matched = materials.searchMaterials(key);
    this.setData({
      preview: materials.decorateList(matched.slice(0, PREVIEW_LIMIT)),
      previewTotal: matched.length,
      showPreview: true
    });
  },

  submitSearch() {
    const key = this.data.keyword.trim();
    if (!key) {
      wx.showToast({ title: '请输入物料号或关键词', icon: 'none' });
      return;
    }
    materials.addSearchHistory(key);
    this.setData({ searchHistory: materials.getSearchHistory() });
    wx.navigateTo({ url: `/pages/query-list/query-list?keyword=${encodeURIComponent(key)}` });
  },

  /** 点击搜索历史词条：回填并直接出结果 */
  openHistoryItem(e) {
    const keyword = e.currentTarget.dataset.keyword;
    if (!keyword) return;
    this.setData({ keyword });
    this.runSearch(keyword);
  },

  clearHistory() {
    materials.clearSearchHistory();
    this.setData({ searchHistory: [] });
  },

  openImageQuery() {
    wx.navigateTo({ url: '/pages/query-image/query-image' });
  },

  scanCode() {
    wx.scanCode({
      success: (res) => {
        const code = (res.result || '').trim();
        if (!code) return;
        const hit = materials.getMaterialByCode(code);
        if (hit) {
          materials.addRecent(hit.id);
          wx.navigateTo({ url: `/pages/material-detail/material-detail?id=${hit.id}` });
          return;
        }
        wx.navigateTo({ url: `/pages/query-list/query-list?keyword=${encodeURIComponent(code)}` });
      },
      fail: () => {}
    });
  },

  browseSeries(e) {
    const name = e.currentTarget.dataset.name;
    wx.navigateTo({ url: `/pages/query-list/query-list?series=${encodeURIComponent(name)}` });
  },

  browseType(e) {
    const name = e.currentTarget.dataset.name;
    wx.navigateTo({ url: `/pages/query-list/query-list?mtype=${encodeURIComponent(name)}` });
  },

  openAll() {
    wx.navigateTo({ url: '/pages/query-list/query-list' });
  },

  openFavorites() {
    wx.navigateTo({ url: '/pages/query-list/query-list?mode=favorite' });
  },

  openRecent(e) {
    const id = e.currentTarget.dataset.id;
    materials.addRecent(id);
    wx.navigateTo({ url: `/pages/material-detail/material-detail?id=${id}` });
  },

  onPreviewTap(e) {
    const id = e.detail.id;
    materials.addRecent(id);
    wx.navigateTo({ url: `/pages/material-detail/material-detail?id=${id}` });
  },

  createMaterial() {
    if (!roles.canWrite()) {
      wx.showToast({ title: '需要维护员权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/material-edit/material-edit' });
  },

  openImport() {
    if (!roles.canWrite()) {
      wx.showToast({ title: '需要维护员权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/query-import/query-import' });
  },

  openAdmin() {
    wx.navigateTo({ url: '/pages/query-admin/query-admin' });
  }
});

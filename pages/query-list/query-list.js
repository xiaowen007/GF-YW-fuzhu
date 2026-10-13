const materials = require('../../utils/materials.js');
const roles = require('../../utils/material-roles.js');

const PAGE_SIZE = 20;

Page({
  data: {
    mode: 'all',
    keyword: '',
    series: '',
    mtype: '',
    code: '',
    brand: '',
    model: '',
    location: '',
    seriesOptions: [],
    typeOptions: [],
    list: [],
    total: 0,
    page: 1,
    hasMore: false,
    loading: false,
    favoriteOnly: false,
    canWrite: false,
    extraFilter: ''
  },

  onLoad(options) {
    // 小程序框架已对 URL query 自动解码一次，此处不能再 decodeURIComponent，
    // 否则中文关键词（如「断路器」）会被二次解码成乱码。
    this.setData({
      mode: options.mode || 'all',
      keyword: options.keyword || '',
      series: options.series || '',
      mtype: options.mtype || '',
      code: options.code || '',
      brand: options.brand || '',
      model: options.model || '',
      location: options.location || '',
      favoriteOnly: options.mode === 'favorite'
    });
    this.setData({
      seriesOptions: materials.listSeries(),
      typeOptions: materials.listTypes(),
      canWrite: roles.canWrite()
    });
    this.refreshExtraFilter();
  },

  /** 展示来自 URL 的附加精确条件（AI 识别结果带入时） */
  refreshExtraFilter() {
    const parts = [];
    if (this.data.code) parts.push(`物料号含 ${this.data.code}`);
    if (this.data.brand) parts.push(`品牌含 ${this.data.brand}`);
    if (this.data.model) parts.push(`型号含 ${this.data.model}`);
    if (this.data.location) parts.push(`位置含 ${this.data.location}`);
    this.setData({ extraFilter: parts.join(' · ') });
  },

  onShow() {
    this.reload();
    if (!this._shareMenuReady) {
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
      this._shareMenuReady = true;
    }
  },

  onPullDownRefresh() {
    this.reload();
    wx.stopPullDownRefresh();
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.loadMore();
  },

  reload() {
    // 智能搜索：多关键词 AND + 拼音 + 同义词 + 容错，附带 URL 传入的精确字段条件
    const result = materials.smartSearch(this.data.keyword, {
      series: this.data.series,
      mtype: this.data.mtype,
      favoriteOnly: this.data.favoriteOnly,
      code: this.data.code,
      brand: this.data.brand,
      model: this.data.model,
      location: this.data.location,
      pageSize: 0
    });

    this.all = result.list;
    this.setData({
      total: result.total,
      list: result.list.slice(0, PAGE_SIZE),
      page: 1,
      hasMore: result.total > PAGE_SIZE
    });
  },

  loadMore() {
    this.setData({ loading: true });
    const nextPage = this.data.page + 1;
    const list = this.all.slice(0, nextPage * PAGE_SIZE);
    this.setData({
      list,
      page: nextPage,
      hasMore: this.all.length > list.length,
      loading: false
    });
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
    if (this.filterTimer) clearTimeout(this.filterTimer);
    this.filterTimer = setTimeout(() => this.reload(), 250);
  },

  clearKeyword() {
    if (this.filterTimer) clearTimeout(this.filterTimer);
    this.setData({ keyword: '' }, () => this.reload());
  },

  selectSeries(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({ series: this.data.series === name ? '' : name, mtype: '' }, () => this.reload());
  },

  selectType(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({ mtype: this.data.mtype === name ? '' : name }, () => this.reload());
  },

  clearFilter() {
    this.setData({ series: '', mtype: '' }, () => this.reload());
  },

  onItemTap(e) {
    const id = e.detail.id;
    materials.addRecent(id);
    wx.navigateTo({ url: `/pages/material-detail/material-detail?id=${id}` });
  },

  /** 把当前检索条件（关键词 + 系列/类型）作为卡片转发给同事 */
  onShareAppMessage() {
    const { keyword, series, mtype, total } = this.data;
    const parts = [];
    if (keyword) parts.push(keyword);
    if (series) parts.push(series);
    if (mtype) parts.push(mtype);
    const title = parts.length
      ? `${parts.join(' · ')} · ${total} 条物料`
      : '物料查询 · 仓库物料速查';
    const params = [];
    if (keyword) params.push(`keyword=${encodeURIComponent(keyword)}`);
    if (series) params.push(`series=${encodeURIComponent(series)}`);
    if (mtype) params.push(`mtype=${encodeURIComponent(mtype)}`);
    const query = params.length ? `?${params.join('&')}` : '';
    return { title, path: `/pages/query-list/query-list${query}` };
  },

  /** 微信朋友圈（单页模式）分享 */
  onShareTimeline() {
    const { keyword, series, mtype } = this.data;
    const parts = [];
    if (keyword) parts.push(keyword);
    if (series) parts.push(series);
    if (mtype) parts.push(mtype);
    const params = [];
    if (keyword) params.push(`keyword=${encodeURIComponent(keyword)}`);
    if (series) params.push(`series=${encodeURIComponent(series)}`);
    if (mtype) params.push(`mtype=${encodeURIComponent(mtype)}`);
    return {
      title: parts.length ? `${parts.join(' · ')} · 物料查询` : '物料查询 · 仓库物料速查',
      query: params.join('&')
    };
  }
});

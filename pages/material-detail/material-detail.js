const materials = require('../../utils/materials.js');
const roles = require('../../utils/material-roles.js');

Page({
  data: {
    id: '',
    material: null,
    favorited: false,
    canWrite: false,
    photoTab: 'real',
    realPhotos: [],
    fakePhotos: []
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
  },

  /** 开启右上角原生「···」菜单里的转发按钮 */
  onShow() {
    this.loadMaterial();
    if (!this._shareMenuReady) {
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
      this._shareMenuReady = true;
    }
  },

  loadMaterial() {
    const material = materials.getMaterialById(this.data.id);
    if (!material) {
      wx.showToast({ title: '物料不存在或已删除', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    materials.addRecent(material.id);
    const realPhotos = material.photos || [];
    const fakePhotos = material.fakePhotos || [];
    this.setData({
      material,
      favorited: materials.isFavorite(material.id),
      canWrite: roles.canWrite(),
      realPhotos,
      fakePhotos,
      photoTab: fakePhotos.length && !realPhotos.length ? 'fake' : 'real'
    });
    wx.setNavigationBarTitle({ title: material.name || material.code || '物料详情' });
  },

  switchPhotoTab(e) {
    const tab = e.currentTarget.dataset.tab;
    const photos = tab === 'fake' ? this.data.fakePhotos : this.data.realPhotos;
    if (!photos.length) return;
    this.setData({ photoTab: tab });
  },

  toggleFavorite() {
    const added = materials.toggleFavorite(this.data.id);
    this.setData({ favorited: added });
    wx.showToast({ title: added ? '已收藏' : '已取消收藏', icon: 'none' });
  },

  editMaterial() {
    if (!roles.canWrite()) {
      wx.showToast({ title: '需要维护员权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/material-edit/material-edit?id=${this.data.id}` });
  },

  deleteMaterial() {
    if (!roles.canWrite()) {
      wx.showToast({ title: '需要维护员权限', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认删除',
      content: `删除后「${this.data.material.name || this.data.material.code}」将不可恢复，是否继续？`,
      confirmText: '删除',
      confirmColor: '#FF5B5B',
      success: (res) => {
        if (!res.confirm) return;
        materials.deleteMaterial(this.data.id);
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 500);
      }
    });
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.src;
    const photos = this.data.photoTab === 'fake' ? this.data.fakePhotos : this.data.realPhotos;
    wx.previewImage({ current, urls: photos });
  },

  onShareAppMessage() {
    const m = this.data.material || {};
    return {
      title: `${m.name || m.code || '物料'} · 物料查询`,
      path: `/pages/material-detail/material-detail?id=${this.data.id}`
    };
  },

  /** 微信朋友圈（单页模式）分享 */
  onShareTimeline() {
    const m = this.data.material || {};
    return {
      title: `${m.name || m.code || '物料'} · 物料查询`,
      query: `id=${this.data.id}`
    };
  }
});

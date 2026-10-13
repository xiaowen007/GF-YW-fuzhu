const storage = require('../../utils/storage.js');
const cloud = require('../../utils/cloud.js');

Page({
  data: {
    activeTab: 'cloud',
    cloudEnv: '',
    cloudReady: false,
    recycleBin: []
  },

  onLoad(options) {
    const tab = options.tab || 'cloud';
    this.setData({ activeTab: tab });
    this.loadRecycle();
  },

  onShow() {
    const app = getApp();
    this.setData({
      cloudEnv: app.globalData.settings.cloudEnv || '',
      cloudReady: app.globalData.cloudInitialized
    });
    this.loadRecycle();
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'recycle') this.loadRecycle();
  },

  loadRecycle() {
    const bin = storage.getRecycleBin().map(r => ({
      ...r,
      deletedAt: storage.formatDate(r.deletedAt)
    }));
    this.setData({ recycleBin: bin });
  },

  restore(e) {
    const id = e.currentTarget.dataset.id;
    storage.restoreFromRecycleBin(id);
    this.loadRecycle();
    wx.showToast({ title: '已恢复', icon: 'success' });
  },

  clearRecycle() {
    wx.showModal({
      title: '确认清空',
      content: '清空后无法恢复，是否继续？',
      success: (res) => {
        if (res.confirm) {
          storage.clearRecycleBin();
          this.loadRecycle();
        }
      }
    });
  },


  onInput(e) {
    this.setData({ cloudEnv: e.detail.value });
  },

  saveEnv() {
    const cloudEnv = this.data.cloudEnv.trim();
    if (!cloudEnv) {
      wx.showToast({ title: '请输入环境 ID', icon: 'none' });
      return;
    }
    getApp().saveSettings({ cloudEnv });
    getApp().initCloud();
    this.setData({ cloudReady: getApp().globalData.cloudInitialized });
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  async uploadBackup() {
    if (!this.checkCloud()) return;
    try {
      const data = storage.exportAllData();
      const fs = wx.getFileSystemManager();
      const filePath = `${wx.env.USER_DATA_PATH}/inventory_backup_${Date.now()}.json`;
      await new Promise((resolve, reject) => {
        fs.writeFile({ filePath, data: JSON.stringify(data), encoding: 'utf8', success: resolve, fail: reject });
      });
      const fileID = await cloud.uploadFile(filePath, `backups/inventory_backup_${Date.now()}.json`);
      wx.showModal({ title: '备份成功', content: `云文件 ID：${fileID}`, showCancel: false });
    } catch (e) {
      wx.showToast({ title: e.message || '备份失败', icon: 'none' });
    }
  },

  async syncToCloud() {
    if (!this.checkCloud()) return;
    wx.showLoading({ title: '同步中...' });
    try {
      await cloud.syncAllToCloud();
      getApp().saveSettings({ storageMode: 'cloud' });
      wx.showToast({ title: '已同步到云端', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: e.message || '同步失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async syncFromCloud() {
    if (!this.checkCloud()) return;
    wx.showLoading({ title: '下载中...' });
    try {
      await cloud.syncAllFromCloud();
      getApp().saveSettings({ storageMode: 'cloud' });
      wx.showToast({ title: '已下载到本地', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: e.message || '下载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  checkCloud() {
    if (!cloud.isCloudReady()) {
      wx.showToast({ title: '云开发未初始化', icon: 'none' });
      return false;
    }
    return true;
  }
});

const storage = require('../../utils/storage.js');
const cloud = require('../../utils/cloud.js');

Page({
  data: {
    userInfo: {},
    userId: 'oOSb75P9T_SK...',
    qrCodeUrl: '',
    commonMenus: [
      { key: 'scanSettings', name: '扫码设置', desc: '调整扫码类型、提示音和识别体验', icon: '⊞', bg: '#5B6CFF' },
      { key: 'historyExport', name: '历史导出', desc: '查看已导出的文件记录和处理结果', icon: '⬆', bg: '#00C853' },
      { key: 'dataRecycle', name: '数据回收', desc: '回收误删数据，集中管理回收内容', icon: '🗑', bg: '#FF5B5B' }
    ],
    serviceMenus: [
      { key: 'version', name: '当前版本', desc: '检查当前小程序版本和更新状态', icon: 'ⓥ', bg: '#7C4DFF', extra: 'V2.7.0' },
      { key: 'share', name: '分享好友', desc: '把这款工具推荐给团队伙伴或朋友', icon: '⇧', bg: '#FF9C00' },
      { key: 'contact', name: '联系客服', desc: '遇到问题可直接联系官方客服支持', icon: '☎', bg: '#29B6F6' }
    ],
    settings: {
      storageMode: 'local',
      cloudEnv: '',
      autoSync: false,
      warnThreshold: 10
    }
  },

  onShow() {
    const app = getApp();
    this.setData({
      settings: { ...app.globalData.settings },
      userInfo: app.globalData.userInfo || {}
    });
    this.loadUserId();
  },

  loadUserId() {
    if (cloud.isCloudReady()) {
      cloud.getOpenId()
        .then(id => this.setData({ userId: `${id.slice(0, 12)}...` }))
        .catch(() => {});
    }
  },

  chooseAvatar() {
    wx.getUserProfile({
      desc: '用于完善个人资料',
      success: (res) => {
        const app = getApp();
        app.globalData.userInfo = res.userInfo;
        this.setData({ userInfo: res.userInfo });
      }
    });
  },

  upgrade() {
    wx.showModal({
      title: '开通正式版',
      content: '正式版包含更多高级功能，如多设备云同步、数据恢复等。',
      showCancel: false
    });
  },

  onMenuTap(e) {
    const { key } = e.currentTarget.dataset.item;
    switch (key) {
      case 'scanSettings':
        wx.showModal({ title: '扫码设置', content: '当前支持条形码与二维码识别。', showCancel: false });
        break;
      case 'historyExport':
        this.exportData();
        break;
      case 'dataRecycle':
        wx.navigateTo({ url: '/pages/cloud/cloud?tab=recycle' });
        break;
      case 'version':
        wx.showModal({ title: '当前版本', content: 'V2.7.0', showCancel: false });
        break;
      case 'share':
        wx.showShareMenu({ withShareTicket: true });
        break;
      case 'contact':
        wx.openCustomerServiceChat({ extInfo: {}, corpId: '' });
        break;
    }
  },

  getQRCode() {
    wx.showLoading({ title: '生成中' });
    wx.cloud.callFunction({
      name: 'getMiniProgramCode',
      success: res => {
        wx.hideLoading();
        const result = res.result || {};
        if (result.url) {
          this.setData({ qrCodeUrl: result.url });
          return;
        }
        wx.showModal({
          title: '生成失败',
          content: result.message || '小程序码生成失败，请确认已部署 getMiniProgramCode 云函数且 page 页面已发布',
          showCancel: false
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showModal({
          title: '提示',
          content: '小程序码需部署 cloudfunctions/getMiniProgramCode 云函数（右键目录 → 上传并部署）。',
          showCancel: false
        });
      }
    });
  },

  exportData() {
    const data = storage.exportAllData();
    const fs = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/inventory_backup_${Date.now()}.json`;
    fs.writeFile({
      filePath,
      data: JSON.stringify(data, null, 2),
      encoding: 'utf8',
      success: () => wx.openDocument({ filePath, fileType: 'json' }),
      fail: () => wx.showToast({ title: '导出失败', icon: 'none' })
    });
  }
});

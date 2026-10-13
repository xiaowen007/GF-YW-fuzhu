App({
  globalData: {
    userInfo: null,
    cloudInitialized: false,
    settings: {
      storageMode: 'local',
      cloudEnv: '',
      autoSync: false,
      warnThreshold: 10
    }
  },

  onLaunch() {
    this.loadSettings();
    this.initCloud();
  },

  loadSettings() {
    try {
      const settings = wx.getStorageSync('app_settings');
      if (settings) {
        this.globalData.settings = { ...this.globalData.settings, ...settings };
      }
    } catch (e) {
      console.error('加载设置失败', e);
    }
  },

  saveSettings(settings) {
    this.globalData.settings = { ...this.globalData.settings, ...settings };
    wx.setStorageSync('app_settings', this.globalData.settings);
  },

  initCloud() {
    const { cloudEnv } = this.globalData.settings;
    if (cloudEnv) {
      try {
        wx.cloud.init({
          env: cloudEnv,
          traceUser: true
        });
        this.globalData.cloudInitialized = true;
      } catch (e) {
        console.error('云开发初始化失败', e);
      }
    }
  }
});

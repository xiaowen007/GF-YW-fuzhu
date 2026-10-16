const roles = require('../../utils/material-roles.js');
const materials = require('../../utils/materials.js');

Page({
  data: {
    myRole: null,
    roleText: '只读成员',
    identity: '',
    inviteCode: '',
    admins: [],
    invites: [],
    canWrite: false,
    isOwner: false,
    newInviteRole: 'editor',
    newInviteDays: 30,
    newInviteRemark: '',
    dayOptions: [
      { label: '7 天', value: 7 },
      { label: '30 天', value: 30 },
      { label: '长期', value: 0 }
    ]
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const myRole = roles.getMyRole();
    const invites = roles.listInvites().map(i => ({
      ...i,
      status: roles.inviteStatus(i),
      expiry: roles.formatExpiry(i)
    }));
    const admins = roles.getAdmins().map(a => ({
      ...a,
      roleText: roles.roleText(a.role),
      shortId: a.identity.length > 14 ? `${a.identity.slice(0, 8)}…${a.identity.slice(-4)}` : a.identity,
      isMe: a.identity === roles.getIdentity()
    }));
    this.setData({
      myRole,
      roleText: roles.roleText(myRole),
      identity: roles.getIdentity(),
      admins,
      invites,
      canWrite: roles.canWrite(),
      isOwner: roles.isOwner()
    });
  },

  onInviteInput(e) {
    this.setData({ inviteCode: e.detail.value });
  },

  redeem() {
    const code = this.data.inviteCode.trim();
    if (!code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' });
      return;
    }
    const result = roles.redeemInvite(code);
    if (!result.ok) {
      wx.showToast({ title: result.message, icon: 'none' });
      return;
    }
    this.setData({ inviteCode: '' });
    wx.showToast({ title: `已激活：${roles.roleText(result.role)}`, icon: 'success' });
    this.refresh();
  },

  selectInviteRole(e) {
    this.setData({ newInviteRole: e.currentTarget.dataset.role });
  },

  selectInviteDays(e) {
    this.setData({ newInviteDays: Number(e.currentTarget.dataset.days) });
  },

  onRemarkInput(e) {
    this.setData({ newInviteRemark: e.detail.value });
  },

  createInvite() {
    if (!this.data.isOwner) {
      wx.showToast({ title: '只有负责人可以生成邀请码', icon: 'none' });
      return;
    }
    const result = roles.createInvite({
      role: this.data.newInviteRole,
      days: this.data.newInviteDays,
      remark: this.data.newInviteRemark.trim()
    });
    if (!result.ok) {
      wx.showToast({ title: result.message, icon: 'none' });
      return;
    }
    this.setData({ newInviteRemark: '' });
    wx.showToast({ title: `已生成 ${result.invite.code}`, icon: 'success' });
    this.refresh();
  },

  copyInvite(e) {
    const code = e.currentTarget.dataset.code;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' })
    });
  },

  revokeInvite(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '撤销邀请码',
      content: '撤销后该邀请码立即失效，是否继续？',
      confirmText: '撤销',
      success: (res) => {
        if (!res.confirm) return;
        const result = roles.revokeInvite(id);
        wx.showToast({ title: result.ok ? '已撤销' : result.message, icon: 'none' });
        this.refresh();
      }
    });
  },

  removeAdmin(e) {
    const identity = e.currentTarget.dataset.identity;
    wx.showModal({
      title: '移除成员',
      content: '移除后该成员将回到只读状态，是否继续？',
      confirmText: '移除',
      success: (res) => {
        if (!res.confirm) return;
        const result = roles.removeAdmin(identity);
        wx.showToast({ title: result.ok ? '已移除' : result.message, icon: 'none' });
        this.refresh();
      }
    });
  },

  openImport() {
    if (!roles.canWrite()) {
      wx.showToast({ title: '需要维护员权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/query-import/query-import' });
  },

  /**
   * 导出物料备份
   *
   * 小程序不能像网页那样直接下载文件，给出两条出路：
   *   1. 分享文件 —— 完整备份（含照片），发到微信会话后在电脑端接收，
   *      再拿到网页后台「导入」上传，适合做全量备份与跨端迁移。
   *   2. 复制文本 —— 不含照片，体积只有几十 KB，粘贴到网页后台导入框即可，
   *      适合日常快速把手机上的改动同步到网页。
   */
  exportMaterials() {
    const full = materials.exportMaterials({ includePhotos: true });
    const light = materials.exportMaterials({ includePhotos: false });
    const lightText = JSON.stringify(light, null, 2);
    const photoCount = full.reduce((n, m) => n + ((m.photos || []).length + (m.fakePhotos || []).length), 0);
    const lightKB = Math.max(1, Math.round(lightText.length / 1024));

    wx.showActionSheet({
      itemList: [
        `分享备份文件（${full.length} 条 · 含 ${photoCount} 张照片）`,
        `复制为文本同步到网页（${full.length} 条 · 约 ${lightKB}KB）`
      ],
      success: (res) => {
        if (res.tapIndex === 0) this.shareBackupFile(full);
        if (res.tapIndex === 1) this.copyBackupText(lightText, full.length);
      },
      fail: () => {}
    });
  },

  shareBackupFile(list) {
    const fs = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/materials_backup_${Date.now()}.json`;
    wx.showLoading({ title: '正在生成备份' });
    fs.writeFile({
      filePath,
      data: JSON.stringify(list, null, 2),
      encoding: 'utf8',
      success: () => {
        wx.hideLoading();
        // shareFileMessage 需要基础库 2.16.1+，发到「文件传输助手」后在电脑端即可取用
        wx.shareFileMessage({
          filePath,
          fileName: `物料备份_${list.length}条.json`,
          success: () => wx.showToast({ title: '已分享，请在电脑端接收', icon: 'success' }),
          fail: () => {
            // 不支持文件分享时降级为预览，用户可从预览里另存
            wx.openDocument({
              filePath,
              fileType: 'json',
              success: () => wx.showToast({ title: '已生成备份文件', icon: 'success' }),
              fail: () => wx.showToast({ title: '导出失败', icon: 'none' })
            });
          }
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '写入文件失败', icon: 'none' });
      }
    });
  },

  copyBackupText(text, count) {
    // 照片是 base64，含照片的备份动辄几 MB，剪贴板扛不住，因此文本版一律不带照片
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showModal({
          title: '已复制物料数据',
          content: `共 ${count} 条（不含照片）。发给「文件传输助手」后在电脑打开网页后台，粘贴进导入框即可。\n\n照片需在网页端重新上传，或用「分享备份文件」做完整备份。`,
          showCancel: false,
          confirmText: '知道了'
        });
      },
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' })
    });
  },

  createMaterial() {
    if (!roles.canWrite()) {
      wx.showToast({ title: '需要维护员权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/material-edit/material-edit' });
  },

  restoreSeed() {
    wx.showModal({
      title: '恢复初始数据',
      content: '将清空当前物料并写入内置的 14 条种子物料，收藏与最近查看也会重置，是否继续？',
      confirmText: '恢复',
      success: (res) => {
        if (!res.confirm) return;
        const list = materials.restoreSeed();
        wx.showToast({ title: `已恢复 ${list.length} 条`, icon: 'success' });
        this.refresh();
      }
    });
  },

  clearAll() {
    wx.showModal({
      title: '清空物料',
      content: '清空后所有物料、收藏与最近查看都会被删除且不可恢复，是否继续？',
      confirmText: '清空',
      confirmColor: '#FF5B5B',
      success: (res) => {
        if (!res.confirm) return;
        materials.clearMaterials();
        wx.showToast({ title: '已清空', icon: 'success' });
        this.refresh();
      }
    });
  }
});

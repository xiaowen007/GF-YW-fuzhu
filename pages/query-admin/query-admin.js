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

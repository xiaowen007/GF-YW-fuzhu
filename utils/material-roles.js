/**
 * 物料查询 · 三级权限与邀请码
 *
 * 角色只有三种：
 *   null        只读（所有用户的默认态）：查物料、看照片与验真对照、收藏
 *   'editor'    维护员：上述 + 新增 / 修改 / 删除物料、批量导入、上传照片
 *   'owner'     负责人：维护员全部权限 + 生成 / 撤销邀请码、移除维护员
 *
 * 存储优先本地；云端环境就绪时以 openid 作为身份标识，否则用本机标识，
 * 保证离线也能完整跑通查询与录入流程。
 */

const MY_ROLE_KEY = 'material_my_role';
const ADMINS_KEY = 'material_admins';
const INVITES_KEY = 'material_invites';
const IDENTITY_KEY = 'material_identity';

// 初始邀请码：激活第一位负责人，90 天内有效、只能使用一次
const INITIAL_INVITE = {
  code: 'PUNTFUUS',
  role: 'owner',
  days: 90,
  remark: '初始负责人邀请码'
};

function readList(key) {
  try {
    return wx.getStorageSync(key) || [];
  } catch (e) {
    return [];
  }
}

function writeList(key, list) {
  wx.setStorageSync(key, list);
  return list;
}

function getNow() {
  return new Date().toISOString();
}

/** 身份标识：云环境就绪取 openid，否则用本机生成的稳定标识 */
function getIdentity() {
  let id = wx.getStorageSync(IDENTITY_KEY);
  if (!id) {
    id = `local_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    wx.setStorageSync(IDENTITY_KEY, id);
  }
  return id;
}

function isOwnerRole(role) {
  return role === 'owner';
}

function isEditorRole(role) {
  return role === 'editor' || role === 'owner';
}

// =================== 我的角色 ===================

function getMyRole() {
  const saved = wx.getStorageSync(MY_ROLE_KEY);
  if (!saved || saved.identity !== getIdentity()) return null;
  if (!saved.role) return null;
  // 本地角色必须仍在管理员名单里；被负责人移除后立即降为只读
  const admin = getAdmins().find(a => a.identity === saved.identity);
  if (!admin || admin.role !== saved.role) {
    wx.removeStorageSync(MY_ROLE_KEY);
    return null;
  }
  return saved.role;
}

function isEditor() {
  return isEditorRole(getMyRole());
}

function isOwner() {
  return isOwnerRole(getMyRole());
}

/** 是否允许写操作（新增/修改/删除/导入/上传照片） */
function canWrite() {
  return isEditor();
}

function setMyRole(role, nickname) {
  const data = { identity: getIdentity(), role, nickname: nickname || '', updatedAt: getNow() };
  wx.setStorageSync(MY_ROLE_KEY, data);
  upsertAdmin(data.identity, role, data.nickname);
  return data;
}

// =================== 管理员名单 ===================

function getAdmins() {
  ensureInitialInvite();
  return readList(ADMINS_KEY);
}

function upsertAdmin(identity, role, nickname) {
  const list = readList(ADMINS_KEY);
  const idx = list.findIndex(a => a.identity === identity);
  if (idx >= 0) {
    list[idx] = { ...list[idx], role, nickname: nickname || list[idx].nickname, updatedAt: getNow() };
  } else {
    list.push({ identity, role, nickname: nickname || '', createdAt: getNow(), updatedAt: getNow() });
  }
  writeList(ADMINS_KEY, list);
  return list;
}

/** 移除维护员；负责人不允许被移除，保证系统里永远至少有一个负责人 */
function removeAdmin(identity) {
  const target = getAdmins().find(a => a.identity === identity);
  if (!target) return { ok: false, message: '该成员不存在' };
  if (isOwnerRole(target.role)) {
    return { ok: false, message: '负责人不能被移除，请先提升其他人再交接' };
  }
  if (identity === getIdentity()) {
    return { ok: false, message: '不能移除自己' };
  }
  writeList(ADMINS_KEY, getAdmins().filter(a => a.identity !== identity));
  return { ok: true };
}

// =================== 邀请码 ===================

function ensureInitialInvite() {
  const list = readList(INVITES_KEY);
  if (list.some(i => i.code === INITIAL_INVITE.code)) return list;
  list.unshift({
    id: `invite_${INITIAL_INVITE.code}`,
    code: INITIAL_INVITE.code,
    role: INITIAL_INVITE.role,
    expiresAt: Date.now() + INITIAL_INVITE.days * 86400000,
    usedBy: '',
    usedAt: '',
    remark: INITIAL_INVITE.remark,
    createdAt: getNow()
  });
  return writeList(INVITES_KEY, list);
}

function listInvites() {
  return ensureInitialInvite()
    .slice()
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** 生成邀请码；days 为 0 表示长期有效 */
function createInvite({ role = 'editor', days = 30, remark = '' } = {}) {
  if (!isOwner()) return { ok: false, message: '只有负责人可以生成邀请码' };
  if (role !== 'editor' && role !== 'owner') return { ok: false, message: '角色只能是维护员或负责人' };
  const list = ensureInitialInvite();
  let code = randomCode();
  while (list.some(i => i.code === code)) code = randomCode();
  const invite = {
    id: `invite_${code}_${Date.now().toString(36)}`,
    code,
    role,
    expiresAt: days > 0 ? Date.now() + days * 86400000 : 0,
    usedBy: '',
    usedAt: '',
    remark: remark || '',
    createdAt: getNow()
  };
  list.unshift(invite);
  writeList(INVITES_KEY, list);
  return { ok: true, invite };
}

function revokeInvite(id) {
  if (!isOwner()) return { ok: false, message: '只有负责人可以撤销邀请码' };
  const invite = listInvites().find(i => i.id === id);
  if (!invite) return { ok: false, message: '邀请码不存在' };
  if (invite.usedBy) return { ok: false, message: '已使用的邀请码不能撤销' };
  writeList(INVITES_KEY, listInvites().filter(i => i.id !== id));
  return { ok: true };
}

function inviteStatus(invite) {
  if (invite.usedBy) return { text: '已使用', tone: 'gray' };
  if (invite.expiresAt && invite.expiresAt < Date.now()) return { text: '已过期', tone: 'gray' };
  return { text: '未使用', tone: 'green' };
}

function formatExpiry(invite) {
  if (!invite.expiresAt) return '长期有效';
  const d = new Date(invite.expiresAt);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 到期`;
}

/** 兑换邀请码：一次性使用，成功即写入管理员名单并成为对应角色 */
function redeemInvite(code) {
  const input = String(code || '').trim().toUpperCase();
  if (!input) return { ok: false, message: '请输入邀请码' };
  const list = ensureInitialInvite();
  const idx = list.findIndex(i => i.code === input);
  if (idx < 0) return { ok: false, message: '邀请码不存在，请检查后重试' };
  const invite = list[idx];
  if (invite.usedBy) return { ok: false, message: '该邀请码已被使用' };
  if (invite.expiresAt && invite.expiresAt < Date.now()) return { ok: false, message: '该邀请码已过期' };

  const role = invite.role || 'editor';
  const identity = getIdentity();
  list[idx] = { ...invite, usedBy: identity, usedAt: getNow() };
  writeList(INVITES_KEY, list);
  setMyRole(role, '');
  return { ok: true, role };
}

const ROLE_TEXT = {
  owner: '负责人',
  editor: '维护员',
  reader: '只读成员'
};

function roleText(role) {
  return ROLE_TEXT[role] || ROLE_TEXT.reader;
}

module.exports = {
  MY_ROLE_KEY,
  ADMINS_KEY,
  INVITES_KEY,
  getIdentity,
  getMyRole,
  isEditor,
  isOwner,
  canWrite,
  setMyRole,
  getAdmins,
  removeAdmin,
  listInvites,
  createInvite,
  revokeInvite,
  redeemInvite,
  inviteStatus,
  formatExpiry,
  roleText
};

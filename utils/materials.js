/**
 * 物料查询 · 数据访问层
 * 负责物料 CRUD、模糊搜索、收藏、最近查看、批量导入解析与照片压缩。
 * 存储优先本地（wx.storage），云端同步沿用 utils/cloud.js 的既有链路。
 */

const seed = require('./material-seed.js');
const storage = require('./storage.js');
const pinyinUtil = require('./pinyin.js');
const synonyms = require('./material-synonyms.js');

const MATERIALS_KEY = 'materials';
const FAVORITES_KEY = 'material_favorites';
const RECENT_KEY = 'material_recent';
const HISTORY_KEY = 'material_search_history';
const RECENT_LIMIT = 20;
const HISTORY_LIMIT = 10;
const PHOTO_MAX_EDGE = 1280; // 上传照片长边压缩上限，避免原图撑爆本地存储

// =================== 工具 ===================

function getNow() {
  return new Date().toISOString();
}

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

function normalize(str) {
  return String(str == null ? '' : str).trim();
}

function normalizeKey(str) {
  return normalize(str).toLowerCase().replace(/[\s_\-]/g, '');
}

// =================== 物料 ===================

/**
 * 首次使用时写入种子数据（14 条断路器/重合闸物料）。
 * 用户手动清空过物料后不会再次注入，避免删掉的数据又回来。
 */
function ensureSeed() {
  const existing = wx.getStorageSync(MATERIALS_KEY);
  if (existing) return existing;
  const list = seed.map(item => {
    const material = {
      id: storage.uuid(),
      ...item,
      createdAt: getNow(),
      updatedAt: getNow()
    };
    applyIndex(material);
    return material;
  });
  writeList(MATERIALS_KEY, list);
  return list;
}

function getMaterials() {
  return ensureSeed();
}

function getMaterialById(id) {
  return getMaterials().find(m => m.id === id);
}

function getMaterialByCode(code) {
  const key = normalize(code);
  if (!key) return null;
  return getMaterials().find(m => m.code === key) || null;
}

/** 由各字段拼出检索串，查询只匹配这一个字段，一次请求全字段命中 */
function buildSearchText(m) {
  return [
    m.code, m.name, m.series, m.mtype, m.model,
    m.unit, m.location, m.brand, m.group, m.subCategory, m.remark
  ].map(normalize).filter(Boolean).join(' ');
}

/**
 * 生成拼音索引：full 首选全拼 / initials 首字母 / alt 非首选读音。
 * 参与拼音的字段取中文名相关列（型号里的英文不转，保留原文匹配）。
 */
function buildPinyinIndex(m) {
  const text = [m.name, m.series, m.mtype, m.brand, m.location, m.remark, m.group, m.subCategory]
    .map(normalize).filter(Boolean).join('');
  return pinyinUtil.pinyinIndex(text);
}

/** 保证物料带 searchIndex（旧数据 / 种子数据懒补齐），返回带索引的物料引用 */
function ensureIndex(m) {
  if (!m) return m;
  if (!m.searchIndex) {
    m.searchIndex = buildPinyinIndex(m);
    writeList(MATERIALS_KEY, getMaterials());
  }
  return m;
}

/** 统一刷新检索串与拼音索引（新增 / 修改 / 导入后调用） */
function applyIndex(m) {
  m.searchText = buildSearchText(m);
  m.searchIndex = buildPinyinIndex(m);
  return m;
}

const EDITABLE_FIELDS = [
  'code', 'name', 'series', 'mtype', 'model', 'unit',
  'location', 'stock', 'brand', 'price', 'group', 'subCategory', 'remark'
];

function sanitize(input) {
  const m = {
    code: normalize(input.code),
    name: normalize(input.name),
    series: normalize(input.series),
    mtype: normalize(input.mtype || input.type),
    model: normalize(input.model),
    unit: normalize(input.unit),
    location: normalize(input.location),
    stock: normalize(input.stock),
    brand: normalize(input.brand),
    price: normalize(input.price),
    group: normalize(input.group || input.group_name),
    subCategory: normalize(input.subCategory),
    remark: normalize(input.remark)
  };
  return m;
}

/**
 * 只挑出调用方真正传了的字段，避免局部更新把其余字段清空。
 * 想显式清空某个字段时传空字符串即可。
 */
function pickPatch(input) {
  const patch = {};
  EDITABLE_FIELDS.forEach(field => {
    if (input[field] !== undefined) patch[field] = normalize(input[field]);
  });
  if (input.type !== undefined && input.mtype === undefined) patch.mtype = normalize(input.type);
  if (input.group_name !== undefined && input.group === undefined) patch.group = normalize(input.group_name);
  return patch;
}

/** 新增物料；物料号已存在时返回错误，由调用方决定走更新 */
function addMaterial(input) {
  const list = getMaterials();
  const data = sanitize(input);
  if (!data.code) return { ok: false, message: '物料号不能为空' };
  if (list.some(m => m.code === data.code)) {
    return { ok: false, message: `物料号 ${data.code} 已存在` };
  }
  const now = getNow();
  const material = {
    id: storage.uuid(),
    ...data,
    photos: Array.isArray(input.photos) ? input.photos.slice(0, 9) : [],
    fakePhotos: Array.isArray(input.fakePhotos) ? input.fakePhotos.slice(0, 9) : [],
    createdAt: now,
    updatedAt: now
  };
  applyIndex(material);
  list.unshift(material);
  writeList(MATERIALS_KEY, list);
  return { ok: true, material };
}

function updateMaterial(id, input) {
  const list = getMaterials();
  const idx = list.findIndex(m => m.id === id);
  if (idx < 0) return { ok: false, message: '物料不存在或已删除' };
  const data = pickPatch(input);
  if (data.code && data.code !== list[idx].code && list.some(m => m.code === data.code && m.id !== id)) {
    return { ok: false, message: `物料号 ${data.code} 已被其他物料占用` };
  }
  const next = {
    ...list[idx],
    ...data,
    id: list[idx].id,
    photos: Array.isArray(input.photos) ? input.photos.slice(0, 9) : list[idx].photos,
    fakePhotos: Array.isArray(input.fakePhotos) ? input.fakePhotos.slice(0, 9) : list[idx].fakePhotos,
    updatedAt: getNow()
  };
  applyIndex(next);
  list[idx] = next;
  writeList(MATERIALS_KEY, list);
  return { ok: true, material: next };
}

function deleteMaterial(id) {
  const list = getMaterials().filter(m => m.id !== id);
  writeList(MATERIALS_KEY, list);
  // 收藏与最近查看里的失效引用一并清掉
  writeList(FAVORITES_KEY, readList(FAVORITES_KEY).filter(fid => fid !== id));
  writeList(RECENT_KEY, readList(RECENT_KEY).filter(rid => rid !== id));
  return list;
}

function clearMaterials() {
  writeList(MATERIALS_KEY, []);
  writeList(FAVORITES_KEY, []);
  writeList(RECENT_KEY, []);
}

function restoreSeed() {
  wx.removeStorageSync(MATERIALS_KEY);
  wx.removeStorageSync(FAVORITES_KEY);
  wx.removeStorageSync(RECENT_KEY);
  return ensureSeed();
}

// =================== 搜索与浏览 ===================

// 原文匹配域与权重：越能唯一定位物料的字段权重越高
const SEARCH_FIELDS = [
  { key: 'code', weight: 10 },
  { key: 'name', weight: 8 },
  { key: 'model', weight: 6 },
  { key: 'series', weight: 5 },
  { key: 'mtype', weight: 5 },
  { key: 'brand', weight: 4 },
  { key: 'location', weight: 4 },
  { key: 'subCategory', weight: 3 },
  { key: 'remark', weight: 3 },
  { key: 'searchText', weight: 2 }
];
const PY_FULL_WEIGHT = 3.5;   // 全拼命中
const PY_INITIAL_WEIGHT = 3;  // 首字母命中
const PY_ALT_WEIGHT = 2.5;    // 多音字非首选读音命中
const FUZZY_WEIGHT = 1.5;     // 编辑距离容错命中

/** 把用户输入切成多个 token（空格 / 逗号 / 顿号 / 分号 / 竖线），多 token 之间为 AND 语义 */
function parseTokens(keyword) {
  return String(keyword == null ? '' : keyword)
    .split(/[\s,，、;；|]+/)
    .map(t => t.trim())
    .filter(Boolean);
}

/** 经典 Levenshtein 编辑距离（短串够用） */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
  return prev[n];
}

/**
 * ASCII token（长度 ≥4，允许连字符/下划线）对 code / model 的编辑距离容错：差 1 个字符也算命中，
 * 用于手抄料号时的笔误。原文已精确命中时不会走到这里。
 */
function fuzzyMatch(token, m) {
  if (!/^[a-z0-9][a-z0-9\-_]{3,}$/i.test(token)) return null;
  const candidates = [
    { field: 'code', value: normalize(m.code) },
    { field: 'model', value: normalize(m.model) }
  ];
  let best = null;
  candidates.forEach(({ field, value }) => {
    if (!value || Math.abs(value.length - token.length) > 1) return;
    if (levenshtein(token.toLowerCase(), value.toLowerCase()) <= 1) {
      const hit = { field, start: 0, end: value.length, fuzzy: true };
      if (!best) best = { score: FUZZY_WEIGHT, hits: [hit] };
    }
  });
  return best;
}

/** 单个 token（含同义词扩展）在一条物料上的最佳匹配结果 */
function matchToken(token, m) {
  const variants = synonyms.expandToken(token);
  let best = null;
  variants.forEach(variant => {
    const result = matchOne(variant, m);
    if (result && (!best || result.score > best.score)) best = result;
  });
  return best;
}

/** 单个 token 在一条物料上的匹配：原文域 + 拼音域 + 容错 */
function matchOne(token, m) {
  const lower = String(token || '').toLowerCase();
  if (!lower) return null;
  let score = 0;
  const hits = [];
  const index = m.searchIndex || (m.searchIndex = buildPinyinIndex(m));

  SEARCH_FIELDS.forEach(({ key, weight }) => {
    const value = normalize(m[key]);
    if (!value) return;
    const at = value.toLowerCase().indexOf(lower);
    if (at < 0) return;
    let s = weight;
    if (value.toLowerCase() === lower) s += weight * 0.5; // 整个字段等于 token，加权
    score += s;
    if (key === 'name' || key === 'code') {
      hits.push({ field: key, start: at, end: at + lower.length });
    }
  });

  // 拼音域：只对"像拼音"的 token 生效，全拼 → 首字母 → 多音字变体依次降权
  if (pinyinUtil.looksLikePinyin(lower)) {
    if (index.full && index.full.includes(lower)) {
      score += PY_FULL_WEIGHT;
    } else if (index.initials && index.initials.includes(lower)) {
      score += PY_INITIAL_WEIGHT;
    } else if (index.alt && index.alt.includes(lower)) {
      score += PY_ALT_WEIGHT;
    }
  }

  if (score === 0) {
    const fuzzy = fuzzyMatch(lower, m);
    if (fuzzy) return fuzzy;
  }
  return score > 0 ? { score, hits } : null;
}

/** 把命中片段合并成 [{ text, hit }] 高亮段，供 material-card 渲染 */
function buildSegments(value, hits) {
  const text = String(value == null ? '' : value);
  if (!text || !hits || !hits.length) return [{ text, hit: false }];
  const ranges = hits
    .map(h => ({ start: Math.max(0, h.start), end: Math.min(text.length, h.end) }))
    .filter(r => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  ranges.forEach(r => {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  });
  const segments = [];
  let cursor = 0;
  merged.forEach(r => {
    if (r.start > cursor) segments.push({ text: text.slice(cursor, r.start), hit: false });
    segments.push({ text: text.slice(r.start, r.end), hit: true });
    cursor = r.end;
  });
  if (cursor < text.length) segments.push({ text: text.slice(cursor), hit: false });
  return segments.length ? segments : [{ text, hit: false }];
}

function buildHighlight(m, hits) {
  const hl = {};
  ['name', 'code'].forEach(field => {
    const fieldHits = hits.filter(h => h.field === field);
    hl[field] = buildSegments(m[field], fieldHits);
  });
  return hl;
}

/**
 * 智能搜索：多关键词 AND + 拼音（全拼/首字母/多音字）+ 同义词扩展 + 编辑距离容错，
 * 按相关度评分排序，支持系列/类型/收藏/精确字段筛选与分页。
 *
 * @param {string} keyword 关键词串（可含多个 token）
 * @param {object} options { series, mtype, favoriteOnly, page, pageSize, code, brand, model, location }
 * @returns {{ list: Array, total: number, page: number, hasMore: boolean }}
 *          list 元素为 decorate 后的物料，命中关键词时附带 hl 高亮段
 */
function smartSearch(keyword, options = {}) {
  const {
    series = '', mtype = '', favoriteOnly = false,
    page = 1, pageSize = 20,
    code = '', brand = '', model = '', location = ''
  } = options;

  let list = getMaterials().map(ensureIndex);
  if (favoriteOnly) list = list.filter(m => isFavorite(m.id));
  if (series) list = list.filter(m => m.series === series);
  if (mtype) list = list.filter(m => m.mtype === mtype);

  // 精确字段条件（AI 识别结果等场景）：作为 AND 过滤，不参与评分
  const exactFilters = [
    ['code', code], ['brand', brand], ['model', model], ['location', location]
  ];
  exactFilters.forEach(([key, value]) => {
    const v = normalize(value).toLowerCase();
    if (v) list = list.filter(m => normalize(m[key]).toLowerCase().includes(v));
  });

  const tokens = parseTokens(keyword);
  let result;
  if (tokens.length) {
    const scored = [];
    list.forEach(m => {
      let total = 0;
      const hits = [];
      for (let i = 0; i < tokens.length; i++) {
        const matched = matchToken(tokens[i], m);
        if (!matched) return; // AND：任一 token 未命中即淘汰
        total += matched.score;
        hits.push(...matched.hits);
      }
      scored.push({ m, score: total, hits });
    });
    scored.sort((a, b) =>
      b.score - a.score ||
      String(b.m.updatedAt || '').localeCompare(String(a.m.updatedAt || ''))
    );
    result = scored.map(({ m, hits }) => Object.assign(decorate(m), { hl: buildHighlight(m, hits) }));
  } else {
    result = decorateList(list);
  }

  const total = result.length;
  const size = pageSize > 0 ? pageSize : Infinity; // pageSize ≤ 0 表示全量返回
  const start = (Math.max(1, page) - 1) * (pageSize > 0 ? pageSize : 0);
  return {
    list: result.slice(start, start + size),
    total,
    page: Math.max(1, page),
    hasMore: total > start + size
  };
}

/** 关键词模糊匹配（兼容旧调用）：等价于 smartSearch 全量返回 */
function searchMaterials(keyword) {
  return smartSearch(keyword, { pageSize: 0 }).list;
}

/** 按条件筛选（兼容旧调用）：keyword + series + mtype */
function filterMaterials({ keyword = '', series = '', mtype = '' } = {}) {
  return smartSearch(keyword, { series, mtype, pageSize: 0 }).list;
}

function listSeries() {
  const set = {};
  getMaterials().forEach(m => {
    if (m.series) set[m.series] = (set[m.series] || 0) + 1;
  });
  return Object.keys(set).map(name => ({ name, count: set[name] }));
}

function listTypes() {
  const set = {};
  getMaterials().forEach(m => {
    if (m.mtype) set[m.mtype] = (set[m.mtype] || 0) + 1;
  });
  return Object.keys(set).map(name => ({ name, count: set[name] }));
}

function decorate(m) {
  return {
    ...m,
    cover: (m.photos && m.photos[0]) || '',
    photoCount: m.photos ? m.photos.length : 0,
    fakeCount: m.fakePhotos ? m.fakePhotos.length : 0,
    hasFake: !!(m.fakePhotos && m.fakePhotos.length),
    favorited: isFavorite(m.id)
  };
}

function decorateList(list) {
  return list.map(decorate);
}

// =================== 收藏 ===================

function getFavorites() {
  return readList(FAVORITES_KEY);
}

function isFavorite(id) {
  return getFavorites().indexOf(id) >= 0;
}

function toggleFavorite(id) {
  const list = getFavorites();
  const idx = list.indexOf(id);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.unshift(id);
  }
  writeList(FAVORITES_KEY, list);
  return idx < 0;
}

function getFavoriteMaterials() {
  const ids = getFavorites();
  return getMaterials().filter(m => ids.indexOf(m.id) >= 0);
}

// =================== 最近查看 ===================

function getRecentIds() {
  return readList(RECENT_KEY);
}

function addRecent(id) {
  const list = getRecentIds().filter(rid => rid !== id);
  list.unshift(id);
  writeList(RECENT_KEY, list.slice(0, RECENT_LIMIT));
}

function getRecentMaterials() {
  const ids = getRecentIds();
  return ids.map(id => getMaterialById(id)).filter(Boolean);
}

// =================== 搜索历史 ===================

/** 记录一次搜索（去重、置顶、截断到 HISTORY_LIMIT） */
function addSearchHistory(keyword) {
  const key = normalize(keyword);
  if (!key) return getSearchHistory();
  const list = readList(HISTORY_KEY).filter(k => k !== key);
  list.unshift(key);
  return writeList(HISTORY_KEY, list.slice(0, HISTORY_LIMIT));
}

function getSearchHistory() {
  return readList(HISTORY_KEY);
}

function clearSearchHistory() {
  writeList(HISTORY_KEY, []);
}

// =================== 批量导入 ===================

// 表头别名：有表头时按名字认列，没表头时按固定列序理解
const FIELD_ALIASES = {
  code: ['code', '物料号', '物料编号', '物料编码', '料号', '编号', '编码', 'materialcode', 'materialno', 'itemcode'],
  name: ['name', '名称', '物料名称', '品名', 'materialname', 'title'],
  series: ['series', '系列', '分类', '大类', '物料组别', 'category'],
  mtype: ['mtype', 'type', '类型', '小类', '物料类型', 'materialtype'],
  model: ['model', '型号', '规格', '规格型号', 'modelno'],
  unit: ['unit', '单位', '计量单位'],
  location: ['location', '位置', '存放位置', '库位', '仓位', '库区'],
  stock: ['stock', '库存', '数量', '存量', '库存数量'],
  brand: ['brand', '品牌', '厂家', '制造商', '厂商'],
  price: ['price', '价格', '单价'],
  group: ['group', 'groupname', '物料组', '分组'],
  subCategory: ['subcategory', '二级分类', '子分类', '子类', '小分类'],
  remark: ['remark', '备注', '说明', '判定要点', '描述', '描述说明']
};

const FIXED_ORDER = ['code', 'name', 'series', 'mtype', 'model', 'unit', 'location', 'stock', 'brand', 'price', 'group', 'subCategory', 'remark'];

function detectDelimiter(line) {
  if (line.indexOf('\t') >= 0) return '\t';
  if (line.indexOf(',') >= 0) return ',';
  if (line.indexOf(';') >= 0) return ';';
  return null;
}

function splitLine(line, delimiter) {
  if (delimiter === '\t') return line.split('\t');
  // CSV：简单处理，支持英文双引号包裹
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === delimiter && !inQuote) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseRows(text) {
  const content = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!content) return { rows: [], delimiter: null };

  if (content[0] === '[' || content[0] === '{') {
    try {
      const json = JSON.parse(content);
      const rows = Array.isArray(json) ? json : [json];
      return { rows: rows.map(r => (typeof r === 'object' && r ? r : {})), delimiter: 'json' };
    } catch (e) {
      return { rows: [], delimiter: 'json', error: 'JSON 解析失败：' + e.message };
    }
  }

  const lines = content.split('\n').filter(l => l.trim() !== '');
  const delimiter = detectDelimiter(lines[0]);
  if (!delimiter) return { rows: [], delimiter: null, error: '无法识别分隔符（支持制表符 / 逗号 / 分号）' };
  const rows = lines.map(l => splitLine(l, delimiter));
  return { rows, delimiter };
}

/**
 * 解析粘贴内容（Excel 复制 / CSV / JSON），返回规范化物料与跳过统计。
 * @returns {{ items: Array, skipped: number, total: number, hasHeader: boolean, error: string }}
 */
function parseImport(text) {
  const { rows, delimiter, error } = parseRows(text);
  if (error) return { items: [], skipped: 0, total: 0, hasHeader: false, error };
  if (!rows.length) return { items: [], skipped: 0, total: 0, hasHeader: false, error: '内容为空' };

  let hasHeader = false;
  let fieldMap = FIXED_ORDER;
  if (delimiter !== 'json') {
    const header = rows[0].map(normalizeKey);
    const hits = Object.keys(FIELD_ALIASES).filter(field =>
      FIELD_ALIASES[field].some(alias => header.indexOf(normalizeKey(alias)) >= 0)
    );
    if (hits.length >= 1) {
      hasHeader = true;
      fieldMap = header.map(name => {
        const hit = Object.keys(FIELD_ALIASES).find(field =>
          FIELD_ALIASES[field].some(alias => normalizeKey(alias) === name)
        );
        return hit || null;
      });
    }
  }

  const items = [];
  let skipped = 0;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  // JSON 备份里的照片字段不在 FIELD_ALIASES 中，需单独识别（兼容 photos/fakePhotos 与中文别名）
  const PHOTO_ALIASES = ['photos', 'photo', '正品照片', '照片', '图片'];
  const FAKE_PHOTO_ALIASES = ['fakephotos', 'fakephoto', '异常照片', '异常对照', '异常对照照片'];
  function pickArray(row, aliases) {
    const hit = Object.keys(row).find(k => aliases.indexOf(normalizeKey(k)) >= 0);
    if (!hit) return null;
    const value = row[hit];
    if (Array.isArray(value)) return value.filter(Boolean).slice(0, 9);
    if (typeof value === 'string' && value.trim()) {
      return value.split(/[\n,，、|]/).map(s => s.trim()).filter(Boolean).slice(0, 9);
    }
    return [];
  }

  dataRows.forEach(row => {
    const raw = {};
    if (delimiter === 'json') {
      Object.keys(FIELD_ALIASES).forEach(field => {
        FIELD_ALIASES[field].some(alias => {
          const hit = Object.keys(row).find(k => normalizeKey(k) === normalizeKey(alias));
          if (hit) {
            raw[field] = row[hit];
            return true;
          }
          return false;
        });
      });
    } else {
      fieldMap.forEach((field, index) => {
        if (field) raw[field] = row[index];
      });
    }
    const material = sanitize(raw);
    if (!material.code) {
      skipped++;
      return;
    }
    // JSON 备份（含 photos / fakePhotos）需保留照片；CSV/Excel 无照片列则不带 hasPhotos，
    // 由 upsertMaterials 沿用库中已有照片，避免被空数组冲掉。
    if (delimiter === 'json') {
      material.photos = pickArray(row, PHOTO_ALIASES) || [];
      material.fakePhotos = pickArray(row, FAKE_PHOTO_ALIASES) || [];
      material.hasPhotos = true; // 标记：本次导入携带了照片字段
    }
    applyIndex(material);
    items.push(material);
  });

  return { items, skipped, total: dataRows.length, hasHeader, error: '' };
}

/**
 * 按物料号 upsert：存在则更新，不存在则新增。
 *
 * 照片处理策略：
 *   - 导入项带 hasPhotos（JSON 备份）→ 用文件里的照片覆盖，完整还原备份；
 *   - 导入项是 CSV/Excel（无照片列）→ 沿用库中已有的照片，避免被空数组冲掉。
 *
 * @param {Array} items parseImport 产出的物料数组
 * @param {object} options { appendOnly } appendOnly=true 时只新增、跳过已存在料号
 * @returns {{ added: number, updated: number, skipped: number }}
 */
function upsertMaterials(items, options = {}) {
  const { appendOnly = false } = options;
  const list = getMaterials();
  let added = 0;
  let updated = 0;
  let skipped = 0;

  items.forEach(item => {
    const idx = list.findIndex(m => m.code === item.code);
    // 照片合并策略：只有当本次导入「确实带照片内容」时才覆盖，否则沿用库里已有的。
    // 空数组也是 truthy，`[] || 旧值` 拿不到兜底，必须显式判长度 ——
    // 否则手机侧没照片的物料同步到网页，会把网页上已上传的照片冲掉。
    const incomingPhotos = Array.isArray(item.photos) ? item.photos.slice(0, 9) : null;
    const incomingFakes = Array.isArray(item.fakePhotos) ? item.fakePhotos.slice(0, 9) : null;
    const usePhotos = !!item.hasPhotos && incomingPhotos !== null && incomingPhotos.length > 0;
    const useFakes = !!item.hasPhotos && incomingFakes !== null && incomingFakes.length > 0;
    const carryPhotos = {
      photos: usePhotos ? incomingPhotos : undefined,
      fakePhotos: useFakes ? incomingFakes : undefined
    };
    if (idx >= 0) {
      if (appendOnly) { skipped++; return; }
      list[idx] = {
        ...list[idx],
        ...item,
        id: list[idx].id,
        photos: carryPhotos.photos !== undefined ? carryPhotos.photos : (list[idx].photos || []),
        fakePhotos: carryPhotos.fakePhotos !== undefined ? carryPhotos.fakePhotos : (list[idx].fakePhotos || []),
        updatedAt: getNow()
      };
      applyIndex(list[idx]);
      updated++;
    } else {
      const created = {
        id: storage.uuid(),
        ...item,
        photos: (item.photos || []).slice(0, 9),
        fakePhotos: (item.fakePhotos || []).slice(0, 9),
        createdAt: getNow(),
        updatedAt: getNow()
      };
      applyIndex(created);
      list.unshift(created);
      added++;
    }
  });

  writeList(MATERIALS_KEY, list);
  return { added, updated, skipped };
}

// =================== 照片压缩 ===================

/**
 * 把本地图片压缩到长边 PHOTO_MAX_EDGE 以内，返回新的临时文件路径。
 * 小程序里 canvas 2d 需要先取得图片信息，这里用最稳妥的同步流程封装。
 */
function compressImage(filePath) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: filePath,
      success: info => {
        const { width, height } = info;
        const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(width, height));
        if (scale >= 1) {
          resolve(filePath);
          return;
        }
        const targetW = Math.round(width * scale);
        const targetH = Math.round(height * scale);
        const query = wx.createSelectorQuery();
        query.select('#material-compress-canvas').fields({ node: true }).exec(res => {
          const canvas = res && res[0] && res[0].node;
          if (!canvas) {
            // 页面没挂 canvas 时降级：直接用原图
            resolve(filePath);
            return;
          }
          const ctx = canvas.getContext('2d');
          const img = canvas.createImage();
          img.onload = () => {
            canvas.width = targetW;
            canvas.height = targetH;
            ctx.drawImage(img, 0, 0, targetW, targetH);
            wx.canvasToTempFilePath({
              canvas,
              fileType: 'jpg',
              quality: 0.85,
              success: r => resolve(r.tempFilePath),
              fail: () => resolve(filePath)
            });
          };
          img.onerror = () => resolve(filePath);
          img.src = filePath;
        });
      },
      fail: () => resolve(filePath)
    });
  });
}

/**
 * 导出物料备份
 *
 * 输出与网页后台「导出 JSON」完全一致的格式：纯物料对象数组，
 * 两端可互相导入（导出 → 导入自成闭环）。
 *
 * 剥离派生字段：searchText / searchIndex 是搜索索引，导入时会重建，不入库文件。
 * hasPhotos 只在「确实带照片」时才打标记 —— 若一条物料没有照片也打标记，
 * 导入的空数组会覆盖掉库里已有的照片（空数组是 truthy，`[] || 旧值` 不会兜底）。
 *
 * @param {Object} options
 * @param {boolean} options.includePhotos 是否携带照片，默认 true。
 *        关掉后体积大幅缩小，适合走剪贴板快速同步到网页后台。
 * @returns {Array} 可直接 JSON.stringify 的物料数组
 */
function exportMaterials(options = {}) {
  const { includePhotos = true } = options;
  return getMaterials().map(m => {
    const copy = {};
    Object.keys(m).forEach(k => {
      if (k === 'searchText' || k === 'searchIndex') return;
      copy[k] = m[k];
    });

    if (includePhotos) {
      const hasPhoto = (Array.isArray(m.photos) && m.photos.length > 0)
        || (Array.isArray(m.fakePhotos) && m.fakePhotos.length > 0);
      if (hasPhoto) {
        copy.photos = Array.isArray(m.photos) ? m.photos : [];
        copy.fakePhotos = Array.isArray(m.fakePhotos) ? m.fakePhotos : [];
        copy.hasPhotos = true;
      } else {
        // 明确不带标记：导入时沿用目标库已有照片，绝不覆盖
        delete copy.hasPhotos;
        copy.photos = [];
        copy.fakePhotos = [];
      }
    } else {
      delete copy.hasPhotos;
      delete copy.photos;
      delete copy.fakePhotos;
    }
    return copy;
  });
}

module.exports = {
  MATERIALS_KEY,
  FAVORITES_KEY,
  RECENT_KEY,
  HISTORY_KEY,
  PHOTO_MAX_EDGE,
  ensureSeed,
  getMaterials,
  getMaterialById,
  getMaterialByCode,
  buildSearchText,
  buildPinyinIndex,
  addMaterial,
  updateMaterial,
  deleteMaterial,
  clearMaterials,
  restoreSeed,
  parseTokens,
  smartSearch,
  searchMaterials,
  filterMaterials,
  listSeries,
  listTypes,
  decorate,
  decorateList,
  getFavorites,
  isFavorite,
  toggleFavorite,
  getFavoriteMaterials,
  getRecentIds,
  addRecent,
  getRecentMaterials,
  addSearchHistory,
  getSearchHistory,
  clearSearchHistory,
  parseImport,
  upsertMaterials,
  exportMaterials,
  compressImage
};

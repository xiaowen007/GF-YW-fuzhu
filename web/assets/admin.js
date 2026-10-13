/**
 * 物料库管理后台 · 交互逻辑
 *
 * 数据层直接复用小程序 utils（经 app-bundle.js 打包），
 * 因此搜索（拼音 / 同义词 / 容错）、导入解析、CRUD 与小程序行为完全一致。
 * 存储走 wx-shim.js 提供的 localStorage 适配，键名与小程序相同。
 */
(function () {
  'use strict';

  var core = window.NavMaterialCore;
  var M = core.materials;

  var PAGE_SIZE = 20;

  var state = {
    keyword: '',
    series: '',
    mtype: '',
    sort: 'relevance',
    view: 'table',
    page: 1,
    total: 0,
    list: [],
    editingId: null,
    editPhotos: [],
    editFakePhotos: [],
    pendingImport: null
  };

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };

  var els = {
    searchInput: $('searchInput'),
    btnClearSearch: $('btnClearSearch'),
    historyChips: $('historyChips'),
    filterSeries: $('filterSeries'),
    filterType: $('filterType'),
    countSeries: $('countSeries'),
    countType: $('countType'),
    resultTitle: $('resultTitle'),
    resultMeta: $('resultMeta'),
    sortSelect: $('sortSelect'),
    activeFilters: $('activeFilters'),
    tableBody: $('tableBody'),
    tableEmpty: $('tableEmpty'),
    tableWrap: $('tableWrap'),
    cardGrid: $('cardGrid'),
    pager: $('pager'),
    pagerInfo: $('pagerInfo'),
    btnPrev: $('btnPrev'),
    btnNext: $('btnNext'),
    chipTotal: $('chipTotal'),
    chipPhoto: $('chipPhoto'),
    chipFake: $('chipFake'),
    drawer: $('drawer'),
    drawerMask: $('drawerMask'),
    drawerTitle: $('drawerTitle'),
    editForm: $('editForm'),
    photoList: $('photoList'),
    fakeList: $('fakeList'),
    filePhoto: $('filePhoto'),
    fileFake: $('fileFake'),
    modalMask: $('modalMask'),
    importText: $('importText'),
    importPreview: $('importPreview'),
    detailMask: $('detailMask'),
    detailBody: $('detailBody'),
    detailTitle: $('detailTitle'),
    btnDetailEdit: $('btnDetailEdit'),
    toast: $('toast'),
    dlSeries: $('dlSeries'),
    dlType: $('dlType')
  };

  // ---------- 工具 ----------
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var toastTimer = null;
  function toast(msg, type) {
    els.toast.textContent = msg;
    els.toast.className = 'toast' + (type ? ' toast--' + type : '');
    els.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, 2200);
  }

  /** 把智能搜索返回的高亮段渲染成带 <mark> 的 HTML */
  function renderHighlight(segments, fallback) {
    if (!segments || !segments.length) return esc(fallback);
    return segments.map(function (s) {
      return s.hit ? '<mark class="hl">' + esc(s.text) + '</mark>' : esc(s.text);
    }).join('');
  }

  function photoUrl(p) {
    if (!p) return '';
    // 小程序内是 /assets/materials/xxx.jpg，Web 里 assets 在同级目录
    if (/^(https?:|data:|blob:)/.test(p)) return p;
    return '.' + (p.charAt(0) === '/' ? p : '/' + p);
  }

  // ---------- 统计 ----------
  function refreshStats() {
    var all = M.getMaterials();
    var photoCount = 0;
    var fakeCount = 0;
    all.forEach(function (m) {
      photoCount += (m.photos ? m.photos.length : 0);
      fakeCount += (m.fakePhotos ? m.fakePhotos.length : 0);
    });
    els.chipTotal.textContent = '物料 ' + all.length;
    els.chipPhoto.textContent = '照片 ' + photoCount;
    els.chipFake.textContent = '异常对照 ' + fakeCount;
  }

  // ---------- 侧栏筛选 ----------
  function refreshSidebar() {
    var series = M.listSeries();
    var types = M.listTypes();
    els.countSeries.textContent = series.length ? series.length + ' 项' : '';
    els.countType.textContent = types.length ? types.length + ' 项' : '';

    els.filterSeries.innerHTML = series.map(function (s) {
      var active = state.series === s.name ? ' class="is-active"' : '';
      return '<li' + active + ' data-series="' + esc(s.name) + '">' +
        '<span>' + esc(s.name) + '</span><span class="cnt">' + s.count + '</span></li>';
    }).join('') || '<li class="cnt">暂无</li>';

    els.filterType.innerHTML = types.map(function (t) {
      var active = state.mtype === t.name ? ' class="is-active"' : '';
      return '<li' + active + ' data-mtype="' + esc(t.name) + '">' +
        '<span>' + esc(t.name) + '</span><span class="cnt">' + t.count + '</span></li>';
    }).join('') || '<li class="cnt">暂无</li>';

    // datalist 联想
    els.dlSeries.innerHTML = series.map(function (s) {
      return '<option value="' + esc(s.name) + '">';
    }).join('');
    els.dlType.innerHTML = types.map(function (t) {
      return '<option value="' + esc(t.name) + '">';
    }).join('');
  }

  function refreshHistory() {
    var history = M.getSearchHistory();
    els.historyChips.innerHTML = history.map(function (k) {
      return '<span class="chip" data-history="' + esc(k) + '">' + esc(k) + '</span>';
    }).join('');
  }

  // ---------- 列表渲染 ----------
  function currentQuery() {
    return {
      keyword: state.keyword,
      series: state.series,
      mtype: state.mtype,
      page: state.page,
      pageSize: PAGE_SIZE
    };
  }

  function sortList(list) {
    if (state.sort === 'relevance') return list;
    var arr = list.slice();
    if (state.sort === 'updated') {
      arr.sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
    } else if (state.sort === 'code') {
      arr.sort(function (a, b) { return String(a.code || '').localeCompare(String(b.code || ''), 'zh-Hans-CN'); });
    } else if (state.sort === 'name') {
      arr.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN'); });
    }
    return arr;
  }

  function refresh() {
    var result = M.smartSearch(state.keyword, currentQuery());
    state.total = result.total;
    var list = sortList(result.list);
    state.list = list;

    var allCount = M.getMaterials().length;
    var filtered = !!(state.keyword || state.series || state.mtype);
    els.resultTitle.textContent = filtered ? '筛选结果' : '全部物料';
    els.resultMeta.textContent = filtered
      ? state.total + ' / ' + allCount + ' 条'
      : allCount + ' 条';

    if (state.keyword) M.addSearchHistory(state.keyword);
    refreshHistory();
    refreshActiveFilters();

    if (state.view === 'table') renderTable();
    else renderCards();

    renderPager();
    refreshStats();
    refreshSidebar();
  }

  function refreshActiveFilters() {
    var parts = [];
    if (state.keyword) parts.push({ key: 'keyword', label: '关键词：' + state.keyword });
    if (state.series) parts.push({ key: 'series', label: '系列：' + state.series });
    if (state.mtype) parts.push({ key: 'mtype', label: '类型：' + state.mtype });

    if (!parts.length) { els.activeFilters.hidden = true; return; }
    els.activeFilters.hidden = false;
    els.activeFilters.innerHTML = parts.map(function (p) {
      return '<span class="af-item">' + esc(p.label) +
        '<span class="af-remove" data-clear="' + p.key + '">✕</span></span>';
    }).join('') + '<span class="af-item"><span class="af-remove" data-clear="all">清除全部</span></span>';
  }

  function renderTable() {
    if (!state.list.length) {
      els.tableBody.innerHTML = '';
      els.tableEmpty.hidden = false;
      return;
    }
    els.tableEmpty.hidden = true;

    els.tableBody.innerHTML = state.list.map(function (m) {
      var hl = m.hl || {};
      var cover = m.photos && m.photos[0];
      var thumb = cover
        ? '<img class="thumb" src="' + esc(photoUrl(cover)) + '" alt="" loading="lazy" data-detail="' + esc(m.id) + '">'
        : '<div class="thumb thumb--empty">□</div>';
      var badge = m.hasFake ? '<span class="cell-name__badge">有异常对照</span>' : '';
      return '<tr data-id="' + esc(m.id) + '">' +
        '<td>' + thumb + '</td>' +
        '<td class="cell-code">' + renderHighlight(hl.code, m.code) + '</td>' +
        '<td><span class="cell-name" data-detail="' + esc(m.id) + '">' +
          renderHighlight(hl.name, m.name) + '</span>' + badge + '</td>' +
        '<td class="cell-muted">' + esc(m.series) + '</td>' +
        '<td class="cell-muted">' + esc(m.mtype) + '</td>' +
        '<td class="cell-muted">' + esc(m.model) + '</td>' +
        '<td class="cell-muted">' + esc(m.location) + '</td>' +
        '<td>' + esc(m.stock) + '</td>' +
        '<td class="cell-muted">' + esc(m.remark) + '</td>' +
        '<td><span class="row-ops">' +
          '<button class="icon-btn" data-detail="' + esc(m.id) + '">查看</button>' +
          '<button class="icon-btn" data-edit="' + esc(m.id) + '">编辑</button>' +
          '<button class="icon-btn icon-btn--del" data-del="' + esc(m.id) + '">删除</button>' +
        '</span></td>' +
      '</tr>';
    }).join('');
  }

  function renderCards() {
    if (!state.list.length) {
      els.cardGrid.innerHTML = '<div class="empty" style="grid-column:1/-1">' +
        '<p class="empty__icon">🔍</p><p class="empty__text">没有匹配的物料</p>' +
        '<p class="empty__sub">试试更短的关键词，或清空筛选条件</p></div>';
      return;
    }
    var hlCache = {};
    state.list.forEach(function (m) { hlCache[m.id] = m.hl || {}; });

    els.cardGrid.innerHTML = state.list.map(function (m) {
      var hl = hlCache[m.id];
      var cover = m.photos && m.photos[0];
      var img = cover
        ? '<img src="' + esc(photoUrl(cover)) + '" alt="" loading="lazy" data-detail="' + esc(m.id) + '">'
        : '□';
      var tags = [];
      if (m.series) tags.push('<span class="tag tag--primary">' + esc(m.series) + '</span>');
      if (m.mtype) tags.push('<span class="tag">' + esc(m.mtype) + '</span>');
      if (m.location) tags.push('<span class="tag">' + esc(m.location) + '</span>');
      if (m.photoCount) tags.push('<span class="tag">图 ' + m.photoCount + '</span>');
      return '<div class="mcard" data-id="' + esc(m.id) + '">' +
        '<div class="mcard__img">' + img +
          (m.hasFake ? '<span class="mcard__badge">异常对照 ' + m.fakeCount + '</span>' : '') +
        '</div>' +
        '<div class="mcard__body">' +
          '<div class="mcard__name">' + renderHighlight(hl.name, m.name) + '</div>' +
          '<div class="mcard__code">' + renderHighlight(hl.code, m.code) + '</div>' +
          '<div class="mcard__meta">' + tags.join('') + '</div>' +
        '</div>' +
        '<div class="mcard__foot">' +
          '<button class="icon-btn" data-detail="' + esc(m.id) + '">查看</button>' +
          '<button class="icon-btn" data-edit="' + esc(m.id) + '">编辑</button>' +
          '<button class="icon-btn icon-btn--del" data-del="' + esc(m.id) + '">删除</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderPager() {
    var pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    if (state.total <= PAGE_SIZE) { els.pager.hidden = true; return; }
    els.pager.hidden = false;
    els.pagerInfo.textContent = '第 ' + state.page + ' / ' + pages + ' 页 · 共 ' + state.total + ' 条';
    els.btnPrev.disabled = state.page <= 1;
    els.btnNext.disabled = state.page >= pages;
  }

  // ---------- 抽屉（新增 / 编辑） ----------
  var FIELD_NAMES = ['code', 'name', 'series', 'mtype', 'model', 'unit', 'location', 'stock', 'brand', 'price', 'group', 'subCategory', 'remark'];

  function openDrawer(material) {
    state.editingId = material ? material.id : null;
    els.drawerTitle.textContent = material ? '编辑物料' : '新增物料';
    FIELD_NAMES.forEach(function (f) {
      els.editForm.elements[f].value = material ? (material[f] || '') : '';
    });
    state.editPhotos = material && material.photos ? material.photos.slice() : [];
    state.editFakePhotos = material && material.fakePhotos ? material.fakePhotos.slice() : [];
    renderPhotoList();
    els.drawer.hidden = false;
    els.drawerMask.hidden = false;
    setTimeout(function () { els.editForm.elements.code.focus(); }, 60);
  }

  function closeDrawer() {
    els.drawer.hidden = true;
    els.drawerMask.hidden = true;
    state.editingId = null;
  }

  function renderPhotoList() {
    function build(list, container, isFake) {
      if (!list.length) {
        container.innerHTML = '<div class="photo-empty">' + (isFake ? '暂无异常照片' : '暂无照片') + '</div>';
        return;
      }
      container.innerHTML = list.map(function (p, i) {
        return '<div class="photo-item">' +
          '<img src="' + esc(photoUrl(p)) + '" alt="" data-preview="' + i + '" data-fake="' + (isFake ? '1' : '0') + '">' +
          '<button type="button" class="photo-item__del" data-rm="' + i + '" data-fake="' + (isFake ? '1' : '0') + '">✕</button>' +
        '</div>';
      }).join('');
    }
    build(state.editPhotos, els.photoList, false);
    build(state.editFakePhotos, els.fakeList, true);
  }

  /** 图片压缩：统一压到长边 1280，转 dataURL 后存本地（与小程序端策略一致） */
  function readImageCompressed(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('读取失败')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('图片解析失败')); };
        img.onload = function () {
          var maxEdge = M.PHOTO_MAX_EDGE || 1280;
          var w = img.width, h = img.height;
          var scale = Math.min(1, maxEdge / Math.max(w, h));
          var cw = Math.round(w * scale), ch = Math.round(h * scale);
          var canvas = document.createElement('canvas');
          canvas.width = cw; canvas.height = ch;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function handlePhotoPick(fileInput, isFake) {
    var files = Array.prototype.slice.call(fileInput.files || []);
    if (!files.length) return;
    var target = isFake ? state.editFakePhotos : state.editPhotos;
    Promise.all(files.map(readImageCompressed)).then(function (urls) {
      urls.forEach(function (u) {
        if (target.length < 9) target.push(u);
      });
      if (target.length >= 9 && files.length) toast('每类照片最多 9 张', 'err');
      renderPhotoList();
      fileInput.value = '';
    }).catch(function (e) {
      toast('图片处理失败：' + e.message, 'err');
      fileInput.value = '';
    });
  }

  function collectForm() {
    var data = {};
    FIELD_NAMES.forEach(function (f) { data[f] = els.editForm.elements[f].value.trim(); });
    data.photos = state.editPhotos;
    data.fakePhotos = state.editFakePhotos;
    return data;
  }

  function saveMaterial() {
    var data = collectForm();
    if (!data.code) { toast('物料号不能为空', 'err'); els.editForm.elements.code.focus(); return; }

    // 先记下是否为编辑态：closeDrawer 会把 editingId 清空，之后判断会失真
    var isEdit = !!state.editingId;
    var res = isEdit
      ? M.updateMaterial(state.editingId, data)
      : M.addMaterial(data);

    if (!res.ok) { toast(res.message, 'err'); return; }
    closeDrawer();
    refresh();
    toast(isEdit ? '已保存' : '已新增', 'ok');
  }

  // ---------- 详情 ----------
  function openDetail(id) {
    var m = M.getMaterialById(id);
    if (!m) { toast('物料不存在或已删除', 'err'); return; }
    M.addRecent(id);

    var cover = m.photos && m.photos.length
      ? m.photos.map(function (p) { return '<img src="' + esc(photoUrl(p)) + '" data-open="' + esc(photoUrl(p)) + '">'; }).join('')
      : '<p class="hint">暂无正品照片</p>';
    var fake = m.fakePhotos && m.fakePhotos.length
      ? m.fakePhotos.map(function (p) { return '<img src="' + esc(photoUrl(p)) + '" data-open="' + esc(photoUrl(p)) + '">'; }).join('')
      : '<p class="hint">暂无异常对照照片</p>';

    var rows = [
      ['系列', m.series], ['类型', m.mtype], ['型号', m.model],
      ['单位', m.unit], ['位置', m.location], ['库存', m.stock],
      ['品牌', m.brand], ['价格', m.price], ['物料组', m.group],
      ['二级分类', m.subCategory], ['备注', m.remark]
    ].filter(function (r) { return r[1]; });

    els.detailTitle.textContent = m.name || m.code || '物料详情';
    els.detailBody.innerHTML =
      '<div class="detail-head">' +
        '<div>' +
          '<div class="section-label">正品照片</div>' +
          '<div class="detail-photos">' + cover + '</div>' +
          '<div class="section-label">异常对照</div>' +
          '<div class="detail-photos detail-photos--fake">' + fake + '</div>' +
        '</div>' +
        '<div class="detail-info">' +
          '<h4>' + esc(m.name || '（未填名称）') + '</h4>' +
          '<div class="code">' + esc(m.code) + '</div>' +
          '<dl class="kv">' + rows.map(function (r) {
            return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>';
          }).join('') + '</dl>' +
        '</div>' +
      '</div>';

    els.btnDetailEdit.dataset.edit = id;
    els.detailMask.hidden = false;
    // 详情弹窗内也可用 Esc 关闭
    els.detailMask.focus && els.detailMask.focus();
  }

  function closeDetail() { els.detailMask.hidden = true; }

  // ---------- 导出 / 导入 ----------
  function exportJSON() {
    // 直接导出为「物料对象数组」：这样 parseImport 的 JSON 分支能逐条还原，
    // 导出的文件也能一键导回（自成闭环）。元信息不放文件里，避免污染解析。
    var materials = M.getMaterials().map(function (m) {
      var copy = {};
      Object.keys(m).forEach(function (k) {
        // 剥离派生索引字段，保持文件干净、体积小
        if (k !== 'searchText' && k !== 'searchIndex') copy[k] = m[k];
      });
      return copy;
    });

    var blob = new Blob([JSON.stringify(materials, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
    a.href = url;
    a.download = 'materials-' + stamp + '.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('已导出 ' + materials.length + ' 条物料（含照片）', 'ok');
  }

  function handleImportFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      els.modalMask.hidden = false;
      els.importText.value = text;
      doPreviewImport();
      toast('已读入文件，请确认后导入');
    };
    reader.readAsText(file, 'utf-8');
  }

  /** 用数据层自带的 parseImport 解析，保证与小程序同规则 */
  function doPreviewImport() {
    var text = els.importText.value;
    if (!text.trim()) {
      els.importPreview.hidden = true;
      state.pendingImport = null;
      return null;
    }
    // parseImport(text) → { items, skipped, total, hasHeader, error }
    // JSON 格式下 items 会带 hasPhotos 标记，导入时照片一并还原
    var parsed = M.parseImport(text);
    state.pendingImport = parsed;

    if (parsed.error) {
      els.importPreview.hidden = false;
      els.importPreview.className = 'import-preview import-preview--warn';
      els.importPreview.textContent = '解析失败：' + parsed.error;
      return parsed;
    }

    var count = parsed.items ? parsed.items.length : 0;
    var trimmed = text.trim();
    var isJson = trimmed.charAt(0) === '[' || trimmed.charAt(0) === '{';
    els.importPreview.hidden = false;
    els.importPreview.className = 'import-preview' + (count ? '' : ' import-preview--warn');
    els.importPreview.textContent = count
      ? '解析成功：' + count + ' 条' + (isJson ? '（JSON 备份，含照片）' : '（表格文本' + (parsed.hasHeader ? '，已识别表头' : '，按固定列序') + '）') +
        '　示例：' + (parsed.items[0].code || '(无料号)') + ' / ' + (parsed.items[0].name || '') +
        (parsed.skipped ? '　跳过 ' + parsed.skipped + ' 条（无料号）' : '')
      : '未解析到有效数据，请检查格式（需包含表头或按固定列序，且至少一列是物料号）';
    return parsed;
  }

  function doImport() {
    var parsed = state.pendingImport || doPreviewImport();
    if (!parsed || parsed.error) { toast('没有可导入的数据', 'err'); return; }
    if (!parsed.items || !parsed.items.length) { toast('没有可导入的数据', 'err'); return; }

    var mode = document.querySelector('input[name="impMode"]:checked').value;
    var res = M.upsertMaterials(parsed.items, { appendOnly: mode === 'append' });
    els.modalMask.hidden = true;
    els.importText.value = '';
    els.importPreview.hidden = true;
    state.pendingImport = null;
    state.page = 1;
    refresh();
    var msg = '新增 ' + res.added + ' 条';
    if (res.updated) msg += '，更新 ' + res.updated + ' 条';
    if (res.skipped) msg += '，跳过 ' + res.skipped + ' 条';
    toast(msg, 'ok');
  }

  // ---------- 事件绑定 ----------
  function bind() {
    // 搜索（防抖）
    var searchTimer = null;
    els.searchInput.addEventListener('input', function () {
      var val = els.searchInput.value;
      els.btnClearSearch.hidden = !val;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.keyword = val.trim();
        state.page = 1;
        refresh();
      }, 220);
    });
    els.searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        state.keyword = els.searchInput.value.trim();
        state.page = 1;
        refresh();
      }
    });
    els.btnClearSearch.addEventListener('click', function () {
      els.searchInput.value = '';
      els.btnClearSearch.hidden = true;
      state.keyword = '';
      state.page = 1;
      refresh();
    });

    els.historyChips.addEventListener('click', function (e) {
      var k = e.target.dataset.history;
      if (!k) return;
      els.searchInput.value = k;
      els.btnClearSearch.hidden = false;
      state.keyword = k;
      state.page = 1;
      refresh();
    });

    // 侧栏筛选
    els.filterSeries.addEventListener('click', function (e) {
      var li = e.target.closest('li[data-series]');
      if (!li) return;
      state.series = state.series === li.dataset.series ? '' : li.dataset.series;
      state.page = 1;
      refresh();
    });
    els.filterType.addEventListener('click', function (e) {
      var li = e.target.closest('li[data-mtype]');
      if (!li) return;
      state.mtype = state.mtype === li.dataset.mtype ? '' : li.dataset.mtype;
      state.page = 1;
      refresh();
    });
    els.activeFilters.addEventListener('click', function (e) {
      var key = e.target.dataset.clear;
      if (!key) return;
      if (key === 'all') { state.keyword = ''; state.series = ''; state.mtype = ''; els.searchInput.value = ''; els.btnClearSearch.hidden = true; }
      else if (key === 'keyword') { state.keyword = ''; els.searchInput.value = ''; els.btnClearSearch.hidden = true; }
      else state[key] = '';
      state.page = 1;
      refresh();
    });

    // 排序 / 视图
    els.sortSelect.addEventListener('change', function () {
      state.sort = els.sortSelect.value;
      refresh();
    });
    document.querySelector('.view-toggle').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-view]');
      if (!btn) return;
      state.view = btn.dataset.view;
      Array.prototype.forEach.call(this.querySelectorAll('[data-view]'), function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      els.tableWrap.hidden = state.view !== 'table';
      els.cardGrid.hidden = state.view !== 'card';
      refresh();
    });

    // 分页
    els.btnPrev.addEventListener('click', function () {
      if (state.page > 1) { state.page--; refresh(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    els.btnNext.addEventListener('click', function () {
      state.page++;
      refresh();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 表格 / 卡片 行内操作（事件委托）
    function handleListClick(e) {
      var del = e.target.closest('[data-del]');
      var edit = e.target.closest('[data-edit]');
      var detail = e.target.closest('[data-detail]');
      if (del) {
        var dm = M.getMaterialById(del.dataset.del);
        if (!dm) return;
        if (window.confirm('确认删除「' + (dm.name || dm.code) + '」？删除后不可恢复。')) {
          M.deleteMaterial(dm.id);
          refresh();
          toast('已删除', 'ok');
        }
        return;
      }
      if (edit) { openDrawer(M.getMaterialById(edit.dataset.edit)); return; }
      if (detail) { openDetail(detail.dataset.detail); }
    }
    els.tableBody.addEventListener('click', handleListClick);
    els.cardGrid.addEventListener('click', handleListClick);

    // 新增 / 恢复 / 清空
    $('btnNew').addEventListener('click', function () { openDrawer(null); });
    $('btnRestoreSeed').addEventListener('click', function () {
      if (!window.confirm('将删除现有全部物料并恢复初始 14 条，确认继续？')) return;
      M.restoreSeed();
      state.page = 1;
      refresh();
      toast('已恢复初始数据', 'ok');
    });
    $('btnClearAll').addEventListener('click', function () {
      if (!window.confirm('将清空全部物料（此操作不可恢复，建议先导出备份），确认继续？')) return;
      M.clearMaterials();
      state.page = 1;
      refresh();
      toast('已清空', 'ok');
    });

    // 导出 / 导入
    $('btnExport').addEventListener('click', exportJSON);
    $('btnImport').addEventListener('click', function () { $('fileImport').click(); });
    $('fileImport').addEventListener('change', function () {
      if (this.files && this.files[0]) handleImportFile(this.files[0]);
      this.value = '';
    });

    // 抽屉
    $('btnDrawerClose').addEventListener('click', closeDrawer);
    $('btnCancel').addEventListener('click', closeDrawer);
    els.drawerMask.addEventListener('click', closeDrawer);
    $('btnSave').addEventListener('click', saveMaterial);

    // 照片增删预览
    $('btnAddPhoto').addEventListener('click', function () { els.filePhoto.click(); });
    $('btnAddFake').addEventListener('click', function () { els.fileFake.click(); });
    els.filePhoto.addEventListener('change', function () { handlePhotoPick(this, false); });
    els.fileFake.addEventListener('change', function () { handlePhotoPick(this, true); });

    function photoListClick(e, isFake) {
      var rm = e.target.closest('[data-rm]');
      if (rm) {
        var list = isFake ? state.editFakePhotos : state.editPhotos;
        list.splice(Number(rm.dataset.rm), 1);
        renderPhotoList();
        return;
      }
      var img = e.target.closest('[data-preview]');
      if (img) {
        var l = isFake ? state.editFakePhotos : state.editPhotos;
        window.open(photoUrl(l[Number(img.dataset.preview)]), '_blank');
      }
    }
    els.photoList.addEventListener('click', function (e) { photoListClick(e, false); });
    els.fakeList.addEventListener('click', function (e) { photoListClick(e, true); });

    // 批量导入弹窗
    $('btnModalClose').addEventListener('click', function () {
      els.modalMask.hidden = true;
      state.pendingImport = null;
    });
    els.modalMask.addEventListener('click', function (e) {
      if (e.target === els.modalMask) { els.modalMask.hidden = true; state.pendingImport = null; }
    });
    $('btnImportPreview').addEventListener('click', doPreviewImport);
    $('btnImportConfirm').addEventListener('click', doImport);
    els.importText.addEventListener('input', function () { state.pendingImport = null; });

    // 详情弹窗
    function closeDetailClick() { closeDetail(); }
    $('btnDetailClose').addEventListener('click', closeDetailClick);
    $('btnDetailClose2').addEventListener('click', closeDetailClick);
    els.detailMask.addEventListener('click', function (e) { if (e.target === els.detailMask) closeDetail(); });
    $('btnDetailEdit').addEventListener('click', function () {
      var id = this.dataset.edit;
      if (!id) return;
      closeDetail();
      openDrawer(M.getMaterialById(id));
    });
    els.detailBody.addEventListener('click', function (e) {
      var src = e.target.dataset.open;
      if (src) window.open(src, '_blank');
    });

    // 全局快捷键：Esc 关闭浮层
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!els.detailMask.hidden) closeDetail();
      else if (!els.modalMask.hidden) { els.modalMask.hidden = true; state.pendingImport = null; }
      else if (!els.drawer.hidden) closeDrawer();
    });
  }

  // ---------- 启动 ----------
  function init() {
    bind();
    refresh();
    console.log('[物料库管理后台] 已加载，物料数：' + M.getMaterials().length);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

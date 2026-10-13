/**
 * Web 管理后台运行时适配层
 *
 * 小程序 utils 依赖 wx.getStorageSync / wx.setStorageSync / wx.removeStorageSync。
 * 浏览器里没有 wx，这里用 localStorage 实现同名接口，并保持与小程序完全一致的存储键，
 * 于是「小程序导出的 JSON ↔ 网页后台」可以自由互通。
 *
 * 用法：必须在 web/assets/app-bundle.js 之前引入。
 */
(function () {
  if (window.wx && window.wx.__isMock) return;

  var PREFIX = 'inventory_wxapp:'; // 加前缀避免和网页其他数据打架

  function realKey(key) {
    return PREFIX + key;
  }

  function getStorageSync(key) {
    try {
      var raw = window.localStorage.getItem(realKey(key));
      if (raw === null) return '';
      return JSON.parse(raw);
    } catch (e) {
      return '';
    }
  }

  function setStorageSync(key, value) {
    try {
      window.localStorage.setItem(realKey(key), JSON.stringify(value));
    } catch (e) {
      // 配额满等情况：抛出让上层提示
      throw new Error('本地存储写入失败（可能超出浏览器配额）：' + e.message);
    }
  }

  function removeStorageSync(key) {
    window.localStorage.removeItem(realKey(key));
  }

  function clearStorageSync() {
    Object.keys(window.localStorage)
      .filter(function (k) { return k.indexOf(PREFIX) === 0; })
      .forEach(function (k) { window.localStorage.removeItem(k); });
  }

  function getStorageInfoSync() {
    var keys = [];
    var size = 0;
    Object.keys(window.localStorage).forEach(function (k) {
      if (k.indexOf(PREFIX) === 0) {
        keys.push(k.slice(PREFIX.length));
        size += (window.localStorage.getItem(k) || '').length;
      }
    });
    return { keys: keys, currentSize: Math.ceil(size / 1024), limitSize: 5120 };
  }

  window.wx = {
    __isMock: true,
    getStorageSync: getStorageSync,
    setStorageSync: setStorageSync,
    removeStorageSync: removeStorageSync,
    clearStorageSync: clearStorageSync,
    getStorageInfoSync: getStorageInfoSync,
    showToast: function (opts) {
      var o = opts || {};
      if (o.title) console.log('[toast]', o.title);
    },
    showModal: function () { /* 网页端用原生 confirm 替代，不用这个 */ },
    previewImage: function (opts) {
      var o = opts || {};
      var urls = o.urls || [];
      if (o.current) window.open(o.current, '_blank');
      else if (urls.length) window.open(urls[0], '_blank');
    }
  };
})();

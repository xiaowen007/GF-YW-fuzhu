/**
 * 把小程序端 utils 打包成 Web 管理后台可直接 <script> 加载的 bundle。
 *
 * 打包理由：物料查询的搜索算法（拼音、同义词、编辑距离容错）已经在
 * utils/pinyin.js、utils/material-synonyms.js、utils/materials.js 里实现，
 * Web 后台必须复用同一套逻辑，否则「小程序搜得到、网页搜不到」。
 *
 * 做法：给每个模块套一层 CommonJS 壳（__modules[path] = function(module, exports, require)），
 * 实现一个极简 require，把 5 个模块合成单文件。pinyin-data.js 体积较大（~83KB），
 * 但字符串字面量本来就是合法 JS，直接内联即可。
 *
 * 用法：node scripts/build-web-bundle.js
 * 产物：web/assets/app-bundle.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'web', 'assets', 'app-bundle.js');

// 需要打包的模块（相对 utils/），顺序无关，require 时按需取
const MODULES = [
  'pinyin-data.js',
  'pinyin.js',
  'material-synonyms.js',
  'material-seed.js',
  'materials.js'
];

/**
 * 打包前对源码做最小改写：
 * materials.js 里的 storage.uuid()、wx.* 在小程序外不可用，
 * 由下面的 shim 提供（见运行时适配层），这里不动源码。
 */
function wrap(relPath, source) {
  return [
    `__modules[${JSON.stringify('./' + relPath)}] = function (module, exports, require) {`,
    source,
    '};'
  ].join('\n');
}

const parts = [];
parts.push('/* 由 scripts/build-web-bundle.js 自动生成，请勿手改 */');
parts.push('/* 源：utils/{pinyin-data,pinyin,material-synonyms,material-seed,materials}.js */');
parts.push('(function () {');
parts.push('var __modules = {};');
parts.push('var __cache = {};');
parts.push('function __require(id) {');
parts.push('  if (__cache[id]) return __cache[id].exports;');
parts.push('  var mod = __cache[id] = { exports: {} };');
parts.push('  var fn = __modules[id];');
parts.push('  if (!fn) throw new Error("模块未打包: " + id);');
parts.push('  fn(mod, mod.exports, __require);');
parts.push('  return mod.exports;');
parts.push('}');

MODULES.forEach(rel => {
  const abs = path.join(ROOT, 'utils', rel);
  const source = fs.readFileSync(abs, 'utf-8');
  parts.push(wrap(rel, source));
});

// storage.js 替身：Web 后台只用得到 uuid()，完整实现依赖扫码记录等无关逻辑，故内联精简版
parts.push([
  '__modules["./storage.js"] = function (module, exports, require) {',
  '  function uuid() {',
  '    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 11);',
  '  }',
  '  module.exports = { uuid: uuid };',
  '};'
].join('\n'));

parts.push('window.NavMaterialCore = {');
parts.push('  materials: __require("./materials.js"),');
parts.push('  synonyms: __require("./material-synonyms.js"),');
parts.push('  seed: __require("./material-seed.js")');
parts.push('};');
parts.push('})();');

fs.writeFileSync(OUT, parts.join('\n\n'), 'utf-8');
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`已生成 ${path.relative(ROOT, OUT)}（${kb} KB）`);

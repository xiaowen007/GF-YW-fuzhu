/**
 * 物料查询 · 拼音工具
 * 基于 utils/pinyin-data.js（GB2312 汉字无声调拼音）把中文转成可被 ASCII 输入命中的索引串。
 *
 * 每个中文名生成三套索引：
 *   full  首选读音拼接        「断路器」→ duanluqi
 *   initials 首选首字母拼接   「断路器」→ dlq
 *   alt   非首选读音拼接       「重」→ chong（首选 zhong）
 * 匹配时对这三套串做 includes，即可支持全拼 / 首字母 / 多音字变体输入。
 */

const DICT = require('./pinyin-data.js');

/** 取一个汉字的全部读音（无声调），非字典内汉字返回 null */
function charPinyins(ch) {
  const value = DICT[ch];
  return value ? value.split(',') : null;
}

/** 文本是否含字典内汉字 */
function hasHan(text) {
  const str = String(text || '');
  for (let i = 0; i < str.length; i++) {
    if (DICT[str[i]]) return true;
  }
  return false;
}

/**
 * 把一段文本转成拼音索引。
 *   full       首选读音拼接            「断路器」→ duanluqi
 *   initials   首选首字母拼接           「断路器」→ dlq
 *   alt        多音字变体（空格连接）    「重合闸」→ chonghezha（首选 zhonghezha）
 *   variants   全部变体数组
 * 多音字超过 4 个或组合超过 8 个时只用首选读音，避免组合爆炸。
 * @returns {{ full: string, initials: string, alt: string, variants: string[] }}
 */
function pinyinIndex(text) {
  const charList = [];
  const str = String(text || '');
  for (let i = 0; i < str.length; i++) {
    const ps = charPinyins(str[i]);
    if (ps && ps.length) charList.push(ps);
  }
  if (!charList.length) return { full: '', initials: '', alt: '', variants: [] };

  const full = charList.map(ps => ps[0]).join('');
  const initials = charList.map(ps => ps[0][0]).join('');

  const multiCount = charList.filter(ps => ps.length > 1).length;
  const variants = [];
  if (multiCount > 0 && multiCount <= 4) {
    const seen = new Set();
    const combine = (i, acc) => {
      if (variants.length >= 8) return;
      if (i >= charList.length) {
        if (!seen.has(acc)) {
          seen.add(acc);
          variants.push(acc);
        }
        return;
      }
      charList[i].forEach(p => combine(i + 1, acc + p));
    };
    combine(0, '');
  }
  if (!variants.length) variants.push(full);

  const alt = variants.filter(v => v !== full).join(' ');
  return { full, initials, alt, variants };
}

/**
 * 判断一个查询 token 是否"像拼音"（纯字母、长度 ≥2），只有这类 token 才走拼音域匹配，
 * 避免把中文或数字 token 浪费在拼音判断上。
 */
function looksLikePinyin(token) {
  return /^[a-z]{2,}$/i.test(String(token || ''));
}

module.exports = {
  charPinyins,
  hasHan,
  pinyinIndex,
  looksLikePinyin
};

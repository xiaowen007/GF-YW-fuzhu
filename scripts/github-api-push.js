/**
 * 通过 GitHub REST Contents API 推送本地文件到远程仓库。
 *
 * 用途：沙箱环境无法访问 github.com（git push 走不通），但 api.github.com 可通，
 * 因此改用 REST API 逐文件提交。适用于首次推送或全量同步。
 *
 * 用法：
 *   node scripts/github-api-push.js <owner> <repo> <token> [branch]
 *
 * 注意：Contents API 每个文件一次请求，157 个文件约需 157 次调用。
 * 已存在的文件会自动带上 sha 做更新，不存在的直接创建。
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const [, , OWNER, REPO, TOKEN, BRANCH = 'main'] = process.argv;

if (!OWNER || !REPO || !TOKEN) {
  console.error('用法: node scripts/github-api-push.js <owner> <repo> <token> [branch]');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');
const API_HOST = 'api.github.com';

// 需要跳过的目录/文件（与 .gitignore 对齐）
const SKIP_DIRS = new Set(['.git', '.tmp', 'node_modules', '.playwright-cli', '.workbuddy']);
const SKIP_FILES = new Set(['config.json', '.env', 'project.private.config.json']);

function apiRequestOnce(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        host: API_HOST,
        path: apiPath,
        method,
        headers: Object.assign(
          {
            Authorization: `token ${TOKEN}`,
            'User-Agent': 'gf-yw-fuzhu-push',
            Accept: 'application/vnd.github+json',
          },
          payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}
        ),
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try { json = data ? JSON.parse(data) : null; } catch (e) { json = { raw: data }; }
          resolve({ status: res.statusCode, body: json });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// 带重试的请求：网络抖动（ECONNRESET / ETIMEDOUT / socket hang up）自动重试
async function apiRequest(method, apiPath, body, retries = 4) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await apiRequestOnce(method, apiPath, body);
    } catch (err) {
      lastErr = err;
      const delay = 800 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// 递归收集待推送文件（相对路径，统一 / 分隔）
function collectFiles(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.git') && entry.name === '.git') continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...collectFiles(path.join(dir, entry.name), rel));
    } else {
      if (SKIP_FILES.has(entry.name)) continue;
      if (entry.name.endsWith('.key')) continue;
      out.push(rel);
    }
  }
  return out;
}

// 判断文件是否应作为二进制（用 base64）— 实际上 Contents API 始终用 base64
function isBinary(buf) {
  const len = Math.min(buf.length, 8000);
  for (let i = 0; i < len; i++) if (buf[i] === 0) return true;
  return false;
}

// 计算 git blob 的 sha1：sha1("blob <字节数>\0" + 内容)
// 与 GitHub 返回的 blob sha 同一算法，可据此判断内容是否真的变了
function gitBlobSha(buf) {
  const header = Buffer.from(`blob ${buf.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([header, buf])).digest('hex');
}

// 拉取远程已有文件：路径 → blob sha（只比对 sha，不下载内容，省流量）
async function fetchRemoteBlobs() {
  const res = await apiRequest('GET', `/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`);
  if (res.status !== 200 || !res.body || !Array.isArray(res.body.tree)) return new Map();
  const map = new Map();
  res.body.tree.filter((n) => n.type === 'blob').forEach((n) => map.set(n.path, n.sha));
  return map;
}

(async function main() {
  const allFiles = collectFiles(ROOT);
  const remoteBlobs = await fetchRemoteBlobs();

  // 只推「远程没有」或「内容不一样」的文件
  const pending = [];
  let unchanged = 0;
  for (const rel of allFiles) {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    const sha = gitBlobSha(buf);
    if (remoteBlobs.get(rel) === sha) { unchanged++; continue; }
    pending.push({ rel, buf, sha });
  }

  console.log(`本地 ${allFiles.length} 个文件，远程已有 ${remoteBlobs.size} 个，内容相同 ${unchanged} 个，待推送 ${pending.length} 个 -> ${OWNER}/${REPO}@${BRANCH}\n`);

  if (!pending.length) {
    console.log('远程已是最新，无需推送。');
    return;
  }

  let ok = 0, fail = 0;
  const failures = [];

  for (let i = 0; i < pending.length; i++) {
    const { rel, buf } = pending[i];
    const contentB64 = buf.toString('base64');
    const apiPath = `/repos/${OWNER}/${REPO}/contents/${rel.split('/').map(encodeURIComponent).join('/')}`;

    const body = {
      message: `chore: sync ${rel}`,
      content: contentB64,
      branch: BRANCH,
    };
    // 已存在的文件必须带上原 sha，否则 API 拒绝更新
    const oldSha = remoteBlobs.get(rel);
    if (oldSha) body.sha = oldSha;

    let res;
    try {
      res = await apiRequest('PUT', apiPath, body);
    } catch (err) {
      fail++;
      failures.push(`${rel} -> 网络错误 ${err.code || err.message}`);
      console.error(`✗ ${rel} -> 网络错误 ${err.code || err.message}`);
      continue;
    }

    // 首次推送时 branch 尚不存在，Contents API 允许不带 branch 创建默认分支
    if (res.status === 422 && i === 0) {
      delete body.branch;
      res = await apiRequest('PUT', apiPath, body);
    }

    if (res.status === 200 || res.status === 201) {
      ok++;
      if ((i + 1) % 20 === 0 || i === pending.length - 1) {
        console.log(`进度 ${i + 1}/${pending.length} (ok=${ok}, fail=${fail})`);
      }
    } else {
      fail++;
      const msg = (res.body && (res.body.message || JSON.stringify(res.body).slice(0, 200))) || 'unknown';
      failures.push(`${rel} -> ${res.status} ${msg}`);
      console.error(`✗ ${rel} -> ${res.status} ${msg}`);
    }
  }

  console.log(`\n完成: 成功 ${ok}, 失败 ${fail}`);
  if (failures.length) {
    console.log('\n失败清单:');
    failures.slice(0, 30).forEach((f) => console.log('  ' + f));
    process.exit(1);
  }
})();

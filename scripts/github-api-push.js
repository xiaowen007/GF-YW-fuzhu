#!/usr/bin/env node
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

function apiRequest(method, apiPath, body) {
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

async function getExistingSha(apiPath) {
  const res = await apiRequest('GET', apiPath);
  if (res.status === 200 && res.body && res.body.sha) return res.body.sha;
  return null;
}

(async function main() {
  const files = collectFiles(ROOT);
  console.log(`共 ${files.length} 个文件待推送 -> ${OWNER}/${REPO}@${BRANCH}\n`);

  let ok = 0, fail = 0, skipped = 0;
  const failures = [];

  for (let i = 0; i < files.length; i++) {
    const rel = files[i];
    const abs = path.join(ROOT, rel);
    const buf = fs.readFileSync(abs);
    const contentB64 = buf.toString('base64');
    const apiPath = `/repos/${OWNER}/${REPO}/contents/${rel.split('/').map(encodeURIComponent).join('/')}`;

    // 先查是否已存在，决定是否带 sha（更新）
    let sha = await getExistingSha(apiPath);
    // 已存在且内容相同则跳过（对比 blob 内容需要额外请求，这里简单按 sha 存在即更新）
    const body = {
      message: `chore: sync ${rel}`,
      content: contentB64,
      branch: BRANCH,
    };
    if (sha) body.sha = sha;

    let res = await apiRequest('PUT', apiPath, body);

    // 首次推送时 branch 尚不存在，Contents API 允许不带 branch 创建默认分支
    if (res.status === 422 && i === 0) {
      delete body.branch;
      res = await apiRequest('PUT', apiPath, body);
    }

    if (res.status === 200 || res.status === 201) {
      ok++;
      if ((i + 1) % 20 === 0 || i === files.length - 1) {
        console.log(`进度 ${i + 1}/${files.length} (ok=${ok}, fail=${fail})`);
      }
    } else {
      fail++;
      const msg = (res.body && (res.body.message || JSON.stringify(res.body).slice(0, 200))) || 'unknown';
      failures.push(`${rel} -> ${res.status} ${msg}`);
      console.error(`✗ ${rel} -> ${res.status} ${msg}`);
    }
  }

  console.log(`\n完成: 成功 ${ok}, 失败 ${fail}, 跳过 ${skipped}`);
  if (failures.length) {
    console.log('\n失败清单:');
    failures.slice(0, 30).forEach((f) => console.log('  ' + f));
    process.exit(1);
  }
})();

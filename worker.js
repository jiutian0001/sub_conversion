/**
 * 订阅转换 Cloudflare Worker（隐私保护版）
 *
 * 核心隐私保护逻辑：
 *   1. 拉取用户订阅，把 server/password/uuid 替换成随机占位符
 *   2. 脱敏内容存 R2，生成临时链接发给第三方后端（后端看不到真实数据）
 *   3. 后端返回结果后，把占位符全部还原成真实值
 *   4. 把最终结果存 R2，返回稳定订阅链接给前端
 *   5. 删除临时 R2 数据
 *
 * 环境变量：
 *   BACKEND    后端转换地址，例如 https://api.v1.mk
 *
 * R2 绑定：
 *   SUB_BUCKET 绑定你的 R2 Bucket
 *
 * 路由：
 *   GET  /            → 前端页面
 *   GET  /convert     → 执行转换，返回 JSON { url }
 *   GET  /sub/:key    → 返回存储内容（供后端拉取或客户端订阅）
 */

// ─── 内嵌前端 ──────────────────────────────────────────────────────────────────

const FRONTEND_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>订阅转换</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#fff;border-radius:14px;box-shadow:0 4px 28px rgba(0,0,0,.09);padding:36px 40px;width:100%;max-width:580px}
    h1{font-size:22px;font-weight:700;color:#111;margin-bottom:28px}
    label{display:block;font-size:13px;color:#555;margin:16px 0 6px;font-weight:500}
    input,select,textarea{width:100%;padding:10px 14px;border:1.5px solid #e0e3e8;border-radius:9px;font-size:14px;color:#222;background:#fafbfd;outline:none;transition:border .18s,box-shadow .18s}
    input:focus,select:focus,textarea:focus{border-color:#4f8ef7;background:#fff;box-shadow:0 0 0 3px rgba(79,142,247,.12)}
    textarea{resize:vertical;min-height:90px;line-height:1.6}
    .btn{margin-top:24px;width:100%;padding:13px;background:#4f8ef7;color:#fff;border:none;border-radius:9px;font-size:15px;font-weight:600;cursor:pointer;transition:background .18s}
    .btn:hover{background:#3a7de0}
    .btn:disabled{background:#a0b4d6;cursor:not-allowed}
    .result{margin-top:22px;display:none}
    .result-label{font-size:13px;color:#4f8ef7;font-weight:500;margin-bottom:6px}
    .row{display:flex;gap:10px;align-items:center}
    .row input{flex:1}
    .copy-btn{white-space:nowrap;padding:10px 20px;background:#4f8ef7;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;transition:background .18s}
    .copy-btn:hover{background:#3a7de0}
    .copy-btn.ok{background:#22c55e}
    .err{margin-top:14px;color:#e53e3e;font-size:13px;background:#fff5f5;border:1px solid #fed7d7;border-radius:8px;padding:10px 14px;display:none}
    .tip{font-size:12px;color:#999;margin-top:8px}
  </style>
</head>
<body>
<div class="card">
  <h1>🔗 订阅转换</h1>

  <label>订阅链接 <span style="color:#999;font-weight:400">（多个用 | 分隔，支持 http/vmess/vless/trojan/ss/ssr）</span></label>
  <textarea id="urlInput" placeholder="https://example.com/sub&#10;vmess://xxxxx|trojan://xxxxx"></textarea>

  <label>目标格式</label>
  <select id="target">
    <option value="clash">Clash</option>
    <option value="singbox">SingBox</option>
    <option value="surge">Surge 4</option>
    <option value="quan">Quantumult</option>
    <option value="quanx">Quantumult X</option>
    <option value="loon">Loon</option>
    <option value="surfboard">Surfboard</option>
    <option value="v2ray">V2Ray / Base64</option>
  </select>

  <label>后端地址</label>
  <select id="backend" onchange="onBackendChange(this)">
    <option value="https://api.v1.mk">api.v1.mk（推荐）</option>
    <option value="https://sub.v1.mk">sub.v1.mk</option>
    <option value="https://subapi.fxxk.dedyn.io">subapi.fxxk.dedyn.io</option>
    <option value="custom">自定义...</option>
  </select>
  <input id="backendCustom" placeholder="https://your-backend.com" style="margin-top:8px;display:none" />

  <button class="btn" id="btn" onclick="doConvert()">生成订阅链接</button>
  <div class="err" id="err"></div>

  <div class="result" id="result">
    <div class="result-label">转换结果</div>
    <div class="row">
      <input id="out" readonly />
      <button class="copy-btn" id="copyBtn" onclick="doCopy()">复制</button>
    </div>
    <p class="tip">⚠️ 此链接包含你的节点数据，请勿分享给他人</p>
  </div>
</div>
<script>
function onBackendChange(sel) {
  document.getElementById('backendCustom').style.display = sel.value === 'custom' ? 'block' : 'none';
}

function getBackend() {
  const sel = document.getElementById('backend');
  if (sel.value === 'custom') return document.getElementById('backendCustom').value.trim();
  return sel.value;
}

async function doConvert() {
  const urlInput = document.getElementById('urlInput').value.trim();
  const target   = document.getElementById('target').value;
  const backend  = getBackend();
  const errEl    = document.getElementById('err');
  const resultEl = document.getElementById('result');
  const btn      = document.getElementById('btn');

  errEl.style.display = 'none';
  resultEl.style.display = 'none';
  if (!urlInput) { showErr('请输入订阅链接'); return; }
  if (!backend)  { showErr('请输入后端地址'); return; }

  btn.disabled = true;
  btn.textContent = '转换中...';
  try {
    const qs = new URLSearchParams({ url: urlInput, target, bd: backend });
    const res = await fetch('/convert?' + qs);
    const text = await res.text();
    if (!res.ok) { showErr('转换失败：' + text); return; }
    const data = JSON.parse(text);
    document.getElementById('out').value = data.url || '';
    resultEl.style.display = 'block';
  } catch(e) {
    showErr(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '生成订阅链接';
  }
}

function showErr(msg) {
  const el = document.getElementById('err');
  el.textContent = msg;
  el.style.display = 'block';
}

function doCopy() {
  const val = document.getElementById('out').value;
  navigator.clipboard.writeText(val).catch(() => {
    document.getElementById('out').select();
    document.execCommand('copy');
  });
  const btn = document.getElementById('copyBtn');
  btn.textContent = '已复制 ✓';
  btn.classList.add('ok');
  setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('ok'); }, 2000);
}
</script>
</body>
</html>`;

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function generateRandomStr(len) {
  return Math.random().toString(36).substring(2, 2 + len);
}

function generateRandomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

function urlSafeBase64Encode(input) {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function urlSafeBase64Decode(input) {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  return atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
}

function parseData(data) {
  try {
    const decoded = urlSafeBase64Decode(data.replace(/\s/g, ''));
    if (/^(ssr?|vmess1?|trojan|vless|hysteria):\/\//m.test(decoded) || decoded.includes('\n')) {
      return { format: 'base64', data: decoded };
    }
  } catch (_) {}
  if (/^proxies:|^proxy-groups:/m.test(data)) {
    return { format: 'yaml', data };
  }
  return { format: 'unknown', data };
}

function cReplace(match, ...pairs) {
  for (let i = 0; i < pairs.length; i += 2) {
    if (match === pairs[i]) return pairs[i + 1];
  }
  return match;
}

// ─── 各协议脱敏 & 还原 ─────────────────────────────────────────────────────────

function replaceSSR(link, replacements, isRecovery) {
  const body = link.slice('ssr://'.length).replace('\r', '').split('#')[0];
  const decoded = urlSafeBase64Decode(body);
  const m = decoded.match(/(\S+):(\d+?):(\S+?):(\S+?):(\S+?):(\S+)\//);
  if (!m) return;
  const [, server, , , , , password] = m;
  if (isRecovery) {
    return 'ssr://' + urlSafeBase64Encode(
      decoded
        .replace(password, urlSafeBase64Encode(replacements[urlSafeBase64Decode(password)]))
        .replace(server, replacements[server])
    );
  }
  const rPass = generateRandomStr(12);
  const rDomain = generateRandomStr(12) + '.com';
  replacements[rDomain] = server;
  replacements[rPass] = urlSafeBase64Decode(password);
  return 'ssr://' + urlSafeBase64Encode(
    decoded.replace(server, rDomain).replace(password, urlSafeBase64Encode(rPass))
  );
}

function replaceVmess(link, replacements, isRecovery) {
  const rUUID = generateRandomUUID();
  const rDomain = generateRandomStr(10) + '.com';

  const mRocket = link.match(/vmess:\/\/([A-Za-z0-9\-_]+)\?(.*)/);
  if (mRocket) {
    const b64 = mRocket[1];
    const m = urlSafeBase64Decode(b64).match(/(.*?):(.*?)@(.*):(.*)/);
    if (!m) return;
    const [, cipher, uuid, server, port] = m;
    replacements[rDomain] = server;
    replacements[rUUID] = uuid;
    return link.replace(b64, urlSafeBase64Encode(`${cipher}:${rUUID}@${rDomain}:${port}`));
  }

  const mKit = link.match(/vmess1:\/\/(.*?)@(.*):(.*?)\?(.*)/);
  if (mKit) {
    const [, uuid, server] = mKit;
    replacements[rDomain] = server;
    replacements[rUUID] = uuid;
    return link.replace(new RegExp(`${uuid}|${server}`, 'g'), (m) => cReplace(m, uuid, rUUID, server, rDomain));
  }

  let tempLink = link.replace(/vmess:\/\/|vmess1:\/\//g, '');
  try {
    tempLink = urlSafeBase64Decode(tempLink);
    const jsonData = JSON.parse(tempLink);
    const server = jsonData.add;
    const uuid = jsonData.id;
    const re = new RegExp(`${uuid}|${server}`, 'g');
    let result;
    if (isRecovery) {
      result = tempLink.replace(re, (m) => cReplace(m, uuid, replacements[uuid], server, replacements[server]));
    } else {
      replacements[rDomain] = server;
      replacements[rUUID] = uuid;
      result = tempLink.replace(re, (m) => cReplace(m, uuid, rUUID, server, rDomain));
    }
    return 'vmess://' + btoa(result);
  } catch (_) { return; }
}

function replaceSS(link, replacements, isRecovery) {
  const rPass = generateRandomStr(12);
  const rDomain = rPass + '.com';
  const body = link.slice('ss://'.length).split('#')[0];

  if (body.includes('@')) {
    const m1 = body.match(/(\S+?)@(\S+):/);
    if (!m1) return;
    const [, b64Data, server] = m1;
    const m2 = urlSafeBase64Decode(b64Data).match(/(\S+?):(\S+)/);
    if (!m2) return;
    const [, encryption, password] = m2;
    if (isRecovery) {
      return link.replace(b64Data, urlSafeBase64Encode(encryption + ':' + replacements[password]))
                 .replace(server, replacements[server]);
    }
    replacements[rDomain] = server;
    replacements[rPass] = password;
    return link.replace(b64Data, urlSafeBase64Encode(encryption + ':' + rPass))
               .replace(/@.*:/, `@${rDomain}:`);
  }

  try {
    const decoded = urlSafeBase64Decode(body);
    const m = decoded.match(/(\S+?):(\S+)@(\S+):/);
    if (!m) return;
    const [, , password, server] = m;
    replacements[rDomain] = server;
    replacements[rPass] = password;
    let result = 'ss://' + urlSafeBase64Encode(
      decoded.replace(/:.*@/, `:${rPass}@`).replace(/@.*:/, `@${rDomain}:`)
    );
    const hash = link.match(/#.*/);
    if (hash) result += hash[0];
    return result;
  } catch (_) { return; }
}

function replaceTrojan(link, replacements, isRecovery) {
  const rUUID = generateRandomUUID();
  const rDomain = generateRandomStr(10) + '.com';
  const m = link.match(/(vless|trojan):\/\/(.*?)@(.*):/);
  if (!m) return;
  const [, , uuid, server] = m;
  replacements[rDomain] = server;
  replacements[rUUID] = uuid;
  const re = new RegExp(`${uuid}|${server}`, 'g');
  if (isRecovery) {
    return link.replace(re, (match) => cReplace(match, uuid, replacements[uuid], server, replacements[server]));
  }
  return link.replace(re, (match) => cReplace(match, uuid, rUUID, server, rDomain));
}

function replaceHysteria(link, replacements) {
  const m = link.match(/hysteria:\/\/(.*):(.*?)\?/);
  if (!m) return;
  const server = m[1];
  const rDomain = generateRandomStr(12) + '.com';
  replacements[rDomain] = server;
  return link.replace(server, rDomain);
}

function replaceInUri(link, replacements, isRecovery) {
  if (link.startsWith('ss://'))        return replaceSS(link, replacements, isRecovery);
  if (link.startsWith('ssr://'))       return replaceSSR(link, replacements, isRecovery);
  if (link.startsWith('vmess://') || link.startsWith('vmess1://'))
                                       return replaceVmess(link, replacements, isRecovery);
  if (link.startsWith('trojan://') || link.startsWith('vless://'))
                                       return replaceTrojan(link, replacements, isRecovery);
  if (link.startsWith('hysteria://'))  return replaceHysteria(link, replacements);
  return;
}

function replaceYAML(yamlText, replacements) {
  return yamlText
    .replace(/^(\s*server:\s*)(.+)$/gm, (_, prefix, val) => {
      const rDomain = generateRandomStr(12) + '.com';
      replacements[rDomain] = val.trim();
      return prefix + rDomain;
    })
    .replace(/^(\s*password:\s*)(.+)$/gm, (_, prefix, val) => {
      const rPass = generateRandomStr(12);
      replacements[rPass] = val.trim();
      return prefix + rPass;
    })
    .replace(/^(\s*uuid:\s*)(.+)$/gm, (_, prefix, val) => {
      const rUUID = generateRandomUUID();
      replacements[rUUID] = val.trim();
      return prefix + rUUID;
    });
}

// ─── Worker 主逻辑 ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.origin;
    const SUB_BUCKET = env.SUB_BUCKET;
    const subDir = 'sub';
    let backend = '';

    const pathSegments = url.pathname.split('/').filter(Boolean);
    const firstSeg = pathSegments[0];

    // ── GET / → 前端页面 ──────────────────────────────────────────────────────
    if (!firstSeg) {
      return new Response(FRONTEND_HTML, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }

    // ── GET /sub/:key → 返回存储内容 ─────────────────────────────────────────
    if (firstSeg === subDir && pathSegments.length === 2) {
      const key = pathSegments[1];
      const object = await SUB_BUCKET.get(key);
      if (!object) return new Response('Not Found', { status: 404 });
      const objectHeaders = await SUB_BUCKET.get(key + '_headers');
      const headers = objectHeaders
        ? new Headers(await objectHeaders.json())
        : new Headers({ 'Content-Type': 'text/plain;charset=UTF-8' });
      return new Response(object.body, { headers });
    }

    // ── GET /convert → 执行订阅转换 ──────────────────────────────────────────
    if (firstSeg !== 'convert') {
      return new Response('Not Found', { status: 404 });
    }

    const urlParam = url.searchParams.get('url');
    if (!urlParam) return jsonErr('Missing url parameter', 400);

    const backendParam = url.searchParams.get('bd');
    if (!backendParam) return jsonErr('Missing backend parameter (bd)', 400);
    if (!/^https?:\/\/[^/]+\..+/.test(backendParam)) return jsonErr('Invalid backend URL', 400);
    backend = backendParam.replace(/(https?:\/\/[^/]+).*$/, '$1');

    const replacements = {};
    const replacedURIs = [];
    const tempKeys = [];

    const urlParts = urlParam.split('|').map((s) => s.trim()).filter(Boolean);
    if (!urlParts.length) return jsonErr('No valid links', 400);

    if (urlParam.startsWith('proxies:')) {
      // proxies: 开头的 YAML 直接内容
      const parsed = parseData(urlParam.replace(/\|/g, '\r\n'));
      if (parsed.format === 'yaml') {
        const key = generateRandomStr(11);
        const replaced = replaceYAML(parsed.data, replacements);
        if (replaced) {
          await SUB_BUCKET.put(key, replaced);
          tempKeys.push(key);
          replacedURIs.push(`${host}/${subDir}/${key}`);
        }
      }
    } else {
      for (const part of urlParts) {
        const key = generateRandomStr(11);
        let parsedObj;

        if (part.startsWith('http://') || part.startsWith('https://')) {
          let resp;
          try {
            resp = await fetch(part, { method: request.method, headers: request.headers, redirect: 'follow' });
          } catch (_) { continue; }
          if (!resp.ok) continue;
          const text = await resp.text();
          parsedObj = parseData(text);
          await SUB_BUCKET.put(key + '_headers', JSON.stringify(Object.fromEntries(resp.headers)));
          tempKeys.push(key);
        } else {
          parsedObj = parseData(part);
        }

        // 单协议链接：脱敏后直接加入列表
        if (/^(ssr?|vmess1?|trojan|vless|hysteria):\/\//.test(part)) {
          const newLink = replaceInUri(part, replacements, false);
          if (newLink) replacedURIs.push(newLink);
          continue;
        }

        // base64
        if (parsedObj.format === 'base64') {
          const links = parsedObj.data.split(/\r?\n/).filter((l) => l.trim());
          const newLinks = links.map((l) => replaceInUri(l, replacements, false)).filter(Boolean);
          if (newLinks.length) {
            await SUB_BUCKET.put(key, btoa(newLinks.join('\r\n')));
            tempKeys.push(key);
            replacedURIs.push(`${host}/${subDir}/${key}`);
          }
          continue;
        }

        // YAML
        if (parsedObj.format === 'yaml') {
          const replaced = replaceYAML(parsedObj.data, replacements);
          if (replaced) {
            await SUB_BUCKET.put(key, replaced);
            tempKeys.push(key);
            replacedURIs.push(`${host}/${subDir}/${key}`);
          }
        }
      }
    }

    if (!replacedURIs.length) return jsonErr('All links failed to process', 502);

    // 构造后端请求（后端只看到脱敏数据）
    const backendUrl = new URL('/sub', backend);
    for (const [k, v] of url.searchParams.entries()) {
      if (k !== 'url' && k !== 'bd') backendUrl.searchParams.set(k, v);
    }
    backendUrl.searchParams.set('url', replacedURIs.join('|'));

    let rpResponse;
    try {
      rpResponse = await fetch(backendUrl.toString(), {
        headers: { 'User-Agent': request.headers.get('User-Agent') || 'ClashForAndroid/2.5.12' },
      });
    } catch (e) {
      await cleanup(SUB_BUCKET, tempKeys);
      return jsonErr('Backend request failed: ' + e.message, 502);
    }

    // 删除临时 R2 数据
    await cleanup(SUB_BUCKET, tempKeys);

    if (!rpResponse.ok) {
      const errText = await rpResponse.text();
      return jsonErr('Backend error ' + rpResponse.status + ': ' + errText, 502);
    }

    // 对后端结果做还原替换
    const rpText = await rpResponse.text();
    let finalContent;

    try {
      const decoded = urlSafeBase64Decode(rpText.trim());
      const links = decoded.split(/\r?\n/).filter((l) => l.trim());
      const restored = links.map((l) => replaceInUri(l, replacements, true)).filter(Boolean);
      finalContent = btoa(restored.join('\r\n'));
    } catch (_) {
      const rKeys = Object.keys(replacements);
      if (rKeys.length) {
        const re = new RegExp(rKeys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
        finalContent = rpText.replace(re, (m) => replacements[m] || m);
      } else {
        finalContent = rpText;
      }
    }

    // 把最终结果存 R2，返回稳定链接
    const resultKey = generateRandomStr(11);
    const resultHeaders = {
      'Content-Type': rpResponse.headers.get('Content-Type') || 'text/plain;charset=UTF-8',
    };
    for (const h of ['subscription-userinfo', 'content-disposition', 'profile-update-interval']) {
      const v = rpResponse.headers.get(h);
      if (v) resultHeaders[h] = v;
    }

    await SUB_BUCKET.put(resultKey, finalContent);
    await SUB_BUCKET.put(resultKey + '_headers', JSON.stringify(resultHeaders));

    return new Response(JSON.stringify({ url: `${host}/${subDir}/${resultKey}` }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

function jsonErr(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function cleanup(bucket, keys) {
  await Promise.all(keys.flatMap((k) => [bucket.delete(k), bucket.delete(k + '_headers')]));
}

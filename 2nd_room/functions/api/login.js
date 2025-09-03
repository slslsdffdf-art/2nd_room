// /functions/api/login.js

const json = (x, s = 200, h = {}) =>
  new Response(JSON.stringify(x), {
    status: s,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...h },
  });

function normPw(x) {
  return (x ?? '').toString().replace(/\r\n/g, '\n').trim().normalize('NFKC');
}

async function readPasswordFromBody(request) {
  const ct = (request.headers.get('Content-Type') || '').toLowerCase();
  try {
    if (ct.includes('application/json')) {
      const b = await request.json(); if (b && 'pw' in b) return normPw(b.pw);
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      const t = await request.text(); const p = new URLSearchParams(t); if (p.has('pw')) return normPw(p.get('pw'));
    } else if (ct.includes('multipart/form-data')) {
      const f = await request.formData(); if (f.has('pw')) return normPw(f.get('pw'));
    } else if (ct.includes('text/plain')) {
      const t = await request.text(); if (t) return normPw(t);
    } else {
      try { const b = await request.json(); if (b && 'pw' in b) return normPw(b.pw); } catch {}
      const t = await request.text(); if (t) return normPw(t);
    }
  } catch {}
  return '';
}

function isHTTPS(request) {
  try { return new URL(request.url).protocol === 'https:'; } catch { return false; }
}
function getCookie(req, name){
  const c=req.headers.get('Cookie')||''; const m=c.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'));
  return m?decodeURIComponent(m[1]):'';
}
function setCookie(H, name, value, { maxAge, httpOnly = true, secure } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  if (httpOnly) parts.push('HttpOnly');
  if (maxAge) parts.push(`Max-Age=${maxAge}`);
  H.append('Set-Cookie', parts.join('; '));
}
function uuid() {
  // RFC4122 v4 (간단 구현)
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x=>x.toString(16).padStart(2,'0'));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}

// === Rate limit (KV: LINES) ===
const WINDOW_SEC = 600; // 10분
const MAX_TRIES  = 5;

async function sha256Hex(s) {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function getRL(env, key) {
  const raw = await env.LINES?.get(key);
  return raw ? parseInt(raw, 10) || 0 : 0;
}
async function bumpRL(env, key) {
  const n = (await getRL(env, key)) + 1;
  await env.LINES?.put(key, String(n), { expirationTtl: WINDOW_SEC });
  return n;
}
async function clearRL(env, key) {
  try { await env.LINES?.delete(key); } catch {}
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  const input  = await readPasswordFromBody(request);
  const target = normPw(env.GATE_PASSWORD || env.OWNER_PASSWORD || env.PASSWORD || '');
  if (!target) return json({ error: 'server_not_configured' }, 500);

  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ipKey = 'rl:' + (await sha256Hex(ip));

  try {
    const tries = await getRL(env, ipKey);
    if (tries >= MAX_TRIES) return json({ error: 'too_many_attempts' }, 429);
  } catch {}

  if (input !== target) {
    try { await bumpRL(env, ipKey); } catch {}
    return json({ error: 'bad_passwords' }, 401);
  }

  // 성공
  try { await clearRL(env, ipKey); } catch {}

  const H = new Headers();
  const secure = isHTTPS(request);

  // ① 게임 접근용 세션
  setCookie(H, 'auth', 'ok', { maxAge: 60*60*12, httpOnly: true, secure });

  // ② 대기열 티켓 (없을 때만 발급) — queue.js가 이 쿠키를 보고 동작
  const hasQ2 = !!getCookie(request, 'q2');
  if (!hasQ2) {
    setCookie(H, 'q2', uuid(), { maxAge: 60*60*2, httpOnly: true, secure });
  }

  return json({ ok: true }, 200, Object.fromEntries(H.entries()));
}

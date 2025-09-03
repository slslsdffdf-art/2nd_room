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
      const b = await request.json();
      if (b && 'pw' in b) return normPw(b.pw);
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      const t = await request.text();
      const p = new URLSearchParams(t);
      if (p.has('pw')) return normPw(p.get('pw'));
    } else if (ct.includes('multipart/form-data')) {
      const f = await request.formData();
      if (f.has('pw')) return normPw(f.get('pw'));
    } else if (ct.includes('text/plain')) {
      const t = await request.text();
      if (t) return normPw(t);
    } else {
      // 관대한 파싱(모바일/특수 브라우저)
      try { const b = await request.json(); if (b && 'pw' in b) return normPw(b.pw); } catch {}
      const t = await request.text(); if (t) return normPw(t);
    }
  } catch {}
  return '';
}

function isHTTPS(request) {
  try { return new URL(request.url).protocol === 'https:'; } catch { return false; }
}

function setCookie(H, name, value, { maxAge, httpOnly = true, secure } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  if (httpOnly) parts.push('HttpOnly');
  if (maxAge) parts.push(`Max-Age=${maxAge}`);
  H.append('Set-Cookie', parts.join('; '));
}

async function sha256Hex(s) {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ==== Rate Limit (per IP) ====
const WINDOW_SEC = 600; // 10분
const MAX_TRIES = 5;

async function getRL(env, key) {
  const raw = await env.LINES.get(key);
  return raw ? parseInt(raw, 10) || 0 : 0;
}
async function bumpRL(env, key) {
  const n = (await getRL(env, key)) + 1;
  await env.LINES.put(key, String(n), { expirationTtl: WINDOW_SEC });
  return n;
}
async function clearRL(env, key) {
  try { await env.LINES.delete(key); } catch {}
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  const input = await readPasswordFromBody(request);
  const target = normPw(env.GATE_PASSWORD || env.OWNER_PASSWORD || '');

  if (!target) return json({ error: 'server_not_configured' }, 500);

  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ipKey = 'rl:' + (await sha256Hex(ip));     // 윈도우 내 시도 횟수
  const badKey = 'badpw:' + (await sha256Hex(ip)); // 선택: 최근 오입력 카운트

  // 1) 레이트리밋 체크 (Cloudflare 자체 429와 별개로 우리가 먼저 차단)
  try {
    const tries = await getRL(env, ipKey);
    if (tries >= MAX_TRIES) {
      return json({ error: 'too_many_attempts' }, 429);
    }
  } catch {
    // KV 에러는 무시하고 계속 (최악의 경우 레이트리밋만 비활성)
  }

  // 2) 비밀번호 비교
  if (input !== target) {
    try {
      const n = await bumpRL(env, ipKey);              // 윈도우 내 카운트 +1
      await env.LINES.put(badKey, String(n), { expirationTtl: WINDOW_SEC }); // 참고용
    } catch {}
    return json({ error: 'bad_passwords' }, 401);
  }

  // 3) 성공: 레이트리밋/실패카운트 정리 + 쿠키 발급
  try { await clearRL(env, ipKey); await clearRL(env, badKey); } catch {}

  const H = new Headers();
  setCookie(H, 'auth', 'ok', {
    maxAge: 60 * 60 * 12, // 12h
    httpOnly: true,
    secure: isHTTPS(request),
  });

  return json({ ok: true }, 200, Object.fromEntries(H.entries()));
}

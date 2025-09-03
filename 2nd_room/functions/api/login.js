// /functions/api/login.js  — 게이트 로그인 (전문)
// - 비번 소스: GATE_PASSWORD > OWNER_PASSWORD > PASSWORD
// - 모바일/전각 대응: NFKC 정규화 + trim
// - 레이트리밋: 10분 윈도우 5회 초과 시 429 (KV: LINES 필요; 없어도 로그인은 동작)
// - 성공 시 auth=ok 쿠키(HttpOnly, SameSite=Lax, HTTPS면 Secure)

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
      // 관대한 파싱(일부 브라우저 호환)
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

// === Rate limit 설정 ===
const WINDOW_SEC = 600;     // 10분
const MAX_TRIES  = 5;       // 윈도우 내 최대 시도 횟수

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

  // 1) 입력값
  const input = await readPasswordFromBody(request);

  // 2) 서버 비번 (우선순위: GATE_PASSWORD > OWNER_PASSWORD > PASSWORD)
  const target = normPw(env.GATE_PASSWORD || env.OWNER_PASSWORD || env.PASSWORD || '');
  if (!target) return json({ error: 'server_not_configured' }, 500);

  // 3) 레이트리밋 키 (IP 기준)
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ipKey = 'rl:' + (await sha256Hex(ip));

  // 4) 우리 쪽 레이트리밋 선 차단 (Cloudflare 429과 무관하게)
  try {
    const tries = await getRL(env, ipKey);
    if (tries >= MAX_TRIES) return json({ error: 'too_many_attempts' }, 429);
  } catch { /* KV 이슈는 무시하고 계속 */ }

  // 5) 비밀번호 비교
  if (input !== target) {
    try { await bumpRL(env, ipKey); } catch {}
    return json({ error: 'bad_passwords' }, 401);
  }

  // 6) 성공: 카운터 초기화 + 쿠키 발급
  try { await clearRL(env, ipKey); } catch {}
  const H = new Headers();
  setCookie(H, 'auth', 'ok', {
    maxAge: 60 * 60 * 12, // 12시간
    httpOnly: true,
    secure: isHTTPS(request),
  });

  return json({ ok: true }, 200, Object.fromEntries(H.entries()));
}
```0

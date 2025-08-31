// functions/api/choose.js

function getCookie(req, name){
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}
function setCookie(headers, name, value, opts = {}){
  const p = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax',
    'Secure',
    opts.httpOnly ? 'HttpOnly' : '',
    opts.maxAge ? `Max-Age=${opts.maxAge}` : ''
  ].filter(Boolean).join('; ');
  headers.append('Set-Cookie', p);
}

// --- UTF-8 안전 Base64 인코딩/디코딩 ---
function enc(o){
  return btoa(unescape(encodeURIComponent(JSON.stringify(o))));
}
function dec(s){
  try { return JSON.parse(decodeURIComponent(escape(atob(s)))); }
  catch { return null; }
}

const json = (x, s = 200, extra) =>
  new Response(JSON.stringify(x), {
    status: s,
    headers: { 'Content-Type': 'application/json', ...(extra || {}) }
  });

export async function onRequest({ request }) {
  // 게이트 세션 확인 (login에서 심은 auth2=ok 쿠키)
  const authed = /(?:^|;\s*)auth2=ok(?:;|$)/.test(request.headers.get('Cookie') || '');
  if (!authed) return json({ error: 'no session' }, 401);

  const url = new URL(request.url);

  // 최초 진입: /api/choose?init=1  → r2 쿠키 초기화
  if (url.searchParams.get('init') === '1') {
    const st = { v: 1, step: 0, alive: true, cause: '' };
    const h = new Headers();
    setCookie(h, 'r2', enc(st), { httpOnly: true, maxAge: 60 * 60 * 2 });
    return json({ ok: true, step: 0 }, 200, Object.fromEntries(h.entries()));
  }

  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  const r2raw = getCookie(request, 'r2');
  const st = dec(r2raw);
  if (!st || !st.alive) return json({ error: 'no session' }, 401);

  const body = await request.json().catch(() => ({}));
  const dir = String(body.dir || '').toUpperCase();
  if (!['L', 'F', 'R'].includes(dir)) return json({ error: 'bad_dir' }, 400);

  // 1/3 확률 전진
  const ok = Math.floor(Math.random() * 3) === 0;
  const h = new Headers();

  if (ok) {
    st.step += 1;
    setCookie(h, 'r2', enc(st), { httpOnly: true, maxAge: 60 * 60 * 2 });
    return json({ result: 'advance', step: st.step }, 200, Object.fromEntries(h.entries()));
  } else {
    st.alive = false;
    st.cause = dir === 'L' ? '왼쪽 문' : dir === 'F' ? '정면 문' : '오른쪽 문';
    setCookie(h, 'r2', enc(st), { httpOnly: true, maxAge: 60 * 10 }); // 사망상태 10분 유지
    return json({ result: 'dead', step: st.step, cause: st.cause }, 200, Object.fromEntries(h.entries()));
  }
}

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

function setCookie(H, name, value, { maxAge, httpOnly = true, secure } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (secure) parts.push('Secure'); // HTTPS에서만
  if (httpOnly) parts.push('HttpOnly');
  if (maxAge) parts.push(`Max-Age=${maxAge}`);
  H.append('Set-Cookie', parts.join('; '));
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  const input = await readPasswordFromBody(request);
  const target = normPw(env.GATE_PASSWORD || env.OWNER_PASSWORD || '');

  // (선택) 간단 백오프 — LINES 미바인딩이어도 안전하게 동작
  try {
    const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
    const key = `badpw:${ip}`;
    const nRaw = await env.LINES?.get(key);
    const n = nRaw ? parseInt(nRaw, 10) || 0 : 0;
    if (n >= 8) return json({ error: 'too_many_attempts' }, 429);

    if (!target) return json({ error: 'server_not_configured' }, 500);
    if (input !== target) {
      await env.LINES?.put(key, String(n + 1), { expirationTtl: 300 });
      return json({ error: 'bad_passwords' }, 401);
    }
    await env.LINES?.delete(key);
  } catch {
    if (!target) return json({ error: 'server_not_configured' }, 500);
    if (input !== target) return json({ error: 'bad_passwords' }, 401);
  }

  const H = new Headers();
  setCookie(H, 'auth', 'ok', { maxAge: 60 * 60 * 12, httpOnly: true, secure: isHTTPS(request) });
  return json({ ok: true }, 200, Object.fromEntries(H.entries()));
}

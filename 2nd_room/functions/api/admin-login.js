const json = (x, s = 200, h = {}) =>
  new Response(JSON.stringify(x), { status: s, headers: { 'Content-Type': 'application/json', ...h } });

function setCookie(H, name, value, { maxAge, httpOnly = true, secure } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  if (httpOnly) parts.push('HttpOnly');
  if (maxAge) parts.push(`Max-Age=${maxAge}`);
  H.append('Set-Cookie', parts.join('; '));
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  const token = request.headers.get('Authorization') || '';
  const pass = (env.OWNER_PASSWORD || '').trim();
  const ok = token.startsWith('Bearer ') && token.slice(7) === pass;
  if (!ok) return json({ error: 'forbidden' }, 403);
  const H = new Headers();
  const secure = (new URL(request.url)).protocol === 'https:';
  setCookie(H, 'admin', 'ok', { httpOnly: true, secure, maxAge: 60 * 60 * 12 });
  return json({ ok: true }, 200, Object.fromEntries(H.entries()));
}

// ENV: PASSWORD (필수) – 1방 탈출자에게만 공개된 암호
const json = (x, s=200, headers={}) =>
  new Response(JSON.stringify(x), { status: s, headers: { 'Content-Type':'application/json', ...headers } });

function setCookie(headers, name, value, opts={}) {
  const p = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax',
    'Secure',
    opts.httpOnly ? 'HttpOnly' : '',
    opts.maxAge ? `Max-Age=${opts.maxAge}` : '',
  ].filter(Boolean).join('; ');
  headers.append('Set-Cookie', p);
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error:'Method Not Allowed' }, 405);

  const { PASSWORD = '' } = env;
  const body = await request.json().catch(()=>({}));
  const code = String(body.code || '').trim();

  if (!PASSWORD || !code) return json({ error:'INVALID' }, 400);

  if (code !== PASSWORD) return json({ ok:false, error:'WRONG' }, 401);

  const h = new Headers();
  // 2시간 세션
  setCookie(h, 'auth2', 'ok', { httpOnly:true, maxAge: 60*60*2 });

  return json({ ok:true }, 200, Object.fromEntries(h.entries()));
}

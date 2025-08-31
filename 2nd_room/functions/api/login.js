function setCookie(headers, name, value, opts = {}) {
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

export async function onRequestPost({ request, env }) {
  const { PASSWORD = '' } = env; // 첫 번째 방 탈출자가 아는 코드
  const bad = new Response(JSON.stringify({ error:'INVALID_CODE' }), {
    status:401, headers:{'Content-Type':'application/json'}
  });

  if (!/application\/json/i.test(request.headers.get('Content-Type')||'')) return bad;
  const body = await request.json().catch(()=>({}));
  const code = (body.code || '').toString().trim();

  if (!PASSWORD || code !== PASSWORD) return bad;

  const h = new Headers({ 'Content-Type':'application/json' });
  // 플레이 접근용 세션 쿠키
  setCookie(h, 'auth2', 'ok', { httpOnly:true, maxAge:60*60*6 });
  return new Response(JSON.stringify({ ok:true }), { status:200, headers:h });
}

// GET/기타 메서드는 막기
export async function onRequest({ request }) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error:'Method Not Allowed' }), {
      status:405, headers:{'Content-Type':'application/json'}
    });
  }
}

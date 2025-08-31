// 비번 확인 후 쿠키 세팅.
// 락 유저면 'auth2=wall' 로 세팅하고 /play/wall.html 로 보냄.

function setCookie(headers,name,value,opts={}){
  const p = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/','SameSite=Lax','Secure',
    opts.httpOnly?'HttpOnly':'',
    opts.maxAge?`Max-Age=${opts.maxAge}`:''
  ].filter(Boolean).join('; ');
  headers.append('Set-Cookie', p);
}

async function fpHash(req, salt=''){
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ua = req.headers.get('user-agent') || '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${ip}|${ua}`));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export async function onRequest({ request, env }){
  const { PASSWORD='', LINES, SECRET_SALT='' } = env;

  if (request.method !== 'POST')
    return new Response('Method Not Allowed', { status:405 });

  let body = {};
  try { body = await request.json(); } catch {}
  const code = String(body.code || '').trim();

  if (!code || code !== PASSWORD) {
    return new Response(JSON.stringify({ ok:false, error:'invalid_code' }), {
      status:401, headers:{'Content-Type':'application/json'}
    });
  }

  const fp = await fpHash(request, SECRET_SALT);
  const locked = await LINES.get(`lock:${fp}`);
  const h = new Headers();

  if (locked) {
    setCookie(h, 'auth2', 'wall', { maxAge:60*60*24*30 });
    return new Response(null, { status:302, headers:new Headers([...h, ['Location','/play/wall.html']]) });
  } else {
    setCookie(h, 'auth2', 'ok', { maxAge:60*60*2 });
    return new Response(null, { status:302, headers:new Headers([...h, ['Location','/play/']]) });
  }
}

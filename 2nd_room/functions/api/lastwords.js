const sanitize = (s) => String(s||'')
  .replace(/[\u200B-\u200D\uFEFF]/g,'')
  .replace(/\s{3,}/g,' ')
  .trim()
  .slice(0, 300);

function getCookie(req, name){
  const c = req.headers.get('Cookie')||'';
  const m = c.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

async function fpHash(req, salt=''){
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ua = req.headers.get('user-agent') || '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${ip}|${ua}`));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export async function onRequest({ request, env }){
  const { LINES, SECRET_SALT='' } = env;
  if (request.method !== 'POST')
    return new Response('Method Not Allowed', { status:405 });

  // 죽은 상태에서만 허용(auth2=wall 혹은 r2.alive=false)
  const cookies = request.headers.get('Cookie')||'';
  if (!/(^|;\s*)auth2=wall(;|$)/.test(cookies))
    return new Response(JSON.stringify({ ok:false, error:'forbidden' }), { status:403, headers:{'Content-Type':'application/json'} });

  let body = {};
  try { body = await request.json(); } catch {}
  const text = sanitize(body.text);

  const fp = await fpHash(request, SECRET_SALT);
  const key = `lw:${fp}`;               // 사용자당 1회(멱등)
  const existed = await LINES.get(key);

  if (existed) {
    // 이미 저장되어 있으면 성공으로 간주(멱등)
    return new Response(JSON.stringify({ ok:true, id:key, note:'already' }), {
      status:200, headers:{'Content-Type':'application/json'}
    });
  }

  const now = Date.now();
  const item = { id:key, text, ts:now };

  await LINES.put(key, JSON.stringify(item), { expirationTtl: 60*60*24*365 });

  // 인덱스(간단)
  const idx = JSON.parse(await LINES.get('idx') || '[]');
  idx.push(key);
  await LINES.put('idx', JSON.stringify(idx));

  return new Response(JSON.stringify({ ok:true, id:key }), {
    status:200, headers:{'Content-Type':'application/json'}
  });
}

const json = (x,s=200,h={})=>new Response(JSON.stringify(x),{status:s,headers:{'Content-Type':'application/json',...h}});

function setCookie(H,name,value,opts={}){
  const p=[`${name}=${encodeURIComponent(value)}`,'Path=/','SameSite=Lax','Secure',
    opts.httpOnly?'HttpOnly':'',opts.maxAge?`Max-Age=${opts.maxAge}`:''].filter(Boolean).join('; ');
  H.append('Set-Cookie', p);
}
function randTicket(n=16){
  const a=new Uint8Array(n); crypto.getRandomValues(a);
  return [...a].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export async function onRequest({ request, env }){
  if (request.method!=='POST') return json({error:'Method Not Allowed'},405);
  const { PASSWORD='', LINES } = env;
  const body = await request.json().catch(()=>({}));
  const code = String(body.code||'').trim();
  const ck = request.headers.get('Cookie')||'';

  if (/(^|;\s*)auth2=wall(;|$)/.test(ck)) return json({ ok:true, wall:true });

  if (!code || code !== PASSWORD) return json({ error:'bad_password' },401);

  // 티켓 발급(기존 q2 유지)
  const m = (ck.match(/(?:^|;\s*)q2=([^;]+)/)||[])[1];
  const ticket = m ? decodeURIComponent(m) : randTicket();

  // 큐 등록
  const mapKey = `q:map:${ticket}`;
  const has = await LINES.get(mapKey);
  if (!has) {
    await LINES.put(mapKey, JSON.stringify({ ticket, joined: Date.now() }), { expirationTtl: 60*60*6 });
    const qRaw = await LINES.get('q:queue'); const q = qRaw?JSON.parse(qRaw):[];
    if (!q.includes(ticket)) { q.push(ticket); await LINES.put('q:queue', JSON.stringify(q)); }
  }

  const H = new Headers();
  setCookie(H,'q2', ticket, { httpOnly:true, maxAge:60*60*6 });
  return json({ ok:true, lobby:true }, 200, Object.fromEntries(H.entries()));
}

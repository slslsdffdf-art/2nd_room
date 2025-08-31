// ENV: SECRET_SALT (선택), KV 바인딩: LINES
const json = (x, s=200) => new Response(JSON.stringify(x), { status:s, headers:{'Content-Type':'application/json'} });

const dec=(s)=>{ try{ return JSON.parse(atob(s)) } catch { return null } };
const sha = async (s) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
};

function getCookie(req, name){
  const c = req.headers.get('Cookie')||'';
  const m = c.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

export async function onRequest({ request, env }) {
  const { LINES, SECRET_SALT = '' } = env;
  if (request.method !== 'POST') return json({ error:'Method Not Allowed' }, 405);

  const r2raw = getCookie(request,'r2');
  const st = dec(r2raw);
  if (!st) return json({ error:'no session' }, 401);
  if (st.alive) return json({ error:'not dead' }, 400);

  const { text } = await request.json().catch(()=>({}));
  const body = String(text||'').trim();
  if (!body) return json({ error:'EMPTY' }, 400);
  if (body.length > 300) return json({ error:'TOO_LONG' }, 400);

  // 간단 중복 방지(세션+스텝 기준 한번만)
  const markerKey = `mark:${await sha((r2raw||'')+'|'+st.step)}`;
  const marked = await LINES.get(markerKey);
  if (marked) return json({ error:'ALREADY' }, 409);

  const idx = JSON.parse(await LINES.get('idx') || '[]'); // [1,2,...]
  const nextId = idx.length ? Math.max(...idx) + 1 : 1;

  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const sid = await sha(SECRET_SALT + '|' + ip);

  const item = {
    id: nextId,
    nick: `도전자 ${nextId}`,
    step: st.step,
    cause: st.cause,
    text: body,
    ts: Date.now(),
    who: sid.slice(0,16) // 가벼운 마스킹
  };

  idx.push(nextId);
  await LINES.put('idx', JSON.stringify(idx));
  await LINES.put(`c:${nextId}`, JSON.stringify(item));
  await LINES.put(markerKey, '1', { expirationTtl: 60*60*24*365 });

  return json({ ok:true, item });
}

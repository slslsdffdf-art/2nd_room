function getCookie(req, name){
  const c=req.headers.get('Cookie')||''; const m=c.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'));
  return m?decodeURIComponent(m[1]):'';
}
function setCookie(H,name,value,opts={}){
  const p=[`${name}=${encodeURIComponent(value)}`,'Path=/','SameSite=Lax','Secure',
    opts.httpOnly?'HttpOnly':'',opts.maxAge?`Max-Age=${opts.maxAge}`:''].filter(Boolean).join('; ');
  H.append('Set-Cookie', p);
}
const enc=(o)=>btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const dec=(s)=>{ try{return JSON.parse(decodeURIComponent(escape(atob(s))))}catch{return null} };
const json=(x,s=200,h={})=>new Response(JSON.stringify(x),{status:s,headers:{'Content-Type':'application/json',...h}});

export async function onRequest({ request, env }) {
  const { LINES, LASTWORDS_LIMIT_SEC='45' } = env;
  const cookie = request.headers.get('Cookie')||'';
  const hasOK = /(^|;\s*)auth2=ok(;|$)/.test(cookie);
  const hasWall = /(^|;\s*)auth2=wall(;|$)/.test(cookie);
  if (!hasOK || hasWall) return json({ error:'no session' }, 401);

  const url = new URL(request.url);

  // 최초 진입: 직전 유언 전달
  if (url.searchParams.get('init')==='1') {
    const st = { v:1, step:0, alive:true, cause:'' };
    const H = new Headers();
    setCookie(H,'r2', enc(st), { httpOnly:true, maxAge:60*60*2 });

    const latest = await LINES.get('lastword:latest').then(x=>x?JSON.parse(x):null);
    return json({
      ok:true,
      step:0,
      lastHint: latest ? { id: latest.id, text: latest.text, step: latest.step, cause: latest.cause, ts: latest.ts } : null,
      lw_limit_sec: Math.max(10, parseInt(LASTWORDS_LIMIT_SEC,10)||45)
    }, 200, Object.fromEntries(H.entries()));
  }

  if (request.method!=='POST') return json({ error:'Method Not Allowed' },405);

  const st = dec(getCookie(request,'r2'));
  if (!st || !st.alive) return json({ error:'no session' },401);

  const body = await request.json().catch(()=>({}));
  const dir = String(body.dir||'').toUpperCase();
  if (!['L','F','R'].includes(dir)) return json({ error:'bad_dir' },400);

  const ok = Math.floor(Math.random()*3)===0;
  const H = new Headers();

  if (ok) {
    st.step += 1;
    setCookie(H,'r2', enc(st), { httpOnly:true, maxAge:60*60*2 });
    return json({ result:'advance', step:st.step }, 200, Object.fromEntries(H.entries()));
  } else {
    st.alive = false;
    st.cause = dir==='L'?'왼쪽 문' : dir==='F'?'정면 문' : '오른쪽 문';
    setCookie(H,'r2', enc(st), { httpOnly:true, maxAge:60*10 });
    setCookie(H,'auth2','wall',{ httpOnly:true, maxAge:60*60*24 });

    // q:active 에 dead 플래그 및 유언 마감 등록
    const ticket = getCookie(request,'q2');
    const raw = await env.LINES.get('q:active'); const act = raw?JSON.parse(raw):null;
    const limitMs = 1000 * (Math.max(10, parseInt(LASTWORDS_LIMIT_SEC,10)||45));
    if (act && act.ticket === ticket) {
      act.dead = true;
      act.lw_deadline = Date.now() + limitMs;
      act.step = st.step;
      act.cause = st.cause;
      await env.LINES.put('q:active', JSON.stringify(act));
    }
    return json({ result:'dead', step:st.step, cause:st.cause }, 200, Object.fromEntries(H.entries()));
  }
}

function getCookie(req, name){
  const c = req.headers.get('Cookie')||'';
  const m = c.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}
function setCookie(headers,name,value,opts={}){
  const p=[
    `${name}=${encodeURIComponent(value)}`,
    'Path=/', 'SameSite=Lax', 'Secure',
    opts.httpOnly?'HttpOnly':'',
    opts.maxAge?`Max-Age=${opts.maxAge}`:''
  ].filter(Boolean).join('; ');
  headers.append('Set-Cookie', p);
}
function j(x,s=200,hdrs){ const h=new Headers({'Content-Type':'application/json'}); if(hdrs) for(const[k,v] of Object.entries(hdrs)) h.set(k,v); return new Response(JSON.stringify(x),{status:s,headers:h}); }
const enc=o=>btoa(JSON.stringify(o));
const dec=s=>{ try{ return JSON.parse(atob(s)); } catch { return null; } };

export async function onRequest(ctx) {
  try {
    const { request } = ctx;

    // 게이트 세션 확인
    const authed = /(?:^|;\s*)auth2=ok(?:;|$)/.test(request.headers.get('Cookie')||'');
    if (!authed) return j({ error:'no session (auth2 missing)' }, 401);

    const url = new URL(request.url);
    if (url.searchParams.get('init') === '1') {
      const st = { v:1, step:0, alive:true, cause:'' };
      const h = new Headers();
      setCookie(h,'r2',enc(st),{ httpOnly:true, maxAge:60*60*2 });
      // h.entries()를 그대로 Response에 합치면 종종 구현차로 꼬일 수 있어 명시적으로 셋팅
      const rh = new Headers({ 'Content-Type':'application/json' });
      h.forEach((v,k)=>rh.append(k,v));
      return new Response(JSON.stringify({ ok:true, step:0 }), { status:200, headers: rh });
    }

    const r2raw = getCookie(request,'r2');
    const st = dec(r2raw);
    if (!st) return j({ error:'no session (r2 missing/invalid)' }, 401);
    if (!st.alive) return j({ error:'already dead' }, 401);

    if (request.method !== 'POST') return j({ error:'Method Not Allowed' }, 405);

    const body = await request.json().catch(()=>({}));
    const dir = String(body.dir||'').toUpperCase();
    if (!['L','F','R'].includes(dir)) return j({ error:'bad_dir' }, 400);

    const ok = Math.floor(Math.random()*3) === 0; // 1/3
    const h = new Headers();

    if (ok) {
      st.step += 1;
      setCookie(h,'r2',enc(st),{ httpOnly:true, maxAge:60*60*2 });
      const rh = new Headers({ 'Content-Type':'application/json' });
      h.forEach((v,k)=>rh.append(k,v));
      return new Response(JSON.stringify({ result:'advance', step:st.step }), { status:200, headers: rh });
    } else {
      st.alive = false;
      st.cause = dir==='L'?'왼쪽 문': dir==='F'?'정면 문':'오른쪽 문';
      setCookie(h,'r2',enc(st),{ httpOnly:true, maxAge:60*10 });
      const rh = new Headers({ 'Content-Type':'application/json' });
      h.forEach((v,k)=>rh.append(k,v));
      return new Response(JSON.stringify({ result:'dead', step:st.step, cause:st.cause }), { status:200, headers: rh });
    }
  } catch (e) {
    // ✅ 여기서 원인 바로 확인 가능
    console.error('choose.js error:', e && e.stack || e);
    return j({ error:'internal', where:'choose', message: String(e && e.message || e) }, 500);
  }
}

// 선택/초기화 엔드포인트
function getCookie(req, name){
  const c = req.headers.get('Cookie')||'';
  const m = c.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}
function setCookie(headers,name,value,opts={}){
  const p=[
    `${name}=${encodeURIComponent(value)}`,
    'Path=/','SameSite=Lax','Secure',
    opts.httpOnly?'HttpOnly':'',
    opts.maxAge?`Max-Age=${opts.maxAge}`:''
  ].filter(Boolean).join('; ');
  headers.append('Set-Cookie', p);
}
const enc=o=>btoa(JSON.stringify(o));
const dec=s=>{ try{ return JSON.parse(atob(s)) } catch { return null } };
const J=(x,s=200,h={})=>new Response(JSON.stringify(x),{status:s,headers:new Headers({'Content-Type':'application/json',...h})});

export async function onRequest({ request }) {
  // 게이트 통과 쿠키 확인 (미들웨어가 대부분 막지만 안전망)
  const authed = /(?:^|;\s*)auth2=ok(?:;|$)/.test(request.headers.get('Cookie')||'');
  if (!authed) return J({ error:'no session' }, 401);

  const url = new URL(request.url);
  // ★ init=1 : 플레이 세션(r2) 초기화 (GET 허용)
  if (url.searchParams.get('init') === '1') {
    const st = { v:1, step:0, alive:true, cause:'' };
    const h = new Headers();
    setCookie(h,'r2',enc(st),{httpOnly:true,maxAge:60*60*2});
    return new Response(JSON.stringify({ ok:true, step:0 }), { status:200, headers:new Headers([...h.entries(),['Content-Type','application/json']])});
  }

  if (request.method !== 'POST') return J({ error:'Method Not Allowed' }, 405);

  // 이후부터는 r2 필수
  const r2 = dec(getCookie(request,'r2'));
  if (!r2 || !r2.alive) return J({ error:'no session' }, 401);

  let dir = '';
  try {
    const body = await request.json();
    dir = String(body.dir||'').toUpperCase();
  } catch {}
  if (!['L','F','R'].includes(dir)) return J({ error:'bad_dir' }, 400);

  // 1/3 통과
  const pass = Math.floor(Math.random()*3) === 0;
  const h = new Headers();

  if (pass) {
    r2.step += 1;
    setCookie(h,'r2',enc(r2),{httpOnly:true,maxAge:60*60*2});
    return new Response(JSON.stringify({ result:'advance', step:r2.step }), { status:200, headers:new Headers([...h.entries(),['Content-Type','application/json']])});
  } else {
    r2.alive = false;
    r2.cause = dir==='L'?'왼쪽 문': dir==='F'?'정면 문':'오른쪽 문';
    setCookie(h,'r2',enc(r2),{httpOnly:true,maxAge:60*10});
    return new Response(JSON.stringify({ result:'dead', step:r2.step, cause:r2.cause }), { status:200, headers:new Headers([...h.entries(),['Content-Type','application/json']])});
  }
}

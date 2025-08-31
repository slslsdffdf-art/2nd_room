// UTF-8 safe base64 helpers
const enc = (obj) => {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = "";
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
};
const dec = (str) => {
  try {
    const bin = atob(str);
    const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
};

// cookies
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
const json = (x, s=200, extra) =>
  new Response(JSON.stringify(x), { status:s, headers:{ 'Content-Type':'application/json', ...(extra||{}) } });

async function fpHash(req, salt=''){
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ua = req.headers.get('user-agent') || '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${ip}|${ua}`));
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export async function onRequest({ request, env }) {
  const { LINES, SECRET_SALT='' } = env;

  // 게이트 통과 여부
  const authed = /(?:^|;\s*)auth2=ok(?:;|$)/.test(request.headers.get('Cookie')||'');
  if (!authed) return json({ error:'no session' }, 401);

  const url = new URL(request.url);

  // 최초 진입: 세션 초기화
  if (url.searchParams.get('init') === '1') {
    const st = { v:1, step:0, alive:true, cause:'' };
    const h = new Headers();
    setCookie(h,'r2',enc(st),{ httpOnly:true, maxAge:60*60*2 });
    return json({ ok:true, step:0 }, 200, Object.fromEntries(h.entries()));
  }

  if (request.method !== 'POST') return json({ error:'Method Not Allowed' }, 405);

  const r2raw = getCookie(request,'r2');
  const st = dec(r2raw);
  if (!st || !st.alive) return json({ error:'no session' }, 401);

  const body = await request.json().catch(()=>({}));
  const dir = String(body.dir||'').toUpperCase();
  if (!['L','F','R'].includes(dir)) return json({ error:'bad_dir' }, 400);

  const ok = Math.floor(Math.random()*3) === 0; // 1/3 성공
  const h = new Headers();

  if (ok) {
    st.step += 1;
    setCookie(h,'r2',enc(st),{ httpOnly:true, maxAge:60*60*2 });
    return json({ result:'advance', step:st.step }, 200, Object.fromEntries(h.entries()));
  } else {
    // 사망 처리
    st.alive = false;
    st.cause = dir==='L'?'왼쪽 문' : dir==='F'?'정면 문' : '오른쪽 문';

    // 즉시 재도전 봉쇄: auth2=wall 로 전환
    setCookie(h,'auth2','wall',{ maxAge:60*60*24*30 });

    // 사망 상태 세션도 저장(UTF-8 safe)
    setCookie(h,'r2',enc(st),{ httpOnly:true, maxAge:60*10 });

    // KV에 락/사유 로그
    const fp = await fpHash(request, SECRET_SALT);
    await LINES.put(`lock:${fp}`, '1', { expirationTtl: 60*60*24*30 }); // 30일 락

    return json({ result:'dead', step:st.step, cause:st.cause }, 200, Object.fromEntries(h.entries()));
  }
}

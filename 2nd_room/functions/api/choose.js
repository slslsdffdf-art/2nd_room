// ----- cookie utils -----
function getCookie(req, name) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}
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
function json(x, s=200, extra){ 
  const h = new Headers({ 'Content-Type':'application/json' });
  if (extra) for (const [k,v] of Object.entries(extra)) h.set(k,v);
  return new Response(JSON.stringify(x), { status:s, headers:h });
}
function parseState(str){ try{ return JSON.parse(atob(str)); }catch{ return null; } }
function encState(obj){ return btoa(JSON.stringify(obj)); }

// ----- handler -----
export async function onRequest({ request }) {
  const url = new URL(request.url);

  // gate cookie
  const authed = /(?:^|;\s*)auth2=ok(?:;|$)/.test(request.headers.get('Cookie')||'');
  if (!authed) return json({ error:'no session' }, 401);

  // init: 새 진행 세션(r2)
  if (url.searchParams.get('init') === '1') {
    const st = { v:1, step:0, alive:true, t:Date.now() };
    const h = new Headers();
    setCookie(h, 'r2', encState(st), { httpOnly:true, maxAge:60*60*2 });
    return new Response(JSON.stringify({ ok:true, step:0 }), {
      status:200, headers:new Headers([...h.entries(), ['Content-Type','application/json']])
    });
  }

  // 진행 요청 시 r2 필요
  const r2 = getCookie(request, 'r2');
  const state = parseState(r2);
  if (!state || !state.alive) return json({ error:'no session' }, 401);

  if (request.method === 'POST') {
    const body = await request.json().catch(()=>({}));
    const dir = (body.dir || '').toString().toUpperCase(); // L/F/R
    if (!['L','F','R'].includes(dir)) return json({ error:'bad_dir' }, 400);

    const ok = Math.floor(Math.random()*3) === 0; // 1/3

    const h = new Headers();
    if (ok) {
      state.step += 1;
      setCookie(h, 'r2', encState(state), { httpOnly:true, maxAge:60*60*2 });
      return new Response(JSON.stringify({ result:'advance', step:state.step }), {
        status:200, headers:new Headers([...h.entries(), ['Content-Type','application/json']])
      });
    } else {
      state.alive = false;
      setCookie(h, 'r2', encState(state), { httpOnly:true, maxAge:60*10 });
      return new Response(JSON.stringify({ result:'dead', step:state.step }), {
        status:200, headers:new Headers([...h.entries(), ['Content-Type','application/json']])
      });
    }
  }

  return json({ error:'Method Not Allowed' }, 405);
}

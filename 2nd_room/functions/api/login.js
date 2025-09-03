const json=(x,s=200,h={})=>new Response(JSON.stringify(x),{
  status:s,
  headers:{ 'Content-Type':'application/json','Cache-Control':'no-store', ...h }
});

function normPw(x){
  return (x ?? '')
    .toString()
    .trim()
    .normalize('NFKC'); // 전각/호환문자 통합
}

async function readPasswordFromBody(request){
  const ct = (request.headers.get('Content-Type')||'').toLowerCase();
  try{
    if (ct.includes('application/json')){
      const b = await request.json();
      if (b && typeof b.pw !== 'undefined') return normPw(b.pw);
    } else if (ct.includes('application/x-www-form-urlencoded')){
      const txt = await request.text(); const p=new URLSearchParams(txt);
      if (p.has('pw')) return normPw(p.get('pw'));
    } else if (ct.includes('text/plain')){
      const t = await request.text();
      if (t) return normPw(t);
    } else if (ct.includes('multipart/form-data')){
      const f = await request.formData();
      if (f.has('pw')) return normPw(f.get('pw'));
    } else {
      // 알 수 없는 타입: JSON 시도 → 실패하면 text
      try{ const b = await request.json(); if (b && typeof b.pw !== 'undefined') return normPw(b.pw); }catch{}
      const t = await request.text(); if (t) return normPw(t);
    }
  }catch{}
  return '';
}

function isHTTPS(request){
  try { return new URL(request.url).protocol === 'https:'; } catch { return false; }
}

function setCookie(H,name,value,{ maxAge, httpOnly=true, secure }={}){
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax',
  ];
  if (secure) parts.push('Secure');        // HTTPS에서만
  if (httpOnly) parts.push('HttpOnly');
  if (maxAge) parts.push(`Max-Age=${maxAge}`);
  H.append('Set-Cookie', parts.join('; '));
}

export async function onRequest({ request, env }){
  if (request.method !== 'POST') return json({ error:'Method Not Allowed' },405);

  const input = await readPasswordFromBody(request);
  const target = normPw(env.GATE_PASSWORD || env.OWNER_PASSWORD || '');

  // 간단 백오프 (IP별 5분)
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const k = `badpw:${ip}`;
  const nRaw = await env.LINES.get(k);
  const n = nRaw ? parseInt(nRaw,10) || 0 : 0;
  if (n >= 8) return json({ error:'too_many_attempts' }, 429);

  if (!target) return json({ error:'server_not_configured' }, 500);

  if (input !== target) {
    await env.LINES.put(k, String(n+1), { expirationTtl: 300 }); // 5분
    return json({ error:'bad_passwords' }, 401);
  }

  await env.LINES.delete(k);

  const H = new Headers();
  const secure = isHTTPS(request); // 로컬(HTTP) 테스트 OK, 배포(HTTPS)에서는 Secure
  setCookie(H, 'auth', 'ok', { maxAge: 60*60*12, httpOnly: true, secure });

  return json({ ok:true }, 200, Object.fromEntries(H.entries()));
}

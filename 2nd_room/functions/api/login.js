const json=(x,s=200,h={})=>new Response(JSON.stringify(x),{
  status:s,
  headers:{ 'Content-Type':'application/json','Cache-Control':'no-store', ...h }
});

function normPw(x){
  return (x ?? '')
    .toString()
    .trim()
    .normalize('NFKC'); // 전각/호환문자 정규화
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

  const body = await request.json().catch(()=>({}));
  const input = normPw(body.pw);
  const target = normPw(env.GATE_PASSWORD || env.OWNER_PASSWORD || '');

  // 간단한 백오프(무차별 대입 완화)
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

  // 성공: 실패 카운터 클리어
  await env.LINES.delete(k);

  const H = new Headers();
  // ⚠ 로컬(HTTP)에서는 Secure 미설정, HTTPS 배포에서는 Secure 설정
  const secure = isHTTPS(request);
  setCookie(H, 'auth', 'ok', { maxAge: 60*60*12, httpOnly: true, secure }); // 12h

  return json({ ok:true }, 200, Object.fromEntries(H.entries()));
}

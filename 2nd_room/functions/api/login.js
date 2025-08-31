export async function onRequestPost({ request, env }) {
  const { ROOM2_PASSWORD = '', ROOM2_SECRET = '' } = env;

  const body = await request.formData().catch(()=>null);
  const code = body?.get('code')?.toString().trim() || '';

  // 1) 암호 매치
  const passOK = ROOM2_PASSWORD && code && (code === ROOM2_PASSWORD);

  // 2) (확장 여지) JWT 티켓 검증: "TICKET:xxxxx"
  let ticketOK = false;
  if (code.startsWith('TICKET:') && ROOM2_SECRET) {
    // 간단 서명 토큰 검증 (HMAC) — 추후 실제 JWT로 교체 가능
    try{
      const token = code.slice(7);
      const [payloadB64, sigHex] = token.split('.');
      const payload = JSON.parse(atob(payloadB64));
      // 유효기간/1회용 등 체크
      if (payload && payload.exp && Date.now() < payload.exp) {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', enc.encode(ROOM2_SECRET), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
        const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
        const hex = [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,'0')).join('');
        ticketOK = (hex === sigHex);
      }
    }catch{}
  }

  if (!(passOK || ticketOK)) {
    return new Response(JSON.stringify({ error:'INVALID_CODE' }), { status: 401, headers:{'Content-Type':'application/json'}});
  }

  // 세션 토큰(간단): 유효기간 하루
  const sess = Math.random().toString(36).slice(2) + '.' + Date.now();
  const headers = new Headers({
    'Set-Cookie': `r2sess=${sess}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
  });
  return new Response(null, { status: 204, headers });
}
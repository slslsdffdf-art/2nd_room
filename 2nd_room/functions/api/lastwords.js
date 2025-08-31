export async function onRequest({ request, env }) {
  const { LINES, SECRET_SALT = '' } = env;
  const authedWall = /(?:^|;\s*)auth2=wall(?:;|$)/.test(request.headers.get('Cookie')||'');
  if (!authedWall) {
    return new Response(JSON.stringify({ ok:false, error:'forbidden' }), {
      status: 403, headers: { 'Content-Type':'application/json' }
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok:false, error:'Method Not Allowed' }), {
      status:405, headers:{'Content-Type':'application/json'}
    });
  }

  const body = await request.json().catch(()=>({}));
  const text = String(body.text||'').slice(0,300);

  // 요청자 식별키(하루 단위로 멱등 처리 예시)
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const idKey = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${SECRET_SALT}|${ip}|wall`));
  const keyHex = [...new Uint8Array(idKey)].map(b=>b.toString(16).padStart(2,'0')).join('');

  const existed = await LINES.get(`lw:${keyHex}`);
  if (existed) {
    return new Response(JSON.stringify({ ok:true, already:true }), {
      status:200, headers:{'Content-Type':'application/json'}
    });
  }

  const idxRaw = await LINES.get('idx');
  const idx = idxRaw ? JSON.parse(idxRaw) : [];
  const nextId = idx.length ? Math.max(...idx)+1 : 1;

  const item = {
    id: nextId,
    ts: Date.now(),
    step: 0, // 기록용(원하면 r2 decode해서 채워도 됨)
    cause: '사망', // 프론트에선 별도로 표기
    text: text || ''
  };

  idx.push(nextId);
  await LINES.put('idx', JSON.stringify(idx));
  await LINES.put(`c:${nextId}`, JSON.stringify(item));
  await LINES.put(`lw:${keyHex}`, '1', { expirationTtl: 60*60*24*30 }); // 30일 중복 방지

  return new Response(JSON.stringify({ ok:true, id: nextId }), {
    status:200, headers:{'Content-Type':'application/json'}
  });
}

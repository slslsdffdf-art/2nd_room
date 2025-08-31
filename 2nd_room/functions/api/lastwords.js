export async function onRequestPost({ request, env }) {
  const { ROOM2_LINES } = env;
  if (!ROOM2_LINES) return j({ error:'NO_KV' }, 500);

  // 진행 쿠키(r2) 확인
  const c = request.headers.get('Cookie') || '';
  const r2 = (c.match(/(?:^|;\\s*)r2=([^;]+)/) || [])[1];
  if (!r2) return j({ error:'NO_SESSION' }, 401);

  let state=null; try{ state = JSON.parse(atob(decodeURIComponent(r2))); }catch{}
  if (!state || state.alive) return j({ error:'NOT_DEAD' }, 400);

  const data = await request.json().catch(()=>({}));
  let text = String(data.text||'').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\s{3,}/g,' ').trim();
  if (text.length > 140) text = text.slice(0,140);

  // auto-increment id
  const idxRaw = await ROOM2_LINES.get('idx');
  const idx = idxRaw ? JSON.parse(idxRaw) : [];
  const nextId = idx.length ? Math.max(...idx) + 1 : 1;

  const item = {
    id: nextId,
    step: state.step||0,
    cause: state.cause || '', // 필요시 choose에서 세팅
    text,
    ts: Date.now()
  };

  idx.push(nextId);
  await ROOM2_LINES.put('idx', JSON.stringify(idx));
  await ROOM2_LINES.put(`c:${nextId}`, JSON.stringify(item));

  return j({ ok:true, id: nextId });
}

function j(x,s=200){ return new Response(JSON.stringify(x), { status:s, headers:{'Content-Type':'application/json'} }); }

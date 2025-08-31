export async function onRequestPost({ request, env }) {
  const { ROOM2_LINES } = env;
  if(!ROOM2_LINES) return json({ error:'NO_KV' }, 500);

  // (간단 세션 체크)
  const cookie = request.headers.get('Cookie')||'';
  if(!/r2sess=/.test(cookie)) return json({ error:'NO_SESSION' }, 401);

  const data = await request.json().catch(()=> ({}));
  let text = String(data.text||'').replace(/[\u200B-\u200D\uFEFF]/g,'').trim();
  if (text.length > 140) text = text.slice(0, 140);

  // 자동 로그 + 유언 기록 (데모 키)
  const id = Date.now();
  const item = {
    id, ts: Date.now(),
    text: text || '', // 빈 유언 허용
  };
  await ROOM2_LINES.put('l:'+id, JSON.stringify(item));
  const idx = JSON.parse(await ROOM2_LINES.get('idx') || '[]');
  idx.push(id);
  await ROOM2_LINES.put('idx', JSON.stringify(idx));

  return json({ ok:true });

  function json(x, s=200){
    return new Response(JSON.stringify(x), { status:s, headers:{'Content-Type':'application/json'}});
  }
}

export async function onRequest({ request, env }) {
  const { ROOM2_LINES } = env;
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || '';

  const idx = JSON.parse(await ROOM2_LINES.get('idx') || '[]');
  if (mode === 'one') {
    const lastId = idx[idx.length - 1];
    if (!lastId) return json({ item: null });
    const raw = await ROOM2_LINES.get('l:'+lastId);
    if (!raw) return json({ item: null });

    const item = JSON.parse(raw);
    return json({ item: { id:item.id, ts:item.ts, textMasked: mask(item.text) } });
  }

  return json({ error:'NOT_IMPLEMENTED' }, 400);

  function mask(s){
    if(!s) return '(없음)';
    // 60~80% 랜덤 가림
    const rate = 0.6 + Math.random()*0.2;
    return s.split('').map(ch => (/\s/.test(ch) || Math.random()>rate) ? ch : '●').join('');
  }
  function json(x, s=200){
    return new Response(JSON.stringify(x), { status:s, headers:{'Content-Type':'application/json'}});
  }
}
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'Content-Type':'application/json'}});

export async function onRequest({ request, env }){
  const { LINES, OWNER_PASSWORD='' } = env;
  const url = new URL(request.url);

  if (request.method==='GET') {
    const page  = Math.max(1, parseInt(url.searchParams.get('page')||'1',10));
    const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get('limit')||'10',10)));
    const idx = JSON.parse((await LINES.get('idx')) || '[]'); // [1,2,3,...]
    const total = idx.length;
    const start = (page-1)*limit, end=page*limit;
    const ids = idx.slice(start, end); // 오래된→최신 (탈출자1 상단)

    const items=[];
    for (const id of ids) {
      const raw = await LINES.get(`l:${id}`);
      if (raw) items.push(JSON.parse(raw));
    }
    return json({ total, page, limit, items });
  }

  if (request.method==='DELETE') {
    const token = (request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
    if (!OWNER_PASSWORD || token !== OWNER_PASSWORD) return json({ error:'FORBIDDEN' },403);
    const body = await request.json().catch(()=>({}));
    const id = parseInt(body.id,10);
    if (!id) return json({ error:'INVALID_ID' },400);

    const idx = JSON.parse((await LINES.get('idx')) || '[]');
    const pos = idx.indexOf(id);
    if (pos===-1) return json({ error:'NOT_FOUND' },404);
    idx.splice(pos,1);
    await LINES.put('idx', JSON.stringify(idx));
    await LINES.delete(`l:${id}`);
    return json({ ok:true });
  }

  return json({ error:'Method Not Allowed' },405);
}

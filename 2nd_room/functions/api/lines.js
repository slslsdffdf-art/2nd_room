export async function onRequest({ request, env }) {
  const { ROOM2_LINES, OWNER_PASSWORD = '' } = env;
  if (!ROOM2_LINES) return j({ error:'NO_KV' }, 500);

  const url = new URL(request.url);

  if (request.method === 'GET') {
    const page = Math.max(1, parseInt(url.searchParams.get('page')||'1',10));
    const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get('limit')||'20',10)));

    const idx = JSON.parse(await ROOM2_LINES.get('idx') || '[]'); // [1..n]
    const total = idx.length;
    const totalPages = Math.max(1, Math.ceil(total/limit));
    const cur = Math.min(page, totalPages);

    const start = (cur-1)*limit, end = cur*limit;
    const ids = idx.slice(total - end < 0 ? 0 : total - end, total - start).reverse(); // 최신→오래된 순
    const items = [];
    for (const id of ids) {
      const raw = await ROOM2_LINES.get(`c:${id}`);
      if (raw) items.push(JSON.parse(raw));
    }
    return j({ page:cur, totalPages, total, items });
  }

  if (request.method === 'DELETE') {
    const auth = (request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
    if (!OWNER_PASSWORD || auth !== OWNER_PASSWORD) return j({ error:'FORBIDDEN' }, 403);

    const data = await request.json().catch(()=>({}));
    const id = parseInt(data.id,10);
    if (!id) return j({ error:'INVALID_ID' }, 400);

    const idx = JSON.parse(await ROOM2_LINES.get('idx') || '[]');
    const pos = idx.indexOf(id);
    if (pos === -1) return j({ error:'NOT_FOUND' }, 404);

    idx.splice(pos,1);
    await ROOM2_LINES.put('idx', JSON.stringify(idx));
    await ROOM2_LINES.delete(`c:${id}`);
    return j({ ok:true });
  }

  return j({ error:'Method Not Allowed' }, 405);
}

function j(x,s=200){ return new Response(JSON.stringify(x), { status:s, headers:{'Content-Type':'application/json'} }); }

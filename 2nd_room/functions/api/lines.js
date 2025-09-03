const json = (x, s = 200, h = {}) =>
  new Response(JSON.stringify(x), { status: s, headers: { 'Content-Type': 'application/json', ...h } });

function isAdmin(req) {
  const c = req.headers.get('Cookie') || '';
  return /(?:^|;\s*)admin=ok(?:;|$)/.test(c);
}

export async function onRequest({ request, env }) {
  const { LINES } = env;
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const idxRaw = await LINES.get('idx'); const idx = idxRaw ? JSON.parse(idxRaw) : [];
    const total = idx.length;
    const start = (page - 1) * limit;
    const ids = idx.slice(start, start + limit);
    const items = [];
    for (const id of ids) {
      const row = await LINES.get(`l:${id}`);
      if (row) items.push(JSON.parse(row));
    }
    return json({ items, page, limit, total, admin: isAdmin(request) });
  }

  if (request.method === 'DELETE') {
    if (!isAdmin(request)) return json({ error: 'forbidden' }, 403);
    const id = parseInt(url.searchParams.get('id') || '0', 10);
    if (!id) return json({ error: 'bad_id' }, 400);

    const idxRaw = await LINES.get('idx'); const idx = idxRaw ? JSON.parse(idxRaw) : [];
    const i = idx.indexOf(id);
    if (i < 0) return json({ error: 'not_found' }, 404);

    // 삭제
    idx.splice(i, 1);
    await LINES.put('idx', JSON.stringify(idx));
    await LINES.delete(`l:${id}`);

    // 번호 재정렬(표시용 number 필드 재계산)
    for (let k = 0; k < idx.length; k++) {
      const curId = idx[k];
      const row = await LINES.get(`l:${curId}`);
      if (!row) continue;
      const j = JSON.parse(row);
      j.number = k + 1; // 탈출자 번호
      await LINES.put(`l:${curId}`, JSON.stringify(j));
    }

    return json({ ok: true });
  }

  return json({ error: 'Method Not Allowed' }, 405);
}

// KV 바인딩: LINES
const json = (x, s=200) => new Response(JSON.stringify(x), { status:s, headers:{'Content-Type':'application/json'} });

export async function onRequest({ request, env }) {
  const { LINES } = env;
  const url = new URL(request.url);

  const page = Math.max(1, parseInt(url.searchParams.get('page')||'1',10));
  const limit = Math.min(30, Math.max(1, parseInt(url.searchParams.get('limit')||'10',10)));

  const idx = JSON.parse(await LINES.get('idx') || '[]'); // 오래된→최신
  const total = idx.length;
  const totalPages = Math.max(1, Math.ceil(total/limit));
  const cur = Math.min(page, totalPages);

  const start = (cur-1)*limit;
  const slice = idx.slice(start, start+limit);

  const items = [];
  for (const id of slice) {
    const raw = await LINES.get(`c:${id}`);
    if (raw) items.push(JSON.parse(raw));
  }

  return json({ total, page: cur, limit, items });
}

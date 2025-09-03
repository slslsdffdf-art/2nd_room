const json = (x, s = 200, h = {}) =>
  new Response(JSON.stringify(x), { status: s, headers: { 'Content-Type': 'application/json', ...h } });

function getCookie(req, name) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}
const now = () => Date.now();

export async function onRequest({ request, env }) {
  const { LINES } = env;
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  const ticket = getCookie(request, 'q2') || '';
  if (!ticket) return json({ error: 'no_ticket' }, 401);

  const done = await LINES.get(`lw:byTicket:${ticket}`);
  if (done) return json({ ok: true, already: true });

  const body = await request.json().catch(() => ({}));
  const text = String((body.text || '').slice(0, 300));
  const actRaw = await LINES.get('q:active');
  const act = actRaw ? JSON.parse(actRaw) : null;

  // active가 없거나 내 티켓이 아니어도 유언은 허용(자동사망 처리 직후 등)
  const cause = (act && act.cause) || (await (async () => {
    const last = await LINES.get('lastword:latest');
    try { const j = JSON.parse(last || '{}'); return j.cause || '사망'; } catch { return '사망'; }
  })());

  // 인덱스/저장
  const idxRaw = await LINES.get('idx'); const idx = idxRaw ? JSON.parse(idxRaw) : [];
  const nextId = idx.length ? Math.max(...idx) + 1 : 1;
  const item = {
    id: nextId,
    ts: now(),
    step: (act && act.step) || 0,
    cause: cause,
    text: text && text.trim() ? text : '외마디 비명도 지르지 못한 채 즉사.',
    src: text && text.trim() ? 'user' : 'auto',
  };

  idx.push(nextId);
  await LINES.put('idx', JSON.stringify(idx));
  await LINES.put(`l:${nextId}`, JSON.stringify(item));
  await LINES.put('lastword:latest', JSON.stringify(item));
  await LINES.put(`lw:byTicket:${ticket}`, item.src, { expirationTtl: 60 * 60 * 24 });

  // active 정리(내 티켓이면 해제)
  if (act && act.ticket === ticket) await LINES.delete('q:active');

  return json({ ok: true, id: nextId });
}

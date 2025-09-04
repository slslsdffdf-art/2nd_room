const json = (x, s = 200, h = {}) =>
  new Response(JSON.stringify(x), { status: s, headers: { 'Content-Type': 'application/json', ...h } });

function getCookie(req, name) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}
const now = () => Date.now();

export async function onRequest({ request, env }) {
  const { LINES, LASTWORDS_LIMIT_SEC = '45' } = env;
  const lwLimit = Math.max(10, parseInt(LASTWORDS_LIMIT_SEC, 10) || 45);

  const ticket = getCookie(request, 'q2') || '';
  if (!ticket) return json({ error: 'no_ticket' }, 401);

  const url = new URL(request.url);
  if (request.method === 'GET' && url.searchParams.get('init') === '1') {
    // 초기 로딩 정보: 현재 step, 직전 유언 힌트
    const actRaw = await LINES.get('q:active');
    const act = actRaw ? JSON.parse(actRaw) : null;
    const lastRaw = await LINES.get('lastword:latest');
    const lastHint = lastRaw ? JSON.parse(lastRaw) : null;
    return json({ step: (act && act.step) || 0, lastHint, lw_limit_sec: lwLimit });
  }

  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  const body = await request.json().catch(() => ({}));
  const dir = String(body.dir || '').toUpperCase(); // 'L' | 'F' | 'R'
  if (!['L', 'F', 'R'].includes(dir)) return json({ error: 'bad_dir' }, 400);

  const actRaw = await LINES.get('q:active');
  if (!actRaw) return json({ error: 'no_active' }, 409);
  const act = JSON.parse(actRaw);

  if (act.ticket !== ticket) return json({ error: 'not_your_turn' }, 403);
  if (act.dead) {
    const remain = Math.max(0, Math.floor(((act.lw_deadline || now()) - now()) / 1000));
    return json({ result: 'dead', cause: act.cause || '사망', step: act.step || 0, remain_sec: remain });
  }

  // 판정: 1/3 성공(advance), 2/3 사망
  const ok = Math.floor(Math.random() * 3) === 0;
  if (ok) {
    act.step = (act.step || 0) + 1;
    act.updated = now();
    act.select_deadline = now() + 90 * 1000; // 다음 선택 제한(서버 기준)
    await LINES.put('q:active', JSON.stringify(act));
    // ★ 글로벌 단계 갱신: 다음 도전자도 이 단계에서 시작
    await LINES.put('q:step', String(act.step));
    return json({ result: 'advance', step: act.step });
  }

  // 사망 처리 (글로벌 단계는 그대로 유지)
  act.dead = true;
  act.cause = dir === 'L' ? '왼쪽 문' : dir === 'F' ? '정면 문' : '오른쪽 문';
  act.lw_deadline = now() + lwLimit * 1000;
  await LINES.put('q:active', JSON.stringify(act));
  return json({ result: 'dead', cause: act.cause, step: act.step || 0, remain_sec: lwLimit });
}

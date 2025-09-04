// /functions/api/choose.js
const json = (x, s = 200, h = {}) =>
  new Response(JSON.stringify(x), { status: s, headers: { 'Content-Type': 'application/json', ...h } });

function getCookie(req, name) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}
const now = () => Date.now();

// 단일 방 파일 로드: /data/rooms/<step>.json
async function fetchRoomByStep(request, step) {
  const base = new URL(request.url).origin;
  const u = `${base}/data/rooms/${step}.json`;
  const r = await fetch(u, { cf: { cacheTtl: 120, cacheEverything: true } });
  if (!r.ok) return null;
  return await r.json();
}

export async function onRequest({ request, env }) {
  const { LINES, LASTWORDS_LIMIT_SEC = '45' } = env;
  const lwLimit = Math.max(10, parseInt(LASTWORDS_LIMIT_SEC, 10) || 45);

  const ticket = getCookie(request, 'q2') || '';
  if (!ticket) return json({ error: 'no_ticket' }, 401);

  const url = new URL(request.url);

  // 초기 로딩: 현재 step의 방 데이터(라벨/스토리/이미지/배경)까지 전달
  if (request.method === 'GET' && url.searchParams.get('init') === '1') {
    const [actRaw, lastRaw] = await Promise.all([
      LINES.get('q:active'),
      LINES.get('lastword:latest')
    ]);
    const act = actRaw ? JSON.parse(actRaw) : null;
    const lastHint = lastRaw ? JSON.parse(lastRaw) : null;
    const step = (act && act.step) || 0;

    const room = await fetchRoomByStep(request, step); // A안: 단일 방 로드

    const payload = {
      step,
      lastHint,
      lw_limit_sec: lwLimit,
      room: room ? {
        story: room.story || '',
        image: room.image || '',
        bg: room.bg || '',
        choices: {
          L: room.choices?.L?.label || '왼쪽',
          F: room.choices?.F?.label || '정면',
          R: room.choices?.R?.label || '오른쪽'
        }
      } : null
    };
    return json(payload);
  }

  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  const body = await request.json().catch(() => ({}));
  const dir = String(body.dir || '').toUpperCase(); // 'L' | 'F' | 'R'
  if (!['L','F','R'].includes(dir)) return json({ error: 'bad_dir' }, 400);

  const actRaw = await LINES.get('q:active');
  if (!actRaw) return json({ error: 'no_active' }, 409);
  const act = JSON.parse(actRaw);

  if (act.ticket !== ticket) return json({ error: 'not_your_turn' }, 403);
  if (act.dead) {
    const remain = Math.max(0, Math.floor(((act.lw_deadline || now()) - now()) / 1000));
    return json({ result: 'dead', cause: act.cause || '사망', step: act.step || 0, remain_sec: remain });
  }

  // 현재 step의 방 데이터로 판정
  const stepKey = (act.step || 0);
  const room = await fetchRoomByStep(request, stepKey);

  // 방 데이터 누락 시 안전망: 기존 1/3 랜덤 규칙
  if (!room || !room.choices || !room.choices[dir]) {
    const ok = Math.floor(Math.random() * 3) === 0;
    if (ok) {
      act.step = (act.step || 0) + 1;
      act.updated = now();
      act.select_deadline = now() + 90 * 1000;
      await LINES.put('q:active', JSON.stringify(act));
      await LINES.put('q:step', String(act.step));
      return json({ result: 'advance', step: act.step });
    } else {
      act.dead = true;
      act.cause = dir === 'L' ? '왼쪽 문' : dir === 'F' ? '정면 문' : '오른쪽 문';
      act.lw_deadline = now() + lwLimit * 1000;
      await LINES.put('q:active', JSON.stringify(act));
      return json({ result: 'dead', cause: act.cause, step: act.step || 0, remain_sec: lwLimit });
    }
  }

  const choice = room.choices[dir];
  if (choice.correct) {
    act.step = (act.step || 0) + 1;
    act.updated = now();
    act.select_deadline = now() + 90 * 1000; // 다음 선택 제한
    await LINES.put('q:active', JSON.stringify(act));
    await LINES.put('q:step', String(act.step));

    // (옵션) 이벤트 방 처리
    if (room.event) {
      if (room.event.type === 'hall-of-fame') {
        await env.LINES.put(`hof:${ticket}`, JSON.stringify({ ts: Date.now(), step: act.step }), { expirationTtl: 60*60*24*365 });
      }
      if (room.event.type === 'inventory' && room.event.arg) {
        await env.LINES.put(`inv:${ticket}:${room.event.arg}`, '1', { expirationTtl: 60*60*24*30 });
      }
      if (room.event.type === 'skip' && room.event.arg) {
        const to = parseInt(room.event.arg, 10);
        if (Number.isFinite(to) && to >= 0) {
          act.step = to;
          await LINES.put('q:active', JSON.stringify(act));
          await LINES.put('q:step', String(act.step));
        }
      }
    }

    return json({ result: 'advance', step: act.step, event: room.event || null });
  }

  // 오답 → 사망(사망 원인은 데이터에서)
  act.dead = true;
  act.cause = choice.deathCause || (dir === 'L' ? '왼쪽 문' : dir === 'F' ? '정면 문' : '오른쪽 문');
  act.lw_deadline = now() + lwLimit * 1000;
  await LINES.put('q:active', JSON.stringify(act));
  return json({ result: 'dead', cause: act.cause, step: act.step || 0, remain_sec: lwLimit });
}

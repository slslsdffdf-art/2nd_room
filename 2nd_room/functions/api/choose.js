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

// ===== 사망 원인 바리에이션 =====
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
const POOLS = {
  generic: [
    '갑작스레 의식을 잃고 쓰러졌다.',
    '미친 듯이 발작하다 사망했다.',
    '자신의 이름을 부르짖으며 끝내 쓰러졌다.',
    '무언가에 잠식된 듯, 서서히 멎었다.',
    '비명을 지르지도 못한 채 사라졌다.',
    '피부를 찢어가며 울부짖다가 멈췄다.',
    '숨이 거꾸로 끌려 나간 듯 질식했다.',
    '눈이 뒤집힌 채 그대로 굳었다.'
  ],
  fall: [
    '발 아래가 꺼지며 어둠 속으로 추락했다.',
    '끝없는 계단 사이로 미끄러져 사라졌다.'
  ],
  drown: [
    '물 한 방울 없는 곳에서 익사했다.',
    '보이지 않는 물에 폐가 가득 찼다.'
  ],
  madness: [
    '갑자기 신을 부르짖으며 자신의 피부를 찢었다.',
    '자신과 다투다 스스로 목을 조르기 시작했다.'
  ],
  beast: [
    '보이지 않는 이빨에 갈가리 찢겼다.',
    '무언가가 종이를 구기듯 몸을 접어버렸다.'
  ],
  mechanism: [
    '보이지 않는 톱니 사이에 끼여 압축되었다.',
    '철제 소음과 함께 형태를 잃었다.'
  ],
  ritual: [
    '알 수 없는 의식의 제물이 되었다.',
    '낯선 문장이 몸에서 흘러나왔다.'
  ],
  mirror: [
    '거울 속 자신과 자리를 바꾸었다.',
    '반사된 무언가가 먼저 숨을 멈췄다.'
  ]
};

function inferTag(base='') {
  const b = String(base);
  if (/[물|수조|익사|강|바다]/.test(b)) return 'drown';
  if (/[사다리|낭떠러지|바닥|추락|구덩이]/.test(b)) return 'fall';
  if (/[거울|반사]/.test(b)) return 'mirror';
  if (/[톱니|기계|태엽|장치]/.test(b)) return 'mechanism';
  if (/[광기|미쳐|정신|신|제단|의식]/.test(b)) return 'madness';
  if (/[짐승|이빨|손|발톱|괴물]/.test(b)) return 'beast';
  if (/[의식|제물|주문|봉인]/.test(b)) return 'ritual';
  return 'generic';
}

function variedDeath(base) {
  // 태그 지정 방식: deathCause가 "!madness" 처럼 시작하면 해당 풀 사용
  if (typeof base === 'string' && base.trim().startsWith('!')) {
    const tag = base.trim().replace(/^!+/, '').toLowerCase();
    const pool = POOLS[tag] || POOLS.generic;
    return pick(pool);
  }
  // 일반 문자열이면 30%는 원문 유지, 70%는 태그 기반 변주
  const tag = inferTag(base);
  const pool = POOLS[tag] || POOLS.generic;
  if (Math.random() < 0.3 && base) {
    // 원문을 간결화: 끝에 조사/문장부호 보정
    const s = String(base).replace(/\s+/g,' ').trim().replace(/[.]+$/,'');
    // “~하여 사망했다”식으로 마감
    return s + (/[다]$/.test(s) ? '' : '') + ' 사망했다.';
  }
  return pick(pool);
}
// ===== 끝 =====

export async function onRequest({ request, env }) {
  const { LINES, LASTWORDS_LIMIT_SEC = '45' } = env;
  const lwLimit = Math.max(10, parseInt(LASTWORDS_LIMIT_SEC, 10) || 45);

  const ticket = getCookie(request, 'q2') || '';
  if (!ticket) return json({ error: 'no_ticket' }, 401);

  const url = new URL(request.url);

  if (request.method === 'GET' && url.searchParams.get('init') === '1') {
    const [actRaw, lastRaw] = await Promise.all([
      LINES.get('q:active'),
      LINES.get('lastword:latest')
    ]);
    const act = actRaw ? JSON.parse(actRaw) : null;
    const lastHint = lastRaw ? JSON.parse(lastRaw) : null;
    const step = (act && act.step) || 0;

    const room = await fetchRoomByStep(request, step);

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
  const dir = String(body.dir || '').toUpperCase();
  if (!['L','F','R'].includes(dir)) return json({ error: 'bad_dir' }, 400);

  const actRaw = await LINES.get('q:active');
  if (!actRaw) return json({ error: 'no_active' }, 409);
  const act = JSON.parse(actRaw);

  if (act.ticket !== ticket) return json({ error: 'not_your_turn' }, 403);
  if (act.dead) {
    const remain = Math.max(0, Math.floor(((act.lw_deadline || now()) - now()) / 1000));
    return json({ result: 'dead', cause: act.cause || '사망', step: act.step || 0, remain_sec: remain });
  }

  const stepKey = (act.step || 0);
  const room = await fetchRoomByStep(request, stepKey);

  // 데이터 누락 시 안전망: 기존 랜덤
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
      act.cause = variedDeath(''); // 완전 랜덤
      act.lw_deadline = now() + lwLimit * 1000;
      await LINES.put('q:active', JSON.stringify(act));
      return json({ result: 'dead', cause: act.cause, step: act.step || 0, remain_sec: lwLimit });
    }
  }

  const choice = room.choices[dir];

  if (choice.correct) {
    act.step = (act.step || 0) + 1;
    act.updated = now();
    act.select_deadline = now() + 90 * 1000;
    await LINES.put('q:active', JSON.stringify(act));
    await LINES.put('q:step', String(act.step));

    // (옵션) 이벤트 처리
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

  // 오답 → 사망: 데이터의 deathCause를 "그대로" 쓰지 않고 바리에이션
  const base = choice.deathCause || '';
  act.dead = true;
  act.cause = variedDeath(base);
  act.lw_deadline = now() + lwLimit * 1000;
  await LINES.put('q:active', JSON.stringify(act));
  return json({ result: 'dead', cause: act.cause, step: act.step || 0, remain_sec: lwLimit });
}

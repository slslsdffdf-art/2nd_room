// /functions/api/choose.js
// A안 + 방 파일 폴백 로더 + "당신" 주어 고정 + 엔딩 지원 + 평문/태그 deathCause 처리 + 에러내성

const json = (x, s = 200, h = {}) =>
  new Response(JSON.stringify(x), { status: s, headers: { 'Content-Type': 'application/json', ...h } });

function getCookie(req, name) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}
const now = () => Date.now();

function safeKV(env) { return (env && env.LINES) || { get:async()=>null, put:async()=>{}, delete:async()=>{} }; }

// 1) 방 로더: KV(room:<step>) → /data/rooms/<step>.json → /rooms/<step>.json
async function fetchRoomByStep(request, step, env) {
  const LINES = safeKV(env);
  try {
    const kv = await LINES.get(`room:${step}`);
    if (kv) return JSON.parse(kv);
  } catch (e) { console.error('[choose] KV room read error', e); }

  try {
    const origin = new URL(request.url).origin;
    const urls = [
      `${origin}/data/rooms/${step}.json`,
      `${origin}/rooms/${step}.json`,
    ];
    for (const u of urls) {
      const r = await fetch(u, { cf: { cacheTtl: 120, cacheEverything: true } });
      if (r.ok) return await r.json();
    }
  } catch (e) { console.error('[choose] static room fetch error', e); }
  return null;
}

// 2) 한국어 자연도 보강: “당신” 주어 고정, 단문/두문장
function h32(str){ let h=2166136261>>>0; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=(h*16777619)>>>0; } return h>>>0; }
function xorshift32(seed){ let x=seed|0; return ()=>{ x^=x<<13; x^=x>>>17; x^=x<<5; return (x>>>0)/4294967296; } }
function pick(rng, arr){ return arr[Math.floor(rng()*arr.length)] }

const K = {
  tpl: [
    '당신은 {CAUSE} {END}.',
    '당신은 {SCENE}에서 {CAUSE} {END}.',
    '아무도 모르게, 당신은 {CAUSE} {END}.',
    '숨이 가빠진다. 당신은 {CAUSE} {END}.',
    '{SCENE}의 기척 속에서, 당신은 {CAUSE} {END}.'
  ],
  end: ['사라졌다.', '쓰러졌다.', '멎었다.', '질식했다.', '굳어 버렸다.'],
  scene: ['문틈', '바닥', '계단참', '벽 그림자', '거울 앞', '문 뒤', '천장 아래'],
  cause: {
    generic:   ['설명할 수 없는 압박에 눌려', '알 수 없는 그늘에 잠식되어', '낯선 주문에 묶여'],
    fall:      ['발밑이 꺼져', '깊은 구덩이에 빨려 들어가', '계단 사이로 미끄러져'],
    drown:     ['보이지 않는 물에 잠겨', '마른 공기에서 거꾸로 숨이 빨려 나가', '폐가 차올라'],
    mechanism: ['보이지 않는 톱니에 끼여', '철제 압력에 눌려', '태엽 소리에 짓눌려'],
    beast:     ['보이지 않는 이빨에 물려', '발톱에 베여', '안쪽에서 씹혀'],
    madness:   ['스스로 목을 조르며', '자신의 이름을 외치다 미쳐', '피부를 찢으며'],
    ritual:    ['낯선 의식의 제물이 되어', '몸에서 문장이 흘러나와', '봉인에 삼켜져']
  }
};
function inferTag(base='', tags=[]){
  if (Array.isArray(tags) && tags.length) return tags[0];
  const b = String(base);
  if (/[물|수조|익사|강|바다]/.test(b)) return 'drown';
  if (/[사다리|낭떠러지|바닥|추락|구덩이]/.test(b)) return 'fall';
  if (/[톱니|기계|태엽|장치|철]/.test(b)) return 'mechanism';
  if (/[광기|미쳐|정신|신|제단|의식]/.test(b)) return 'madness';
  if (/[짐승|이빨|발톱|괴물]/.test(b)) return 'beast';
  if (/[의식|제물|주문|봉인]/.test(b)) return 'ritual';
  return 'generic';
}
async function buildDeath({ baseCause='', tags=[], seedStr='' }) {
  const tag = (typeof baseCause==='string' && baseCause.trim().startsWith('!'))
    ? baseCause.trim().replace(/^!+/,'').toLowerCase()
    : inferTag(baseCause, tags);
  const rng = xorshift32(h32(seedStr || (baseCause + '|' + (tags.join(',')))));
  const out = pick(rng, K.tpl)
    .replace('{CAUSE}', pick(rng, K.cause[tag] || K.cause.generic))
    .replace('{SCENE}', pick(rng, K.scene))
    .replace('{END}', pick(rng, K.end));
  return out;
}

export async function onRequest({ request, env }) {
  const LINES = safeKV(env);
  const lwLimit = Math.max(10, parseInt(env?.LASTWORDS_LIMIT_SEC, 10) || 45);
  const maxStep  = Math.max(1, parseInt(env?.MAX_STEP, 10) || 300); // 엔딩 기준(원하면 조정)

  const ticket = getCookie(request, 'q2') || '';
  if (!ticket) return json({ error: 'no_ticket' }, 401);

  const url = new URL(request.url);

  // 초기 데이터(스토리/유언/라벨)
  if (request.method === 'GET' && url.searchParams.get('init') === '1') {
    try {
      const [actRaw, lastRaw] = await Promise.all([LINES.get('q:active'), LINES.get('lastword:latest')]);
      const act = actRaw ? JSON.parse(actRaw) : null;
      const lastHint = lastRaw ? JSON.parse(lastRaw) : null;
      const step = (act && act.step) || 0;

      const room = await fetchRoomByStep(request, step, env);
      return json({
        step,
        lastHint,
        lw_limit_sec: lwLimit,
        room: room ? {
          type: room.type || 'normal',
          story: room.story || '',
          image: room.image || '',
          bg: room.bg || '',
          choices: {
            L: room.choices?.L?.label || '왼쪽',
            F: room.choices?.F?.label || '정면',
            R: room.choices?.R?.label || '오른쪽'
          }
        } : null
      });
    } catch (e) {
      console.error('[choose] GET init failed:', e);
      return json({ step: 0, lastHint: null, lw_limit_sec: lwLimit, room: null });
    }
  }

  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  // 선택
  let body = {};
  try { body = await request.json(); } catch {}
  const dir = String(body.dir || '').toUpperCase();
  if (!['L','F','R'].includes(dir)) return json({ error: 'bad_dir' }, 400);

  try {
    const actRaw = await LINES.get('q:active');
    if (!actRaw) return json({ error: 'no_active' }, 409);
    const act = JSON.parse(actRaw);
    if (act.ticket !== ticket) return json({ error: 'not_your_turn' }, 403);
    if (act.dead) {
      const remain = Math.max(0, Math.floor(((act.lw_deadline || now()) - now()) / 1000));
      return json({ result: 'dead', cause: act.cause || '사망', step: act.step || 0, remain_sec: remain });
    }

    const step = (act.step || 0);
    const room = await fetchRoomByStep(request, step, env);

    // 데이터 없으면 1/3 백업룰
    if (!room || !room.choices || !room.choices[dir]) {
      const ok = Math.floor(Math.random() * 3) === 0;
      if (ok) {
        act.step = step + 1;
        act.updated = now();
        act.select_deadline = now() + 90 * 1000;
        await LINES.put('q:active', JSON.stringify(act));
        await LINES.put('q:step', String(act.step));
        const ending = (act.step > maxStep) ? { type:'ending' } : null;
        return json({ result: 'advance', step: act.step, event: ending });
      } else {
        act.dead = true;
        act.cause = await buildDeath({ baseCause:'', tags:[], seedStr:`${ticket}|${step}|${dir}` });
        act.lw_deadline = now() + lwLimit * 1000;
        await LINES.put('q:active', JSON.stringify(act));
        return json({ result: 'dead', cause: act.cause, step, remain_sec: lwLimit });
      }
    }

    const choice = room.choices[dir];

    if (choice.correct) {
      act.step = step + 1;
      act.updated = now();
      act.select_deadline = now() + 90 * 1000;
      await LINES.put('q:active', JSON.stringify(act));
      await LINES.put('q:step', String(act.step));

      // 엔딩 판단
      let event = null;
      if (room.type === 'ending' || act.step > maxStep) {
        event = { type:'ending' };
      } else if (room.event) {
        event = room.event;
      }
      return json({ result: 'advance', step: act.step, event });
    }

    // 오답 → deathCause 우선 규칙 적용
    const base = (choice.deathCause || '').trim();
    const tags = Array.isArray(choice.deathTags) ? choice.deathTags : [];

    let causeText = '';
    if (base && !base.startsWith('!')) {
      // 평문이면 그대로
      causeText = base;
    } else {
      // 태그 or 빈 값이면 조립형
      causeText = await buildDeath({
        baseCause: base,   // '!mechanism' 등
        tags,
        seedStr: `${ticket}|${step}|${dir}`
      });
    }

    act.dead = true;
    act.cause = causeText;
    act.lw_deadline = now() + lwLimit * 1000;
    await LINES.put('q:active', JSON.stringify(act));
    return json({ result: 'dead', cause: act.cause, step, remain_sec: lwLimit });

  } catch (e) {
    console.error('[choose] POST choose failed:', e);
    return json({ error: 'choose_failed' }, 200);
  }
}

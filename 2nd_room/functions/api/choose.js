// /functions/api/choose.js
// 방 데이터: KV(room:<step>) → 정적 파일(/data/rooms/<step>.json → /rooms/<step>.json) → 자동 AI 생성
// UI/텍스트는 기존대로 사용. 자동 생성은 실패해도 1/3 백업룰로 서비스 계속.

const json = (x, s = 200, h = {}) =>
  new Response(JSON.stringify(x), { status: s, headers: { 'Content-Type': 'application/json', ...h } });

function getCookie(req, name) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}
const now = () => Date.now();
const ymd = (d = new Date()) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

function kv(env) {
  return env && env.LINES ? env.LINES : { get: async () => null, put: async () => {}, delete: async () => {} };
}

/* =======================
   사망 문장 합성(“당신 …” 고정)
   ======================= */
function h32(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; } return h >>> 0; }
function xorshift32(seed) { let x = seed | 0; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
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
function inferTag(base = '', tags = []) {
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
async function buildDeath({ baseCause = '', tags = [], seedStr = '' }) {
  const tag = (typeof baseCause === 'string' && baseCause.trim().startsWith('!'))
    ? baseCause.trim().replace(/^!+/, '').toLowerCase()
    : inferTag(baseCause, tags);
  const rng = xorshift32(h32(seedStr || (baseCause + '|' + (tags.join(',')))));
  const out = pick(rng, K.tpl)
    .replace('{CAUSE}', pick(rng, K.cause[tag] || K.cause.generic))
    .replace('{SCENE}', pick(rng, K.scene))
    .replace('{END}', pick(rng, K.end));
  return out;
}

/* =======================
   정적 방 로딩
   ======================= */
async function fetchRoomStatic(request, step) {
  try {
    const origin = new URL(request.url).origin;
    const urls = [
      `${origin}/data/rooms/${step}.json`,
      `${origin}/rooms/${step}.json`
    ];
    for (const u of urls) {
      const r = await fetch(u, { cf: { cacheTtl: 120, cacheEverything: true } });
      if (r.ok) return await r.json();
    }
  } catch (e) {
    console.error('[choose] static fetch error', e);
  }
  return null;
}

/* =======================
   (PATCH) AI 생성 / 보정
   ======================= */
async function aiGenerateOne(env, prompt) {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new Error('no_openai_key');
  const model = env.OPENAI_MODEL || 'gpt-4o-mini';

  // 1차: 방 + 선택지 모두 생성(엄격 JSON)
  const req = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, temperature: 0.8, max_tokens: 1600, response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content:
`너는 한국어 공포 퍼즐 "방 한 개"를 생성한다. 결과는 아래 "정확한 JSON"만.
스키마:
{
 "bg": "/css/images/파일명.jpg" | "",
 "image": "/css/images/파일명.webp" | "",
 "story": "당신으로 시작하는 2~3문장",
 "choices": {
   "L": {"label":"12자 이내", "correct":true|false, "deathCause":""|문장|"!태그"},
   "F": {"label":"12자 이내", "correct":true|false, "deathCause":""|문장|"!태그"},
   "R": {"label":"12자 이내", "correct":true|false, "deathCause":""|문장|"!태그"}
 }
}
규칙:
- 정답(correct:true)인 선택지는 deathCause가 반드시 ""(빈 문자열)
- 오답은 deathCause 채우기(문장 또는 "!mechanism" 같은 태그). 다른 텍스트 출력 금지.` },
        { role: 'user', content: prompt }
      ]
    })
  });
  const data = await req.json();
  if (!req.ok) throw new Error(JSON.stringify(data));
  let obj = {};
  try { obj = JSON.parse(data?.choices?.[0]?.message?.content || '{}'); } catch {}

  // choices가 비정형/누락이면 2차 보강 호출
  if (!obj || !obj.choices) {
    const story = (obj && obj.story) ? obj.story : '당신은 어둔 복도에 서 있다.';
    const req2 = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, temperature: 0.7, max_tokens: 600, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content:
`아래 story에 맞는 choices만 JSON으로 생성.
반드시 이 스키마 그대로:
{"choices":{
 "L":{"label":"12자 이내","correct":true|false,"deathCause":""|문장|"!태그"},
 "F":{"label":"12자 이내","correct":true|false,"deathCause":""|문장|"!태그"},
 "R":{"label":"12자 이내","correct":true|false,"deathCause":""|문장|"!태그"}
}}
정답은 하나 이상. 정답의 deathCause는 반드시 "".` },
          { role: 'user', content: `story: ${story}` }
        ]
      })
    });
    const data2 = await req2.json();
    if (req2.ok) {
      const onlyChoices = JSON.parse(data2?.choices?.[0]?.message?.content || '{}');
      obj = Object.assign({ story }, obj, onlyChoices);
    }
  }

  return obj || {};
}

function coerceChoices(input) {
  const out = { L: {}, F: {}, R: {} };
  const labelCap = (s) => {
    const t = (typeof s === 'string' ? s : '').trim();
    const arr = [...t];
    return arr.length > 12 ? arr.slice(0, 12).join('') : (t || '선택');
  };

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    ['L','F','R'].forEach(k => {
      const v = input[k];
      if (v && typeof v === 'object') {
        out[k] = {
          label: labelCap(v.label),
          correct: !!v.correct,
          deathCause: (v.correct ? '' : (typeof v.deathCause === 'string' ? v.deathCause : ''))
        };
      } else if (typeof v === 'string') {
        out[k] = { label: labelCap(v), correct: false, deathCause: '!generic' };
      }
    });
  }

  if ((!out.L.label || !out.F.label || !out.R.label) && Array.isArray(input)) {
    const arr = input.slice(0, 3);
    const map = ['L', 'F', 'R'];
    arr.forEach((v, i) => {
      if (!v) return;
      out[map[i]] = {
        label: labelCap(v.label || v),
        correct: !!v.correct,
        deathCause: (v.correct ? '' : (v.deathCause || '!generic'))
      };
    });
  }

  ['L','F','R'].forEach(k => {
    if (!out[k].label) out[k] = { label: (k === 'L' ? '왼쪽' : k === 'F' ? '정면' : '오른쪽'), correct: false, deathCause: '!generic' };
  });

  if (!out.L.correct && !out.F.correct && !out.R.correct) out.F.correct = true, out.F.deathCause = '';
  return out;
}

function normalizeRoom(room) {
  const clamp = (s) => (typeof s === 'string' ? s : '');
  const story = clamp(room?.story) || '당신은 낡은 복도에 선다. 공기가 무겁다.';
  let choices = coerceChoices(room?.choices);
  ['L','F','R'].forEach(k => {
    const c = choices[k];
    c.deathCause = c.correct ? '' : (c.deathCause || '!generic');
  });
  return {
    bg: clamp(room?.bg),
    image: clamp(room?.image),
    story,
    choices,
    type: (room?.type === 'ending' ? 'ending' : (room?.type === 'special' ? 'special' : 'normal'))
  };
}

/* =======================
   자동 생성 (조건부)
   ======================= */
async function aiMaybeGenerateRoom(request, env, step, LINES) {
  if (String(env.AUTO_GEN).toLowerCase() !== 'on') return null;

  const cap = parseInt(env.GEN_DAILY_CAP || '200', 10);
  const k = `gen:count:${ymd()}`;
  let n = parseInt(await LINES.get(k) || '0', 10) || 0;
  if (n >= cap) return null;

  const theme = env.GEN_THEME || '폐허, 기계, 거울, 물, 길, 금속, 그림자';
  const useTags = String(env.GEN_USE_TAGS || '').toLowerCase() === 'on';
  const prompt =
`테마: ${theme}
태그모드: ${useTags ? 'ON' : 'OFF'}
방 번호: ${step}
형식은 반드시 스키마 그대로.`;

  try {
    const obj = await aiGenerateOne(env, prompt);
    const normalized = normalizeRoom(obj);
    await LINES.put(`room:${step}`, JSON.stringify(normalized));
    n++; await LINES.put(k, String(n), { expirationTtl: 60 * 60 * 30 });
    return normalized;
  } catch (e) {
    console.error('[choose] auto-gen error', e);
    return null;
  }
}

/* =======================
   방 조회 통합
   ======================= */
async function fetchRoomByStep(request, step, env) {
  const LINES = kv(env);

  try {
    const kvRoom = await LINES.get(`room:${step}`);
    if (kvRoom) return JSON.parse(kvRoom);
  } catch (e) { console.error('[choose] KV read error', e); }

  const staticRoom = await fetchRoomStatic(request, step);
  if (staticRoom) return normalizeRoom(staticRoom);

  const gen = await aiMaybeGenerateRoom(request, env, step, LINES);
  if (gen) return gen;

  return null;
}

/* =======================
   핸들러
   ======================= */
export async function onRequest({ request, env }) {
  const LINES = kv(env);
  const lwLimit = Math.max(10, parseInt(env?.LASTWORDS_LIMIT_SEC, 10) || 45);
  const maxStep = Math.max(1, parseInt(env?.MAX_STEP, 10) || 300);

  const ticket = getCookie(request, 'q2') || '';
  if (!ticket) return json({ error: 'no_ticket' }, 401);

  const url = new URL(request.url);

  // 초기 데이터 (클라 진입 시)
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

  // 선택 처리
  let body = {}; try { body = await request.json(); } catch {}
  const dir = String(body.dir || '').toUpperCase();
  if (!['L', 'F', 'R'].includes(dir)) return json({ error: 'bad_dir' }, 400);

  try {
    const actRaw = await LINES.get('q:active');
    if (!actRaw) return json({ error: 'no_active' }, 409);
    const act = JSON.parse(actRaw);
    if (act.ticket !== ticket) return json({ error: 'not_your_turn' }, 403);
    if (act.dead) {
      const remain = Math.max(0, Math.floor(((act.lw_deadline || now()) - now()) / 1000));
      return json({ result: 'dead', cause: act.cause || '사망', step: act.step || 0, remain_sec: remain });
    }

    const step = act.step || 0;
    const room = await fetchRoomByStep(request, step, env);

    // 방 데이터가 전혀 없으면 백업룰(1/3)
    if (!room || !room.choices || !room.choices[dir]) {
      const ok = Math.floor(Math.random() * 3) === 0;
      if (ok) {
        act.step = step + 1;
        act.updated = now();
        act.select_deadline = now() + 90 * 1000;
        await LINES.put('q:active', JSON.stringify(act));
        await LINES.put('q:step', String(act.step));
        const ending = (act.step > maxStep) ? { type: 'ending' } : null;
        return json({ result: 'advance', step: act.step, event: ending });
      } else {
        act.dead = true;
        act.cause = await buildDeath({ baseCause: '', tags: [], seedStr: `${ticket}|${step}|${dir}` });
        act.lw_deadline = now() + lwLimit * 1000;
        await LINES.put('q:active', JSON.stringify(act));
        return json({ result: 'dead', cause: act.cause, step, remain_sec: lwLimit });
      }
    }

    // 정상 분기
    const choice = room.choices[dir];

    if (choice.correct) {
      act.step = step + 1;
      act.updated = now();
      act.select_deadline = now() + 90 * 1000;
      await LINES.put('q:active', JSON.stringify(act));
      await LINES.put('q:step', String(act.step));

      let event = null;
      if (room.type === 'ending' || act.step > maxStep) event = { type: 'ending' };
      else if (room.event) event = room.event;

      return json({ result: 'advance', step: act.step, event });
    }

    // 오답 → 사망원인 텍스트 조립
    const base = (choice.deathCause || '').trim();
    const tags = Array.isArray(choice.deathTags) ? choice.deathTags : [];
    let causeText = '';
    if (base && !base.startsWith('!')) causeText = base;
    else causeText = await buildDeath({ baseCause: base, tags, seedStr: `${ticket}|${step}|${dir}` });

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

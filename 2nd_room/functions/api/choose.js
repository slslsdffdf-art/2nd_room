// /functions/api/choose.js
// A안 + 방 파일 폴백 로더 + 결정적(시드) 사망문장 생성기 + 중복회피 + 에러내성

const json = (x, s = 200, h = {}) =>
  new Response(JSON.stringify(x), { status: s, headers: { 'Content-Type': 'application/json', ...h } });

function getCookie(req, name) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}
const now = () => Date.now();

// ===== 방 파일 로더: /data/rooms/<step>.json → 실패 시 /rooms/<step>.json 폴백 =====
async function fetchRoomByStep(request, step) {
  try {
    const origin = new URL(request.url).origin;
    const tryUrls = [
      `${origin}/data/rooms/${step}.json`,
      `${origin}/rooms/${step}.json`,
    ];
    for (const u of tryUrls) {
      const r = await fetch(u, { cf: { cacheTtl: 120, cacheEverything: true } });
      if (r.ok) return await r.json();
      if (r.status === 404) continue;
    }
  } catch (e) {
    console.error('[choose] fetchRoomByStep error:', e);
  }
  return null;
}

// ===== Robust death text generator (millions of combos) =====
function xorshift32(seed){ let x=seed|0; return ()=>{ x^=x<<13; x^=x>>>17; x^=x<<5; return (x>>>0)/4294967296; } }
function h32(str){ let h=2166136261>>>0; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=(h*16777619)>>>0; } return h>>>0; }
function pickR(rng, arr){ return arr[Math.floor(rng()*arr.length)] }

const CORE = {
  template: [
    '{S} {ADV}{V}, {CAUSE}{TAIL}',
    '{LOC}에서 {S} {ADV}{V}. {DETAIL}{TAIL}',
    '{S} {CAUSE} 탓에 {ADV}{V}{TAIL}',
    '아무도 보지 못한 사이, {S} {V}. {DETAIL}{TAIL}',
    '{S} {SENSE} {ADV}{V}{TAIL}',
    '{S} {CAUSE}로 {V}. {LOC}에는 {TRACE}만 남았다{TAIL}'
  ],
  style: {
    report:    (t)=>t.replace(/\.$/,'했다.'),
    witness:   (t)=>'나는 보았다. '+t,
    folk:      (t)=>t.replace('{TAIL}','다…'),
    short:     (t)=>t.replace(/[,，]?\s*{TAIL}/,'')
  },
  subject:   ['그', '도전자', '사람', '누군가', '그림자', '몸'],
  verb:      ['멎었다', '쓰러졌다', '사라졌다', '질식했다', '굳었다', '꺾였다', '찢어졌다', '뒤틀렸다'],
  adv:       ['갑자기 ', '서서히 ', '소리 없이 ', '격렬하게 ', '어느 순간 '],
  cause:     {
    generic:   ['이유 없이', '설명할 수 없는 압박에', '알 수 없는 주문에', '그늘이 스며들어'],
    fall:      ['발밑이 비어', '끝없는 계단에 쓸려', '구덩이에 빨려들어'],
    drown:     ['보이지 않는 물에 잠겨', '마른 공기 속에서 익사해', '폐에 찬 물 때문에'],
    mechanism: ['보이지 않는 톱니에 끼어', '철제 압력에 눌려', '태엽이 감기며'],
    beast:     ['이빨에 물려', '보이지 않는 발톱에 베여', '입 안에서 씹혀'],
    madness:   ['자기 이름을 부르짖다', '자신을 조르다', '피부를 찢다'],
    ritual:    ['문장 하나가 몸에서 흘러나와', '제물로 선택돼', '낯선 의식의 한 가운데서']
  },
  detail:    ['피부는 종이처럼 구겨졌다', '숨이 거꾸로 끌려나갔다', '눈은 뒤집힌 채 멎었다', '비명은 나오지 않았다'],
  loc:       ['문틈', '바닥', '계단참', '벽 그림자', '천장 바로 아래', '거울 앞', '문 뒤'],
  sense:     ['차가운 바람을 맞으며', '어둠을 삼키듯', '누군가의 숨소리를 들으며', '낡은 금속 냄새와 함께'],
  trace:     ['자국 하나', '구겨진 종잇조각', '희미한 긁힌 자국', '젖은 발자국', '낡은 실']
};

function buildDeath(rng, tag='generic'){
  const tpl = pickR(rng, CORE.template);
  const styleKey = pickR(rng, ['report','witness','folk','short']);
  const fill = {
    S: pickR(rng, CORE.subject),
    V: pickR(rng, CORE.verb),
    ADV: pickR(rng, CORE.adv),
    CAUSE: pickR(rng, (CORE.cause[tag]||CORE.cause.generic)),
    DETAIL: pickR(rng, CORE.detail),
    LOC: pickR(rng, CORE.loc),
    SENSE: pickR(rng, CORE.sense),
    TRACE: pickR(rng, CORE.trace),
    TAIL: '.'
  };
  let out = tpl.replace(/\{([A-Z]+)\}/g, (_,k)=>fill[k]||'');
  out = CORE.style[styleKey](out);
  out = out.replace(/\s+([,.…])/g,'$1').replace(/\s{2,}/g,' ').trim();
  return out;
}

function inferTagAdvanced(base='', tags=[]){
  if (Array.isArray(tags) && tags.length) return tags[0]; // 방/선택지 지정 우선
  const b = String(base);
  if (/[물|수조|익사|강|바다]/.test(b)) return 'drown';
  if (/[사다리|낭떠러지|바닥|추락|구덩이]/.test(b)) return 'fall';
  if (/[거울|반사]/.test(b)) return 'mirror';
  if (/[톱니|기계|태엽|장치|철]/.test(b)) return 'mechanism';
  if (/[광기|미쳐|정신|신|제단|의식]/.test(b)) return 'madness';
  if (/[짐승|이빨|발톱|괴물]/.test(b)) return 'beast';
  if (/[의식|제물|주문|봉인]/.test(b)) return 'ritual';
  return 'generic';
}

// 메인 생성기: baseCause(문자열) 또는 tags(array) 받음, seed로 결정적 생성 + 최근중복 회피
async function generateDeathText({ baseCause='', tags=[], seedStr='', env }) {
  const seed = h32(seedStr || (baseCause + '|' + (tags.join(','))));
  const rng = xorshift32(seed);
  const tag = (typeof baseCause==='string' && baseCause.trim().startsWith('!'))
    ? baseCause.trim().replace(/^!+/,'').toLowerCase()
    : inferTagAdvanced(baseCause, tags);

  const key = 'dedup:death:last';
  let setStr = null;
  try { setStr = await env.LINES.get(key); } catch(e){ console.error('[choose] KV get dedup error', e); }
  let set = setStr ? setStr.split(',') : [];

  let out = '';
  for (let i=0;i<3;i++){
    out = buildDeath(rng, tag);
    const h = h32(out).toString(36);
    if (!set.includes(h)) {
      set.push(h);
      if (set.length>10000) set = set.slice(-10000);
      try { await env.LINES.put(key, set.join(',')); } catch(e){ console.error('[choose] KV put dedup error', e); }
      break;
    }
  }
  return out;
}
// ===== end robust generator =====

// ===== KV 안전 래퍼 (바인딩 누락/오류에도 500 방지) =====
function safeKV(env) {
  const kv = env && env.LINES;
  const nope = { get: async()=>null, put: async()=>{}, delete: async()=>{} };
  if (!kv) {
    console.error('[choose] KV binding "LINES" missing. Returning no-op KV.');
    return nope;
  }
  return kv;
}

export async function onRequest({ request, env }) {
  const LINES = safeKV(env);
  const lwLimit = Math.max(10, parseInt(env?.LASTWORDS_LIMIT_SEC, 10) || 45);

  const ticket = getCookie(request, 'q2') || '';
  if (!ticket) return json({ error: 'no_ticket' }, 401);

  const url = new URL(request.url);

  // ===== 초기 로드 (클라가 스토리/유언/라벨 받아감) =====
  if (request.method === 'GET' && url.searchParams.get('init') === '1') {
    try {
      const [actRaw, lastRaw] = await Promise.all([LINES.get('q:active'), LINES.get('lastword:latest')]);
      const act = actRaw ? JSON.parse(actRaw) : null;
      const lastHint = lastRaw ? JSON.parse(lastRaw) : null;
      const step = (act && act.step) || 0;

      const room = await fetchRoomByStep(request, step);

      return json({
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
      });
    } catch (e) {
      console.error('[choose] GET init failed:', e);
      return json({ step: 0, lastHint: null, lw_limit_sec: lwLimit, room: null });
    }
  }

  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  // ===== 선택 처리 =====
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

    const stepKey = (act.step || 0);
    const room = await fetchRoomByStep(request, stepKey);

    // 데이터 없으면 1/3 백업룰
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
        act.cause = await generateDeathText({
          baseCause: '',
          tags: [],
          seedStr: `${act.ticket}|${act.step}|${Date.now()}`,
          env
        });
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

      // 이벤트 룸 처리
      if (room.event) {
        if (room.event.type === 'hall-of-fame') {
          try {
            await LINES.put(`hof:${ticket}`, JSON.stringify({ ts: Date.now(), step: act.step }), { expirationTtl: 60*60*24*365 });
          } catch(e){ console.error('[choose] hof put error', e); }
        }
        if (room.event.type === 'inventory' && room.event.arg) {
          try {
            await LINES.put(`inv:${ticket}:${room.event.arg}`, '1', { expirationTtl: 60*60*24*30 });
          } catch(e){ console.error('[choose] inv put error', e); }
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

    // 오답 → 조립형 사망문장
    const base = choice.deathCause || '';
    const tags = Array.isArray(choice.deathTags) ? choice.deathTags : [];
    act.dead = true;
    act.cause = await generateDeathText({
      baseCause: base,
      tags,
      seedStr: `${act.ticket}|${act.step}|${dir}`, // 같은 사건은 동일 문장
      env
    });
    act.lw_deadline = now() + lwLimit * 1000;
    await LINES.put('q:active', JSON.stringify(act));
    return json({ result: 'dead', cause: act.cause, step: act.step || 0, remain_sec: lwLimit });

  } catch (e) {
    console.error('[choose] POST choose failed:', e);
    // 실패시에도 500 방지
    return json({ error: 'choose_failed' }, 200);
  }
}
```0

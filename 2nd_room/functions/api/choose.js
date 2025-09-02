const json=(x,s=200,h={})=>new Response(JSON.stringify(x),{
  status:s, headers:{'Content-Type':'application/json','Cache-Control':'no-store',...h}
});

function getCookie(req,name){
  const c=req.headers.get('Cookie')||''; const m=c.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'));
  return m?decodeURIComponent(m[1]):'';
}
const now=()=>Date.now();

function hashInt(str){
  let h=2166136261>>>0;
  for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=(h*16777619)>>>0; }
  return h>>>0;
}
function seededChoice(ticket, step){
  // 1/3 성공 판정 (dir 무관): 매 스텝마다 고정 재현 가능
  const h = hashInt(ticket+':'+step);
  return (h % 3)===0; // true=생존(전진), false=사망
}

export async function onRequest({ request, env }){
  const { LINES, LASTWORDS_LIMIT_SEC='45', SELECT_LIMIT_SEC='90' } = env;
  const ticket = getCookie(request,'q2');
  if(!ticket) return json({error:'no_ticket'},401);

  // init: 최근 유언 1건
  if(request.method==='GET'){
    const init = new URL(request.url).searchParams.get('init');
    if(init){
      const actRaw = await LINES.get('q:active'); const act = actRaw?JSON.parse(actRaw):null;
      const lastRaw = await LINES.get('lastword:latest'); const lastHint = lastRaw?JSON.parse(lastRaw):null;
      const step = (act && act.ticket===ticket) ? (act.step||0) : 0;
      return json({
        step,
        lw_limit_sec: Math.max(10, parseInt(LASTWORDS_LIMIT_SEC,10)||45),
        lastHint: lastHint ? { text: lastHint.text||'' } : null
      });
    }
    return json({error:'bad_request'},400);
  }

  if(request.method!=='POST') return json({error:'Method Not Allowed'},405);

  const body = await request.json().catch(()=>({}));
  const dir = (body.dir||'').toUpperCase();
  if(!['L','C','R'].includes(dir)) return json({error:'invalid_dir'},400);

  const actRaw = await LINES.get('q:active'); let act = actRaw?JSON.parse(actRaw):null;
  if(!act || act.ticket!==ticket) return json({error:'not_active'},409);

  // 이미 사망 상태면 원인 덮어쓰기 금지
  if(act.dead){
    return json({ result:'dead', cause: act.cause||'사망', step: act.step||0 });
  }

  // 선택 제한 보장
  const selLimit = Math.max(30, parseInt(SELECT_LIMIT_SEC,10)||90);
  if(!act.select_deadline){ act.select_deadline = (act.since||now()) + selLimit*1000; }

  // 스텝 증가(시도 시 1 증가)
  act.step = (act.step||0) + 1;

  // 판정
  const ok = seededChoice(ticket, act.step);
  if(ok){
    // 전진: 다음 선택 제한 갱신
    act.updated = now();
    act.dead = false;
    act.cause ??= null;
    act.select_deadline = now() + selLimit*1000;
    await LINES.put('q:active', JSON.stringify(act));
    return json({ result:'advance', step: act.step });
  }

  // 사망 처리 (원인 고정)
  const lwLimit = Math.max(10, parseInt(LASTWORDS_LIMIT_SEC,10)||45);
  act.dead = true;
  if(!act.cause){
    act.cause = (dir==='L'?'왼쪽 문':(dir==='C'?'정면 문':'오른쪽 문'));
  }
  act.lw_deadline = now() + lwLimit*1000;
  await LINES.put('q:active', JSON.stringify(act));
  return json({ result:'dead', cause: act.cause, step: act.step });
}

const json=(x,s=200,h={})=>new Response(JSON.stringify(x),{status:s,headers:{'Content-Type':'application/json',...h}});

function getCookie(req,name){
  const c=req.headers.get('Cookie')||''; const m=c.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'));
  return m?decodeURIComponent(m[1]):'';
}
function setCookie(H,name,value,opts={}){
  const p=[`${name}=${encodeURIComponent(value)}`,'Path=/','SameSite=Lax','Secure',
    opts.httpOnly?'HttpOnly':'',opts.maxAge?`Max-Age=${opts.maxAge}`:''].filter(Boolean).join('; ');
  H.append('Set-Cookie', p);
}
const now=()=>Date.now();

export async function onRequest({ request, env }){
  const { LINES, AVG_DURATION_SEC='90', LASTWORDS_LIMIT_SEC='45' } = env;
  const avg = Math.max(30, parseInt(AVG_DURATION_SEC,10)||90);
  const lwLimit = Math.max(10, parseInt(LASTWORDS_LIMIT_SEC,10)||45);
  const ticket = getCookie(request,'q2') || '';

  if (!ticket) return json({ error:'no_ticket' }, 401);

  // 도우미: active 타임아웃이면 기본 유언 생성 후 비우기
  async function finalizeActiveIfTimedOut() {
    const raw = await LINES.get('q:active'); let act = raw?JSON.parse(raw):null;
    if (!act || !act.dead) return false;
    const deadline = act.lw_deadline || 0;
    if (now() <= deadline) return false;

    // 이미 유언 저장됐는지 확인
    if (await LINES.get(`lw:byTicket:${act.ticket}`)) {
      await LINES.delete('q:active');
      return true;
    }

    // 기본 유언 생성
    const idxRaw = await LINES.get('idx'); const idx = idxRaw?JSON.parse(idxRaw):[];
    const nextId = idx.length ? Math.max(...idx)+1 : 1;
    const item = {
      id: nextId,
      ts: now(),
      step: act.step || 0,
      cause: act.cause || '사망',
      text: '외마디 비명도 지르지 못한 채 즉사.'
    };
    idx.push(nextId);
    await LINES.put('idx', JSON.stringify(idx));
    await LINES.put(`l:${nextId}`, JSON.stringify(item));
    await LINES.put('lastword:latest', JSON.stringify(item));
    await LINES.put(`lw:byTicket:${act.ticket}`, 'auto', { expirationTtl: 60*60*24 });

    // active 해제
    await LINES.delete('q:active');
    return true;
  }

  if (request.method === 'GET') {
    // 유언 타임아웃 처리(있다면)
    await finalizeActiveIfTimedOut();

    // 큐/액티브 로드
    const qRaw = await LINES.get('q:queue'); let q = qRaw?JSON.parse(qRaw):[];
    const actRaw = await LINES.get('q:active'); let act = actRaw?JSON.parse(actRaw):null;

    // active 만료(하트비트 끊김) 30초
    const stale = act && !act.dead && (now() - (act.updated||act.since||0) > 30000);
    if (stale) { act = null; await LINES.delete('q:active'); }

    // 승급(비어있으면 선두를 active로)
    if (!act && q.length>0) {
      const head = q.shift();
      await LINES.put('q:queue', JSON.stringify(q));
      act = { ticket: head, since: now(), updated: now(), dead: false };
      await LINES.put('q:active', JSON.stringify(act));
    }

    // 내 상태 응답
    const size = q.length + (act?1:0);
    // 내가 active라면 플레이 허용 쿠키 세팅
    let headers = {};
    if (act && act.ticket === ticket && !act.dead) {
      const H = new Headers();
      setCookie(H,'auth2','ok',{ httpOnly:true, maxAge:60*60*2 });
      headers = Object.fromEntries(H.entries());
      return json({ state:'active', position:0, est_sec:0, size }, 200, headers);
    }

    // 대기 중
    const pos = q.indexOf(ticket);
    if (pos >= 0) {
      const est = (pos + (act?1:0)) * avg;
      return json({ state:'waiting', position:pos+1, est_sec:est, size }, 200, headers);
    }

    // active인데 dead 상태면(유언 중/또는 타임아웃 대기)
    if (act && act.ticket === ticket && act.dead) {
      const remain = Math.max(0, Math.floor(((act.lw_deadline||now()) - now())/1000));
      return json({ state:'dead_pending', remain_sec: remain, size }, 200, headers);
    }

    // 큐에 없으면 tail 로 복구(보수적)
    q.push(ticket); await LINES.put('q:queue', JSON.stringify(q));
    const est = (q.length + (act?1:0) - 1) * avg;
    return json({ state:'waiting', position:q.length, est_sec:est, size }, 200, headers);
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(()=>({}));
    // 하트비트
    if (body.hb) {
      const raw = await LINES.get('q:active'); const act = raw?JSON.parse(raw):null;
      if (act && act.ticket === ticket && !act.dead) {
        act.updated = now();
        await LINES.put('q:active', JSON.stringify(act));
        return json({ ok:true });
      }
      return json({ error:'not_active' }, 409);
    }
    // 대기 취소
    if (body.leave) {
      const qRaw = await LINES.get('q:queue'); const q = qRaw?JSON.parse(qRaw):[];
      const i = q.indexOf(ticket);
      if (i>=0) { q.splice(i,1); await LINES.put('q:queue', JSON.stringify(q)); }
      const H=new Headers();
      setCookie(H,'q2','',{httpOnly:true,maxAge:0});
      return json({ ok:true }, 200, Object.fromEntries(H.entries()));
    }
    return json({ error:'bad_request' }, 400);
  }

  return json({ error:'Method Not Allowed' }, 405);
}
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
  const { LINES, AVG_DURATION_SEC='90', LASTWORDS_LIMIT_SEC='45', SELECT_LIMIT_SEC='90' } = env;
  const avg = Math.max(30, parseInt(AVG_DURATION_SEC,10)||90);
  const lwLimit = Math.max(10, parseInt(LASTWORDS_LIMIT_SEC,10)||45);
  const selLimit = Math.max(30, parseInt(SELECT_LIMIT_SEC,10)||90);

  const ticket = getCookie(request,'q2') || '';
  if (!ticket) return json({ error:'no_ticket' }, 401);

  async function finalizeActiveIfTimedOut() {
    const raw = await LINES.get('q:active'); let act = raw?JSON.parse(raw):null;
    if (!act || !act.dead) return false;
    if (now() <= (act.lw_deadline||0)) return false;

    // 이미 유언 저장된 티켓이면 active만 해제
    if (await LINES.get(`lw:byTicket:${act.ticket}`)) { await LINES.delete('q:active'); return true; }

    // 기본 유언 자동 저장
    const idxRaw = await LINES.get('idx'); const idx = idxRaw?JSON.parse(idxRaw):[];
    const nextId = idx.length ? Math.max(...idx)+1 : 1;
    const item = { id: nextId, ts: now(), step: act.step||0, cause: act.cause||'사망', text:'외마디 비명도 지르지 못한 채 즉사.' };
    idx.push(nextId);
    await LINES.put('idx', JSON.stringify(idx));
    await LINES.put(`l:${nextId}`, JSON.stringify(item));
    await LINES.put('lastword:latest', JSON.stringify(item));
    await LINES.put(`lw:byTicket:${act.ticket}`, 'auto', { expirationTtl: 60*60*24 });
    await LINES.delete('q:active');
    return true;
  }

  async function autoKillIfSelectTimedOut() {
    const raw = await LINES.get('q:active'); let act = raw?JSON.parse(raw):null;
    if (!act || act.dead) return null;
    if (!act.select_deadline) {
      act.select_deadline = (act.since||now()) + selLimit*1000;
      await LINES.put('q:active', JSON.stringify(act));
    }
    if (now() <= act.select_deadline) return null;

    act.dead = true;
    act.cause = act.cause || '시간 초과';
    act.step = act.step || 0;
    act.lw_deadline = now() + lwLimit*1000;
    await LINES.put('q:active', JSON.stringify(act));
    return act;
  }

  if (request.method === 'GET') {
    await finalizeActiveIfTimedOut();

    let q = JSON.parse((await LINES.get('q:queue')) || '[]');
    let act = JSON.parse((await LINES.get('q:active')) || 'null');

    // 내가 유언 자동저장까지 끝났으면 finished 응답
    if (!act) {
      const done = await LINES.get(`lw:byTicket:${ticket}`);
      if (done) {
        const H=new Headers();
        setCookie(H,'auth2','wall',{ httpOnly:true, maxAge:60*60*24 });
        return json({ state:'finished' }, 200, Object.fromEntries(H.entries()));
      }
    }

    // 하트비트 끊긴 active(30초) → 해제
    const stale = act && !act.dead && (now() - (act.updated||act.since||0) > 30000);
    if (stale) { act=null; await LINES.delete('q:active'); }

    // active 없으면 선두 입장
    if (!act && q.length>0) {
      const head=q.shift();
      await LINES.put('q:queue', JSON.stringify(q));
      act = { ticket: head, since: now(), updated: now(), dead:false, select_deadline: now()+selLimit*1000 };
      await LINES.put('q:active', JSON.stringify(act));
    }

    // 선택 제한 초과 자동 사망
    const killed = await autoKillIfSelectTimedOut();
    if (killed && killed.ticket === ticket) {
      const H=new Headers();
      setCookie(H,'auth2','wall',{ httpOnly:true, maxAge:60*60*24 });
      const remain = Math.max(0, Math.floor(((killed.lw_deadline||now()) - now())/1000));
      return json(
        { state:'dead_pending', remain_sec: remain, cause: killed.cause || '사망', step: killed.step||0 },
        200,
        Object.fromEntries(H.entries())
      );
    }

    // 내 상태
    const size = q.length + (act?1:0);

    if (act && act.ticket===ticket && !act.dead) {
      const H=new Headers();
      setCookie(H,'auth2','ok',{ httpOnly:true, maxAge:60*60*2 });
      const remain = Math.max(0, Math.floor(((act.select_deadline||now()) - now())/1000));
      return json(
        { state:'active', position:0, est_sec:0, select_remain_sec: remain, size },
        200,
        Object.fromEntries(H.entries())
      );
    }

    if (act && act.ticket===ticket && act.dead) {
      const remain = Math.max(0, Math.floor(((act.lw_deadline||now()) - now())/1000));
      return json({ state:'dead_pending', remain_sec: remain, cause: act.cause || '사망', step: act.step||0, size });
    }

    const pos = q.indexOf(ticket);
    if (pos>=0) {
      const est = (pos + (act?1:0)) * avg;
      return json({ state:'waiting', position:pos+1, est_sec:est, size });
    }

    // 큐에 없으면 tail 재삽입
    q.push(ticket); await LINES.put('q:queue', JSON.stringify(q));
    const est = (q.length + (act?1:0) - 1) * avg;
    return json({ state:'waiting', position:q.length, est_sec:est, size });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(()=>({}));

    if (body.hb) {
      const act = JSON.parse((await LINES.get('q:active')) || 'null');
      if (act && act.ticket===ticket && !act.dead) {
        act.updated = now();
        await LINES.put('q:active', JSON.stringify(act));
        return json({ ok:true });
      }
      return json({ error:'not_active' },409);
    }

    if (body.leave) {
      const q = JSON.parse((await LINES.get('q:queue')) || '[]');
      const i = q.indexOf(ticket); if (i>=0){ q.splice(i,1); await LINES.put('q:queue', JSON.stringify(q)); }
      const H=new Headers(); setCookie(H,'q2','',{httpOnly:true,maxAge:0});
      return json({ ok:true },200,Object.fromEntries(H.entries()));
    }

    return json({ error:'bad_request' },400);
  }

  return json({ error:'Method Not Allowed' },405);
}

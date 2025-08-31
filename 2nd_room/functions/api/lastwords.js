const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'Content-Type':'application/json'}});

function getCookie(req,name){
  const c=req.headers.get('Cookie')||''; const m=c.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'));
  return m?decodeURIComponent(m[1]):'';
}
const dec=(s)=>{ try{return JSON.parse(decodeURIComponent(escape(atob(s))))}catch{return null} };

export async function onRequest({ request, env }){
  const { LINES } = env;
  const ck = request.headers.get('Cookie')||'';
  if (!/(^|;\s*)auth2=wall(;|$)/.test(ck)) return json({ ok:false, error:'forbidden' },403);
  if (request.method!=='POST') return json({ ok:false, error:'Method Not Allowed' },405);

  const body = await request.json().catch(()=>({}));
  const text = String(body.text||'').replace(/[\u200B-\u200D\uFEFF]/g,'').trim().slice(0,300);

  const ticket = getCookie(request,'q2') || '';
  if (!ticket) return json({ ok:false, error:'no_ticket' },401);

  // 멱등: 티켓당 1회
  if (await LINES.get(`lw:byTicket:${ticket}`)) return json({ ok:true, already:true });

  // r2 쿠키에서 step/cause 복원
  const st = dec(getCookie(request,'r2')) || { step:0, cause:'사망' };

  // 유언 저장
  const idxRaw = await LINES.get('idx'); const idx = idxRaw?JSON.parse(idxRaw):[];
  const nextId = idx.length ? Math.max(...idx)+1 : 1;
  const item = { id: nextId, ts: Date.now(), step: st.step||0, cause: st.cause||'사망', text: text||'…' };
  idx.push(nextId);
  await LINES.put('idx', JSON.stringify(idx));
  await LINES.put(`l:${nextId}`, JSON.stringify(item));
  await LINES.put('lastword:latest', JSON.stringify(item));
  await LINES.put(`lw:byTicket:${ticket}`, '1', { expirationTtl: 60*60*24 });

  // active 해제(다음 도전자 입장 가능)
  const raw = await LINES.get('q:active'); const act = raw?JSON.parse(raw):null;
  if (act && act.ticket === ticket) {
    await LINES.delete('q:active');
  }

  return json({ ok:true, id: nextId });
}

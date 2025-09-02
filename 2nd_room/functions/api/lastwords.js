const json=(x,s=200,h={})=>new Response(JSON.stringify(x),{
  status:s, headers:{'Content-Type':'application/json','Cache-Control':'no-store',...h}
});
function getCookie(req,name){
  const c=req.headers.get('Cookie')||''; const m=c.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'));
  return m?decodeURIComponent(m[1]):'';
}
const now=()=>Date.now();

function setCookie(H,name,value,opts={}){
  const p=[`${name}=${encodeURIComponent(value)}`,'Path=/','SameSite=Lax','Secure',
    opts.httpOnly?'HttpOnly':'',opts.maxAge?`Max-Age=${opts.maxAge}`:''].filter(Boolean).join('; ');
  H.append('Set-Cookie', p);
}

export async function onRequest({ request, env }){
  if(request.method!=='POST') return json({error:'Method Not Allowed'},405);
  const { LINES } = env;
  const ticket = getCookie(request,'q2');
  if(!ticket) return json({error:'no_ticket'},401);

  const body = await request.json().catch(()=>({}));
  const text = (body.text||'').toString().slice(0,300).trim();

  const actRaw = await LINES.get('q:active'); const act = actRaw?JSON.parse(actRaw):null;
  if(!act || act.ticket!==ticket) return json({error:'not_active'},409);
  if(!act.dead) return json({error:'not_dead'},409);

  // 중복 작성 방지
  const doneKey = `lw:byTicket:${ticket}`;
  if(await LINES.get(doneKey)){
    const H=new Headers(); setCookie(H,'auth2','wall',{httpOnly:true,maxAge:60*60*24});
    return json({ ok:true, already:true },200,Object.fromEntries(H.entries()));
  }

  // idx 부여
  const idxRaw = await LINES.get('idx'); const idx = idxRaw?JSON.parse(idxRaw):[];
  const nextId = idx.length ? Math.max(...idx)+1 : 1;

  const rec = {
    id: nextId,
    ticket,
    step: act.step||0,
    cause: act.cause||'사망',
    text: text || '외마디 비명도 지르지 못한 채 즉사.',
    ts: now(),
    src: text ? 'user' : 'auto'
  };
  idx.push(nextId);
  await LINES.put('idx', JSON.stringify(idx));
  await LINES.put(`l:${nextId}`, JSON.stringify(rec));
  await LINES.put('lastword:latest', JSON.stringify(rec));
  await LINES.put(doneKey, 'done', { expirationTtl: 60*60*24 }); // 24h

  // 활성 해제
  await LINES.delete('q:active');

  const H=new Headers(); setCookie(H,'auth2','wall',{httpOnly:true,maxAge:60*60*24});
  return json({ ok:true, id: nextId },200,Object.fromEntries(H.entries()));
}

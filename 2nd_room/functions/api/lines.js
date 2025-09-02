const json=(x,s=200,h={})=>new Response(JSON.stringify(x),{
  status:s, headers:{'Content-Type':'application/json','Cache-Control':'no-store',...h}
});
function getCookie(req,name){
  const c=req.headers.get('Cookie')||''; const m=c.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'));
  return m?decodeURIComponent(m[1]):'';
}

async function loadAll(env){
  const idxRaw = await env.LINES.get('idx'); const idx = idxRaw?JSON.parse(idxRaw):[];
  const items=[];
  for(const id of idx){
    const r = await env.LINES.get(`l:${id}`);
    if(r) items.push(JSON.parse(r));
  }
  return { idx, items };
}

export async function onRequest({ request, env }){
  const { LINES } = env;
  const url = new URL(request.url);
  const method = request.method;

  // 목록 조회
  if(method==='GET'){
    const page = Math.max(1, parseInt(url.searchParams.get('page')||'1',10));
    const limit = Math.max(1, Math.min(50, parseInt(url.searchParams.get('limit')||'20',10)));

    const { idx, items } = await loadAll(env);
    // 오래된 → 최신 (요구사항) 정렬 유지
    const total = items.length;

    // 번호 재정렬된 표시 번호 부여(1..N)
    items.forEach((it, i)=> it.number = i+1);

    const start = (page-1)*limit;
    const paged = items.slice(start, start+limit);

    const admin = (getCookie(request,'admin')==='ok');
    return json({ ok:true, total, page, limit, admin, items: paged });
  }

  // 관리자 삭제 (단건) → 번호 재정렬
  if(method==='DELETE'){
    const admin = (getCookie(request,'admin')==='ok');
    if(!admin) return json({error:'forbidden'},403);

    const id = parseInt(new URL(request.url).searchParams.get('id')||'0',10);
    if(!id) return json({error:'bad_id'},400);

    const { idx, items } = await loadAll(env);
    if(!idx.includes(id)) return json({error:'not_found'},404);

    // 대상 제외 후 모든 항목을 1..N으로 재기록
    const remain = items.filter(x=>x.id!==id);

    // idx 리셋
    await LINES.put('idx', JSON.stringify(remain.map((_,i)=>i+1)));

    // 기존 레코드 삭제
    for(const old of items){ await LINES.delete(`l:${old.id}`); }

    // 새 번호로 다시 씀(1..N)
    for(let i=0;i<remain.length;i++){
      const rec = { ...remain[i], id: i+1 };
      await LINES.put(`l:${i+1}`, JSON.stringify(rec));
    }

    // lastword:latest는 가장 최신(마지막)으로 갱신
    const latest = remain[remain.length-1] ? { ...remain[remain.length-1], id: remain.length } : null;
    if(latest){ await LINES.put('lastword:latest', JSON.stringify(latest)); }

    return json({ ok:true, total: remain.length });
  }

  return json({error:'Method Not Allowed'},405);
}

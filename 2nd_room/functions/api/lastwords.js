export async function onRequestPost({ request/*, env*/ }) {
  const c = request.headers.get('Cookie') || '';
  const r2 = (c.match(/(?:^|;\s*)r2=([^;]+)/) || [])[1];
  if (!r2) {
    return new Response(JSON.stringify({ error:'no session' }), {
      status:401, headers:{'Content-Type':'application/json'}
    });
  }
  let s=null; try{ s = JSON.parse(atob(decodeURIComponent(r2))); }catch{}
  if (!s || s.alive) {
    return new Response(JSON.stringify({ error:'not_dead' }), {
      status:400, headers:{'Content-Type':'application/json'}
    });
  }

  const body = await request.json().catch(()=>({}));
  const text = (body.text || '').toString().replace(/\s{3,}/g,' ').trim().slice(0, 200);
  // TODO: KV 같은 곳에 실제 저장 (env.LINES.put 등)
  // 여기서는 성공만 반환
  return new Response(JSON.stringify({ ok:true }), {
    status:200, headers:{'Content-Type':'application/json'}
  });
}

export async function onRequest({ request }) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error:'Method Not Allowed' }), {
      status:405, headers:{'Content-Type':'application/json'}
    });
  }
}

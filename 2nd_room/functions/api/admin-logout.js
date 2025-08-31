// admin-logout.js
function setCookie(H,name,value,opts={}){
  const p=[`${name}=${encodeURIComponent(value)}`,'Path=/','SameSite=Lax','Secure',
    opts.httpOnly?'HttpOnly':'',opts.maxAge?`Max-Age=${opts.maxAge}`:''].filter(Boolean).join('; ');
  H.append('Set-Cookie', p);
}
const json=(x,s=200,h={})=>new Response(JSON.stringify(x),{status:s,headers:{'Content-Type':'application/json',...h}});

export async function onRequest({ request, env }){
  if (request.method!=='POST') return json({ error:'Method Not Allowed' },405);
  const { OWNER_PASSWORD='' } = env;
  const token = (request.headers.get('Authorization')||'').replace(/^Bearer\s+/,'');
  if (!OWNER_PASSWORD || token!==OWNER_PASSWORD) return json({ error:'FORBIDDEN' },403);
  const H=new Headers();
  setCookie(H,'admin','',{ httpOnly:true, maxAge:0 });
  return json({ ok:true },200,Object.fromEntries(H.entries()));
}

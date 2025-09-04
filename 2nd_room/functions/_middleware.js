// Cloudflare Pages Middleware (SAFE)
// - /play/css/*  →  /css/* 301 (경로 보정)
// - /api/*        : 항상 통과
// - 정적 리소스   : 항상 통과 (player.js, 이미지, css 등 + /data/rooms/*.json)
// - /play/* HTML  : auth/auth2 없으면 / 로 302
// - 나머지는 모두 context.next()

function getCookie(req, name) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

const RX_STATIC = [
  /^\/css\/images\/.+\.(png|jpg|jpeg|webp|gif|svg)$/i,
  /^\/css\/bgm\/.+\.(mp3|ogg|wav|m4a)$/i,
  /^\/css\/.+\.(css|js|map|json|txt|woff2?|ttf)$/i,
  // 레거시 경로 허용
  /^\/play\/css\/images\/.+\.(png|jpg|jpeg|webp|gif|svg)$/i,
  /^\/play\/css\/bgm\/.+\.(mp3|ogg|wav|m4a)$/i,
  // A안: 방 데이터 JSON
  /^\/data\/rooms\/\d+\.json$/i
];

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const p = url.pathname;

  // /play/css/* → /css/* 로 영구 리다이렉트
  if (p.startsWith('/play/css/')) {
    const to = p.replace('/play/css/', '/css/') + (url.search || '');
    return Response.redirect(url.origin + to, 301);
  }

  // API는 그대로 통과
  if (p.startsWith('/api/')) {
    return await context.next();
  }

  // 정적 리소스(+ 데이터 JSON)는 통과
  if (RX_STATIC.some(rx => rx.test(p))) {
    return await context.next();
  }

  // /play/* 의 HTML만 보호
  const isPlay = p.startsWith('/play/');
  const isHTML = p.endsWith('.html') ||
    (request.headers.get('Accept') || '').toLowerCase().includes('text/html');

  if (isPlay && isHTML) {
    const authed = getCookie(request, 'auth') === 'ok' || !!getCookie(request, 'auth2');
    if (!authed) return Response.redirect(url.origin + '/', 302);
  }

  return await context.next();
}

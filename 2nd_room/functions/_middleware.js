// Cloudflare Pages Middleware (SAFE)
// - /play/css/*  →  /css/* 301 (HTML 수정 없이 경로 보정)
// - /api/*        : 항상 통과
// - 정적 리소스   : 항상 통과 (player.js 포함)
// - /play/* HTML  : auth/auth2 없으면 / 로 302
// - 나머지는 모두 context.next() 로 전달 (절대 fetch(request) 쓰지 않음)

function getCookie(req, name) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

const RX_STATIC = [
  /^\/css\/images\/.+\.(png|jpg|jpeg|webp|gif|svg)$/i,
  /^\/css\/bgm\/.+\.(mp3|ogg|wav|m4a)$/i,
  /^\/css\/.+\.(css|js|map|json|txt|woff2?|ttf)$/i,
  // 레거시 경로도 허용 (과거 HTML이 /play/css/*를 참조하는 경우)
  /^\/play\/css\/images\/.+\.(png|jpg|jpeg|webp|gif|svg)$/i,
  /^\/play\/css\/bgm\/.+\.(mp3|ogg|wav|m4a)$/i,
];

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const p = url.pathname;

  // 0) /play/css/* → /css/* 로 영구 리다이렉트 (정적 경로 보정)
  if (p.startsWith('/play/css/')) {
    const to = p.replace('/play/css/', '/css/') + (url.search || '');
    return Response.redirect(url.origin + to, 301);
  }

  // 1) /api/* 는 미들웨어 건드리지 않고 통과
  if (p.startsWith('/api/')) {
    return await context.next();
  }

  // 2) 정적 리소스는 항상 통과 (player.js, 이미지, 폰트, css 등)
  if (RX_STATIC.some(rx => rx.test(p))) {
    return await context.next();
  }

  // 3) /play/*의 HTML만 보호 (문서 요청일 때만)
  const isPlay = p.startsWith('/play/');
  const isHTML = p.endsWith('.html') ||
    (request.headers.get('Accept') || '').toLowerCase().includes('text/html');

  if (isPlay && isHTML) {
    const authed = getCookie(request, 'auth') === 'ok' || !!getCookie(request, 'auth2');
    if (!authed) {
      return Response.redirect(url.origin + '/', 302);
    }
  }

  // 4) 그 외는 기본 응답으로 넘김
  return await context.next();
}

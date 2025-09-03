// Cloudflare Pages Middleware (safe passthrough)
// - /play/css/* → /css/* 301 (HTML 안 건드려도 경로 보정)
// - 정적 리소스(이미지/오디오/CSS/JS/폰트/맵/텍스트) 무조건 통과
// - /api/* 무조건 통과 (login 등 영향 X)
// - /play/* HTML만 auth/auth2 쿠키 없으면 / 로 302
// - context.next 사용하지 않음 → 503 방지

const RX_STATIC = [
  /^\/css\/images\/.+\.(png|jpg|jpeg|webp|gif|svg)$/i,
  /^\/css\/bgm\/.+\.(mp3|ogg|wav|m4a)$/i,
  /^\/css\/.+\.(css|js|map|json|txt|woff2?|ttf)$/i,
  // 과거 경로로 오는 정적 요청도 허용
  /^\/play\/css\/images\/.+\.(png|jpg|jpeg|webp|gif|svg)$/i,
  /^\/play\/css\/bgm\/.+\.(mp3|ogg|wav|m4a)$/i
];

function getCookie(req, name) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const p = url.pathname;

  // (0) /play/css/* → /css/* 로 301 고정 (HTML 수정 없이 리소스 살리기)
  if (p.startsWith('/play/css/')) {
    const to = p.replace('/play/css/', '/css/') + (url.search || '');
    return Response.redirect(url.origin + to, 301);
  }

  // (1) /api/* 은 절대 건드리지 않음
  if (p.startsWith('/api/')) {
    return fetch(request);
  }

  // (2) 정적 리소스는 무조건 통과 (player.js 포함)
  if (RX_STATIC.some(rx => rx.test(p))) {
    return fetch(request);
  }

  // (3) /play/* 중 HTML만 보호 (Accept가 text/html 이거나 .html 확장자)
  const isPlay = p.startsWith('/play/');
  const isHTML =
    p.endsWith('.html') ||
    (request.headers.get('Accept') || '').toLowerCase().includes('text/html');

  if (isPlay && isHTML) {
    const hasAuth =
      getCookie(request, 'auth') === 'ok' || !!getCookie(request, 'auth2');
    if (!hasAuth) return Response.redirect(url.origin + '/', 302);
  }

  // (4) 나머지는 그대로 패스
  return fetch(request);
}


// 정적 리소스는 인증 우회
const STATIC_ALLOW = [
  /^\/css\/images\/.+\.(png|jpg|jpeg|webp|gif|svg)$/i,
  /^\/css\/bgm\/.+\.(mp3|ogg|wav|m4a)$/i,
  /^\/css\/.+\.(css|js|map|json|woff2?|ttf)$/i,
  // 과거 경로 호환: /play/css/* 로 오는 정적 요청도 통과
  /^\/play\/css\/images\/.+\.(png|jpg|jpeg|webp|gif|svg)$/i,
  /^\/play\/css\/bgm\/.+\.(mp3|ogg|wav|m4a)$/i,
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

  // 1) 정적 파일은 그대로 통과
  if (STATIC_ALLOW.some(rx => rx.test(p))) {
    return fetch(request);
  }

  // 2) 본문 보호: /play/* 는 auth / auth2 필요 (API는 각 파일에서 처리)
  if (p.startsWith('/play')) {
    const hasAuth = getCookie(request, 'auth') === 'ok' || !!getCookie(request, 'auth2');
    if (!hasAuth) return Response.redirect(url.origin + '/', 302);
  }

  // 3) 나머지는 다음으로
  if (typeof context.next === 'function') return await context.next();
  return fetch(request);
}

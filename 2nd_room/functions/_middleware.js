// /, /index.html, /images/* 는 공개
// /api/login 은 공개
// 나머지(/play/*, 대부분의 /api/*)는 auth2=ok 쿠키 필요

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const p = url.pathname;
  const cookies = request.headers.get('Cookie') || '';
  const authed = /(?:^|;\s*)auth2=ok(?:;|$)/.test(cookies);

  const isPublic =
    p === '/' ||
    p === '/index.html' ||
    p.startsWith('/images/') ||
    p === '/favicon.ico';

  if (isPublic) return next();

  if (p.startsWith('/api/')) {
    if (p === '/api/login') return next();
    if (!authed) return new Response('Unauthorized', { status: 401 });
    return next();
  }

  if (p.startsWith('/play')) {
    if (!authed) return new Response(null, { status: 302, headers: { Location: '/' } });
    return next();
  }

  return next();
}

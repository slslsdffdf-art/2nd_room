export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  // 보호 대상: /play/ 및 게임 API (login 제외)
  const needAuth = url.pathname.startsWith('/play') ||
                   (url.pathname.startsWith('/api') && !url.pathname.startsWith('/api/login'));

  if (!needAuth) return next();

  const cookie = request.headers.get('Cookie') || '';
  const ok = /r2sess=([A-Za-z0-9_\-\.]+)/.test(cookie); // 서명 검증은 API들에서 재확인
  if (ok) return next();

  // 세션 없으면 게이트로
  return new Response(null, { status: 302, headers: { Location: '/' }});
}
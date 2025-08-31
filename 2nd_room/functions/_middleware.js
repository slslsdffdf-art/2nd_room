export async function onRequest({ request, next }) {
  try {
    const { pathname } = new URL(request.url);

    // API 중 게이트/초기화/조회는 누구나 접근 (login, choose?init=1, lines GET)
    if (
      pathname.startsWith('/api/login') ||
      (pathname.startsWith('/api/choose') && request.method === 'GET') ||
      (pathname.startsWith('/api/lines') && request.method === 'GET')
    ) {
      return await next();
    }

    // 그 외 /play, POST choose/lastwords 등은 세션 필요
    const authed = /(?:^|;\s*)auth2=ok(?:;|$)/.test(request.headers.get('Cookie')||'');
    if (!authed) {
      return new Response('Unauthorized', { status: 401 });
    }

    return await next();
  } catch (e) {
    console.error('middleware error:', e && e.stack || e);
    return new Response('Internal Error (middleware)', { status: 500 });
  }
}

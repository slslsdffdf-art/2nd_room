export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 보호 대상
  const protect =
    path.startsWith('/play') ||
    path.startsWith('/api/choose') ||
    path.startsWith('/api/lastwords');

  if (!protect) return next(); // 공개 자원은 통과

  const cookie = request.headers.get('Cookie') || '';
  const authed = /(?:^|;\s*)auth2=ok(?:;|$)/.test(cookie);
  if (!authed) {
    return Response.redirect(`${url.origin}/?err=session`, 302);
  }
  return next();
}

export async function onRequest({ request, next }) {
  const url = new URL(request.url);

  // 보호할 경로
  if (url.pathname.startsWith("/play")) {
    const cookie = request.headers.get("Cookie") || "";
    // login.js 와 동일하게 auth2 쿠키 체크
    const authed = /(?:^|;\s*)auth2=ok(?:;|$)/.test(cookie);

    if (!authed) {
      return Response.redirect(`${url.origin}/`, 302);
    }
  }

  return next();
}

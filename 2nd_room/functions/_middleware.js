// /play 및 일부 API는 게이트 쿠키(auth2=ok) 필요
export async function onRequest({ request, next }) {
  try {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    // 게이트/초기화/방명록 조회는 통과
    if (
      pathname.startsWith("/api/login") ||
      (pathname.startsWith("/api/choose") && searchParams.get("init") === "1") ||
      (pathname.startsWith("/api/lines") && request.method === "GET")
    ) {
      return next();
    }

    // /play 화면, /api/choose POST, /api/lastwords 등은 세션 필요
    const cookie = request.headers.get("Cookie") || "";
    const authed = /(?:^|;\s*)auth2=ok(?:;|$)/.test(cookie);
    if (!authed) return new Response("Unauthorized", { status: 401 });

    return next();
  } catch (e) {
    return new Response("Internal Error (middleware)", { status: 500 });
  }
}

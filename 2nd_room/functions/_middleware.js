// functions/_middleware.js
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  const cookie = context.request.headers.get("Cookie") || "";
  const hasOK = /(?:^|;\s*)auth2=ok(?:;|$)/.test(cookie);
  const hasWall = /(?:^|;\s*)auth2=wall(?:;|$)/.test(cookie);

  // 방명록은 누구나(게이트 통과자 + 사망자) 접근 허용
  if (path.startsWith("/play/wall")) return await context.next();

  // /play/ 메인 UI는 "auth2=ok" 이면서 "wall"이 아닌 경우에만 허용
  if (path.startsWith("/play/")) {
    if (!hasOK || hasWall) {
      return new Response("", {
        status: 302,
        headers: { Location: "/play/wall" },
      });
    }
  }
  // 그 외는 그대로 통과
  return await context.next();
}

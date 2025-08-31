export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);
  const p = url.pathname;
  const cookie = req.headers.get("Cookie") || "";
  const hasOK   = /(^|;\s*)auth2=ok(;|$)/.test(cookie);
  const hasWall = /(^|;\s*)auth2=wall(;|$)/.test(cookie);
  const isAdmin = /(^|;\s*)admin=1(;|$)/.test(cookie);

  // 공개/허용 경로
  const allow =
    p === "/" ||
    p === "/lobby.html" ||
    p.startsWith("/images/") ||
    p.startsWith("/api/login") ||
    p.startsWith("/api/queue") ||
    p.startsWith("/api/lines") ||
    p.startsWith("/api/admin-login") ||
    p.startsWith("/api/admin-logout") ||
    p.startsWith("/play/wall");

  if (allow) return context.next();

  // /play/* 접근 제어
  if (p.startsWith("/play/")) {
    if (isAdmin) return context.next();
    if (hasWall) {
      return new Response(null, { status: 302, headers: { Location: "/play/wall" } });
    }
    if (!hasOK) {
      return new Response(null, { status: 302, headers: { Location: "/lobby.html" } });
    }
  }

  return context.next();
}

// functions/api/login.js
const json = (x, s = 200, extra) =>
  new Response(JSON.stringify(x), {
    status: s,
    headers: { "Content-Type": "application/json", ...(extra || {}) },
  });

function setCookie(headers, name, value, opts = {}) {
  const p = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax",
    "Secure",
    opts.httpOnly ? "HttpOnly" : "",
    opts.maxAge ? `Max-Age=${opts.maxAge}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  headers.append("Set-Cookie", p);
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const { PASSWORD = "" } = env;
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "");

  // 이미 사망 쿠키 보유자 → 방명록만 허용
  const ck = request.headers.get("Cookie") || "";
  if (/(^|;\s*)auth2=wall(;|$)/.test(ck)) {
    // 굳이 실패로 돌릴 필요 없이 ok로 응답(프런트가 이미 /play/wall로 보냄)
    return json({ ok: true, wall: true });
  }

  if (!code || code !== PASSWORD) return json({ error: "bad_password" }, 401);

  // 플레이 허용 쿠키(auth2=ok) 발급 + 이전 진행 쿠키(r2) 초기화
  const h = new Headers();
  setCookie(h, "auth2", "ok", { httpOnly: true, maxAge: 60 * 60 * 6 }); // 6시간
  setCookie(h, "r2", "", { httpOnly: true, maxAge: 0 }); // 초기화

  return json({ ok: true }, 200, Object.fromEntries(h.entries()));
}

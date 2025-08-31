// POST /api/login  { code }
// 비번이 맞으면 auth2=ok 쿠키 심고 ok:true 반환
export async function onRequest({ request, env }) {
  const { PASSWORD = "" } = env;

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let code = "";
  try {
    ({ code = "" } = await request.json());
  } catch (_) {}

  if (String(code) !== String(PASSWORD)) {
    return new Response(JSON.stringify({ ok: false, error: "bad_code" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const h = new Headers({ "Content-Type": "application/json" });
  // ★ auth2=ok 세션 쿠키 (게이트 통과)
  h.append(
    "Set-Cookie",
    [
      "auth2=ok",
      "Path=/",
      "Max-Age=7200", // 2h
      "SameSite=Lax",
      "Secure",
      "HttpOnly",
    ].join("; ")
  );

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: h });
}

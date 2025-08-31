export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  // password 또는 code 필드 허용
  const input = (form.get("password") || form.get("code") || "").toString().trim();

  if (!input) {
    return new Response(JSON.stringify({ error: "empty" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (input !== env.PASSWORD) {
    return new Response(JSON.stringify({ error: "invalid_code" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 로그인 성공 시 세션 쿠키 발급
  return new Response(null, {
    status: 302,
    headers: {
      "Set-Cookie":
        "auth2=ok; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400",
      "Location": "/play/",
    },
  });
}

// functions/api/choose.js
function getCookie(req, name) {
  const c = req.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : "";
}
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
const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const dec = (s) => {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(s))));
  } catch {
    return null;
  }
};
const json = (x, s = 200, extra) =>
  new Response(JSON.stringify(x), {
    status: s,
    headers: { "Content-Type": "application/json", ...(extra || {}) },
  });

export async function onRequest({ request }) {
  // 게이트 통과 확인
  const cookie = request.headers.get("Cookie") || "";
  const authed = /(?:^|;\s*)auth2=ok(?:;|$)/.test(cookie);
  const walled = /(?:^|;\s*)auth2=wall(?:;|$)/.test(cookie);
  if (!authed || walled) return json({ error: "no session" }, 401);

  const url = new URL(request.url);

  // 최초 진입(세션 초기화)
  if (url.searchParams.get("init") === "1") {
    const st = { v: 1, step: 0, alive: true, cause: "" };
    const h = new Headers();
    setCookie(h, "r2", enc(st), { httpOnly: true, maxAge: 60 * 60 * 2 });
    return json({ ok: true, step: 0 }, 200, Object.fromEntries(h.entries()));
  }

  if (request.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const st = dec(getCookie(request, "r2"));
  if (!st || !st.alive) return json({ error: "no session" }, 401);

  const body = await request.json().catch(() => ({}));
  const dir = String(body.dir || "").toUpperCase();
  if (!["L", "F", "R"].includes(dir)) return json({ error: "bad_dir" }, 400);

  const ok = Math.floor(Math.random() * 3) === 0; // 1/3 확률
  const h = new Headers();

  if (ok) {
    st.step += 1;
    setCookie(h, "r2", enc(st), { httpOnly: true, maxAge: 60 * 60 * 2 });
    return json({ result: "advance", step: st.step }, 200, Object.fromEntries(h.entries()));
  } else {
    st.alive = false;
    st.cause = dir === "L" ? "왼쪽 문" : dir === "F" ? "정면 문" : "오른쪽 문";
    // 사망 상태 유지 + 방명록 전용 쿠키 부여
    setCookie(h, "r2", enc(st), { httpOnly: true, maxAge: 60 * 10 }); // 10분
    setCookie(h, "auth2", "wall", { httpOnly: true, maxAge: 60 * 60 * 24 }); // 24h
    return json(
      { result: "dead", step: st.step, cause: st.cause },
      200,
      Object.fromEntries(h.entries())
    );
  }
}

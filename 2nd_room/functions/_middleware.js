// /play/* 과 대부분의 /api/* 보호.
// 죽은(락) 사용자는 /play/wall.html 로만 접근 가능.

function getCookie(req, name){
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

export async function onRequest(context){
  const { request, next } = context;
  const url = new URL(request.url);
  const p = url.pathname;

  // 공개 허용(게이트/배경/폰트/방명록 페이지 & API)
  const allow =
    p === '/' ||
    p === '/play/wall.html' ||
    p.startsWith('/images/') ||
    p === '/favicon.ico' ||
    p.startsWith('/api/lines') ||
    p.startsWith('/api/login');

  if (allow) return next();

  const auth = getCookie(request, 'auth2'); // 'ok' | 'wall' | ''
  if (!auth) {
    return Response.redirect(`${url.origin}/`, 302);
  }

  // 락 유저는 어디로 가든 방명록만
  if (auth === 'wall') {
    return Response.redirect(`${url.origin}/play/wall.html`, 302);
  }

  // auth === 'ok' → 통과
  return next();
}

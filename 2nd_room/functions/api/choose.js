// KV는 나중에 진행도/번호/로그 저장용으로 확장
export async function onRequestPost({ request, env }) {
  // 간단 세션 확인(쿠키 존재만) — 실제로는 서명 검증 권장
  const cookie = request.headers.get('Cookie')||'';
  if(!/r2sess=/.test(cookie)){
    return new Response(JSON.stringify({ error:'NO_SESSION' }), { status:401, headers:{'Content-Type':'application/json'}});
  }

  const body = await request.json().catch(()=> ({}));
  const choice = String(body.choice||'').toUpperCase();

  // 시간초과/무효 선택 처리
  const valid = ['L','F','R'];
  const timeout = (choice === 'TIMEOUT');

  // 도전자 번호/단계는 나중에 KV로 관리. 우선 더미 값:
  const num = Math.floor(Math.random()*900000) + 100000; // 더미 식별
  const step = 1; // 데모: 항상 1단계로 간주

  // 판정
  let ok = false;
  if (!timeout && valid.includes(choice)) {
    ok = (Math.random() < (1/3));
  } else {
    ok = false;
  }

  if (ok) {
    return json({ ok:true, step: step+1 });
  } else {
    // 사망 → lastwords 단계로 넘어가도록 정보 제공
    return json({ ok:false, num, step, cause: timeout ? '시간 초과' : '잘못된 문' });
  }

  function json(x, s=200){
    return new Response(JSON.stringify(x), { status:s, headers:{'Content-Type':'application/json'}});
  }
}
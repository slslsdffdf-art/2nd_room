// 공통 BGM 플레이어 (모바일/PC 모두 안정)
// 전략: 처음엔 muted+autoplay로 재생 시도 → 사용자 제스처에서 unmute+resume
// 각 페이지에서 이 파일보다 "앞"에 window.BGM_SRC = '...' 만 선언하면 됨.

(function () {
  if (window.__bgm && window.__bgm.src === window.BGM_SRC) return; // 중복 초기화 방지

  const SRC = window.BGM_SRC || '';
  const state = (window.__bgm = {
    src: SRC,
    audio: null,
    unlocked: false,
    playing: false,
    volume: 0.9,
  });

  // <audio> 엘리먼트
  const audio = document.createElement('audio');
  audio.src = SRC;
  audio.loop = true;
  audio.preload = 'auto';
  audio.autoplay = true;        // muted 상태에서 자동 재생 허용
  audio.muted = true;           // 처음엔 무음으로 재생
  audio.playsInline = true;     // iOS 전체화면 방지
  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
  audio.crossOrigin = 'anonymous';
  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(audio);
  });
  state.audio = audio;

  // 초기 재생 시도(무음)
  function tryPlayMuted() {
    if (!SRC) return;
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => { state.playing = true; }).catch(() => { state.playing = false; });
    }
  }
  tryPlayMuted();

  // 사용자 제스처에서 언락
  async function unlock() {
    if (state.unlocked) return;
    state.unlocked = true;
    ['pointerdown','touchend','keydown'].forEach(t => document.removeEventListener(t, unlock, true));
    // unmute + 재생
    try {
      audio.muted = false;
      audio.volume = state.volume;
      if (audio.paused) await audio.play();
      state.playing = true;
    } catch (e) {
      // 일부 브라우저는 한 번 더 제스처 필요
      state.playing = false;
    }
  }
  ['pointerdown','touchend','keydown'].forEach(t => document.addEventListener(t, unlock, true));

  // 페이지가 다시 보이면 재시도
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.unlocked && !state.playing) {
      audio.muted = false;
      audio.volume = state.volume;
      audio.play().then(() => { state.playing = true; }).catch(() => {});
    }
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && state.unlocked) {
      audio.muted = false;
      audio.volume = state.volume;
      audio.play().catch(()=>{});
    }
  });

  // BGM 전환 API
  window.switchBgm = function (newSrc) {
    if (!newSrc || newSrc === state.src) return;
    state.src = newSrc;
    audio.pause();
    audio.src = newSrc;
    // 정책상 다시 무음으로 시작 → 제스처 지나온 페이지면 바로 unmute
    audio.muted = !state.unlocked;
    audio.volume = state.unlocked ? state.volume : 0;
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        if (state.unlocked) { audio.muted = false; audio.volume = state.volume; }
        state.playing = true;
      }).catch(()=>{ state.playing = false; });
    }
  };

  // 초기에 한 번 더 무음 재생 시도(일부 브라우저 타이밍 문제 보완)
  setTimeout(tryPlayMuted, 200);
})();

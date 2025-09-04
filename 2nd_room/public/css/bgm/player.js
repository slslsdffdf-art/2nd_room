// 공통 BGM 플레이어 (모바일/PC 안정 재생)
// 전략: muted+autoplay로 선재생 → 사용자 제스처에서 unmute
// 추가: window.__bgmUnlock(), window.switchBgm() 제공, 언락 상태 localStorage에 유지

(function () {
  if (window.__bgm && window.__bgm.src === window.BGM_SRC) return;

  const SRC = window.BGM_SRC || '';
  const LS_KEY = '__bgm_unlocked_v1';

  const state = (window.__bgm = {
    src: SRC,
    audio: null,
    unlocked: false,
    playing: false,
    volume: 0.9,
  });

  const audio = document.createElement('audio');
  audio.src = SRC;
  audio.loop = true;
  audio.preload = 'auto';
  audio.autoplay = true;
  audio.muted = true; // 정책 회피용 선재생
  audio.playsInline = true;
  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
  audio.crossOrigin = 'anonymous';

  document.addEventListener('DOMContentLoaded', () => {
    // DOM 붙여놓으면 iOS에서 안정적
    document.body.appendChild(audio);
    // 선재생 시도
    try { audio.play().then(()=>{ state.playing = true; }).catch(()=>{}); } catch {}
  });

  async function doUnmutePlay() {
    try {
      audio.muted = false;
      audio.volume = state.volume;
      if (audio.paused) await audio.play();
      state.playing = true;
      state.unlocked = true;
      try { localStorage.setItem(LS_KEY, '1'); } catch {}
    } catch { /* 필요시 다음 제스처에서 재시도 */ }
  }

  async function unlock() {
    if (state.unlocked) return;
    await doUnmutePlay();
  }

  // 페이지 어디서든 호출 가능
  window.__bgmUnlock = unlock;

  // 페이지가 다시 보이면 재시도
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.unlocked && !state.playing) {
      doUnmutePlay();
    }
  });

  window.addEventListener('pageshow', (e) => {
    if (e.persisted && state.unlocked) doUnmutePlay();
  });

  // 첫 제스처 자동 언락
  const evts = ['pointerdown','touchend','keydown','click'];
  evts.forEach(t => document.addEventListener(t, unlock, { once:true, capture:true }));

  // 이전 페이지에서 이미 언락돼 있으면 즉시 시도
  try {
    if (localStorage.getItem(LS_KEY) === '1') {
      // 약간의 지연 후 언락 재시도 (iOS 타이밍 보정)
      setTimeout(() => { unlock(); }, 120);
    }
  } catch {}

  // BGM 전환 API
  window.switchBgm = function (newSrc) {
    if (!newSrc || newSrc === state.src) return;
    state.src = newSrc;
    audio.pause();
    audio.src = newSrc;
    // 언락 전이면 muted 상태로 선재생
    audio.muted = !state.unlocked;
    audio.volume = state.unlocked ? state.volume : 0.0;
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        if (state.unlocked) { audio.muted = false; audio.volume = state.volume; }
        state.playing = true;
      }).catch(()=>{ state.playing = false; });
    }
  };
})();

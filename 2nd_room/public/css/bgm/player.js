// 공통 BGM 플레이어 (모바일 오디오 언락 대응)
// 사용법: 각 페이지에서 이 스크립트보다 "앞"에
//   window.BGM_SRC = '/css/bgm/gate-theme.mp3'
// 를 선언해두면 됩니다.

(function () {
  if (window.__bgm && window.__bgm.src === window.BGM_SRC) return; // 중복 방지

  const SRC = window.BGM_SRC || '';
  const state = (window.__bgm = {
    src: SRC,
    audio: null,
    ctx: null,
    gain: null,
    unlocked: false,
    playing: false,
    volume: 1.0,
  });

  // <audio> 준비
  const audio = document.createElement('audio');
  audio.src = SRC;
  audio.loop = true;
  audio.preload = 'auto';
  audio.setAttribute('playsinline', ''); // iOS 전체화면 방지
  audio.setAttribute('webkit-playsinline', '');
  audio.crossOrigin = 'anonymous'; // 로컬이면 영향 없음
  state.audio = audio;

  // WebAudio 준비(가능한 경우)
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    try {
      const ctx = new AC();
      const srcNode = ctx.createMediaElementSource(audio);
      const gain = ctx.createGain();
      gain.gain.value = 0.0001; // 처음엔 거의 무음
      srcNode.connect(gain).connect(ctx.destination);
      state.ctx = ctx;
      state.gain = gain;
    } catch (e) {
      // 일부 브라우저는 여러 번 MediaElementSource를 만들면 에러
      state.ctx = null;
      state.gain = null;
    }
  }

  // 재생 시도 (언락 이후 호출)
  async function playNow() {
    if (!SRC) return;
    try {
      if (state.ctx && state.ctx.state === 'suspended') {
        await state.ctx.resume();
      }
      const p = audio.play();
      if (p && typeof p.then === 'function') await p;
      // 페이드 인
      if (state.gain) {
        const g = state.gain.gain;
        try {
          const t = state.ctx.currentTime;
          g.cancelScheduledValues(t);
          g.setValueAtTime(Math.max(0.0001, g.value), t);
          g.exponentialRampToValueAtTime(Math.max(0.001, state.volume), t + 0.8);
        } catch {}
      } else {
        // WebAudio가 없으면 볼륨 직접
        audio.volume = state.volume;
      }
      state.playing = true;
    } catch (err) {
      // 재생 거부 시 다음 제스처를 기다림
      state.playing = false;
    }
  }

  // 사용자 제스처로 언락
  async function unlock() {
    if (state.unlocked) return;
    state.unlocked = true;
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('touchend', unlock, true);
    document.removeEventListener('keydown', unlock, true);

    // iOS 하드웨어 무음 스위치 ON이면 HTMLAudio가 묵음일 수 있음 (사용자 안내 필요)
    try {
      if (state.ctx && state.ctx.state === 'suspended') {
        await state.ctx.resume();
      }
    } catch {}
    await playNow();
  }

  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('touchend', unlock, true);
  document.addEventListener('keydown', unlock, true);

  // 페이지가 보일 때 재시도 (bfcache/백그라운드 복귀)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.unlocked && !state.playing) {
      playNow();
    }
  });

  // iOS Safari bfcache 복귀
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && state.unlocked) playNow();
  });

  // 초기에 살짝 지연 후 한 번 시도 (데스크톱/권한 풀린 상태 대비)
  setTimeout(() => {
    if (!state.unlocked) return; // 아직 제스처 전이면 대기
    playNow();
  }, 200);

  // 노출
  window.__bgmPlay = playNow;
})();

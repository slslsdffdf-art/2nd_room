(function(){
  // 페이지가 window.BGM_SRC로 초기 src를 넘긴다.
  let src = window.BGM_SRC || '';
  const state = { unlocked:false, ctx:null, el:null, trying:false };

  function el(){ if(state.el) return state.el;
    const a=document.createElement('audio');
    a.id='bgm'; a.src=src; a.loop=true; a.preload='auto';
    a.playsInline=true; a.crossOrigin='anonymous'; a.volume=0.55;
    document.body.appendChild(a);
    state.el=a; return a;
  }

  async function unlock(){
    try{
      if(state.ctx && state.ctx.state==='running') return;
      state.ctx = state.ctx || new (window.AudioContext||window.webkitAudioContext)();
      if(state.ctx.state!=='running') await state.ctx.resume();
      const o=state.ctx.createOscillator(), g=state.ctx.createGain();
      g.gain.value=0.0001; o.connect(g).connect(state.ctx.destination); o.start(); o.stop(state.ctx.currentTime+0.03);
    }catch{}
  }

  async function play(){
    if(state.trying || !src) return; state.trying=true;
    try{
      await unlock();
      const a = el();
      if (a.src !== new URL(src, location.origin).href){ a.src = src; a.currentTime=0; }
      await a.play();
      state.unlocked=true; hide();
    }catch{ show(); } finally{ state.trying=false; }
  }

  function arm(){ play(); ['pointerdown','keydown','touchstart'].forEach(t=>document.removeEventListener(t,arm)); }
  ['pointerdown','keydown','touchstart'].forEach(t=>document.addEventListener(t,arm,{once:true}));
  setTimeout(()=>{ if(!state.unlocked) play(); }, 1200);

  document.addEventListener('visibilitychange',()=>{ if(!state.el) return;
    if(document.hidden) state.el.pause(); else if(state.unlocked) state.el.play().catch(()=>{}); });

  let ov=null;
  function show(){ if(ov || !src) return;
    ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);z-index:9999;color:#fff';
    ov.innerHTML='<div style="background:#222;border:1px solid #555;padding:16px 18px;border-radius:12px;text-align:center;max-width:320px"><div style="font-size:16px;margin-bottom:8px">🔊 브금 허용</div><div style="font-size:13px;opacity:.9;margin-bottom:12px">한 번 눌러서 소리를 켭니다</div><button id="bgmAllow" style="padding:8px 12px;border:1px solid #777;background:#333;color:#fff;border-radius:10px;cursor:pointer">소리 켜기</button></div>';
    document.body.appendChild(ov);
    ov.querySelector('#bgmAllow').addEventListener('click', play);
  }
  function hide(){ if(!ov) return; ov.remove(); ov=null; }

  // 외부 전환 API
  window.switchBgm = function(newSrc){
    src = newSrc || src;
    if(!src) return;
    const a = el();
    a.pause(); a.src = src; a.currentTime=0;
    if(state.unlocked) a.play().catch(()=>{ show(); });
  };

  // 즉시 시도
  if(src) play();
})();
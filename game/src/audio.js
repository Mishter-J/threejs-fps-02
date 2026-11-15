// audio.js — every sound is synthesized with WebAudio, so the game
// ships zero audio files and makes zero network requests. All nodes
// are created lazily on the first user gesture; muted state persists
// in a plain boolean the HUD toggles.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuf = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function noise(dur, filterFreq, gain, type) {
    if (!ensure() || muted || !ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type || 'lowpass';
    filt.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, gain, type, slideTo) {
    if (!ensure() || muted || !ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  return {
    unlock() {
      ensure();
    },
    setMuted(v) {
      muted = !!v;
      if (master) master.gain.value = muted ? 0 : 0.35;
    },
    isMuted() {
      return muted;
    },
    shot(kind) {
      if (kind === 'sniper') {
        noise(0.28, 900, 0.9, 'lowpass');
        tone(140, 0.18, 0.25, 'sawtooth', 55);
      } else if (kind === 'smg') {
        noise(0.09, 2400, 0.55, 'bandpass');
      } else if (kind === 'pistol') {
        noise(0.12, 1600, 0.7, 'bandpass');
        tone(220, 0.08, 0.18, 'square', 90);
      } else {
        noise(0.14, 1200, 0.8, 'lowpass');
        tone(180, 0.1, 0.22, 'sawtooth', 70);
      }
    },
    dryFire() {
      tone(1400, 0.03, 0.12, 'square');
    },
    reload() {
      tone(500, 0.05, 0.15, 'square');
      setTimeout(() => tone(700, 0.05, 0.15, 'square'), 180);
    },
    hit() {
      tone(1900, 0.05, 0.2, 'sine');
    },
    headshot() {
      tone(2400, 0.07, 0.25, 'sine');
      setTimeout(() => tone(2900, 0.06, 0.2, 'sine'), 60);
    },
    kill() {
      tone(660, 0.09, 0.2, 'triangle', 990);
    },
    hurt() {
      noise(0.15, 500, 0.5, 'lowpass');
      tone(110, 0.15, 0.25, 'sawtooth', 70);
    },
    step() {
      noise(0.05, 400, 0.12, 'lowpass');
    },
    plantBeep() {
      tone(1200, 0.12, 0.25, 'sine');
    },
    plantDone() {
      tone(880, 0.15, 0.25, 'sine');
      setTimeout(() => tone(1320, 0.2, 0.25, 'sine'), 140);
    },
    explosion() {
      noise(0.9, 300, 1.0, 'lowpass');
      tone(60, 0.7, 0.5, 'sine', 30);
    },
    roundWin() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.22, 'triangle'), i * 130));
    },
    roundLose() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.25, 0.2, 'triangle'), i * 150));
    },
    buy() {
      tone(990, 0.08, 0.18, 'sine');
      setTimeout(() => tone(1480, 0.1, 0.18, 'sine'), 80);
    },
    click() {
      tone(800, 0.04, 0.12, 'square');
    },
  };
}

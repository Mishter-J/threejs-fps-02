// audio.js — synthesised sound effects, no audio assets. Everything is built
// from oscillators and one shared noise buffer, created lazily on the first
// user gesture (browsers block audio before that). Mute is a single flag.
let ctx = null;
let noiseBuf = null;
let muted = false;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const len = ctx.sampleRate * 0.5;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  } catch (e) {
    ctx = null;
  }
}

export function setMuted(m) {
  muted = m;
}

function noise(dur, filterFreq, gain, when = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(ctx.destination);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(freq, dur, gain, type = 'sine', when = 0, slideTo = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  shot(id) {
    if (id === 'sg12') {
      noise(0.22, 900, 0.5);
      tone(90, 0.18, 0.4, 'sine', 0, 45);
    } else if (id === 'lr50') {
      noise(0.35, 700, 0.6);
      tone(70, 0.3, 0.5, 'sine', 0, 35);
    } else if (id === 'ar9') {
      noise(0.09, 1800, 0.32);
      tone(160, 0.07, 0.22, 'square', 0, 80);
    } else {
      noise(0.08, 2200, 0.28);
      tone(200, 0.06, 0.18, 'square', 0, 90);
    }
  },
  enemyShot(dist) {
    const g = Math.max(0.05, 0.3 - dist * 0.006);
    noise(0.09, 1400, g);
  },
  dry() {
    tone(1400, 0.03, 0.12, 'square');
  },
  reload() {
    tone(900, 0.04, 0.12, 'square');
    tone(600, 0.04, 0.12, 'square', 0.18);
  },
  hit(head) {
    tone(head ? 1500 : 1100, 0.05, 0.2, 'square');
  },
  hurt() {
    tone(140, 0.15, 0.35, 'sawtooth', 0, 70);
    noise(0.12, 500, 0.25);
  },
  kill() {
    tone(880, 0.08, 0.2, 'square');
    tone(1320, 0.12, 0.2, 'square', 0.08);
  },
  plantBeep() {
    tone(1200, 0.07, 0.18, 'square');
  },
  beep() {
    tone(1000, 0.05, 0.1, 'square');
  },
  explosion() {
    noise(0.9, 300, 0.8);
    tone(55, 0.8, 0.6, 'sine', 0, 28);
  },
  win() {
    tone(523, 0.12, 0.2, 'triangle');
    tone(659, 0.12, 0.2, 'triangle', 0.12);
    tone(784, 0.25, 0.25, 'triangle', 0.24);
  },
  lose() {
    tone(392, 0.15, 0.2, 'triangle');
    tone(311, 0.15, 0.2, 'triangle', 0.15);
    tone(233, 0.35, 0.22, 'triangle', 0.3);
  },
  click() {
    tone(700, 0.04, 0.12, 'square');
  },
  buy() {
    tone(990, 0.06, 0.15, 'square');
    tone(1320, 0.09, 0.15, 'square', 0.06);
  },
};

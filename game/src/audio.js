// audio.js — procedural WebAudio sound effects.
//
// No audio assets ship with the game: every sound is synthesized from
// oscillators and filtered noise, so the game loads nothing over the
// network and the sounds are the game's own.

let ctx = null;
let master = null;
let muted = false;
let noiseBuf = null;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // One shared white-noise buffer for shots, steps and explosions.
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

function noise(dur, filterType, freq, gain, when = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(freq, dur, type, gain, slideTo = null, when = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Gunshot: a sharp noise crack plus a low thump. `big` for shotgun/marksman. */
export function playShot(kind) {
  if (kind === 'shotgun') { noise(0.22, 'lowpass', 900, 0.9); tone(90, 0.18, 'sine', 0.7, 45); }
  else if (kind === 'marksman') { noise(0.3, 'bandpass', 1400, 0.9); tone(70, 0.25, 'sine', 0.8, 40); }
  else if (kind === 'pistol') { noise(0.1, 'bandpass', 1800, 0.55); tone(140, 0.08, 'sine', 0.4, 70); }
  else { noise(0.12, 'bandpass', 2200, 0.6); tone(120, 0.09, 'sine', 0.45, 60); }
}

/** A distant, muffled shot (another bot firing). */
export function playDistantShot() {
  noise(0.14, 'lowpass', 500, 0.25);
}

export function playDryFire() { tone(1200, 0.04, 'square', 0.12); }

export function playReload() {
  tone(500, 0.05, 'square', 0.15);
  tone(350, 0.05, 'square', 0.15, null, 0.18);
  tone(700, 0.06, 'square', 0.18, null, 0.45);
}

export function playStep(run) {
  noise(0.05, 'lowpass', 300, run ? 0.12 : 0.07);
}

export function playHitmarker(head) {
  tone(head ? 2400 : 1800, 0.06, 'sine', 0.3);
}

export function playHurt() {
  tone(220, 0.15, 'sawtooth', 0.25, 110);
}

export function playExplosion() {
  noise(0.9, 'lowpass', 400, 1.0);
  tone(60, 0.8, 'sine', 0.9, 28);
  noise(0.4, 'bandpass', 3000, 0.4);
}

export function playBeep(final) {
  tone(final ? 1400 : 950, 0.09, 'square', 0.22);
}

export function playPlant() {
  tone(880, 0.07, 'square', 0.2);
  tone(880, 0.07, 'square', 0.2, null, 0.12);
}

export function playGrenadePin() { tone(1500, 0.05, 'square', 0.15); }

export function playRoundWin() {
  for (const [f, t] of [[523, 0], [659, 0.12], [784, 0.24]]) tone(f, 0.22, 'triangle', 0.3, null, t);
}

export function playRoundLose() {
  for (const [f, t] of [[392, 0], [330, 0.15], [262, 0.3]]) tone(f, 0.25, 'triangle', 0.3, null, t);
}

export function playBuy() {
  tone(660, 0.06, 'square', 0.2);
  tone(990, 0.09, 'square', 0.2, null, 0.07);
}

export function playDenied() { tone(180, 0.12, 'square', 0.25, 140); }

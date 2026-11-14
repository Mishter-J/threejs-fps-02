// main.js — bootstrap and the game loop.
//
// The simulation runs at a fixed 60 Hz step, apart from rendering: the
// loop accumulates real time, steps the world in 1/60 s slices, then
// renders once. Input, HUD and camera are the only per-frame work.

import * as THREE from 'three';
import { createState, BOMB_TIMER } from './state.js';
import { buildMap, WALLS } from './map.js';
import { createEffects } from './effects.js';
import { createBots, resetBotsForRound, transferBomb, updateBots } from './bots.js';
import { createInput, lockPointer, updatePlayer, applyCamera } from './player.js';
import { createHud } from './hud.js';
import { startMatch, updateRound, buyItem, onPlayerDeath, aliveCount } from './round.js';
import { explodeGrenade } from './combat.js';
import { segmentBlocked, insideBox } from './collision.js';
import * as audio from './audio.js';

const STEP = 1 / 60;
const canvas = document.getElementById('game');
const params = new URLSearchParams(location.search);
// ?fast=1 lowers render quality for software renderers (SwiftShader);
// the game itself is unchanged, only shadows and pixel ratio drop.
const FAST = params.has('fast');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !FAST });
renderer.setPixelRatio(FAST ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !FAST;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 220);
const raycaster = new THREE.Raycaster();

const state = createState();
const { wallMeshes } = buildMap(scene);
const effects = createEffects(scene);
const { partMeshes } = createBots(state, scene);
const hitMeshes = [...wallMeshes, ...partMeshes];
const input = createInput(canvas);

let shakeAmp = 0;
let buyOpen = false;

const ctx = {
  state, scene, camera, renderer, raycaster, hitMeshes, effects, input,
  get buyOpen() { return buyOpen; },
  shake(a) { shakeAmp = Math.max(shakeAmp, a); },
  announce(text, sub) { hud.announce(text, sub); },
  onPlayerShot() {
    const p = state.player;
    state.lastShot = { x: p.x, z: p.z, at: state.time, team: 'atk' };
  },
  onPlayerHit(head) { hud.hitmark(head); },
  onPlayerHurt() { hud.hurt(); },
  onPlayerKilled() { onPlayerDeath(state); },
  onBotKilled(bot) {
    if (bot.carryingBomb) transferBomb(state);
  },
  onBombDefused() { /* updateRound ends the round on the 'defused' state */ },
  onBombDetonated() {
    const b = state.bomb;
    const at = { x: b.x, y: 0.6, z: b.z };
    effects.explosion(at);
    audio.playExplosion();
    ctx.shake(1);
    // The detonation clears the site: heavy radius damage, walls block it.
    const p = state.player;
    const hurt = (x, z, apply) => {
      const dist = Math.hypot(x - b.x, z - b.z);
      if (dist > 12) return;
      if (segmentBlocked(b.x, b.z, x, z, WALLS, 1.0)) return;
      apply(220 * (1 - (dist / 12) * 0.7));
    };
    if (p.alive) hurt(p.x, p.z, (d) => { p.hp -= d; if (p.hp <= 0) { p.hp = 0; p.alive = false; } });
    for (const bot of state.bots) {
      if (bot.alive) hurt(bot.x, bot.z, (d) => {
        bot.hp -= d;
        if (bot.hp <= 0) { bot.hp = 0; bot.alive = false; bot.deathAt = state.time; }
      });
    }
  },
};

const hud = createHud((id) => buyItem(state, id));

// --- Menu / start -------------------------------------------------------

function deploy() {
  audio.initAudio();
  audio.resumeAudio();
  hud.hideMenu();
  lockPointer(canvas);
  if (state.phase === 'menu' || state.phase === 'matchEnd') {
    startMatch(state);
    hud.announce(`Round 1 — buy phase`, 'Press B for the buy menu');
  }
}

document.getElementById('menu-button').addEventListener('click', deploy);
canvas.addEventListener('click', () => {
  if (state.phase === 'live' || state.phase === 'buy') lockPointer(canvas);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && state.phase === 'matchEnd') {
    deploy();
    return;
  }
  if (e.code === 'Enter' && state.phase === 'menu') {
    deploy();
    return;
  }
  if (e.code === 'KeyB' && state.phase === 'buy') {
    buyOpen = !buyOpen;
    hud.setBuyOpen(buyOpen);
    return;
  }
  if (e.code === 'KeyM') {
    audio.setMuted(!(window.__muted = !window.__muted));
    return;
  }
  // Number keys buy while the shop is open.
  if (buyOpen && state.phase === 'buy' && /^Digit[1-6]$/.test(e.code)) {
    const idx = Number(e.code.slice(5)) - 1;
    const item = document.querySelectorAll('.buy-row')[idx];
    if (item) item.click();
  }
});

// --- Grenades -----------------------------------------------------------

function updateGrenades(dt) {
  for (let i = state.grenades.length - 1; i >= 0; i--) {
    const g = state.grenades[i];
    g.fuse -= dt;
    g.vy -= 12 * dt;
    // Move axis by axis so a wall bounce is a reflection, not a stick.
    let nx = g.x + g.vx * dt;
    if (hitsWall(nx, g.y, g.z)) { g.vx *= -0.45; nx = g.x; }
    let nz = g.z + g.vz * dt;
    if (hitsWall(nx, g.y, nz)) { g.vz *= -0.45; nz = g.z; }
    let ny = g.y + g.vy * dt;
    if (ny < 0.12) {
      ny = 0.12;
      g.vy = Math.abs(g.vy) > 1 ? -g.vy * 0.45 : 0;
      g.vx *= 0.7;
      g.vz *= 0.7;
    }
    g.x = nx;
    g.z = nz;
    g.y = ny;
    if (g.fuse <= 0) {
      state.grenades.splice(i, 1);
      explodeGrenade(ctx, g);
    }
  }
}

function hitsWall(x, y, z) {
  for (const b of WALLS) {
    if (y < b.height && insideBox(x, z, b)) return true;
  }
  return false;
}

// --- Fixed-step simulation ----------------------------------------------

function simStep(dt) {
  state.time += dt;
  updatePlayer(ctx, dt, input);
  // Bots only think once the round is running.
  if (state.phase === 'live' || state.phase === 'buy') {
    updateBots(ctx, dt);
  }
  updateGrenades(dt);
  updateRound(ctx, dt);
  effects.update(dt, camera);
  shakeAmp = Math.max(0, shakeAmp - dt * 2.2);
}

// --- Render loop ----------------------------------------------------------

let last = performance.now();
let acc = 0;
let frames = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const playing = state.phase === 'live' || state.phase === 'buy' || state.phase === 'roundEnd';
  if (playing) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      simStep(STEP);
      acc -= STEP;
      n++;
    }
    if (n === 5) acc = 0; // drop backlog rather than spiral
    // Scope zoom for the marksman rifle.
    const p = state.player;
    const wantFov = p.current === 'marksman' && input.rmb && state.phase === 'live' ? 32 : 75;
    if (Math.abs(camera.fov - wantFov) > 0.1) {
      camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 10);
      camera.updateProjectionMatrix();
    }
    applyCamera(camera, p, shakeAmp, dt);
  } else {
    // Menu backdrop: a slow orbit over the yard.
    const t = now / 1000;
    camera.position.set(Math.sin(t * 0.08) * 26, 15, Math.cos(t * 0.08) * 26);
    camera.lookAt(0, 0, 0);
    effects.update(dt, camera);
  }
  hud.update(state, now / 1000);
  renderer.render(scene, camera);
  frames++;
  if (frames === 3) window.__ready = true;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Debug hooks for screenshots ----------------------------------------
// These only pose the camera and drive the real game code; the rendered
// frames are the game itself, unedited.
window.__game = {
  state,
  start() { deploy(); },
  /** Fast-forward the simulation (same fixed steps the loop runs). */
  step(sec) {
    const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) simStep(STEP);
  },
  setPose(x, z, yaw, pitch = 0) {
    const p = state.player;
    p.x = x; p.z = z; p.yaw = yaw; p.pitch = pitch;
  },
  fireOnce() {
    input.firing = true;
    setTimeout(() => { input.firing = false; }, 150);
  },
  startFiring() { input.firing = true; },
  stopFiring() { input.firing = false; },
  /** Pose the player 7 m from a defender with a clear line of sight,
   * facing it — for the firefight screenshot. Synchronous, so the bot
   * cannot move between the choice and the pose. Tries the player's
   * spot first, then open vantages around mid. */
  poseForFoe() {
    const p = state.player;
    const foes = state.bots.filter((b) => b.team === 'def' && b.alive);
    const held = foes.filter((b) => b.state === 'hold');
    const pool = held.length > 0 ? held : foes;
    const vantages = [[p.x, p.z], [0, 0], [-10, 0], [10, 0], [0, 10], [-10, 6], [10, -6]];
    for (const [vx, vz] of vantages) {
      for (const f of pool) {
        const d = Math.hypot(f.x - vx, f.z - vz);
        if (d < 6 || d > 30) continue;
        if (segmentBlocked(vx, vz, f.x, f.z, WALLS, 1.4)) continue;
        const px = f.x - ((f.x - vx) / d) * 7;
        const pz = f.z - ((f.z - vz) / d) * 7;
        if (segmentBlocked(px, pz, f.x, f.z, WALLS, 1.4)) continue;
        p.x = px;
        p.z = pz;
        p.yaw = Math.atan2(-(f.x - px), -(f.z - pz));
        p.pitch = 0;
        return f.name;
      }
    }
    return null;
  },
  /** Debug: raycast from the camera and name the first hits. */
  testShot() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    raycaster.set(camera.position, dir);
    raycaster.far = 100;
    return raycaster.intersectObjects(hitMeshes, false).slice(0, 3).map((h) => ({
      d: +h.distance.toFixed(2),
      bot: h.object.userData.bot?.name ?? null,
      part: h.object.userData.part ?? 'wall',
    }));
  },
  plantNow() {
    const p = state.player;
    const site = state.bomb.state === 'carried' ? { id: 'A', x: -16, z: -12 } : null;
    if (!site) return;
    p.x = site.x; p.z = site.z;
    state.bomb.state = 'planted';
    state.bomb.site = site.id;
    state.bomb.x = site.x;
    state.bomb.z = site.z;
    state.bomb.timer = BOMB_TIMER;
  },
  openBuy() {
    if (state.phase === 'buy') {
      buyOpen = true;
      hud.setBuyOpen(true);
    }
  },
  counts() {
    return {
      atkAlive: aliveCount(state, 'atk'),
      defAlive: aliveCount(state, 'def'),
      phase: state.phase,
    };
  },
};
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));

// Start in the menu; the round begins on Deploy.
resetBotsForRound(state);
requestAnimationFrame(frame);

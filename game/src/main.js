// main.js — bootstrap and the render loop. It owns the renderer,
// the camera and the frame loop; the simulation (sim.js) owns the
// game. The loop is the only place rendering and simulation meet:
// fixed-step sim updates, then camera + viewmodel + HUD sync.
// Staging: ?shot=menu|action|won puts the game in a deterministic
// state for screenshots, no pointer lock or input needed, and sets
// window.__shotReady when the frame is rendered.

import * as THREE from 'three';
import { SEED } from './config.js';
import { buildWorld } from './world.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createSim } from './sim.js';

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') || '', 10);
const seed = Number.isFinite(seedParam) ? seedParam : SEED;

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a1e33);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 300);
camera.rotation.order = 'YXZ';
scene.add(camera);
// A small light riding with the camera: keeps the viewmodel and the
// ground right in front of the player readable at dusk.
const camLight = new THREE.PointLight(0xffd9a0, 2.2, 7, 1.4);
camera.add(camLight);

const world = buildWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const input = createInput(canvas);
const sim = createSim({ scene, world, effects, audio, camera, hud });
const state = sim.state;
const player = sim.player;

let sensitivity = 1.0;
let framesRendered = 0;
let lastTime = performance.now();

// Menu overview camera: slow orbit over the yard while the menu is up.
const menuCam = { angle: 0.6, radius: 26, height: 16 };

function syncCamera() {
  const shake = state.shake;
  const shX = shake > 0 ? (Math.random() - 0.5) * shake * 0.06 : 0;
  const shY = shake > 0 ? (Math.random() - 0.5) * shake * 0.06 : 0;
  if (state.phase === 'menu') {
    // Staged screenshots freeze the orbit so the frame is identical
    // every run; live play drifts the camera slowly instead.
    const a = shotMode ? 0.6 : (menuCam.angle += 0.00045, menuCam.angle);
    camera.position.set(
      Math.sin(a) * menuCam.radius,
      menuCam.height,
      Math.cos(a) * menuCam.radius,
    );
    camera.lookAt(0, 0.5, 0);
    return;
  }
  camera.position.set(player.pos.x + shX, player.eyeHeight + shY, player.pos.z);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  camera.rotation.z = 0;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  const look = input.consumeLook();
  const stepInput = {
    move: input.moveState(),
    look,
    firing: input.firing,
    reload: input.wasPressed('KeyR'),
    grenade: input.wasPressed('KeyG'),
    use: keysHeldE(),
    sensitivity,
  };
  // Buy keys and toggles (edge-triggered).
  if (input.wasPressed('KeyB')) {
    if (state.phase === 'buy') {
      hud.hideBuy();
      state.buyTimer = Math.min(state.buyTimer, 0.5);
    }
  }
  if (input.wasPressed('Digit1')) sim.buy('smg');
  if (input.wasPressed('Digit2')) sim.buy('rifle');
  if (input.wasPressed('Digit3')) sim.buy('sniper');
  if (input.wasPressed('Digit4')) sim.buy('grenade');
  if (input.wasPressed('Digit5')) sim.buy('armor');
  if (input.wasPressed('KeyM')) {
    audio.setMuted(!audio.isMuted());
    hud.setHint(audio.isMuted() ? 'Sound muted (M to unmute)' : '');
  }

  // In staged screenshot mode the simulation never advances, so the
  // captured frame is exactly the staged state on every run. The HUD
  // still redraws (with dt 0) so the minimap and banners are painted.
  const frozen = !!shotMode;
  if (!frozen) {
    sim.update(dt, stepInput);
    effects.update(dt);
  }
  syncCamera();
  const moving = !frozen && player.speed > 0.5 && state.phase !== 'menu';
  sim.viewmodel.update(frozen ? 0 : dt, moving, state.weapon.reloading, frozen ? false : input.firing);
  if (state.phase !== 'menu') hud.update(state, frozen ? 0 : dt);
  renderer.render(scene, camera);
  framesRendered += 1;
  if (shotMode && framesRendered >= 10) window.__shotReady = true;
  if (!shotMode && framesRendered === 5) window.__gameReady = true;
}

const eKey = new Set();
function keysHeldE() {
  return eKey.has('KeyE');
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE') eKey.add('KeyE');
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyE') eKey.delete('KeyE');
});

// ---- menu wiring
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const resumeBtn = document.getElementById('resume-btn');
const sensSlider = document.getElementById('sens-slider');
const muteBtn = document.getElementById('mute-btn');

function startGame() {
  audio.unlock();
  audio.click();
  hud.hideMenu();
  input.requestLock();
  sim.startMatch(seed);
  hud.setHint('WASD move · Mouse aim · Click fire · R reload · G frag · E defuse · B buy · M mute');
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', () => {
  audio.click();
  hud.hideEnd();
  input.requestLock();
  sim.startMatch(seed);
});
resumeBtn.addEventListener('click', () => {
  hud.showPause(false);
  input.requestLock();
});
sensSlider.addEventListener('input', () => {
  sensitivity = Number.parseFloat(sensSlider.value) || 1;
});
muteBtn.addEventListener('click', () => {
  audio.setMuted(!audio.isMuted());
  muteBtn.textContent = audio.isMuted() ? 'SOUND: OFF' : 'SOUND: ON';
});

// Clicking the canvas during play re-locks the pointer.
canvas.addEventListener('click', () => {
  if (state.phase !== 'menu' && !input.locked) input.requestLock();
});

// Losing pointer lock mid-round pauses; Esc in the menu does nothing.
document.addEventListener('pointerlockchange', () => {
  if (!input.locked && state.phase === 'live' && player.alive && !shotMode) {
    hud.showPause(true);
  } else if (input.locked) {
    hud.showPause(false);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- boot
if (shotMode) {
  // Deterministic staged screenshot: no menu, no pointer lock.
  hud.hideMenu();
  document.getElementById('menu-screen').classList.add('hidden');
  if (shotMode === 'menu') {
    sim.stage('menu');
    hud.showMenu();
  } else {
    sim.stage(shotMode);
  }
} else {
  hud.showMenu();
  sim.stage('menu');
}

window.__fps = { sim, state, player, hud, input, audio, world, effects };
requestAnimationFrame(frame);

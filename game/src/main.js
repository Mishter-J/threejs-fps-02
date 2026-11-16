// main.js — wiring and the game loop. The simulation runs on a fixed step
// (1/60 s) fed by an accumulator over real elapsed time, so timers, bot
// brains and bullet flight run at true speed even when rendering is slow;
// rendering simply draws the latest simulated state once per frame. The
// loop never allocates in the hot path: the renderer, camera and world
// objects are built once here and handed to the modules as one context.
import * as THREE from 'three';
import { createState } from './state.js';
import { buildMap } from './map.js';
import { createEffects } from './effects.js';
import { createPlayerController } from './player.js';
import { spawnBots, stepBots } from './bots.js';
import { createRoundController } from './round.js';
import { updateProjectiles } from './combat.js';
import { createHud } from './hud.js';

const SIM_DT = 1 / 60;
const MAX_FRAME_DT = 0.5; // clamp: a hitch never fast-forwards the sim
const MAX_STEPS_PER_FRAME = 40; // 40 steps cover a 0.5 s frame at 60 Hz

const canvas = document.createElement('canvas');
canvas.id = 'game';
document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 300);
camera.rotation.order = 'YXZ';
scene.add(camera);

const S = createState();
const map = buildMap(scene);
const effects = createEffects(scene);

// The world context: everything the simulation modules need, in one place.
const W = {
  scene,
  camera,
  canvas,
  colliders: map.colliders,
  sites: map.sites,
  routes: map.routes,
  spawns: map.spawns,
  bounds: map.bounds,
  bombMesh: map.bombMesh,
  effects,
  spawnBots: () => spawnBots(S, W),
  plantBomb: (site) => round.plantBomb(site),
  defuseBomb: () => round.defuseBomb(),
  transferBomb: (deadBot) => round.transferBomb(deadBot),
  onHitmarker: (head, kill) => hud.showHitmarker(head, kill),
  onPlayerHurt: () => hud.hurtFlash(),
  onShake: (mag) => {
    shake = Math.max(shake, mag);
  },
  round: null,
};
const round = createRoundController(S, W);
W.round = round;

const player = createPlayerController(S, W, camera);
const hud = createHud(S, W);
player.bindInput(canvas, hud);
player.buildViewmodel();

// A debug handle for play-testing: read-only state, no cheats.
window.SANDLINE = { state: S, version: '3.0' };

let shake = 0;
let stepIndex = 0;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// One fixed simulation step. Order matters: the round clock first (it can
// end the round), then the player, the bots, then the grenades.
function step(dt) {
  S.time += dt;
  if (S.bannerT > 0) S.bannerT -= dt;
  round.step(dt);
  player.step(dt, W);
  stepBots(S, W, dt, stepIndex);
  updateProjectiles(S, W, dt);
  stepIndex += 1;
}

let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min((now - last) / 1000, MAX_FRAME_DT);
  last = now;
  acc += frameDt;
  let n = 0;
  while (acc >= SIM_DT && n < MAX_STEPS_PER_FRAME) {
    step(SIM_DT);
    acc -= SIM_DT;
    n += 1;
  }
  if (n === MAX_STEPS_PER_FRAME) acc = 0; // spiral guard: drop time instead of stuttering
  player.updateCamera(camera);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.12;
    camera.position.y += (Math.random() - 0.5) * shake * 0.12;
    shake = Math.max(0, shake - frameDt * 1.8);
  }
  effects.update(frameDt);
  hud.update(now);
  renderer.render(scene, camera);
}

requestAnimationFrame(frame);

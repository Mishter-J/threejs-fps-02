// player.js — the first-person controller: mouse look, acceleration
// movement, crouching, collision, firing, reloading, grenades and the
// bomb plant/defuse channels.
//
// The controller only ever writes state.player (and, through combat.js,
// the world). Rendering reads the same fields in main.js.

import * as THREE from 'three';
import { WEAPONS, effectiveSpread } from './weapons.js';
import { shootHitscan } from './combat.js';
import { moveCircle } from './collision.js';
import { WALLS, siteAt } from './map.js';
import { PLAYER_RADIUS, PLAYER_EYE, PLAYER_EYE_CROUCH, WALK_SPEED, CROUCH_SPEED, SLOW_SPEED, PLANT_TIME, DEFUSE_TIME } from './state.js';
import * as audio from './audio.js';

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    lookDX: 0, lookDY: 0,
    firing: false, rmb: false,
    locked: false,
    consumeLook() {
      const dx = this.lookDX;
      const dy = this.lookDY;
      this.lookDX = 0;
      this.lookDY = 0;
      return [dx, dy];
    },
  };
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => input.keys.clear());
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (input.locked) {
      input.lookDX += e.movementX;
      input.lookDY += e.movementY;
    }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) input.firing = true;
    if (e.button === 2) input.rmb = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.firing = false;
    if (e.button === 2) input.rmb = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  return input;
}

/** Request pointer lock on the canvas (the click that starts play). */
export function lockPointer(canvas) {
  try {
    const r = canvas.requestPointerLock();
    if (r && typeof r.catch === 'function') r.catch(() => { /* headless or denied: drag-look still works */ });
  } catch { /* headless / denied: drag-look still works */ }
}

const _fwd = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

/**
 * One fixed-step update of the player. `ctx` carries the shared objects
 * main.js wires up (state, effects, camera, raycaster, hitMeshes, ...).
 */
export function updatePlayer(ctx, dt, input) {
  const { state } = ctx;
  const p = state.player;
  if (!p.alive || (state.phase !== 'live' && state.phase !== 'buy')) return;

  // --- Look ---
  const [dx, dy] = input.consumeLook();
  p.yaw -= dx * 0.0022;
  p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch - dy * 0.0022));

  // --- Move: accelerate toward the wished velocity, so starting and
  // stopping take time instead of snapping. ---
  const freeze = state.phase === 'buy';
  let ix = 0;
  let iz = 0;
  if (!freeze) {
    if (input.keys.has('KeyW')) iz -= 1;
    if (input.keys.has('KeyS')) iz += 1;
    if (input.keys.has('KeyA')) ix -= 1;
    if (input.keys.has('KeyD')) ix += 1;
  }
  const moving = ix !== 0 || iz !== 0;
  p.crouch = input.keys.has('ControlLeft') || input.keys.has('ControlRight');
  p.slow = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
  const top = p.crouch ? CROUCH_SPEED : p.slow ? SLOW_SPEED : WALK_SPEED;
  const len = Math.hypot(ix, iz) || 1;
  // Forward is (-sin yaw, -cos yaw); strafe is its perpendicular.
  const fwdX = -Math.sin(p.yaw);
  const fwdZ = -Math.cos(p.yaw);
  const rightX = -fwdZ;
  const rightZ = fwdX;
  const wx = ((fwdX * -iz + rightX * ix) / len) * top;
  const wz = ((fwdZ * -iz + rightZ * ix) / len) * top;
  const k = 1 - Math.exp(-10 * dt);
  p.vx += (wx - p.vx) * k;
  p.vz += (wz - p.vz) * k;
  moveCircle(p, p.vx * dt, p.vz * dt, PLAYER_RADIUS, WALLS);
  p.speed = Math.hypot(p.vx, p.vz);

  // Footsteps, timed by distance walked.
  if (moving && p.speed > 0.5) {
    p.stepPhase += p.speed * dt;
    if (p.stepPhase > 2.4) {
      p.stepPhase = 0;
      audio.playStep(p.speed > 3.5);
    }
  }

  // --- Aim state: bloom grows per shot, recoil kicks the camera. ---
  p.bloom = Math.max(0, p.bloom - 0.045 * dt);
  p.recoil = Math.max(0, p.recoil - 0.09 * dt);
  p.flash = Math.max(0, p.flash - dt);

  // --- Weapon switching (number keys buy while the shop is open). ---
  const switchTo = (id) => {
    if (id === 'grenade') {
      if ((p.grenades ?? 0) <= 0) return;
    } else if (!p.weapons[id]) {
      return;
    }
    if (p.current !== id) {
      p.current = id;
      p.reloading = 0;
      audio.playReload();
    }
  };
  if (!ctx.buyOpen) {
    if (input.keys.has('Digit1')) switchTo('pistol');
    if (input.keys.has('Digit2')) switchTo('rifle');
    if (input.keys.has('Digit3')) switchTo('shotgun');
    if (input.keys.has('Digit4')) switchTo('marksman');
    if (input.keys.has('Digit5')) switchTo('grenade');
  }

  // --- Reload ---
  if (input.keys.has('KeyR') && p.reloading <= 0 && p.current !== 'grenade') {
    const w = WEAPONS[p.current];
    const owned = p.weapons[p.current];
    if (owned && owned.mag < w.mag && owned.reserve > 0) {
      p.reloading = w.reloadTime;
      p.reloadTotal = w.reloadTime;
      audio.playReload();
    }
  }
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) {
      p.reloading = 0;
      const w = WEAPONS[p.current];
      const owned = p.weapons[p.current];
      if (owned) {
        const need = w.mag - owned.mag;
        const take = Math.min(need, owned.reserve);
        owned.mag += take;
        owned.reserve -= take;
      }
    }
  }

  // --- Fire ---
  if (state.phase === 'live' && input.firing && p.reloading <= 0) {
    tryFire(ctx, input);
  }

  // --- Bomb plant / defuse channels (hold E). ---
  updateBombChannels(ctx, dt, input);
}

function tryFire(ctx, input) {
  const { state, camera, effects } = ctx;
  const p = state.player;
  const now = state.time;
  if (p.current === 'grenade') {
    if ((p.grenades ?? 0) > 0 && now - p.lastShotAt > 0.7) {
      throwGrenade(ctx);
      p.lastShotAt = now;
      input.firing = false;
    }
    return;
  }
  const w = WEAPONS[p.current];
  const owned = p.weapons[p.current];
  if (!owned || now - p.lastShotAt < w.rate) return;
  if (owned.mag <= 0) {
    audio.playDryFire();
    p.lastShotAt = now;
    if (owned.reserve > 0 && p.reloading <= 0) {
      p.reloading = w.reloadTime;
      p.reloadTotal = w.reloadTime;
      audio.playReload();
    }
    return;
  }
  owned.mag--;
  p.lastShotAt = now;
  state.stats.shots++;
  // Direction from the camera, with recoil kick and bloom applied.
  camera.getWorldDirection(_fwd);
  const speedFrac = Math.min(1, p.speed / WALK_SPEED);
  const spread = effectiveSpread(w, speedFrac, p.crouch, p.slow, p.bloom);
  p.bloom = Math.min(0.06, p.bloom + w.recoil * 0.35);
  p.recoil = Math.min(0.12, p.recoil + w.recoil);
  p.pitch += w.recoil * 0.55; // the kick the player feels
  // Muzzle: just ahead of the camera, low and to the right.
  camera.getWorldDirection(_fwd);
  _muzzle.copy(camera.position).addScaledVector(_fwd, 0.7);
  _muzzle.y -= 0.16;
  _muzzle.x += Math.cos(p.yaw) * 0.22;
  _muzzle.z -= Math.sin(p.yaw) * 0.22;
  effects.muzzle(_muzzle, camera);
  audio.playShot(w.kind);
  shootHitscan(ctx, { team: 'atk', isPlayer: true, ref: p }, camera.position, _fwd, w, spread);
  ctx.onPlayerShot?.();
}

function throwGrenade(ctx) {
  const { state, camera } = ctx;
  const p = state.player;
  p.grenades--;
  camera.getWorldDirection(_fwd);
  state.grenades.push({
    x: camera.position.x, y: camera.position.y - 0.1, z: camera.position.z,
    vx: _fwd.x * 15, vy: _fwd.y * 15 + 3.2, vz: _fwd.z * 15,
    fuse: WEAPONS.grenade.fuse, owner: 'player', ownerTeam: 'atk', ownerBot: null,
  });
  audio.playGrenadePin();
  if (p.grenades <= 0) p.current = 'pistol';
}

function updateBombChannels(ctx, dt, input) {
  const { state } = ctx;
  const p = state.player;
  const holdingE = input.keys.has('KeyE');
  const bomb = state.bomb;
  if (state.phase !== 'live') { p.planting = 0; p.defusing = 0; return; }

  // Planting: the player carries the charge and stands on a site.
  if (bomb.state === 'carried' && bomb.carrier === 'player') {
    const site = siteAt(p.x, p.z);
    if (holdingE && site) {
      p.planting += dt;
      bomb.progress = p.planting / PLANT_TIME;
      if (p.planting >= PLANT_TIME) {
        bomb.state = 'planted';
        bomb.site = site.id;
        bomb.x = p.x;
        bomb.z = p.z;
        bomb.timer = 35;
        bomb.progress = 0;
        p.planting = 0;
        state.player.money += 300;
        audio.playPlant();
        ctx.announce?.(`Charge planted at Site ${site.id} — defend it!`);
      }
    } else {
      p.planting = 0;
      bomb.progress = 0;
    }
    return;
  }

  // Defusing: the charge is planted and the player stands on it.
  // (The player is an attacker, so this path is for a planted charge the
  // player team must protect — defuse here belongs to the defenders;
  // the player cannot defuse their own charge.)
  p.defusing = 0;
}

/** Place the camera from the player state each rendered frame. */
export function applyCamera(camera, p, shakeAmp, dt) {
  const eye = p.crouch ? PLAYER_EYE_CROUCH : PLAYER_EYE;
  camera.position.set(p.x, eye, p.z);
  const shakeX = shakeAmp > 0 ? (Math.random() - 0.5) * shakeAmp * 0.05 : 0;
  const shakeY = shakeAmp > 0 ? (Math.random() - 0.5) * shakeAmp * 0.05 : 0;
  camera.rotation.order = 'YXZ';
  camera.rotation.y = p.yaw + shakeX;
  camera.rotation.x = p.pitch + p.recoil + shakeY;
  camera.rotation.z = 0;
}

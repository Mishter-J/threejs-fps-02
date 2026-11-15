// weapons.js — weapon state, firing, recoil/spread, reload and the
// first-person viewmodel. Firing is hitscan: one ray from the camera
// (or a bot's eyes) with spread applied, resolved by sim.resolveShot
// against bots, the player and walls. This module never touches the
// DOM; it reports events (fired / hit / killed / dry) to callbacks
// the simulation wires up.

import * as THREE from 'three';
import { WEAPONS, GRENADE } from './config.js';

export function createWeaponState(weaponId) {
  const def = WEAPONS[weaponId];
  return {
    def,
    mag: def.mag,
    reserve: def.reserve,
    reloading: 0,
    cooldown: 0,
    spreadBloom: 0, // grows while firing, decays while idle
    recoil: 0,
  };
}

export function weaponDef(id) {
  return WEAPONS[id];
}

export function canFire(w) {
  return w.cooldown <= 0 && w.reloading <= 0 && w.mag > 0;
}

// Spread in radians for this shot: base + movement + bloom, less when
// crouched. Stopping to aim genuinely pays.
export function currentSpread(w, speed, crouched) {
  let s = w.def.spread + w.spreadBloom;
  if (speed > 1.2) s += w.def.moveSpread * Math.min(1, speed / 5.2);
  if (crouched) s += w.def.crouchSpread;
  return Math.max(0.0008, s);
}

export function startReload(w, audio) {
  if (w.reloading > 0 || w.mag >= w.def.mag || w.reserve <= 0) return false;
  w.reloading = w.def.reload;
  if (audio) audio.reload();
  return true;
}

export function updateWeapon(w, dt) {
  if (w.cooldown > 0) w.cooldown -= dt;
  if (w.reloading > 0) {
    w.reloading -= dt;
    if (w.reloading <= 0) {
      const need = w.def.mag - w.mag;
      const take = Math.min(need, w.reserve);
      w.mag += take;
      w.reserve -= take;
      w.reloading = 0;
    }
  }
  w.spreadBloom = Math.max(0, w.spreadBloom - dt * 0.055);
  w.recoil = Math.max(0, w.recoil - dt * 0.09);
}

// Fire one hitscan shot. Returns a shot record the sim resolves, or
// null when the weapon cannot fire (dry / reloading / cooling down).
// dir is a THREE.Vector3 the caller owns; it is perturbed in place.
export function fireWeapon(w, dir, speed, crouched, rng) {
  if (w.reloading > 0 || w.cooldown > 0) return null;
  if (w.mag <= 0) return { dry: true };
  w.mag -= 1;
  w.cooldown = w.def.rate;
  w.spreadBloom = Math.min(0.05, w.spreadBloom + w.def.spread * 0.55);
  w.recoil = Math.min(0.12, w.recoil + w.def.recoil);
  const spread = currentSpread(w, speed, crouched);
  // Random cone around the aim direction.
  const a = rng.next() * Math.PI * 2;
  const r = Math.sqrt(rng.next()) * spread;
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  if (Math.abs(dir.y) < 0.95) {
    right.crossVectors(dir, up).normalize();
    up.crossVectors(right, dir).normalize();
  } else {
    right.set(1, 0, 0);
    up.crossVectors(right, dir).normalize();
  }
  dir.addScaledVector(right, Math.cos(a) * r);
  dir.addScaledVector(up, Math.sin(a) * r);
  dir.normalize();
  return { dry: false, def: w.def, damage: w.def.damage, headMul: w.def.headMul, range: w.def.range };
}

// ---- viewmodel: a chunky low-poly gun built from boxes, parented to
// the camera. Bob while walking, kick back on fire, dip on reload.
export function buildViewmodel(camera) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x55555f, roughness: 0.55, metalness: 0.55 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x8a8a96, roughness: 0.5, metalness: 0.5 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xc47b2d, roughness: 0.5, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.5), dark);
  body.position.set(0, 0, 0);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), mid);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.36);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), dark);
  grip.position.set(0, -0.12, 0.12);
  grip.rotation.x = 0.35;
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), accent);
  mag.position.set(0, -0.1, -0.05);
  mag.rotation.x = 0.12;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), mid);
  sight.position.set(0, 0.09, -0.08);
  group.add(body, barrel, grip, mag, sight);
  group.position.set(0.24, -0.22, -0.42);
  camera.add(group);
  return {
    group,
    kick: 0,
    bobPhase: 0,
    update(dt, moving, reloading, firing) {
      if (firing) this.kick = Math.min(0.09, this.kick + 0.03);
      this.kick = Math.max(0, this.kick - dt * 0.35);
      if (moving) this.bobPhase += dt * 9;
      const bob = moving ? Math.sin(this.bobPhase) * 0.008 : 0;
      const bobY = moving ? Math.abs(Math.cos(this.bobPhase)) * 0.01 : 0;
      const dip = reloading > 0 ? Math.sin((1 - reloading / 2.4) * Math.PI) * 0.14 : 0;
      group.position.set(0.24 + bob, -0.22 - bobY + dip, -0.42 + this.kick);
      group.rotation.x = this.kick * 1.4 + dip * 0.9;
    },
  };
}

// ---- grenades: simple ballistic projectile with wall bounces.
export function createGrenadeState() {
  return {
    active: false,
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    fuse: 0,
    thrownBy: null,
  };
}

export function throwGrenade(g, from, dir, thrower) {
  g.active = true;
  g.x = from.x; g.y = from.y; g.z = from.z;
  g.vx = dir.x * GRENADE.throwSpeed;
  g.vy = dir.y * GRENADE.throwSpeed + 2.5;
  g.vz = dir.z * GRENADE.throwSpeed;
  g.fuse = GRENADE.fuse;
  g.thrownBy = thrower;
}

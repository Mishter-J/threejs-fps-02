// player.js — first-person movement, mouse look, the weapon viewmodel and
// the plant channel. Movement is acceleration-based with friction, not
// instant velocity: stopping takes a beat, and firing while moving is
// punished by the spread model in combat.js. Crouching lowers the eye,
// slows the player and tightens the spread.
import * as THREE from 'three';
import { moveCircle, clampBounds } from './collision.js';
import { weaponOf, BUY_ROWS } from './weapons.js';
import { finishReload, releaseGrenade, shootPlayer, startReload } from './combat.js';
import { initAudio, setMuted, sfx } from './audio.js';
import { BOMB_SECONDS, PLANT_SECONDS, setBanner } from './state.js';

const EYE_STAND = 1.62;
const EYE_CROUCH = 1.15;
const RADIUS = 0.45;
const RUN_SPEED = 5.4;
const WALK_SPEED = 2.7;
const CROUCH_SPEED = 2.9;
const ACCEL = 42;
const FRICTION = 11;

export function createPlayerController(S, W, camera) {
  const keys = {};
  let eyeH = EYE_STAND;
  let viewmodel = null;
  let viewmodelWeapon = '';

  // --- the weapon viewmodel: boxes on the camera, rebuilt per weapon -----
  const gunMetal = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.45, metalness: 0.7 });
  const gunAccent = new THREE.MeshStandardMaterial({ color: 0x8a6a2f, roughness: 0.5, metalness: 0.5 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.8 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  function part(w, h, d, x, y, z, mat) {
    const m = new THREE.Mesh(boxGeo, mat || gunMetal);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    viewmodel.add(m);
    return m;
  }

  function buildViewmodel() {
    if (viewmodel) {
      camera.remove(viewmodel);
      viewmodel = null;
    }
    const w = weaponOf(S.player.weapon);
    viewmodel = new THREE.Group();
    viewmodelWeapon = S.player.weapon;
    if (w.id === 'frag') {
      // A grenade in the hand: a small dark sphere on a pin.
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), gunMetal);
      ball.position.set(0, -0.02, 0);
      viewmodel.add(ball);
      part(0.02, 0.05, 0.02, 0, 0.08, 0, gunAccent);
    } else if (w.id === 'p9') {
      part(0.07, 0.09, 0.3, 0, 0, -0.1); // slide
      part(0.06, 0.12, 0.1, 0, -0.09, 0.02, gripMat); // grip
      part(0.02, 0.03, 0.05, 0, 0.06, -0.2, gunAccent); // sight
    } else {
      // Rifles and the scattergun share a receiver + barrel + stock.
      const L = w.length;
      part(0.09, 0.11, L * 0.55, 0, 0, -L * 0.2); // receiver
      part(0.05, 0.05, L * 0.5, 0, 0.01, -L * 0.62); // barrel
      part(0.07, 0.16, 0.09, 0, -0.1, -L * 0.08, gripMat); // grip
      part(0.06, 0.2, 0.12, 0, -0.13, -L * 0.3, gripMat); // magazine
      part(0.08, 0.07, 0.16, 0, -0.01, L * 0.14, gripMat); // stock
      if (w.id === 'lr50') part(0.05, 0.06, 0.22, 0, 0.09, -L * 0.25, gunAccent); // scope
      if (w.id === 'sg12') part(0.07, 0.07, L * 0.4, 0, -0.05, -L * 0.5, gunAccent); // pump
    }
    viewmodel.position.set(0.3, -0.28, -0.55);
    viewmodel.rotation.set(0, 0.06, 0);
    camera.add(viewmodel);
  }

  function bindInput(canvas, hud) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      keys[e.code] = true;
      if (e.code === 'KeyM') {
        S.muted = !S.muted;
        setMuted(S.muted);
        setBanner(S, S.muted ? 'Sound muted' : 'Sound on', 1.5);
      }
      if (e.code === 'KeyR') startReload(S);
      if (e.code === 'KeyB' && (S.phase === 'buy' || S.phase === 'live')) hud.toggleBuy();
      // In the buy phase the number keys buy (1–6, menu order); in a live
      // round they switch weapons instead.
      if (S.phase === 'buy') {
        const buyKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];
        const bi = buyKeys.indexOf(e.code);
        if (bi >= 0) hud.buyRow(BUY_ROWS[bi].id);
      } else if (S.phase === 'live') {
        if (e.code === 'Digit1') selectWeapon('p9');
        if (e.code === 'Digit2') selectWeapon('ar9');
        if (e.code === 'Digit3') selectWeapon('sg12');
        if (e.code === 'Digit4') selectWeapon('lr50');
        if (e.code === 'Digit5') selectWeapon('frag');
      }
      if (e.code === 'Enter' && S.phase === 'menu') hud.deploy();
      if (e.code === 'Enter' && S.phase === 'match') hud.playAgain();
    });
    window.addEventListener('keyup', (e) => {
      keys[e.code] = false;
    });
    window.addEventListener('blur', () => {
      for (const k of Object.keys(keys)) keys[k] = false;
      S.player.fireHeld = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      initAudio();
      if (S.phase === 'live' || S.phase === 'buy') {
        if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
        S.player.fireHeld = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) S.player.fireHeld = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      const p = S.player;
      p.yaw -= e.movementX * 0.0022;
      p.pitch -= e.movementY * 0.0022;
      if (p.pitch > 1.5) p.pitch = 1.5;
      if (p.pitch < -1.5) p.pitch = -1.5;
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas && S.phase === 'live' && S.player.alive) {
        setBanner(S, 'Click the game to aim again', 2);
      }
    });
  }

  function selectWeapon(id) {
    const p = S.player;
    if (!p.owned.includes(id)) return;
    if (id === 'frag' && p.grenades <= 0) return;
    if (p.weapon === id || p.reloading > 0) return;
    p.weapon = id;
    p.reloading = 0;
    p.bloom = 0;
    sfx.click();
  }

  // One fixed simulation step (dt = 1/60). Movement, reload, recoil
  // recovery, the plant channel and grenade wind-up all live here.
  function step(dt, W) {
    const p = S.player;
    if (viewmodelWeapon !== p.weapon) buildViewmodel();
    // Recoil and bloom decay whether or not the player fires.
    p.recoil = Math.max(0, p.recoil - dt * 0.35);
    p.bloom = Math.max(0, p.bloom - dt * 2.2);
    if (p.reloading > 0) {
      p.reloading -= dt;
      if (p.reloading <= 0) {
        p.reloading = 0;
        finishReload(S);
      }
    }
    if (p.throwT > 0) {
      p.throwT -= dt;
      if (p.throwT <= 0) {
        p.throwT = 0;
        releaseGrenade(S, W);
      }
    }
    if (!p.alive || S.phase === 'menu' || S.phase === 'match' || S.phase === 'over') return;

    // --- movement ------------------------------------------------------
    p.crouch = !!keys['ControlLeft'] || !!keys['ControlRight'];
    p.walking = !!keys['ShiftLeft'] || !!keys['ShiftRight'];
    const fwd = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
    const strafe = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
    const moving = fwd !== 0 || strafe !== 0;
    const speed = p.crouch ? CROUCH_SPEED : p.walking ? WALK_SPEED : RUN_SPEED;
    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    // Forward is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw).
    let wx = -sin * fwd + cos * strafe;
    let wz = -cos * fwd - sin * strafe;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) {
      wx /= wl;
      wz /= wl;
    }
    if (moving) {
      p.vel.x += wx * ACCEL * dt;
      p.vel.z += wz * ACCEL * dt;
      const v = Math.hypot(p.vel.x, p.vel.z);
      const cap = speed + (weaponOf(p.weapon).speed || 0);
      if (v > cap) {
        p.vel.x *= cap / v;
        p.vel.z *= cap / v;
      }
    } else {
      // Friction: velocity decays exponentially, never snaps to zero.
      const f = Math.max(0, 1 - FRICTION * dt);
      p.vel.x *= f;
      p.vel.z *= f;
      if (Math.hypot(p.vel.x, p.vel.z) < 0.05) {
        p.vel.x = 0;
        p.vel.z = 0;
      }
    }
    moveCircle(p.pos, RADIUS, p.vel.x * dt, p.vel.z * dt, W.colliders);
    clampBounds(p.pos, RADIUS, W.bounds);

    // --- firing --------------------------------------------------------
    if (p.fireHeld) {
      const w = weaponOf(p.weapon);
      if (w.auto || S.time >= p.nextShot) shootPlayer(S, W, S.time);
      if (!w.auto) p.fireHeld = false;
    }

    // --- planting ------------------------------------------------------
    const nearSite = siteNear(S, W);
    if (S.phase === 'live' && S.bomb.state === 'carried' && S.bomb.carrier === 'player' && nearSite) {
      if (keys['KeyE']) {
        p.plantT += dt;
        if (Math.floor(p.plantT * 4) !== Math.floor((p.plantT - dt) * 4)) sfx.plantBeep();
        if (p.plantT >= PLANT_SECONDS) {
          p.plantT = 0;
          W.plantBomb(nearSite);
        }
      } else {
        p.plantT = 0;
      }
    } else {
      p.plantT = 0;
    }
  }

  function siteNear(S, W) {
    const p = S.player.pos;
    for (const key of ['A', 'B']) {
      const s = W.sites[key];
      if (Math.abs(p.x - s.x) < 4 && Math.abs(p.z - s.z) < 4) return key;
    }
    return null;
  }

  // Place the camera every frame from the simulation state. When the
  // player is dead the camera rides on the spectated teammate.
  function updateCamera(camera) {
    const p = S.player;
    const targetH = p.crouch ? EYE_CROUCH : EYE_STAND;
    eyeH += (targetH - eyeH) * 0.25;
    if (p.alive) {
      camera.position.set(p.pos.x, eyeH, p.pos.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = p.yaw;
      camera.rotation.x = p.pitch + p.recoil;
      camera.rotation.z = 0;
    } else if (p.spectating) {
      const mate = S.bots.find((b) => b.id === p.spectating && b.alive);
      if (mate) {
        camera.position.set(mate.pos.x, 1.62, mate.pos.z);
        camera.rotation.order = 'YXZ';
        camera.rotation.y = mate.yaw;
        camera.rotation.x = 0;
        camera.rotation.z = 0;
      }
    }
    // Viewmodel kick: recoil pushes the gun back, reload dips it down.
    // Hidden while spectating: the dead do not hold guns.
    if (viewmodel) {
      viewmodel.visible = p.alive;
      viewmodel.position.z = -0.55 + p.recoil * 1.2;
      viewmodel.rotation.x = p.reloading > 0 ? 0.55 : 0;
    }
  }

  return { bindInput, step, updateCamera, buildViewmodel, selectWeapon };
}

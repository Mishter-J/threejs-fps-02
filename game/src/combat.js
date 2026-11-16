// combat.js — everything that hurts. Hits are checked against bodies, not
// points: a head sphere (more damage) and a body sphere per bot, cut by the
// nearest wall along the ray. Spread and recoil punish firing on the move:
// the spread grows with speed and with every shot (bloom), and crouching or
// standing still pays. No allocations in the hot path beyond the caller's
// scratch objects; grenades live in state.projectiles and are stepped here.
import { rayWalls, segmentBlocked } from './collision.js';
import { weaponOf } from './weapons.js';
import { addFeed, addMoney, setBanner } from './state.js';
import { sfx } from './audio.js';

const DEG = Math.PI / 180;

// Direction from yaw/pitch. Forward is -Z at yaw 0; spawn yaw -PI/2 faces east.
export function aimDir(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

function eyeOf(S) {
  const p = S.player;
  const crouch = p.crouch ? 1.15 : 1.62;
  return { x: p.pos.x, y: crouch, z: p.pos.z };
}

// Current spread in degrees: base + movement penalty + bloom from firing.
// Standing still and crouching is worth roughly a third of the spread.
export function currentSpread(S) {
  const p = S.player;
  const w = weaponOf(p.weapon);
  const speed = Math.hypot(p.vel.x, p.vel.z);
  const move = Math.min(1, speed / 5.4);
  let spread = w.spread + w.moveSpread * move + p.bloom;
  if (p.crouch) spread *= 0.62;
  if (move < 0.05) spread *= 0.8;
  return spread;
}

// Ray vs one bot: head sphere first (higher damage), then body sphere.
// Returns { dist, head } or null. Bot origin is its feet position.
function rayBot(ox, oy, oz, dx, dy, dz, bot, maxDist) {
  let best = null;
  // Head: centre 1.62 m up, radius 0.28.
  const h = raySphere(ox, oy, oz, dx, dy, dz, bot.pos.x, 1.62, bot.pos.z, 0.3);
  if (h !== null && h < maxDist) best = { dist: h, head: true };
  // Body: centre 0.95 m up, radius 0.55.
  const b = raySphere(ox, oy, oz, dx, dy, dz, bot.pos.x, 0.95, bot.pos.z, 0.55);
  if (b !== null && b < maxDist && (best === null || b < best.dist)) {
    best = { dist: b, head: false };
  }
  return best;
}

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return null;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return null;
  return tca - Math.sqrt(r2 - d2);
}

// One trigger pull by the player. W is the world context main.js builds:
// { colliders, effects, onHitmarker, onShake, transferBomb }.
export function shootPlayer(S, W, now) {
  const p = S.player;
  if (S.phase !== 'live' || !p.alive || p.reloading > 0 || p.throwT > 0) return;
  const w = weaponOf(p.weapon);
  if (now < p.nextShot) return;
  if (p.weapon === 'frag') {
    startThrow(S, W);
    return;
  }
  const ammo = p.ammo[p.weapon];
  if (!ammo || ammo.mag <= 0) {
    sfx.dry();
    p.nextShot = now + 0.25;
    startReload(S);
    return;
  }
  p.nextShot = now + w.interval;
  ammo.mag -= 1;
  const eye = eyeOf(S);
  const base = { x: 0, y: 0, z: 0 };
  aimDir(p.yaw + p.recoil * 0.4, p.pitch + p.recoil, base);
  const spread = currentSpread(S);
  const pellets = w.pellets || 1;
  let hitSomething = false;
  for (let i = 0; i < pellets; i++) {
    const dir = jitterDir(base, spread);
    const wallDist = rayWalls(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, W.colliders, 120);
    let bestBot = null;
    let bestHit = null;
    for (const bot of S.bots) {
      if (!bot.alive || bot.team !== 'jackals') continue;
      const hit = rayBot(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, bot, wallDist);
      if (hit && (!bestHit || hit.dist < bestHit.dist)) {
        bestHit = hit;
        bestBot = bot;
      }
    }
    const end = {
      x: eye.x + dir.x * wallDist,
      y: eye.y + dir.y * wallDist,
      z: eye.z + dir.z * wallDist,
    };
    if (bestBot) {
      end.x = eye.x + dir.x * bestHit.dist;
      end.y = eye.y + dir.y * bestHit.dist;
      end.z = eye.z + dir.z * bestHit.dist;
      const falloff = bestHit.dist > w.range ? 0.75 : 1;
      const dmg = Math.round(w.damage * (bestHit.head ? w.headMult : 1) * falloff);
      damageBot(S, W, bestBot, dmg, bestHit.head, 'You');
      hitSomething = true;
    } else if (wallDist < 120) {
      W.effects.puff(end.x, end.y, end.z, 0xd8c49a);
    }
    W.effects.tracer(eye, end, w.tracer);
  }
  // Muzzle flash at the gun tip, recoil kick and bloom.
  const tip = {
    x: eye.x + base.x * 0.9,
    y: eye.y + base.y * 0.9 - 0.18,
    z: eye.z + base.z * 0.9,
  };
  W.effects.muzzle(tip.x, tip.y, tip.z);
  p.recoil = Math.min(0.09, p.recoil + w.recoil);
  p.bloom = Math.min(4, p.bloom + w.bloom);
  sfx.shot(p.weapon);
  S.noise.push({ x: p.pos.x, z: p.pos.z, r: 26, t: S.time });
  if (ammo.mag === 0) startReload(S);
  if (hitSomething) sfx.hit(false);
}

function jitterDir(base, spreadDeg) {
  const a = Math.random() * Math.PI * 2;
  const r = (Math.random() + Math.random()) * 0.5 * spreadDeg * DEG;
  const dx = Math.cos(a) * r;
  const dy = Math.sin(a) * r;
  // Perturb in a plane perpendicular to the base direction (approx: yaw/pitch).
  const x = base.x + dx * Math.cos(Math.atan2(base.x, base.z));
  const y = base.y + dy;
  const z = base.z - dx * Math.sin(Math.atan2(base.x, base.z));
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

export function startReload(S) {
  const p = S.player;
  if (p.reloading > 0 || p.weapon === 'frag') return;
  const ammo = p.ammo[p.weapon];
  if (!ammo || ammo.mag >= weaponOf(p.weapon).mag || ammo.reserve <= 0) return;
  p.reloading = weaponOf(p.weapon).reload;
  sfx.reload();
}

export function finishReload(S) {
  const p = S.player;
  const w = weaponOf(p.weapon);
  const ammo = p.ammo[p.weapon];
  if (!ammo) return;
  const need = w.mag - ammo.mag;
  const take = Math.min(need, ammo.reserve);
  ammo.mag += take;
  ammo.reserve -= take;
}

function startThrow(S, W) {
  const p = S.player;
  if (p.grenades <= 0 || p.throwT > 0) return;
  p.throwT = 0.45;
  p.nextShot = S.time + 0.6;
}

export function releaseGrenade(S, W) {
  const p = S.player;
  if (p.grenades <= 0) return;
  p.grenades -= 1;
  const dir = { x: 0, y: 0, z: 0 };
  aimDir(p.yaw, p.pitch + 0.25, dir);
  const eye = eyeOf(S);
  S.projectiles.push({
    kind: 'frag',
    x: eye.x + dir.x * 0.6,
    y: eye.y - 0.1,
    z: eye.z + dir.z * 0.6,
    vx: dir.x * 17,
    vy: dir.y * 17 + 2.5,
    vz: dir.z * 17,
    fuse: 1.6,
    from: 'player',
  });
  sfx.click();
}

// Step every live grenade: gravity, one ground bounce, then the blast.
export function updateProjectiles(S, W, dt) {
  for (let i = S.projectiles.length - 1; i >= 0; i--) {
    const g = S.projectiles[i];
    g.vy -= 12 * dt;
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.z += g.vz * dt;
    if (g.y < 0.12) {
      g.y = 0.12;
      g.vy = Math.abs(g.vy) * 0.35;
      g.vx *= 0.6;
      g.vz *= 0.6;
    }
    g.fuse -= dt;
    if (g.fuse > 0) continue;
    S.projectiles.splice(i, 1);
    explode(S, W, g.x, g.y, g.z, g.from);
  }
}

export function explode(S, W, x, y, z, from) {
  W.effects.explosion(x, y, z);
  sfx.explosion();
  W.onShake(0.5);
  S.noise.push({ x, z, r: 30, t: S.time });
  const R = 6.5;
  // Bots in the blast, less through walls.
  for (const bot of S.bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.pos.x - x, bot.pos.z - z);
    if (d > R) continue;
    const throughWall = segmentBlocked(x, 1, z, bot.pos.x, 1, bot.pos.z, W.colliders);
    const dmg = Math.round(95 * (1 - d / R) * (throughWall ? 0.5 : 1));
    if (dmg > 5) damageBot(S, W, bot, dmg, false, from === 'player' ? 'You' : 'Frag-9');
  }
  // The player in their own blast.
  const pd = Math.hypot(S.player.pos.x - x, S.player.pos.z - z);
  if (S.player.alive && pd < R) {
    const dmg = Math.round(80 * (1 - pd / R));
    if (dmg > 5) damagePlayer(S, W, dmg, 'Frag-9');
  }
}

// A bot shoots at a target position (the player or a teammate bot).
// Hit chance falls with distance and with target speed, rises when the
// target stands still — the same accuracy economy as the player's gun.
export function botShoot(S, W, bot, tx, ty, tz, isPlayer, targetSpeed) {
  const from = { x: bot.pos.x, y: 1.45, z: bot.pos.z };
  const dx = tx - from.x;
  const dy = ty - from.y;
  const dz = tz - from.z;
  const dist = Math.hypot(dx, dy, dz) || 1;
  const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
  const wallDist = rayWalls(from.x, from.y, from.z, dir.x, dir.y, dir.z, W.colliders, dist);
  const blocked = wallDist < dist - 0.3;
  // Aim error: ~0.5 up close, falling with distance and target motion,
  // so a still target at 40 m is hittable but not a free kill.
  let hitP = 0.5 - dist * 0.012 - targetSpeed * 0.05;
  if (isPlayer && S.player.crouch) hitP -= 0.08;
  const hit = !blocked && Math.random() < Math.max(0.06, hitP);
  const end = blocked
    ? { x: from.x + dir.x * wallDist, y: from.y + dir.y * wallDist, z: from.z + dir.z * wallDist }
    : { x: tx, y: ty, z: tz };
  if (!hit && !blocked) {
    // A visible miss: the tracer lands a little wide of the target.
    end.x += (Math.random() - 0.5) * 1.6;
    end.y += (Math.random() - 0.5) * 0.9;
    end.z += (Math.random() - 0.5) * 1.6;
  }
  W.effects.tracer(from, end, 0xffb36b);
  W.effects.muzzle(from.x + dir.x * 0.7, from.y, from.z + dir.z * 0.7);
  sfx.enemyShot(dist);
  if (!hit) return;
  const dmg = Math.round((bot.weapon === 'lr50' ? 40 : 16 + Math.random() * 10) * (dist > 30 ? 0.8 : 1));
  if (isPlayer) damagePlayer(S, W, dmg, bot.name);
  else {
    const target = S.bots.find((b) => b.alive && b.pos.x === tx && b.pos.z === tz);
    if (target) damageBot(S, W, target, dmg, false, bot.name);
  }
}

export function damageBot(S, W, bot, dmg, head, attacker) {
  if (!bot.alive) return;
  bot.hp -= dmg;
  bot.lastHitAt = S.time;
  bot.lastHitFrom = { x: S.player.pos.x, z: S.player.pos.z };
  if (attacker === 'You') {
    W.onHitmarker(head, bot.hp <= 0);
    if (head) sfx.hit(true);
  }
  if (bot.hp > 0) return;
  bot.alive = false;
  bot.hp = 0;
  if (bot.group) bot.group.visible = false;
  addFeed(S, attacker + ' ▸ ' + bot.name + (head ? ' (headshot)' : ''));
  if (attacker === 'You') {
    S.kills += 1;
    addMoney(S, 300);
    sfx.kill();
  }
  if (S.bomb.carrier === bot.id) W.transferBomb(bot);
}

export function damagePlayer(S, W, dmg, fromName) {
  const p = S.player;
  if (!p.alive || S.phase !== 'live') return;
  if (p.kevlar) dmg = Math.ceil(dmg / 2);
  p.hp -= dmg;
  p.lastDamageFrom = fromName;
  p.lastDamageAt = S.time;
  sfx.hurt();
  W.onPlayerHurt(fromName);
  if (p.hp > 0) return;
  p.hp = 0;
  p.alive = false;
  p.plantT = 0;
  p.throwT = 0;
  S.deaths += 1;
  addFeed(S, fromName + ' ▸ You');
  if (S.bomb.carrier === 'player') W.transferBomb(null);
  // Spectate the first living teammate so the round stays watchable.
  const mate = S.bots.find((b) => b.alive && b.team === 'vanguard');
  p.spectating = mate ? mate.id : null;
  setBanner(S, 'You are down — spectating ' + (mate ? mate.name : 'the round'), 4);
}

// bots.js — the AI opponents and teammates. Each bot is a small
// state machine: walk a waypoint route to its objective, hold an
// angle, and when it sees an enemy, stop, wait out a human-like
// reaction delay, then fire in bursts with accuracy that falls off
// with distance and target movement. Bots also hear gunfire, plant
// and defuse the spike, and rotate between sites. All randomness
// comes from the match RNG, so behaviour replays from the seed.

import * as THREE from 'three';
import { BOT, MAP, PALETTE } from './config.js';
import { createWeaponState, fireWeapon, updateWeapon } from './weapons.js';

// Breadth-first search on the waypoint graph; returns an array of
// waypoint indices from `from` to `to` (inclusive), or [].
export function findPath(fromIdx, toIdx) {
  if (fromIdx === toIdx) return [toIdx];
  const prev = new Array(MAP.waypoints.length).fill(-1);
  const queue = [fromIdx];
  prev[fromIdx] = fromIdx;
  while (queue.length) {
    const cur = queue.shift();
    for (const [a, b] of MAP.waypointEdges) {
      const nxt = a === cur ? b : b === cur ? a : -1;
      if (nxt < 0 || prev[nxt] !== -1) continue;
      prev[nxt] = cur;
      if (nxt === toIdx) {
        const path = [toIdx];
        let n = cur;
        while (n !== fromIdx) {
          path.unshift(n);
          n = prev[n];
        }
        path.unshift(fromIdx);
        return path;
      }
      queue.push(nxt);
    }
  }
  return [toIdx];
}

export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < MAP.waypoints.length; i++) {
    const w = MAP.waypoints[i];
    const d = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function botMaterials(team) {
  const base = team === 'ct' ? PALETTE.ct : PALETTE.t;
  return {
    body: new THREE.MeshStandardMaterial({ color: base, roughness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x26262e, roughness: 0.7 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.25, metalness: 0.6 }),
  };
}

export function createBot(id, name, team, spawn, role, scene) {
  const mats = botMaterials(team);
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32), mats.body);
  body.position.y = 0.95;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), mats.dark);
  head.position.y = 1.55;
  head.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.05), mats.visor);
  visor.position.set(0, 1.56, -0.18);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.62), mats.dark);
  gun.position.set(0.2, 1.05, -0.3);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.14), mats.dark);
  pack.position.set(0, 1.0, 0.22);
  group.add(body, head, visor, gun, pack);
  group.position.set(spawn.x, 0, spawn.z);
  scene.add(group);
  body.userData.botRef = null; // filled below
  head.userData.botRef = null;

  const bot = {
    id,
    name,
    team,
    role, // 'carrier' | 'support' | 'holder'
    group,
    body,
    head,
    pos: new THREE.Vector3(spawn.x, 0, spawn.z),
    yaw: 0,
    health: 100,
    armor: 0,
    alive: true,
    weapon: createWeaponState(team === 't' ? 'rifle' : (id % 2 === 0 ? 'rifle' : 'smg')),
    path: [],
    pathIdx: 0,
    holdUntil: 0,
    targetSite: 'A',
    state: 'route', // route | hold | engage | plant | defuse | dead
    visibleEnemy: null,
    reaction: 0,
    burstLeft: 0,
    burstPause: 0,
    lastSeen: new THREE.Vector3(),
    lastSeenAt: -99,
    noise: null,
    plantProgress: 0,
    defuseProgress: 0,
    speed: 0,
    spawn: { x: spawn.x, z: spawn.z },
  };
  body.userData.botRef = bot;
  head.userData.botRef = bot;
  body.userData.part = 'body';
  head.userData.part = 'head';
  return bot;
}

function botEye(bot) {
  return { x: bot.pos.x, y: 1.5, z: bot.pos.z };
}

// Pick the nearest visible enemy for this bot. `enemies` is a list of
// {pos, eyeY, alive, isPlayer, crouched, speed, ref}. Returns the
// enemy or null.
function perceive(bot, enemies, world) {
  const eye = botEye(bot);
  const fx = -Math.sin(bot.yaw);
  const fz = -Math.cos(bot.yaw);
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (!e.alive) continue;
    const dx = e.pos.x - eye.x;
    const dy = e.eyeY - eye.y;
    const dz = e.pos.z - eye.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > BOT.sightRange) continue;
    const dot = (dx * fx + dz * fz) / Math.max(0.001, Math.hypot(dx, dz));
    if (d > 7 && dot < BOT.fovCos) continue;
    if (!world.lineOfSight(eye.x, eye.y, eye.z, e.pos.x, e.eyeY, e.pos.z)) continue;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export function updateBot(bot, dt, ctx) {
  const { world, rng, time, enemies, onShoot, onDamage, onPlant, onDefuse } = ctx;
  if (!bot.alive) return;
  updateWeapon(bot.weapon, dt);

  const enemy = perceive(bot, enemies, world);
  if (enemy) {
    bot.lastSeen.set(enemy.pos.x, enemy.eyeY, enemy.pos.z);
    bot.lastSeenAt = time;
    if (bot.visibleEnemy !== enemy) {
      bot.visibleEnemy = enemy;
      bot.reaction = rng.range(BOT.reactionMin, BOT.reactionMax);
    }
  } else if (bot.visibleEnemy && time - bot.lastSeenAt > 1.2) {
    bot.visibleEnemy = null;
  }

  // --- combat: after the reaction delay, fire in bursts.
  if (bot.visibleEnemy && bot.reaction <= 0) {
    const e = bot.visibleEnemy;
    const dx = e.pos.x - bot.pos.x;
    const dz = e.pos.z - bot.pos.z;
    bot.yaw = Math.atan2(-dx, -dz);
    const dist = Math.hypot(dx, dz);
    if (bot.burstPause > 0) {
      bot.burstPause -= dt;
    } else if (bot.burstLeft <= 0) {
      bot.burstLeft = rng.int(BOT.burstMin, BOT.burstMax);
    } else if (bot.weapon.cooldown <= 0 && bot.weapon.mag > 0) {
      const dir = new THREE.Vector3(e.pos.x - bot.pos.x, e.eyeY - 1.5, e.pos.z - bot.pos.z).normalize();
      const shot = fireWeapon(bot.weapon, dir, 0, false, rng);
      if (shot && !shot.dry) {
        onShoot(bot, dir, shot);
        bot.burstLeft -= 1;
        if (bot.burstLeft <= 0) bot.burstPause = rng.range(BOT.burstPauseMin, BOT.burstPauseMax);
        // Accuracy roll: base chance, worse far away, worse vs a
        // moving or crouched target, better up close.
        let p = BOT.accuracy * (10 / Math.max(6, dist));
        if (e.speed > 2) p *= 0.75;
        if (e.crouched) p *= 0.85;
        p = Math.min(0.85, Math.max(0.05, p));
        if (rng.chance(p)) {
          const head = rng.chance(0.12);
          const fall = dist > shot.def.falloffStart
            ? Math.max(shot.def.falloffMin, 1 - (dist - shot.def.falloffStart) / 60)
            : 1;
          const dmg = shot.def.damage * (head ? shot.def.headMul : 1) * fall;
          onDamage(e, dmg, head, bot);
        }
      }
    }
    if (bot.weapon.mag === 0) {
      bot.weapon.reloading = bot.weapon.def.reload;
      bot.weapon.mag = 0;
    }
    bot.state = 'engage';
    bot.group.position.set(bot.pos.x, 0, bot.pos.z);
    bot.group.rotation.y = bot.yaw;
    return;
  }
  if (bot.reaction > 0) bot.reaction -= dt;

  // --- objective: plant / defuse when on site and undisturbed.
  if (ctx.phase === 'live' && bot.visibleEnemy === null) {
    if (bot.team === 't' && bot.role === 'carrier' && !ctx.planted && !ctx.spikePlanted) {
      const site = MAP.sites[bot.targetSite];
      const d = Math.hypot(bot.pos.x - site.x, bot.pos.z - site.z);
      if (d < site.r - 0.5) {
        bot.state = 'plant';
        bot.plantProgress += dt;
        if (bot.plantProgress >= 3.0) {
          bot.plantProgress = 0;
          onPlant(bot, bot.targetSite);
        }
        return;
      }
    }
    if (bot.team === 'ct' && ctx.spikePlanted) {
      const site = MAP.sites[ctx.plantedSite];
      const d = Math.hypot(bot.pos.x - site.x, bot.pos.z - site.z);
      if (d < site.r - 0.5) {
        bot.state = 'defuse';
        bot.defuseProgress += dt;
        if (bot.defuseProgress >= 5.0) {
          bot.defuseProgress = 0;
          onDefuse(bot);
        }
        return;
      }
    }
  }
  bot.plantProgress = 0;
  bot.defuseProgress = 0;

  // --- movement: follow the waypoint path; hold at the destination.
  if (bot.state === 'hold' && time < bot.holdUntil) {
    bot.speed = 0;
    bot.group.rotation.y = bot.yaw;
    return;
  }
  if (!bot.path.length || bot.pathIdx >= bot.path.length) {
    // Choose a destination: attackers push their site, defenders
    // rotate between sites or answer noise / the planted spike.
    let goal;
    if (ctx.spikePlanted && bot.team === 'ct') goal = MAP.sites[ctx.plantedSite];
    else if (bot.noise && time - bot.noise.at < 4) goal = { x: bot.noise.x, z: bot.noise.z };
    else if (bot.team === 't') goal = MAP.sites[bot.targetSite];
    else goal = MAP.sites[bot.targetSite];
    const from = nearestWaypoint(bot.pos.x, bot.pos.z);
    const to = nearestWaypoint(goal.x, goal.z);
    const idxPath = findPath(from, to);
    bot.path = idxPath.map((i) => MAP.waypoints[i]);
    bot.path.push({ x: goal.x, z: goal.z });
    bot.pathIdx = 0;
    bot.state = 'route';
  }
  const target = bot.path[bot.pathIdx];
  const dx = target.x - bot.pos.x;
  const dz = target.z - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.5) {
    bot.pathIdx += 1;
    if (bot.pathIdx >= bot.path.length) {
      bot.state = 'hold';
      bot.holdUntil = time + rng.range(2.5, 6);
      bot.yaw = rng.range(0, Math.PI * 2);
      if (bot.team === 'ct') bot.targetSite = bot.targetSite === 'A' ? 'B' : 'A';
    }
    return;
  }
  const speed = bot.team === 't' ? BOT.runSpeed : BOT.walkSpeed;
  bot.yaw = Math.atan2(-dx, -dz);
  bot.pos.x += (dx / dist) * speed * dt;
  bot.pos.z += (dz / dist) * speed * dt;
  const p = { x: bot.pos.x, z: bot.pos.z };
  world.resolveCircle(p, 0.38);
  bot.pos.x = p.x;
  bot.pos.z = p.z;
  bot.speed = speed;
  bot.group.position.set(bot.pos.x, 0, bot.pos.z);
  bot.group.rotation.y = bot.yaw;
  // Walk bob.
  bot.group.children[0].position.y = 0.95 + Math.abs(Math.sin(time * 9 + bot.id)) * 0.03;
}

export function damageBot(bot, amount) {
  if (!bot.alive) return false;
  let remaining = amount;
  if (bot.armor > 0) {
    const absorbed = Math.min(bot.armor, amount * 0.5);
    bot.armor -= absorbed;
    remaining = amount - absorbed;
  }
  bot.health -= remaining;
  if (bot.health <= 0) {
    bot.health = 0;
    bot.alive = false;
    bot.state = 'dead';
    bot.group.rotation.x = -Math.PI / 2;
    bot.group.position.y = 0.25;
    return true;
  }
  return false;
}

export function resetBot(bot, spawn, rng) {
  bot.pos.set(spawn.x, 0, spawn.z);
  bot.group.position.set(spawn.x, 0, spawn.z);
  bot.group.rotation.set(0, 0, 0);
  bot.health = 100;
  bot.armor = 0;
  bot.alive = true;
  bot.state = 'route';
  bot.path = [];
  bot.pathIdx = 0;
  bot.visibleEnemy = null;
  bot.reaction = 0;
  bot.burstLeft = 0;
  bot.burstPause = 0;
  bot.plantProgress = 0;
  bot.defuseProgress = 0;
  bot.noise = null;
  bot.targetSite = rng.chance(0.5) ? 'A' : 'B';
  bot.weapon.mag = bot.weapon.def.mag;
  bot.weapon.reserve = bot.weapon.def.reserve;
  bot.weapon.reloading = 0;
  bot.weapon.cooldown = 0;
  bot.yaw = spawn.x < 0 ? -Math.PI / 2 : Math.PI / 2;
}

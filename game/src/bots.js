// bots.js — the two bot squads and their tactics.
//
// Defenders (Jackals) hold the sites, rotate to a planted charge and
// defuse. Attackers (Vanguard) follow routes to a site, push together,
// and plant. Every bot perceives on a staggered tick: line of sight,
// field of view and hearing, then picks one of six states — hold, route,
// engage, investigate, plant, defuse — and acts on it. Bots fire in
// bursts with a reaction delay, so a fight is a duel, not a laser.

import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { moveCircle, segmentBlocked } from './collision.js';
import { WALLS, WAYPOINTS, WAY_EDGES, ATK_SPAWN, DEF_SPAWN, SITES, nearestWaypoint, siteAt } from './map.js';
import { botShootAtPlayer, botShootAtBot } from './combat.js';
import { PLANT_TIME, DEFUSE_TIME } from './state.js';

const ATK_NAMES = ['Sable', 'Rook', 'Ivy'];
const DEF_NAMES = ['Dune', 'Viper', 'Havoc', 'Ghost', 'Fang'];
const TEAM_COLOR = { atk: 0x2f6fb5, def: 0xb5502a };
const VISION_RANGE = 42;
const VISION_FOV = 1.9; // radians, ~109 degrees
const BOT_SPEED = 3.4;
const BOT_RADIUS = 0.4;

// BFS over the waypoint graph. Returns a list of {x, z} to walk.
export function findPath(fromX, fromZ, toX, toZ) {
  const start = nearestWaypoint(fromX, fromZ);
  const goal = nearestWaypoint(toX, toZ);
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const [a, b] of WAY_EDGES) {
      const next = a === cur ? b : b === cur ? a : -1;
      if (next >= 0 && prev[next] < 0) {
        prev[next] = cur;
        queue.push(next);
      }
    }
  }
  if (prev[goal] < 0) return [{ x: toX, z: toZ }];
  const nodes = [];
  let cur = goal;
  while (cur !== start) {
    nodes.unshift(WAYPOINTS[cur]);
    cur = prev[cur];
  }
  nodes.push({ x: toX, z: toZ });
  return nodes;
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

function buildBotMesh(scene, team) {
  const color = TEAM_COLOR[team];
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2620, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a184, roughness: 0.8 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.18), dark);
  legL.position.set(-0.13, 0.38, 0);
  const legR = legL.clone();
  legR.position.x = 0.13;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.32), cloth);
  torso.position.y = 1.12;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.4, 0.36), dark);
  vest.position.y = 1.12;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.y = 1.66;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.05), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.6 }));
  visor.position.set(0, 1.68, 0.16);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.85), dark);
  gun.position.set(0.2, 1.25, 0.4);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 0.34), new THREE.MeshStandardMaterial({ color: team === 'atk' ? 0x9fd0ff : 0xffb08a, roughness: 0.6 }));
  stripe.position.y = 1.42;

  g.add(legL, legR, torso, vest, head, visor, gun, stripe);
  g.traverse((o) => { o.castShadow = true; });
  torso.userData.part = 'body';
  head.userData.part = 'head';
  scene.add(g);
  return { group: g, legL, legR, torso, head, gun };
}

export function createBots(state, scene) {
  const bots = [];
  const partMeshes = [];
  const mk = (team, name, spawn, weapon) => {
    const mesh = buildBotMesh(scene, team);
    const bot = {
      id: `${team}-${name}`, team, name,
      x: spawn.x, z: spawn.z, yaw: spawn.yaw, hp: 100, alive: true,
      weapon, mag: WEAPONS[weapon].mag, reserve: 60, reloading: 0,
      state: 'hold', path: [], pathIdx: 0, holdPos: { x: spawn.x, z: spawn.z },
      holdUntil: 0, target: null, targetIsPlayer: false, lastSeen: null,
      lastSeenAt: -10, reactAt: 0, burstLeft: 0, nextShot: 0, burstPauseUntil: 0,
      perceiveAt: Math.random() * 0.15, hearAt: -10, speed: BOT_SPEED,
      carryingBomb: false, planting: 0, defusing: 0, walkPhase: Math.random() * 6,
      strafeDir: 1, strafeUntil: 0, mesh, kills: 0, deathAt: -10, damageAt: -10,
    };
    mesh.torso.userData.bot = bot;
    mesh.head.userData.bot = bot;
    mesh.group.position.set(spawn.x, 0, spawn.z);
    mesh.group.rotation.y = spawn.yaw;
    partMeshes.push(mesh.torso, mesh.head);
    bots.push(bot);
    return bot;
  };
  ATK_NAMES.forEach((n, i) => mk('atk', n, ATK_SPAWN[i + 1], i === 0 ? 'shotgun' : 'rifle'));
  DEF_NAMES.forEach((n, i) => mk('def', n, DEF_SPAWN[i], i === 3 ? 'shotgun' : 'rifle'));
  state.bots = bots;
  return { bots, partMeshes };
}

/** Place every bot at its spawn and assign its opening job for the round. */
export function resetBotsForRound(state) {
  const sitePick = Math.random() < 0.5 ? SITES[0] : SITES[1];
  const atk = state.bots.filter((b) => b.team === 'atk');
  const def = state.bots.filter((b) => b.team === 'def');
  atk.forEach((b, i) => {
    const s = ATK_SPAWN[i + 1];
    b.x = s.x; b.z = s.z; b.yaw = s.yaw;
    b.holdPos = { x: s.x, z: s.z };
    b.state = 'route';
    // Two push the picked site, one takes mid.
    const goal = i < 2 ? sitePick : { x: 0, z: 0 };
    b.path = findPath(b.x, b.z, goal.x, goal.z);
    b.pathIdx = 0;
  });
  def.forEach((b, i) => {
    const s = DEF_SPAWN[i];
    b.x = s.x; b.z = s.z; b.yaw = s.yaw;
    // Two hold A, two hold B, one roams mid.
    const site = i < 2 ? SITES[0] : i < 4 ? SITES[1] : null;
    if (site) {
      b.holdPos = { x: site.x + (Math.random() - 0.5) * 4, z: site.z + (Math.random() - 0.5) * 4 };
      b.state = 'hold';
      b.holdUntil = Infinity;
      b.path = [];
    } else {
      b.state = 'route';
      b.path = findPath(b.x, b.z, 0, 0);
      b.pathIdx = 0;
    }
  });
  // The charge starts with the player; an ally takes it if the player falls.
  state.bomb.carrier = 'player';
}

/** A living enemy the bot can see, or null. Checks range, FOV and walls. */
function visibleEnemy(ctx, bot) {
  const { state } = ctx;
  const candidates = [];
  if (bot.team === 'def' && state.player.alive) {
    candidates.push({ ref: state.player, isPlayer: true, x: state.player.x, z: state.player.z, hp: state.player.hp });
  }
  for (const other of state.bots) {
    if (other.team !== bot.team && other.alive) {
      candidates.push({ ref: other, isPlayer: false, x: other.x, z: other.z, hp: other.hp });
    }
  }
  let best = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const dx = c.x - bot.x;
    const dz = c.z - bot.z;
    const d = Math.hypot(dx, dz);
    if (d > VISION_RANGE || d >= bestD) continue;
    // Inside the vision cone, or very close (heard or bumped into).
    const ang = Math.atan2(dx, dz);
    let diff = ang - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > VISION_FOV / 2 && d > 6) continue;
    if (segmentBlocked(bot.x, bot.z, c.x, c.z, WALLS, 1.4)) continue;
    best = c;
    bestD = d;
  }
  return best;
}

export function updateBots(ctx, dt) {
  const { state } = ctx;
  for (const bot of state.bots) {
    if (!bot.alive) {
      updateDeadBot(bot, dt);
      continue;
    }
    // Perception runs on a staggered tick, not every frame.
    bot.perceiveAt -= dt;
    if (bot.perceiveAt <= 0) {
      bot.perceiveAt = 0.15 + Math.random() * 0.05;
      perceive(ctx, bot);
    }
    switch (bot.state) {
      case 'engage': updateEngage(ctx, bot, dt); break;
      case 'route': updateRoute(ctx, bot, dt); break;
      case 'hold': updateHold(ctx, bot, dt); break;
      case 'investigate': updateInvestigate(ctx, bot, dt); break;
      case 'plant': updatePlant(ctx, bot, dt); break;
      case 'defuse': updateDefuse(ctx, bot, dt); break;
      default: updateHold(ctx, bot, dt);
    }
    syncBotMesh(bot, dt);
  }
}

function perceive(ctx, bot) {
  const { state } = ctx;
  const seen = visibleEnemy(ctx, bot);
  if (seen) {
    if (!bot.target) bot.reactAt = state.time + 0.35 + Math.random() * 0.35;
    bot.target = seen.ref;
    bot.targetIsPlayer = seen.isPlayer;
    bot.lastSeen = { x: seen.x, z: seen.z };
    bot.lastSeenAt = state.time;
    if (bot.state !== 'engage' && bot.state !== 'defuse') bot.state = 'engage';
    return;
  }
  // Heard a shot recently? Go look, unless already busy with the bomb.
  if (state.lastShot && state.time - state.lastShot.at < 1.2 && bot.state !== 'plant' && bot.state !== 'defuse') {
    const d = Math.hypot(state.lastShot.x - bot.x, state.lastShot.z - bot.z);
    if (d < 26 && d > 4) {
      bot.state = 'investigate';
      bot.path = findPath(bot.x, bot.z, state.lastShot.x, state.lastShot.z);
      bot.pathIdx = 0;
      bot.hearAt = state.time;
    }
  }
  // Lost the target: after 2.5 s of nothing, go back to the job.
  if (bot.target && state.time - bot.lastSeenAt > 2.5) {
    bot.target = null;
    if (bot.state === 'engage') {
      if (bot.team === 'def' && state.bomb.state === 'planted') {
        bot.state = 'route';
        bot.path = findPath(bot.x, bot.z, state.bomb.x, state.bomb.z);
        bot.pathIdx = 0;
      } else {
        bot.state = bot.team === 'def' ? 'hold' : 'route';
        if (bot.state === 'route') {
          const site = SITES[Math.floor(Math.random() * SITES.length)];
          bot.path = findPath(bot.x, bot.z, site.x, site.z);
          bot.pathIdx = 0;
        }
      }
    }
  }
}

/** Walk the current path; returns true on arrival. */
function walkPath(bot, dt, speed) {
  if (bot.pathIdx >= bot.path.length) return true;
  const node = bot.path[bot.pathIdx];
  const dx = node.x - bot.x;
  const dz = node.z - bot.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.6) {
    bot.pathIdx++;
    return bot.pathIdx >= bot.path.length;
  }
  const want = Math.atan2(dx, dz);
  bot.yaw = angleLerp(bot.yaw, want, dt * 6);
  const step = speed * dt;
  const nx = bot.x + (dx / d) * step;
  const nz = bot.z + (dz / d) * step;
  const pos = { x: nx, z: nz };
  moveCircle(pos, 0, 0, BOT_RADIUS, WALLS);
  // If a wall stopped us, sidestep: the next tick re-aims at the node.
  bot.x = pos.x;
  bot.z = pos.z;
  bot.walkPhase += dt * speed * 2.2;
  return false;
}

function updateRoute(ctx, bot, dt) {
  if (walkPath(bot, dt, bot.speed)) {
    bot.state = 'hold';
    bot.holdPos = { x: bot.x, z: bot.z };
    bot.holdUntil = ctx.state.time + 2 + Math.random() * 3;
  }
  maybePlant(ctx, bot);
}

function updateHold(ctx, bot, dt) {
  const { state } = ctx;
  // Drift back to the hold position if pushed off it.
  const dx = bot.holdPos.x - bot.x;
  const dz = bot.holdPos.z - bot.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.8) {
    const want = Math.atan2(dx, dz);
    bot.yaw = angleLerp(bot.yaw, want, dt * 5);
    const step = bot.speed * 0.7 * dt;
    const pos = { x: bot.x + (dx / d) * step, z: bot.z + (dz / d) * step };
    moveCircle(pos, 0, 0, BOT_RADIUS, WALLS);
    bot.x = pos.x;
    bot.z = pos.z;
    bot.walkPhase += dt * 3;
  } else if (state.time > bot.holdUntil && bot.team === 'def' && state.bomb.state !== 'planted') {
    // Roaming defender: pick a fresh lane to watch.
    bot.state = 'route';
    const site = SITES[Math.floor(Math.random() * SITES.length)];
    bot.path = findPath(bot.x, bot.z, site.x + (Math.random() - 0.5) * 5, site.z + (Math.random() - 0.5) * 5);
    bot.pathIdx = 0;
  }
  maybePlant(ctx, bot);
  maybeDefuse(ctx, bot);
}

function updateInvestigate(ctx, bot, dt) {
  if (walkPath(bot, dt, bot.speed * 1.1)) {
    bot.state = 'hold';
    bot.holdPos = { x: bot.x, z: bot.z };
    bot.holdUntil = ctx.state.time + 2.5;
  }
}

function updateEngage(ctx, bot, dt) {
  const { state } = ctx;
  const t = bot.target;
  if (!t || (t.hp !== undefined && t.hp <= 0) || (t.alive === false)) {
    bot.target = null;
    bot.state = bot.team === 'def' ? 'hold' : 'route';
    return;
  }
  const tx = t.x;
  const tz = t.z;
  const dx = tx - bot.x;
  const dz = tz - bot.z;
  const dist = Math.hypot(dx, dz);
  // Face the target, strafe sideways to stay hard to hit.
  const want = Math.atan2(dx, dz);
  bot.yaw = angleLerp(bot.yaw, want, dt * 10);
  if (state.time > bot.strafeUntil) {
    bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
    bot.strafeUntil = state.time + 0.7 + Math.random() * 0.9;
  }
  const strafe = bot.strafeDir * bot.speed * 0.45;
  const sx = Math.cos(bot.yaw) * strafe;
  const sz = -Math.sin(bot.yaw) * strafe;
  // Close in when far, hold ground at mid range, back off when too close.
  let approach = 0;
  if (dist > 16) approach = bot.speed * 0.8;
  else if (dist < 5) approach = -bot.speed * 0.5;
  const mx = Math.sin(bot.yaw) * approach + sx;
  const mz = Math.cos(bot.yaw) * approach + sz;
  const pos = { x: bot.x + mx * dt, z: bot.z + mz * dt };
  moveCircle(pos, 0, 0, BOT_RADIUS, WALLS);
  bot.x = pos.x;
  bot.z = pos.z;
  bot.walkPhase += dt * 4;

  // Fire in bursts once the reaction delay has passed.
  if (state.time < bot.reactAt || state.phase !== 'live') return;
  if (bot.reloading > 0) {
    bot.reloading -= dt;
    if (bot.reloading <= 0) {
      bot.mag = WEAPONS[bot.weapon].mag;
      bot.reserve = Math.max(0, bot.reserve - WEAPONS[bot.weapon].mag);
    }
    return;
  }
  if (bot.mag <= 0) {
    bot.reloading = WEAPONS[bot.weapon].reloadTime;
    return;
  }
  if (state.time < bot.burstPauseUntil) return;
  if (bot.burstLeft <= 0) {
    if (state.time < bot.nextShot) return;
    bot.burstLeft = 3 + Math.floor(Math.random() * 3);
  }
  if (state.time >= bot.nextShot) {
    bot.nextShot = state.time + WEAPONS[bot.weapon].rate;
    bot.burstLeft--;
    bot.mag--;
    if (bot.burstLeft <= 0) bot.burstPauseUntil = state.time + 0.6 + Math.random() * 0.7;
    const accuracy = Math.max(0.15, (bot.team === 'def' ? 0.34 : 0.4) - dist * 0.006);
    if (bot.targetIsPlayer) botShootAtPlayer(ctx, bot, accuracy);
    else botShootAtBot(ctx, bot, bot.target);
  }
}

/** The carrier bot reaches a site and plants. */
function maybePlant(ctx, bot) {
  const { state } = ctx;
  if (bot.team !== 'atk' || !bot.carryingBomb || state.bomb.state !== 'carried') return;
  const site = siteAt(bot.x, bot.z);
  if (!site) {
    // Walk to the nearest site.
    if (bot.state !== 'route' || bot.path.length === 0) {
      const near = SITES.reduce((a, b) => (Math.hypot(a.x - bot.x, a.z - bot.z) < Math.hypot(b.x - bot.x, b.z - bot.z) ? a : b));
      bot.state = 'route';
      bot.path = findPath(bot.x, bot.z, near.x, near.z);
      bot.pathIdx = 0;
    }
    return;
  }
  bot.state = 'plant';
  bot.planting = 0;
}

function updatePlant(ctx, bot, dt) {
  const { state } = ctx;
  if (state.bomb.state !== 'carried') { bot.state = 'hold'; return; }
  bot.planting += dt;
  state.bomb.progress = bot.planting / PLANT_TIME;
  if (bot.planting >= PLANT_TIME) {
    state.bomb.state = 'planted';
    state.bomb.site = siteAt(bot.x, bot.z)?.id ?? 'A';
    state.bomb.x = bot.x;
    state.bomb.z = bot.z;
    state.bomb.timer = 35;
    state.bomb.progress = 0;
    bot.carryingBomb = false;
    bot.planting = 0;
    ctx.announce?.(`Charge planted at Site ${state.bomb.site} by ${bot.name}!`);
    // Defenders rotate to the site; attackers hold it.
    for (const other of state.bots) {
      if (!other.alive) continue;
      if (other.team === 'def') {
        other.state = 'route';
        other.path = findPath(other.x, other.z, state.bomb.x, state.bomb.z);
        other.pathIdx = 0;
        other.target = null;
      } else {
        other.state = 'hold';
        other.holdPos = { x: state.bomb.x + (Math.random() - 0.5) * 6, z: state.bomb.z + (Math.random() - 0.5) * 6 };
        other.holdUntil = Infinity;
      }
    }
  }
}

/** A defender standing on the planted charge defuses it. */
function maybeDefuse(ctx, bot) {
  const { state } = ctx;
  if (bot.team !== 'def' || state.bomb.state !== 'planted') return;
  const d = Math.hypot(state.bomb.x - bot.x, state.bomb.z - bot.z);
  if (d < 1.6) {
    bot.state = 'defuse';
    bot.defusing = 0;
  } else if (bot.state === 'hold' || bot.state === 'route') {
    bot.state = 'route';
    bot.path = findPath(bot.x, bot.z, state.bomb.x, state.bomb.z);
    bot.pathIdx = 0;
  }
}

function updateDefuse(ctx, bot, dt) {
  const { state } = ctx;
  if (state.bomb.state !== 'planted') { bot.state = 'hold'; bot.defusing = 0; return; }
  const d = Math.hypot(state.bomb.x - bot.x, state.bomb.z - bot.z);
  if (d > 2) {
    bot.defusing = 0;
    bot.state = 'route';
    bot.path = findPath(bot.x, bot.z, state.bomb.x, state.bomb.z);
    bot.pathIdx = 0;
    return;
  }
  bot.defusing += dt;
  state.bomb.progress = bot.defusing / DEFUSE_TIME;
  if (bot.defusing >= DEFUSE_TIME) {
    state.bomb.state = 'defused';
    state.bomb.progress = 0;
    bot.defusing = 0;
    ctx.onBombDefused?.();
  }
}

/** Hand the charge to a living attacker when its carrier falls. */
export function transferBomb(state) {
  if (state.bomb.state !== 'carried') return;
  const alive = state.bots.filter((b) => b.team === 'atk' && b.alive);
  if (state.player.alive) {
    state.bomb.carrier = 'player';
    return;
  }
  if (alive.length === 0) {
    state.bomb.state = 'gone';
    state.bomb.carrier = null;
    return;
  }
  const next = alive[Math.floor(Math.random() * alive.length)];
  next.carryingBomb = true;
  state.bomb.carrier = next.id;
  next.state = 'route';
  const near = SITES.reduce((a, b) => (Math.hypot(a.x - next.x, a.z - next.z) < Math.hypot(b.x - next.x, b.z - next.z) ? a : b));
  next.path = findPath(next.x, next.z, near.x, near.z);
  next.pathIdx = 0;
}

function updateDeadBot(bot, dt) {
  // Fall over once, then lie still.
  const g = bot.mesh.group;
  if (g.rotation.z > -Math.PI / 2 + 0.05) {
    g.rotation.z = Math.max(-Math.PI / 2, g.rotation.z - dt * 6);
    g.position.y = Math.max(-0.4, g.position.y - dt * 0.5);
  }
}

function syncBotMesh(bot, dt) {
  const { group, legL, legR } = bot.mesh;
  group.position.set(bot.x, Math.abs(Math.sin(bot.walkPhase)) * 0.04, bot.z);
  group.rotation.y = bot.yaw;
  if (group.rotation.z !== 0) group.rotation.z = 0;
  const swing = Math.sin(bot.walkPhase) * 0.45;
  legL.rotation.x = swing;
  legR.rotation.x = -swing;
}

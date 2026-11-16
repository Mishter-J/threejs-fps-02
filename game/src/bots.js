// bots.js — the nine bots. Two teams, three roles each, one brain:
//   rusher  — follows an attack route toward a site, waypoint by waypoint.
//   holder  — walks to a hold spot near a site and watches an angle.
//   carrier — the Vanguard bot carrying the charge: routes to the nearest
//             site, plants, then defends the planted bomb.
// Every bot sees through the same line-of-sight test as the bullets, hears
// gunshots (noise events pull them to investigate), and shoots in bursts
// with a reaction delay — they do not snap to the player. Bot brains think
// at 10 Hz; steering and firing run in the 60 Hz fixed step.
import * as THREE from 'three';
import { moveCircle, segmentBlocked, clampBounds, insideAny } from './collision.js';
import { botShoot } from './combat.js';
import { DEFUSE_SECONDS, PLANT_SECONDS } from './state.js';

const BOT_SPEED = 3.4;
const BOT_RADIUS = 0.45;
const THINK_EVERY = 6; // fixed steps between AI thinks (10 Hz)
const SEE_DIST = 40;
const HEAR_RADIUS = 26;

const VANGUARD_NAMES = ['Rook', 'Sable', 'Wren', 'Pike'];
const JACKAL_NAMES = ['Havoc', 'Fang', 'Bramble', 'Onyx', 'Vex'];

const VANGUARD_COLOR = 0x2f6fd0;
const JACKAL_COLOR = 0xd0502a;

let nextId = 1;

function buildBotMesh(scene, team) {
  const color = team === 'vanguard' ? VANGUARD_COLOR : JACKAL_COLOR;
  const group = new THREE.Group();
  const torsoMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x23232a, roughness: 0.85 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a06b, roughness: 0.9 });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const add = (w, h, d, x, y, z, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    group.add(m);
    return m;
  };
  add(0.5, 0.62, 0.3, 0, 1.06, 0, torsoMat); // torso
  add(0.34, 0.3, 0.3, 0, 1.55, 0, skinMat); // head
  add(0.36, 0.1, 0.32, 0, 1.72, 0, darkMat); // helmet
  add(0.2, 0.62, 0.22, -0.14, 0.35, 0, darkMat); // left leg
  add(0.2, 0.62, 0.22, 0.14, 0.35, 0, darkMat); // right leg
  add(0.08, 0.08, 0.75, 0.2, 1.18, -0.28, darkMat); // rifle
  scene.add(group);
  return group;
}

export function spawnBots(S, W) {
  // Remove the previous round's meshes.
  for (const bot of S.bots) {
    if (bot.group) W.scene.remove(bot.group);
  }
  S.bots.length = 0;
  nextId = 1;
  const routes = W.routes;
  const mk = (team, name, spawn, role, route) => {
    const bot = {
      id: 'bot' + nextId++,
      team,
      name,
      role,
      route: route.slice(),
      routeKey: '',
      wp: 0,
      pos: { x: spawn[0], y: 0, z: spawn[1] },
      yaw: team === 'vanguard' ? -Math.PI / 2 : Math.PI / 2,
      hp: 100,
      alive: true,
      weapon: role === 'holder' ? 'lr50' : 'ar9',
      speed: BOT_SPEED,
      // AI state, all in simulation time.
      target: null, // { kind: 'player' | 'bot', id } currently engaged
      reactAt: 0, // when the bot may first fire at its target
      burstLeft: 0,
      nextBurstAt: 0,
      nextShotAt: 0,
      lastSeen: null, // { x, z, t } last known enemy position
      investigate: null, // { x, z, t } noise to check out
      holdSpot: null,
      plantT: 0,
      lastHitAt: -99,
      lastHitFrom: null,
      // Stuck recovery: if the bot barely moves for ~1.2 s while heading
      // somewhere, it sidesteps around the obstacle instead of pushing
      // the same wall forever.
      stuckSteps: 0,
      px: spawn[0],
      pz: spawn[1],
      detour: null,
      detourT: 0,
      group: null,
    };
    bot.group = buildBotMesh(W.scene, team);
    bot.group.position.set(spawn[0], 0, spawn[1]);
    S.bots.push(bot);
    return bot;
  };
  // Vanguard: two rushers (mid, A), one rusher (B), one carrier (mid).
  mk('vanguard', VANGUARD_NAMES[0], W.spawns.vanguard[1], 'rusher', routes.attackA);
  mk('vanguard', VANGUARD_NAMES[1], W.spawns.vanguard[2], 'rusher', routes.attackB);
  mk('vanguard', VANGUARD_NAMES[2], W.spawns.vanguard[3], 'rusher', routes.attackMid);
  mk('vanguard', VANGUARD_NAMES[3], W.spawns.vanguard[4], 'carrier', routes.attackMid);
  // Jackals: two holders at A, two at B, one mid holder.
  const holdsA = routes.holdA;
  const holdsB = routes.holdB;
  const h1 = mk('jackals', JACKAL_NAMES[0], W.spawns.jackals[0], 'holder', []);
  h1.holdSpot = { x: holdsA[0][0], z: holdsA[0][1] };
  const h2 = mk('jackals', JACKAL_NAMES[1], W.spawns.jackals[1], 'holder', []);
  h2.holdSpot = { x: holdsA[1][0], z: holdsA[1][1] };
  const h3 = mk('jackals', JACKAL_NAMES[2], W.spawns.jackals[2], 'holder', []);
  h3.holdSpot = { x: holdsB[0][0], z: holdsB[0][1] };
  const h4 = mk('jackals', JACKAL_NAMES[3], W.spawns.jackals[3], 'holder', []);
  h4.holdSpot = { x: holdsB[1][0], z: holdsB[1][1] };
  const h5 = mk('jackals', JACKAL_NAMES[4], W.spawns.jackals[4], 'holder', []);
  h5.holdSpot = { x: routes.holdMid[0][0], z: routes.holdMid[0][1] };
}

// Can `bot` see the point (tx, ty, tz)? Distance, field of view and a real
// line-of-sight test against the map. The player crouching behind a crate
// is genuinely hidden.
export function canSee(S, W, bot, tx, ty, tz) {
  const dx = tx - bot.pos.x;
  const dz = tz - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > SEE_DIST) return false;
  // Field of view: 110 degrees around the bot's facing.
  const facingX = -Math.sin(bot.yaw);
  const facingZ = -Math.cos(bot.yaw);
  const dot = (dx * facingX + dz * facingZ) / (dist || 1);
  if (dot < 0.35) return false;
  if (segmentBlocked(bot.pos.x, 1.45, bot.pos.z, tx, ty, tz, W.colliders)) return false;
  return true;
}

// Find the nearest visible enemy for a bot. Enemies are the player and the
// other team's bots; the player counts double when close, so bots do not
// ignore the human while bot fights happen around them.
function acquireTarget(S, W, bot) {
  let best = null;
  let bestScore = Infinity;
  // Only Jackals hunt the player: Vanguard bots are teammates and never
  // treat the human as a target. (A friendly-fire bug lived here.)
  if (bot.team === 'jackals' && S.player.alive) {
    const p = S.player;
    const eyeY = p.crouch ? 1.15 : 1.5;
    if (canSee(S, W, bot, p.pos.x, eyeY, p.pos.z)) {
      const d = Math.hypot(p.pos.x - bot.pos.x, p.pos.z - bot.pos.z);
      best = { kind: 'player', x: p.pos.x, y: eyeY, z: p.pos.z, speed: Math.hypot(p.vel.x, p.vel.z) };
      bestScore = d * 0.5; // the player is the priority target
    }
  }
  for (const other of S.bots) {
    if (!other.alive || other.team === bot.team) continue;
    if (!canSee(S, W, bot, other.pos.x, 1.4, other.pos.z)) continue;
    const d = Math.hypot(other.pos.x - bot.pos.x, other.pos.z - bot.pos.z);
    if (d < bestScore) {
      bestScore = d;
      best = { kind: 'bot', id: other.id, x: other.pos.x, y: 1.4, z: other.pos.z, speed: other.speed };
    }
  }
  return best;
}

// The 10 Hz think: pick a target, react to noise, choose a destination.
function think(S, W, bot) {
  if (S.bomb.state === 'planted' && bot.team === 'jackals') {
    // The bomb is down: defenders abandon their holds and converge.
    // (Set once — resetting the route every think would ping-pong the bot.)
    if (bot.routeKey !== 'defuse') {
      bot.routeKey = 'defuse';
      bot.route = [[W.sites[S.bomb.site].x, W.sites[S.bomb.site].z]];
      bot.wp = 0;
      bot.role = 'rusher';
    }
  }
  if (S.bomb.carrier === bot.id && S.bomb.state === 'carried') {
    bot.role = 'carrier';
    // Route to the nearer site, again set once, not every think.
    const dA = Math.hypot(W.sites.A.x - bot.pos.x, W.sites.A.z - bot.pos.z);
    const dB = Math.hypot(W.sites.B.x - bot.pos.x, W.sites.B.z - bot.pos.z);
    const east = bot.pos.x > 0;
    const key = (east ? 'carryE' : 'carryW') + (dA < dB ? 'A' : 'B');
    if (bot.routeKey !== key) {
      bot.routeKey = key;
      // East of the mid wall the bot takes the gap route around the lane
      // divider (x = 16 clears both dividers); west of it, the full
      // attack route from spawn is the right way in.
      bot.route = east
        ? dA < dB
          ? [[16, -9], [16, -15], [20, -15]]
          : [[16, 9], [16, 15], [20, 15]]
        : dA < dB
          ? W.routes.attackA
          : W.routes.attackB;
      bot.wp = 0;
    }
  }
  const target = acquireTarget(S, W, bot);
  if (target) {
    if (!bot.target) bot.reactAt = S.time + 0.45 + Math.random() * 0.45;
    bot.target = target;
    bot.lastSeen = { x: target.x, z: target.z, t: S.time };
  } else if (bot.target) {
    // Lost sight: keep the last known position for a few seconds.
    bot.target = null;
  }
  // Hearing: a recent gunshot within earshot pulls the bot to look.
  if (!bot.target) {
    for (let i = S.noise.length - 1; i >= 0; i--) {
      const n = S.noise[i];
      if (S.time - n.t > 3) continue;
      const d = Math.hypot(n.x - bot.pos.x, n.z - bot.pos.z);
      if (d < HEAR_RADIUS) {
        bot.investigate = { x: n.x, z: n.z, t: S.time };
        break;
      }
    }
  }
  if (bot.investigate && S.time - bot.investigate.t > 6) bot.investigate = null;
}

// Steer toward (x, z) at bot speed; returns true on arrival.
function steer(S, W, bot, x, z, dt) {
  const dx = x - bot.pos.x;
  const dz = z - bot.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.6) return true;
  const vx = (dx / d) * bot.speed;
  const vz = (dz / d) * bot.speed;
  moveCircle(bot.pos, BOT_RADIUS, vx * dt, vz * dt, W.colliders);
  clampBounds(bot.pos, BOT_RADIUS, W.bounds);
  bot.yaw = Math.atan2(-vx, -vz);
  return false;
}

// One fixed step for every bot. `stepIndex` counts fixed steps so the
// 10 Hz think runs every sixth step.
export function stepBots(S, W, dt, stepIndex) {
  for (const bot of S.bots) {
    if (!bot.alive) continue;
    if (stepIndex % THINK_EVERY === 0) think(S, W, bot);

    // --- planting / defusing ------------------------------------------
    if (bot.role === 'carrier' && S.bomb.state === 'carried' && S.bomb.carrier === bot.id) {
      const site = nearestSite(S, W, bot.pos.x, bot.pos.z);
      if (site && Math.abs(bot.pos.x - site.x) < 3.5 && Math.abs(bot.pos.z - site.z) < 3.5) {
        bot.plantT += dt;
        if (bot.plantT >= PLANT_SECONDS) {
          bot.plantT = 0;
          W.plantBomb(site.key);
        }
        syncMesh(bot);
        continue;
      }
    }
    if (S.bomb.state === 'planted' && bot.team === 'jackals') {
      const s = W.sites[S.bomb.site];
      if (Math.abs(bot.pos.x - s.x) < 3 && Math.abs(bot.pos.z - s.z) < 3) {
        S.bomb.defuseT += dt;
        S.bomb.defuser = bot.name;
        if (S.bomb.defuseT >= DEFUSE_SECONDS) W.defuseBomb();
        syncMesh(bot);
        continue;
      }
    }

    // --- combat --------------------------------------------------------
    if (bot.target && S.time >= bot.reactAt) {
      const t = bot.target;
      // Face the target and fire in bursts of 3-5 with pauses.
      bot.yaw = Math.atan2(-(t.x - bot.pos.x), -(t.z - bot.pos.z));
      if (bot.burstLeft <= 0 && S.time >= bot.nextBurstAt) {
        bot.burstLeft = 3 + Math.floor(Math.random() * 3);
        bot.nextShotAt = S.time;
      }
      if (bot.burstLeft > 0 && S.time >= bot.nextShotAt) {
        bot.burstLeft -= 1;
        bot.nextShotAt = S.time + 0.13;
        if (bot.burstLeft === 0) bot.nextBurstAt = S.time + 0.7 + Math.random() * 0.7;
        const isPlayer = t.kind === 'player';
        const speed = isPlayer
          ? Math.hypot(S.player.vel.x, S.player.vel.z)
          : BOT_SPEED;
        // Re-acquire the target's live position each shot.
        if (isPlayer && S.player.alive) {
          botShoot(S, W, bot, S.player.pos.x, S.player.crouch ? 1.15 : 1.5, S.player.pos.z, true, speed);
        } else if (!isPlayer) {
          const tb = S.bots.find((b) => b.id === t.id);
          if (tb && tb.alive) botShoot(S, W, bot, tb.pos.x, 1.4, tb.pos.z, false, speed);
          else bot.target = null;
        }
      }
      // Hold ground while fighting; strafe a little to stay unpredictable.
      if (Math.random() < 0.3) {
        const side = Math.random() < 0.5 ? 1 : -1;
        moveCircle(bot.pos, BOT_RADIUS, Math.cos(bot.yaw) * side * 0.4 * dt * 10, -Math.sin(bot.yaw) * side * 0.4 * dt * 10, W.colliders);
        clampBounds(bot.pos, BOT_RADIUS, W.bounds);
      }
      syncMesh(bot);
      continue;
    }

    // --- movement ------------------------------------------------------
    let dest = null;
    if (bot.role === 'holder' && bot.holdSpot) {
      dest = bot.holdSpot;
    } else if (bot.investigate) {
      dest = bot.investigate;
    } else if (bot.route.length > 0) {
      dest = { x: bot.route[bot.wp][0], z: bot.route[bot.wp][1] };
      if (Math.hypot(dest.x - bot.pos.x, dest.z - bot.pos.z) < 1.2) {
        bot.wp = Math.min(bot.wp + 1, bot.route.length - 1);
        dest = { x: bot.route[bot.wp][0], z: bot.route[bot.wp][1] };
      }
    }
    if (dest) {
      // Stuck detection: near-zero displacement while a destination exists.
      const moved = Math.hypot(bot.pos.x - bot.px, bot.pos.z - bot.pz);
      bot.px = bot.pos.x;
      bot.pz = bot.pos.z;
      if (moved < 0.02) bot.stuckSteps += 1;
      else bot.stuckSteps = 0;
      if (bot.stuckSteps > 70 && !bot.detour) {
        // Sidestep perpendicular to the blocked heading, alternating side.
        // The detour point is kept inside the yard and out of walls, so a
        // stuck bot can never detour itself out of the map.
        const dx = dest.x - bot.pos.x;
        const dz = dest.z - bot.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const side = bot.id.charCodeAt(3) % 2 === 0 ? 1 : -1;
        const mkDetour = (s) => ({
          x: bot.pos.x + (-dz / d) * 3 * s,
          z: bot.pos.z + (dx / d) * 3 * s,
        });
        let det = mkDetour(side);
        clampBounds(det, 0.5, W.bounds);
        if (insideAny(det.x, det.z, 0.5, W.colliders)) {
          det = mkDetour(-side);
          clampBounds(det, 0.5, W.bounds);
        }
        bot.detour = det;
        bot.detourT = 2.5;
        bot.stuckSteps = 0;
      }
      if (bot.detour) {
        bot.detourT -= dt;
        const done = steer(S, W, bot, bot.detour.x, bot.detour.z, dt);
        if (done || bot.detourT <= 0) bot.detour = null;
        syncMesh(bot);
        continue;
      }
      const arrived = steer(S, W, bot, dest.x, dest.z, dt);
      if (arrived && bot.investigate) bot.investigate = null;
      if (arrived && bot.role === 'holder') {
        // Holders watch an angle: slowly scan left and right.
        bot.yaw += Math.sin(S.time * 0.5 + bot.id.charCodeAt(3)) * 0.01;
      }
    }
    syncMesh(bot);
  }
}

function nearestSite(S, W, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const key of ['A', 'B']) {
    const s = W.sites[key];
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bestD) {
      bestD = d;
      best = { key, x: s.x, z: s.z };
    }
  }
  return bestD < 4 ? best : null;
}

// Keep the visible mesh on the simulated position. One write per bot.
function syncMesh(bot) {
  if (!bot.group) return;
  bot.group.position.set(bot.pos.x, 0, bot.pos.z);
  bot.group.rotation.y = bot.yaw;
}

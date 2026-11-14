// combat.js — hitscan shooting, damage and grenade explosions.
//
// Player shots are real raycasts against the wall meshes and the bots'
// body parts (headshots pay more). Bot shots use the same line-of-sight
// rules but resolve as a hit chance, because a bot's aim error is part of
// its skill, not of the ray. All damage flows through here.

import * as THREE from 'three';
import { WEAPONS, falloff } from './weapons.js';
import { segmentBlocked } from './collision.js';
import { WALLS } from './map.js';
import * as audio from './audio.js';

// Scratch vectors, reused every shot so the hot loop allocates nothing.
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _end = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Fire one hitscan trigger pull from `origin` along `dir`.
 * `shooter` is { team, isPlayer, ref } where ref is the player object or
 * a bot. `spread` is radians of random cone. Returns the bot hit, if any.
 */
export function shootHitscan(ctx, shooter, origin, dir, weapon, spread) {
  const { state, raycaster, hitMeshes, effects } = ctx;
  let hitBot = null;
  let hitHead = false;
  for (let p = 0; p < weapon.pellets; p++) {
    _dir.copy(dir);
    if (spread > 0) {
      _right.crossVectors(_dir, UP);
      if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
      _right.normalize();
      _up.crossVectors(_right, _dir).normalize();
      const a = (Math.random() * 2 - 1) * spread;
      const b = (Math.random() * 2 - 1) * spread;
      _dir.addScaledVector(_right, a).addScaledVector(_up, b).normalize();
    }
    _origin.copy(origin);
    raycaster.set(_origin, _dir);
    raycaster.far = weapon.range;
    const hits = raycaster.intersectObjects(hitMeshes, false);
    const first = hits[0];
    if (!first) {
      _end.copy(_origin).addScaledVector(_dir, weapon.range);
      effects.tracer(_origin, _end);
      continue;
    }
    _end.copy(first.point);
    effects.tracer(_origin, _end);
    const obj = first.object;
    if (obj.userData.bot) {
      const bot = obj.userData.bot;
      if (bot.team !== shooter.team && bot.alive) {
        const head = obj.userData.part === 'head';
        const dist = first.distance;
        let dmg = weapon.damage * falloff(weapon, dist);
        if (head) dmg *= weapon.headMult;
        damageBot(ctx, bot, dmg, head, shooter);
        hitBot = bot;
        hitHead = head;
      } else {
        effects.sparks(_end, 6);
      }
    } else {
      effects.sparks(_end, 8);
    }
  }
  return { hitBot, hitHead };
}

/** Apply damage to a bot; handles death, the kill feed and kill money. */
export function damageBot(ctx, bot, amount, head, shooter) {
  const { state, effects } = ctx;
  if (!bot.alive) return;
  bot.hp -= amount;
  if (shooter.isPlayer) {
    state.stats.hits++;
    if (head) state.stats.headshots++;
    ctx.onPlayerHit?.(head);
  }
  if (bot.hp > 0) return;
  bot.hp = 0;
  bot.alive = false;
  bot.deathAt = state.time;
  const killer = shooter.isPlayer ? 'You' : shooter.ref?.name ?? 'Vanguard';
  const victim = bot.name;
  state.feed.unshift({ text: `${killer} ▸ ${victim}${head ? ' (headshot)' : ''}`, team: shooter.team, at: state.time });
  if (state.feed.length > 5) state.feed.pop();
  if (shooter.isPlayer) {
    state.player.money += 300;
    state.player.kills++;
  } else if (shooter.ref) {
    shooter.ref.kills = (shooter.ref.kills ?? 0) + 1;
  }
  ctx.onBotKilled?.(bot, shooter);
}

/** Apply damage to the player: Kevlar halves it, then health. */
export function damagePlayer(ctx, amount, fromBot) {
  const { state } = ctx;
  const p = state.player;
  if (!p.alive || state.phase !== 'live') return;
  let dmg = amount;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, dmg * 0.5);
    p.armor -= absorbed;
    dmg -= absorbed;
  }
  p.hp -= dmg;
  p.damageAt = state.time;
  audio.playHurt();
  ctx.onPlayerHurt?.(fromBot);
  if (p.hp > 0) return;
  p.hp = 0;
  p.alive = false;
  p.deaths++;
  const killer = fromBot?.name ?? 'Jackals';
  state.feed.unshift({ text: `${killer} ▸ You`, team: 'def', at: state.time });
  if (state.feed.length > 5) state.feed.pop();
  ctx.onPlayerKilled?.(fromBot);
}

/**
 * A bot fires at the player. Line of sight was already checked by the
 * caller. `accuracy` is 0..1: the chance this shot lands, falling with
 * distance and the player's speed. The tracer always shows where the
 * burst went.
 */
export function botShootAtPlayer(ctx, bot, accuracy) {
  const { state, effects } = ctx;
  const p = state.player;
  const weapon = WEAPONS[bot.weapon];
  const muzzle = { x: bot.x, y: 1.35, z: bot.z };
  const target = { x: p.x, y: 1.3, z: p.z };
  // Aim error grows with distance and with how fast the player moves.
  const dist = Math.hypot(p.x - bot.x, p.z - bot.z);
  const speed = Math.hypot(p.vx, p.vz);
  const err = (1 - accuracy) * 0.9 + dist * 0.008 + speed * 0.06 + (p.crouch ? -0.05 : 0);
  const hit = Math.random() > Math.min(0.92, Math.max(0.05, err));
  const end = hit
    ? target
    : { x: target.x + (Math.random() - 0.5) * 2.4, y: target.y + (Math.random() - 0.5) * 1.2, z: target.z + (Math.random() - 0.5) * 2.4 };
  effects.tracer(muzzle, end);
  effects.muzzle(muzzle, ctx.camera);
  audio.playDistantShot();
  if (hit) {
    const dmg = weapon.damage * falloff(weapon, dist) * (Math.random() < 0.12 ? weapon.headMult : 1);
    damagePlayer(ctx, dmg, bot);
  }
}

/** A bot fires at another bot (ally or enemy). Same rules, both sides. */
export function botShootAtBot(ctx, bot, target) {
  const { state, effects } = ctx;
  const weapon = WEAPONS[bot.weapon];
  const muzzle = { x: bot.x, y: 1.35, z: bot.z };
  const aim = { x: target.x, y: 1.25, z: target.z };
  const dist = Math.hypot(target.x - bot.x, target.z - bot.z);
  const err = 0.25 + dist * 0.012;
  const hit = Math.random() > Math.min(0.9, err);
  const end = hit ? aim : { x: aim.x + (Math.random() - 0.5) * 3, y: aim.y + (Math.random() - 0.5) * 1.5, z: aim.z + (Math.random() - 0.5) * 3 };
  effects.tracer(muzzle, end);
  effects.muzzle(muzzle, ctx.camera);
  if (Math.random() < 0.4) audio.playDistantShot();
  if (hit) {
    const head = Math.random() < 0.12;
    const dmg = weapon.damage * falloff(weapon, dist) * (head ? weapon.headMult : 1);
    damageBot(ctx, target, dmg, head, { team: bot.team, isPlayer: false, ref: bot });
  }
}

/** A frag grenade goes off: radius damage, blocked by walls. */
export function explodeGrenade(ctx, g) {
  const { state, effects } = ctx;
  const w = WEAPONS.grenade;
  effects.explosion({ x: g.x, y: Math.max(0.4, g.y), z: g.z });
  audio.playExplosion();
  ctx.shake?.(Math.max(0, 1 - Math.hypot(state.player.x - g.x, state.player.z - g.z) / 14));
  const hurt = (x, z, apply) => {
    const dist = Math.hypot(x - g.x, z - g.z);
    if (dist > w.radius) return;
    if (segmentBlocked(g.x, g.z, x, z, WALLS, 1.0)) return;
    apply(w.damage * (1 - (dist / w.radius) * 0.85));
  };
  const p = state.player;
  if (p.alive) hurt(p.x, p.z, (d) => damagePlayer(ctx, d, null));
  for (const b of state.bots) {
    if (b.alive) hurt(b.x, b.z, (d) => damageBot(ctx, b, d, false, { team: g.ownerTeam, isPlayer: g.owner === 'player', ref: g.ownerBot ?? null }));
  }
}

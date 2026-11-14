// weapons.js — the arsenal: one table drives the HUD, the buy menu,
// the player and the bots, so a weapon's numbers exist exactly once.

import { setWeaponMagSize } from './state.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', kind: 'pistol', price: 0,
    damage: 26, headMult: 4, rate: 0.28, auto: false,
    mag: 12, reserve: 36, pellets: 1,
    spread: 0.012, moveSpread: 0.055, recoil: 0.011, reloadTime: 1.4, range: 60,
    desc: 'Reliable sidearm. Free, always in your holster.',
  },
  rifle: {
    id: 'rifle', name: 'AR-9 Carbine', kind: 'rifle', price: 2700,
    damage: 33, headMult: 4, rate: 0.11, auto: true,
    mag: 25, reserve: 75, pellets: 1,
    spread: 0.014, moveSpread: 0.06, recoil: 0.016, reloadTime: 2.2, range: 90,
    desc: 'Full-auto workhorse. Accurate when you stop to aim.',
  },
  shotgun: {
    id: 'shotgun', name: 'SG-12 Scattergun', kind: 'shotgun', price: 1700,
    damage: 9, headMult: 2, rate: 0.85, auto: false,
    mag: 5, reserve: 20, pellets: 8,
    spread: 0.055, moveSpread: 0.09, recoil: 0.05, reloadTime: 2.6, range: 28,
    desc: 'Eight pellets per shell. Devastating up close, useless far away.',
  },
  marksman: {
    id: 'marksman', name: 'LR-50 Longshot', kind: 'marksman', price: 4200,
    damage: 95, headMult: 4, rate: 1.4, auto: false,
    mag: 5, reserve: 15, pellets: 1,
    spread: 0.002, moveSpread: 0.05, recoil: 0.06, reloadTime: 3.0, range: 140,
    desc: 'One shot, one down. Right-click to steady the scope.',
  },
  grenade: {
    id: 'grenade', name: 'Frag-9 Grenade', kind: 'grenade', price: 300,
    damage: 120, radius: 6.5, fuse: 1.6,
    desc: 'Cooks for 1.6 s, then clears a room. Bounces off the ground.',
  },
};

// The buy menu, in display order. Kevlar is bought once per round.
export const BUY_CATALOG = [
  { id: 'rifle', name: 'AR-9 Carbine', price: 2700, desc: 'Full-auto rifle' },
  { id: 'shotgun', name: 'SG-12 Scattergun', price: 1700, desc: 'Close-range power' },
  { id: 'marksman', name: 'LR-50 Longshot', price: 4200, desc: 'One-shot marksman rifle' },
  { id: 'grenade', name: 'Frag-9 Grenade', price: 300, desc: 'Explosive, 6.5 m radius' },
  { id: 'kevlar', name: 'Kevlar Vest', price: 650, desc: 'Halves damage taken this round' },
  { id: 'ammo', name: 'Reserve Ammo', price: 200, desc: 'Refills every owned weapon' },
];

export function weaponMagSize(id) {
  return WEAPONS[id]?.mag ?? 0;
}
setWeaponMagSize(weaponMagSize);

/**
 * Effective spread (radians) for a shot: base spread, plus bloom from
 * recent fire, plus a heavy penalty for moving — stopping to aim pays.
 * `speed` is 0..1 of top speed; crouching and walking slow both help.
 */
export function effectiveSpread(weapon, speed, crouch, slow, bloom) {
  let s = weapon.spread + bloom;
  s += weapon.moveSpread * speed;
  if (crouch) s *= 0.7;
  if (slow) s *= 0.75;
  return s;
}

/** Damage falloff with distance: full inside half range, fading to 55%. */
export function falloff(weapon, dist) {
  const half = weapon.range * 0.5;
  if (dist <= half) return 1;
  const k = Math.min(1, (dist - half) / half);
  return 1 - 0.45 * k;
}

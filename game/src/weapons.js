// weapons.js — the weapon table. One table, one source of truth: the buy menu,
// the HUD, the firing code and the bot loadouts all read these same rows.
// Damage falls off past `range` metres; headshots multiply by `headMult`.
// Spread is in degrees and grows while the shooter moves (see combat.js).
export const WEAPONS = {
  p9: {
    id: 'p9', key: '1', name: 'P9 Sidearm', price: 0,
    desc: 'Reliable sidearm, free every round',
    damage: 26, headMult: 3, mag: 12, reserve: 36, auto: false,
    interval: 0.16, reload: 1.3, spread: 0.9, moveSpread: 2.4,
    recoil: 0.011, bloom: 0.35, range: 30, speed: 0, // speed 0: no slowdown
    tracer: 0xffe9a8, length: 0.62, barrel: 0.28,
  },
  ar9: {
    id: 'ar9', key: '2', name: 'AR-9 Carbine', price: 2700,
    desc: 'Full-auto rifle, the workhorse',
    damage: 30, headMult: 3, mag: 30, reserve: 90, auto: true,
    interval: 0.1, reload: 2.0, spread: 1.1, moveSpread: 3.0,
    recoil: 0.014, bloom: 0.5, range: 45, speed: -0.3,
    tracer: 0xffd27a, length: 0.95, barrel: 0.55,
  },
  sg12: {
    id: 'sg12', key: '3', name: 'SG-12 Scattergun', price: 1700,
    desc: 'Close-range power, 8 pellets a shell',
    damage: 9, headMult: 2, mag: 6, reserve: 24, auto: false,
    interval: 0.85, reload: 2.4, spread: 4.2, moveSpread: 3.4,
    recoil: 0.05, bloom: 1.4, range: 14, speed: -0.4, pellets: 8,
    tracer: 0xffc46b, length: 0.8, barrel: 0.5,
  },
  lr50: {
    id: 'lr50', key: '4', name: 'LR-50 Longshot', price: 4200,
    desc: 'One-shot marksman rifle, slow and loud',
    damage: 110, headMult: 2.5, mag: 5, reserve: 15, auto: false,
    interval: 1.25, reload: 2.8, spread: 0.15, moveSpread: 5.0,
    recoil: 0.075, bloom: 2.2, range: 90, speed: -0.8,
    tracer: 0xfff3c4, length: 1.35, barrel: 0.85,
  },
  frag: {
    id: 'frag', key: '5', name: 'Frag-9 Grenade', price: 300,
    desc: 'Explosive, 6.5 m radius',
    damage: 95, headMult: 1, mag: 1, reserve: 0, auto: false,
    interval: 0.6, reload: 0, spread: 0, moveSpread: 0,
    recoil: 0, bloom: 0, range: 0, speed: 0, radius: 6.5,
    tracer: 0xffffff, length: 0.3, barrel: 0.1,
  },
};

export const BUY_ROWS = [
  { id: 'ar9', label: 'AR-9 Carbine', desc: 'Full-auto rifle', price: 2700 },
  { id: 'sg12', label: 'SG-12 Scattergun', desc: 'Close-range power', price: 1700 },
  { id: 'lr50', label: 'LR-50 Longshot', desc: 'One-shot marksman rifle', price: 4200 },
  { id: 'frag', label: 'Frag-9 Grenade', desc: 'Explosive, 6.5 m radius', price: 300 },
  { id: 'kevlar', label: 'Kevlar Vest', desc: 'Halves damage taken this round', price: 650 },
  { id: 'ammo', label: 'Reserve Ammo', desc: 'Refills every owned weapon', price: 200 },
];

export function weaponOf(id) {
  return WEAPONS[id];
}

// Ammo state for a weapon the player just bought.
export function freshAmmo(id) {
  const w = WEAPONS[id];
  return { mag: w.mag, reserve: w.reserve };
}

// Buying: returns a message for the HUD, or null when the purchase fails.
export function buy(s, rowId) {
  if (rowId === 'kevlar') {
    if (s.player.kevlar) return 'Kevlar already worn';
    if (s.money < 650) return 'Not enough money';
    s.money -= 650;
    s.player.kevlar = true;
    return 'Kevlar Vest equipped';
  }
  if (rowId === 'ammo') {
    if (s.money < 200) return 'Not enough money';
    s.money -= 200;
    for (const id of s.player.owned) {
      if (id === 'frag') continue;
      s.player.ammo[id].reserve = WEAPONS[id].reserve;
    }
    return 'Reserve ammo refilled';
  }
  const w = WEAPONS[rowId];
  if (!w) return null;
  if (rowId === 'frag') {
    if (s.money < w.price) return 'Not enough money';
    if (s.player.grenades >= 2) return 'Carrying the max 2 grenades';
    s.money -= w.price;
    s.player.grenades += 1;
    if (!s.player.owned.includes('frag')) s.player.owned.push('frag');
    return 'Frag-9 Grenade bought';
  }
  if (s.player.owned.includes(rowId)) return w.name + ' already owned';
  if (s.money < w.price) return 'Not enough money';
  s.money -= w.price;
  s.player.owned.push(rowId);
  s.player.ammo[rowId] = freshAmmo(rowId);
  s.player.weapon = rowId;
  return w.name + ' bought';
}

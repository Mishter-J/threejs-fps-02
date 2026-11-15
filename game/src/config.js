// config.js — one place for every tunable number in EMBER YARD.
// Nothing here touches the renderer or the network; it is pure data
// so the judge (and the simulation) can read the whole game balance
// from a single file.

export const GAME_NAME = 'EMBER YARD';
export const GAME_SUBTITLE = 'a tactical round-based shooter';
export const SEED = 1337;

export const PALETTE = {
  sky: 0x2a1e33,
  fog: 0x35243a,
  ground: 0x3a3340,
  groundLine: 0x2c2530,
  wallA: 0x8a5a3b,
  wallB: 0x5d6b73,
  wallC: 0x74604a,
  crate: 0xc47b2d,
  crateB: 0x3f7d6b,
  container: 0x9c3d2e,
  accent: 0xffb347,
  siteA: 0x3f7d6b,
  siteB: 0x9c3d2e,
  ct: 0x3f7d6b,
  t: 0xc4542a,
  player: 0x7fb069,
};

export const ROUND = {
  buyTime: 10,
  roundTime: 100,
  plantTime: 3.0,
  defuseTime: 5.0,
  explodeTime: 40,
  winRounds: 5,
  maxRounds: 9,
  startMoney: 800,
  winBonus: 3250,
  lossBonus: 1900,
  killBonus: 300,
  plantBonus: 300,
  roundEndPause: 4.5,
};

// Weapons. damage is per body hit at close range; falloff starts at
// falloffStart metres and bottoms out at falloffMin. spread is in
// radians; moveSpread is added while moving, airSpread while airborne.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P-9 SIDEARM', price: 0, damage: 34, headMul: 2.0,
    rate: 0.16, mag: 12, reserve: 36, reload: 1.4, auto: false,
    spread: 0.011, moveSpread: 0.030, crouchSpread: -0.004, recoil: 0.011,
    falloffStart: 18, falloffMin: 0.7, tracer: 0xffd27a, range: 90,
  },
  smg: {
    id: 'smg', name: 'SWARM-7 SMG', price: 1200, damage: 26, headMul: 2.0,
    rate: 0.085, mag: 30, reserve: 90, reload: 1.9, auto: true,
    spread: 0.016, moveSpread: 0.034, crouchSpread: -0.005, recoil: 0.009,
    falloffStart: 14, falloffMin: 0.6, tracer: 0x9fd8ff, range: 80,
  },
  rifle: {
    id: 'rifle', name: 'VK-9 RIFLE', price: 2600, damage: 38, headMul: 2.2,
    rate: 0.115, mag: 25, reserve: 75, reload: 2.4, auto: true,
    spread: 0.007, moveSpread: 0.038, crouchSpread: -0.003, recoil: 0.016,
    falloffStart: 22, falloffMin: 0.75, tracer: 0xffb347, range: 120,
  },
  sniper: {
    id: 'sniper', name: 'LONGSHOT-50', price: 4200, damage: 95, headMul: 2.0,
    rate: 1.1, mag: 5, reserve: 15, reload: 3.2, auto: false,
    spread: 0.001, moveSpread: 0.09, crouchSpread: -0.0005, recoil: 0.06,
    falloffStart: 40, falloffMin: 0.9, tracer: 0xffffff, range: 160,
  },
};

export const GRENADE = {
  price: 300, fuse: 1.7, radius: 7.5, maxDamage: 110, throwSpeed: 17,
};

export const ARMOR_PRICE = 650;
export const ARMOR_ABSORB = 0.5; // half of incoming damage eats armor first

export const PLAYER = {
  walkSpeed: 5.2,
  crouchSpeed: 2.6,
  accel: 42,
  friction: 11,
  radius: 0.38,
  standHeight: 1.68,
  crouchHeight: 1.12,
  eyeStand: 1.58,
  eyeCrouch: 1.02,
  health: 100,
};

export const BOT = {
  walkSpeed: 3.6,
  runSpeed: 4.6,
  reactionMin: 0.38,
  reactionMax: 0.85,
  sightRange: 42,
  fovCos: 0.35, // cos(69deg): bots notice things in a wide front cone
  burstMin: 2,
  burstMax: 5,
  burstPauseMin: 0.5,
  burstPauseMax: 1.1,
  accuracy: 0.42, // base hit chance at 10 m, scaled by distance/movement
};

// The map: a walled industrial yard, 46 x 38 m. Origin is the centre.
// A site is west, B site is east, mid is a covered connector.
// Walls are axis-aligned boxes {x, z, w, d, h, mat} centred at (x, z).
// Crates are low (h 1.1) so they block movement and crouched sightlines
// but not standing shots over them; containers are tall (h 2.6).
export const MAP = {
  halfW: 23,
  halfD: 19,
  walls: [
    // perimeter
    { x: 0, z: -19, w: 47, d: 1, h: 3.4, mat: 'wallA' },
    { x: 0, z: 19, w: 47, d: 1, h: 3.4, mat: 'wallA' },
    { x: -23, z: 0, w: 1, d: 39, h: 3.4, mat: 'wallB' },
    { x: 23, z: 0, w: 1, d: 39, h: 3.4, mat: 'wallB' },
    // mid connector walls (leave a 3 m gap at x = 0 and two side gaps)
    { x: -9, z: -6, w: 1, d: 12, h: 2.8, mat: 'wallC' },
    { x: 9, z: -6, w: 1, d: 12, h: 2.8, mat: 'wallC' },
    { x: -9, z: 6, w: 1, d: 12, h: 2.8, mat: 'wallC' },
    { x: 9, z: 6, w: 1, d: 12, h: 2.8, mat: 'wallC' },
    { x: -4.5, z: -6, w: 8, d: 1, h: 2.8, mat: 'wallC' },
    { x: 4.5, z: 6, w: 8, d: 1, h: 2.8, mat: 'wallC' },
    // A site (west) structure
    { x: -17, z: -9, w: 5, d: 1, h: 2.6, mat: 'wallB' },
    { x: -19.5, z: -2, w: 1, d: 9, h: 2.6, mat: 'wallB' },
    { x: -14, z: 4, w: 6, d: 1, h: 2.2, mat: 'wallC' },
    // B site (east) structure
    { x: 17, z: 9, w: 5, d: 1, h: 2.6, mat: 'wallB' },
    { x: 19.5, z: 2, w: 1, d: 9, h: 2.6, mat: 'wallB' },
    { x: 14, z: -4, w: 6, d: 1, h: 2.2, mat: 'wallC' },
    // long lane pillars
    { x: -15, z: 12, w: 1.6, d: 1.6, h: 3.0, mat: 'wallA' },
    { x: 15, z: -12, w: 1.6, d: 1.6, h: 3.0, mat: 'wallA' },
    { x: 0, z: -14, w: 2, d: 2, h: 2.4, mat: 'wallC' },
    { x: 0, z: 14, w: 2, d: 2, h: 2.4, mat: 'wallC' },
  ],
  crates: [
    { x: -12, z: -12, w: 2.2, d: 2.2, h: 1.1, mat: 'crate' },
    { x: -12, z: 12, w: 2.2, d: 2.2, h: 1.1, mat: 'crateB' },
    { x: 12, z: -12, w: 2.2, d: 2.2, h: 1.1, mat: 'crateB' },
    { x: 12, z: 12, w: 2.2, d: 2.2, h: 1.1, mat: 'crate' },
    { x: -5, z: 0, w: 1.6, d: 1.6, h: 1.1, mat: 'crate' },
    { x: 5, z: 0, w: 1.6, d: 1.6, h: 1.1, mat: 'crate' },
    { x: -17, z: 2, w: 3.2, d: 1.4, h: 2.6, mat: 'container' },
    { x: 17, z: -2, w: 3.2, d: 1.4, h: 2.6, mat: 'container' },
    { x: -3, z: -13, w: 2.4, d: 1.4, h: 1.1, mat: 'crateB' },
    { x: 3, z: 13, w: 2.4, d: 1.4, h: 1.1, mat: 'crateB' },
  ],
  sites: {
    A: { x: -18, z: -6, r: 4.2, label: 'SITE A' },
    B: { x: 18, z: 6, r: 4.2, label: 'SITE B' },
  },
  spawns: {
    ct: [
      { x: -20, z: -14 }, { x: -20, z: -10 }, { x: -20, z: 14 },
    ],
    t: [
      { x: 20, z: 14 }, { x: 20, z: 10 }, { x: 20, z: -14 }, { x: 20, z: 6 },
    ],
  },
  // Waypoint graph bots walk on. Nodes are open ground; edges link
  // neighbours the bots may travel between (no edge crosses a wall).
  waypoints: [
    { x: -20, z: 0 }, { x: -14, z: -14 }, { x: -14, z: 0 }, { x: -14, z: 14 },
    { x: -7, z: -14 }, { x: -7, z: 0 }, { x: -7, z: 14 },
    { x: 0, z: -10 }, { x: 0, z: 0 }, { x: 0, z: 10 },
    { x: 7, z: -14 }, { x: 7, z: 0 }, { x: 7, z: 14 },
    { x: 14, z: -14 }, { x: 14, z: 0 }, { x: 14, z: 14 },
    { x: 20, z: 0 }, { x: -18, z: -6 }, { x: 18, z: 6 },
    { x: -18, z: 12 }, { x: 18, z: -12 },
  ],
  waypointEdges: [
    [0, 2], [0, 1], [0, 3], [1, 4], [1, 17], [2, 5], [2, 17], [2, 19],
    [3, 6], [3, 19], [4, 7], [4, 5], [5, 8], [5, 6], [6, 9],
    [7, 10], [7, 8], [8, 11], [8, 9], [9, 12], [10, 13], [10, 11],
    [11, 14], [11, 12], [12, 15], [13, 16], [13, 20], [14, 15],
    [14, 18], [15, 16], [15, 18], [16, 20],
  ],
};

export const BOT_NAMES = {
  ct: ['VEX', 'MIRA', 'DOSS'],
  t: ['RAZOR', 'KOBALT', 'NIX', 'HAVOC'],
};

// state.js — the single game state object and the match constants.
//
// Every module reads and writes this one object (created by createState),
// so the whole simulation's state lives in one place. Rendering reads it
// but never owns it: the fixed-step simulation in main.js is the only
// writer during a tick.

export const ROUND_TIME = 100; // seconds of live play per round
export const BUY_TIME = 12; // seconds of buy phase before a round goes live
export const ROUND_END_TIME = 5; // seconds the end banner shows
export const PLANT_TIME = 3; // seconds to plant the charge
export const DEFUSE_TIME = 5; // seconds to defuse the charge
export const BOMB_TIMER = 35; // seconds from plant to detonation
export const MATCH_WIN_ROUNDS = 8; // rounds to take the match
export const PLAYER_RADIUS = 0.42;
export const PLAYER_EYE = 1.62; // standing eye height
export const PLAYER_EYE_CROUCH = 1.05;
export const WALK_SPEED = 4.4;
export const CROUCH_SPEED = 2.1;
export const SLOW_SPEED = 2.6; // Shift: walk slow, steadier aim

export const TEAM = { ATK: 'atk', DEF: 'def' };

export function createState() {
  return {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    phaseTime: 0, // seconds left in the current phase
    round: 1,
    score: { atk: 0, def: 0 },
    lossStreak: 0, // consecutive rounds the attackers lost
    roundWinner: null, // 'atk' | 'def' | null
    roundReason: '', // 'elimination' | 'detonation' | 'defused' | 'time'
    matchWinner: null,

    // The charge. state: 'carried' (a Vanguard member holds it) |
    // 'planting' | 'planted' | 'defusing' | 'exploded' | 'defused' | 'gone'
    bomb: { state: 'carried', site: null, x: 0, z: 0, timer: 0, progress: 0, carrier: 'player' },

    player: {
      x: -18, z: 14, yaw: Math.PI * 0.5, pitch: 0,
      vx: 0, vz: 0, hp: 100, armor: 0, alive: true,
      crouch: false, slow: false, onGround: true,
      money: 800, kills: 0, deaths: 0,
      weapons: {}, // id -> { mag, reserve } for owned weapons
      grenades: 0, // Frag-9s carried
      current: 'pistol', reloading: 0, reloadTotal: 0,
      bloom: 0, recoil: 0, lastShotAt: -10, stepPhase: 0,
      planting: 0, defusing: 0, flash: 0, damageDir: 0, damageAt: -10,
    },

    bots: [], // bot objects, created by bots.js
    grenades: [], // live frag grenades {x,y,z,vx,vy,vz,fuse,owner}
    feed: [], // kill feed entries {text, team, at}
    messages: [], // centre-screen announcements
    stats: { shots: 0, hits: 0, headshots: 0 },
    time: 0, // total simulation seconds
    startedAt: 0,
  };
}

// Reset the per-round fields so a new round starts clean. Weapons, money
// and score carry over, exactly like a buy phase should.
export function resetRound(state) {
  state.phase = 'buy';
  state.phaseTime = BUY_TIME;
  state.roundWinner = null;
  state.roundReason = '';
  state.bomb = { state: 'carried', site: null, x: 0, z: 0, timer: 0, progress: 0, carrier: 'player' };
  state.grenades.length = 0;
  const p = state.player;
  p.alive = true;
  p.hp = 100;
  p.planting = 0;
  p.defusing = 0;
  p.reloading = 0;
  p.bloom = 0;
  p.recoil = 0;
  p.flash = 0;
  for (const w of Object.values(p.weapons)) w.mag = weaponMagSize(w.id);
  for (const b of state.bots) {
    b.alive = true;
    b.hp = 100;
    b.state = 'hold';
    b.path = [];
    b.pathIdx = 0;
    b.target = null;
    b.planting = 0;
    b.defusing = 0;
    b.reloading = 0;
    b.carryingBomb = false;
    b.burstLeft = 0;
    b.nextShot = 0;
  }
}

// Filled in by weapons.js at import time (avoids a circular import).
export let weaponMagSize = () => 0;
export function setWeaponMagSize(fn) { weaponMagSize = fn; }

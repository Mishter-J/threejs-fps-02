// state.js — the single state store. Every module reads and writes this one
// object; nothing else keeps game state. Plain data only, no THREE imports,
// so the round flow and the economy can be reasoned about without rendering.
export const MATCH_TARGET = 5; // first team to 5 round wins takes the match
export const BUY_SECONDS = 8;
export const ROUND_SECONDS = 100;
export const BOMB_SECONDS = 35;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const START_MONEY = 800;
export const WIN_MONEY = 3250;
export const LOSS_MONEY = 1900;
export const KILL_MONEY = 300;
export const PLANT_MONEY = 300;
export const MAX_MONEY = 16000;

export function createState() {
  return {
    phase: 'menu', // menu | buy | live | over | match
    phaseT: 0, // seconds left in the current phase
    round: 1,
    score: { vanguard: 0, jackals: 0 },
    money: START_MONEY,
    kills: 0,
    deaths: 0,
    // The player. pos is the feet position; yaw faces east at spawn.
    player: {
      pos: { x: -28, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      yaw: -Math.PI / 2,
      pitch: 0,
      hp: 100,
      alive: true,
      crouch: false,
      walking: false,
      kevlar: false,
      spectating: null, // bot id the camera follows after death
      weapon: 'p9',
      owned: ['p9'],
      ammo: { p9: { mag: 12, reserve: 36 } },
      grenades: 0,
      reloading: 0, // seconds left, 0 when not reloading
      bloom: 0, // extra spread (degrees) from recent shots, decays
      recoil: 0, // pitch kick still to recover (radians)
      fireHeld: false,
      nextShot: 0,
      plantT: 0, // plant channel progress, 0 when not planting
      throwT: 0, // grenade wind-up, 0 when not throwing
      lastDamageFrom: null,
      lastDamageAt: -99,
    },
    bomb: {
      state: 'carried', // carried | planted | exploded | defused | dropped
      site: null, // 'A' | 'B'
      carrier: 'player', // 'player' or a bot id
      x: 0,
      z: 0,
      timer: 0,
      defuseT: 0,
      defuser: null,
    },
    bots: [], // filled by bots.js: { id, team, name, pos, yaw, hp, alive, ... }
    feed: [], // killfeed lines: { text, t }
    noise: [], // { x, z, r, t } gunshots bots can hear
    projectiles: [], // live grenades: { kind, x, y, z, vx, vy, vz, fuse, from }
    banner: '', // centre-screen message
    bannerT: 0,
    result: '', // round-end text shown in the over phase
    matchResult: '',
    time: 0, // total simulation seconds since the match started
    muted: false,
  };
}

// Wipe everything a new round needs, keeping money, score and owned weapons.
export function resetForRound(s) {
  s.phase = 'buy';
  s.phaseT = BUY_SECONDS;
  s.player.hp = 100;
  s.player.alive = true;
  s.player.crouch = false;
  s.player.kevlar = false;
  s.player.spectating = null;
  s.player.pos.x = -28;
  s.player.pos.y = 0;
  s.player.pos.z = 0;
  s.player.vel.x = 0;
  s.player.vel.z = 0;
  s.player.yaw = -Math.PI / 2;
  s.player.pitch = 0;
  s.player.reloading = 0;
  s.player.bloom = 0;
  s.player.recoil = 0;
  s.player.plantT = 0;
  s.player.throwT = 0;
  s.bomb.state = 'carried';
  s.bomb.site = null;
  s.bomb.carrier = 'player';
  s.bomb.timer = 0;
  s.bomb.defuseT = 0;
  s.bomb.defuser = null;
  s.feed.length = 0;
  s.noise.length = 0;
  s.projectiles.length = 0;
  s.banner = 'Round ' + s.round + ' — buy phase';
  s.bannerT = 3;
  s.result = '';
}

export function addFeed(s, text) {
  s.feed.push({ text, t: s.time });
  if (s.feed.length > 5) s.feed.shift();
}

export function addMoney(s, n) {
  s.money = Math.min(MAX_MONEY, s.money + n);
}

export function setBanner(s, text, seconds) {
  s.banner = text;
  s.bannerT = seconds;
}

// sim.js — the single source of truth. All game state lives in the
// object createSim returns; the fixed-step update() advances it in
// 1/60 s slices, apart from rendering. Rounds, economy, the spike
// objective, grenades, hit resolution and bot wiring all live here,
// so main.js only renders and feeds input.

import * as THREE from 'three';
import { ROUND, WEAPONS, GRENADE, ARMOR_PRICE, MAP, BOT_NAMES, SEED } from './config.js';
import { makeRng } from './rng.js';
import { createPlayer } from './player.js';
import {
  createWeaponState, fireWeapon, updateWeapon, startReload,
  currentSpread, buildViewmodel, createGrenadeState, throwGrenade,
} from './weapons.js';
import { createBot, updateBot, damageBot, resetBot } from './bots.js';

const STEP = 1 / 60;
const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _wallHit = { dist: 0, x: 0, y: 0, z: 0 };
const _tmp = new THREE.Vector3();

export function createSim(deps) {
  const { scene, world, effects, audio, camera } = deps;

  const state = {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    round: 1,
    score: { ct: 0, t: 0 },
    money: ROUND.startMoney,
    time: 0,
    roundTimer: ROUND.roundTime,
    buyTimer: 0,
    roundEndTimer: 0,
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    planted: false,
    plantedSite: null,
    explodeTimer: 0,
    spikeCarrierName: null,
    staged: false, // staged screenshot mode: the player cannot die
    playerPlant: 0,
    playerDefuse: 0,
    spread: 0.01,
    shake: 0,
    kills: 0,
    deaths: 0,
  };

  let rng = makeRng(SEED);
  const player = createPlayer(world, MAP.spawns.ct[0]);
  state.player = player;
  const viewmodel = buildViewmodel(camera);

  // Bots: 3 defenders (CT, with the player) vs 4 attackers (T).
  const bots = [];
  MAP.spawns.ct.forEach((s, i) => {
    bots.push(createBot(i, BOT_NAMES.ct[i], 'ct', s, 'holder', scene));
  });
  MAP.spawns.t.forEach((s, i) => {
    bots.push(createBot(10 + i, BOT_NAMES.t[i], 't', s, i === 0 ? 'carrier' : 'support', scene));
  });
  state.bots = bots;
  state.weapon = createWeaponState('pistol');
  state.grenades = 0;

  const grenade = createGrenadeState();
  const grenadeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x2a4a2a, roughness: 0.6 }),
  );
  grenadeMesh.visible = false;
  scene.add(grenadeMesh);

  // Enemy descriptors, built once and mutated in place so the bot
  // loop allocates nothing per step.
  const playerDesc = {
    pos: player.pos, eyeY: player.eyeHeight, alive: true,
    isPlayer: true, crouched: false, speed: 0, ref: 'player',
  };
  const botDescs = new Map();
  for (const b of bots) {
    botDescs.set(b, {
      pos: b.pos, eyeY: 1.5, alive: true, isPlayer: false,
      crouched: false, speed: 0, ref: b,
    });
  }
  const botEnemies = new Map();
  for (const b of bots) {
    const list = [];
    if (b.team === 't') {
      list.push(playerDesc);
      for (const o of bots) if (o.team === 'ct') list.push(botDescs.get(o));
    } else {
      for (const o of bots) if (o.team === 't') list.push(botDescs.get(o));
    }
    botEnemies.set(b, list);
  }
  const botHitMeshes = [];
  for (const b of bots) botHitMeshes.push(b.body, b.head);

  function aliveCount(team) {
    let n = team === 'ct' ? (player.alive ? 1 : 0) : 0;
    for (const b of bots) if (b.team === team && b.alive) n += 1;
    return n;
  }

  function carrierBot() {
    for (const b of bots) if (b.team === 't' && b.role === 'carrier' && b.alive) return b;
    return null;
  }

  function refreshCarrierName() {
    const c = carrierBot();
    state.spikeCarrierName = state.planted ? null : c ? c.name : null;
  }

  function addKillFeed(killer, victim, head) {
    deps.hud.kill(killer, victim, head);
  }

  function damagePlayer(amount, attackerName, head) {
    if (!player.alive || state.phase !== 'live' || state.staged) return;
    player.damage(amount);
    deps.hud.flashDamage();
    audio.hurt();
    state.shake = Math.min(0.5, state.shake + 0.12);
    if (!player.alive) {
      state.deaths += 1;
      addKillFeed(attackerName || 'VIPER', 'YOU', head);
      if (state.phase === 'live') deps.hud.banner('YOU ARE DOWN', 'Your squad fights on — watch the round play out', 3);
    }
  }

  function damageBotTarget(bot, amount, head, attackerName) {
    if (!bot.alive) return;
    const killed = damageBot(bot, amount);
    bot.lastSeenByPlayerAt = state.time;
    if (attackerName === 'YOU') {
      deps.hud.hitmark(head);
      if (head) audio.headshot();
      else audio.hit();
    }
    if (killed) {
      if (attackerName === 'YOU') {
        state.kills += 1;
        state.money += ROUND.killBonus;
        audio.kill();
      }
      addKillFeed(attackerName || 'VIPER', bot.name, head);
      effects.impact(bot.pos.x, 1.2, bot.pos.z, 0xc4542a, 8);
      if (bot.role === 'carrier' && !state.planted) {
        // The spike passes to the nearest living attacker.
        let best = null;
        let bestD = Infinity;
        for (const o of bots) {
          if (o.team !== 't' || !o.alive) continue;
          const d = (o.pos.x - bot.pos.x) ** 2 + (o.pos.z - bot.pos.z) ** 2;
          if (d < bestD) { bestD = d; best = o; }
        }
        bot.role = 'support';
        if (best) best.role = 'carrier';
        refreshCarrierName();
      }
    }
  }

  // Resolve one hitscan shot from the player. origin/dir are vectors;
  // dir is perturbed by spread before this call.
  function resolvePlayerShot(origin, dir, shot) {
    const def = shot.def;
    _ray.set(origin, dir);
    _ray.far = def.range;
    const hits = _ray.intersectObjects(botHitMeshes, false);
    const wall = world.rayHit(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, def.range, _wallHit);
    let botHit = null;
    for (const h of hits) {
      const bot = h.object.userData.botRef;
      if (bot && bot.alive) {
        botHit = h;
        break;
      }
    }
    const wallDist = wall ? wall.dist : Infinity;
    const muzzle = _tmp.copy(origin).addScaledVector(dir, 0.6);
    if (botHit && botHit.distance < wallDist) {
      const bot = botHit.object.userData.botRef;
      const part = botHit.object.userData.part;
      const head = part === 'head';
      const fall = botHit.distance > def.falloffStart
        ? Math.max(def.falloffMin, 1 - (botHit.distance - def.falloffStart) / 60)
        : 1;
      const dmg = def.damage * (head ? def.headMul : 1) * fall;
      effects.tracer(muzzle.x, muzzle.y, muzzle.z, botHit.point.x, botHit.point.y, botHit.point.z, def.tracer);
      effects.impact(botHit.point.x, botHit.point.y, botHit.point.z, head ? 0xff5a3c : 0xffd27a, head ? 8 : 5);
      damageBotTarget(bot, dmg, head, 'YOU');
    } else if (wall) {
      effects.tracer(muzzle.x, muzzle.y, muzzle.z, wall.x, wall.y, wall.z, def.tracer);
      effects.impact(wall.x, wall.y, wall.z, 0xcccccc, 4);
    } else {
      _tmp.copy(origin).addScaledVector(dir, def.range);
      effects.tracer(muzzle.x, muzzle.y, muzzle.z, _tmp.x, _tmp.y, _tmp.z, def.tracer);
    }
    // Gunfire is loud: nearby bots turn toward it.
    for (const b of bots) {
      if (!b.alive) continue;
      const d = Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z);
      if (d < 28) b.noise = { x: player.pos.x, z: player.pos.z, at: state.time };
    }
  }

  function explodeGrenade() {
    grenade.active = false;
    grenadeMesh.visible = false;
    effects.explosion(grenade.x, grenade.y, grenade.z);
    audio.explosion();
    state.shake = Math.min(0.8, state.shake + 0.4);
    const hurt = (pos, eyeY, apply) => {
      const d = Math.hypot(pos.x - grenade.x, pos.z - grenade.z) + Math.abs(eyeY - grenade.y) * 0.4;
      if (d > GRENADE.radius) return;
      const dmg = GRENADE.maxDamage * (1 - d / GRENADE.radius) + 8;
      apply(dmg);
    };
    hurt(player.pos, player.eyeHeight, (dmg) => {
      if (player.alive) {
        player.damage(dmg * 0.8);
        deps.hud.flashDamage();
        if (!player.alive) {
          state.deaths += 1;
          addKillFeed('FRAG', 'YOU', false);
        }
      }
    });
    for (const b of bots) {
      hurt(b.pos, 1.2, (dmg) => {
        if (b.alive) damageBotTarget(b, dmg, false, grenade.thrownBy === 'player' ? 'YOU' : 'VIPER');
      });
    }
  }

  function updateGrenade(dt) {
    if (!grenade.active) return;
    grenade.fuse -= dt;
    grenade.vy -= 13 * dt;
    grenade.x += grenade.vx * dt;
    grenade.y += grenade.vy * dt;
    grenade.z += grenade.vz * dt;
    const p = { x: grenade.x, z: grenade.z };
    const beforeX = grenade.x;
    const beforeZ = grenade.z;
    world.resolveCircle(p, 0.12);
    if (p.x !== beforeX) { grenade.vx = -grenade.vx * 0.45; grenade.x = p.x; }
    if (p.z !== beforeZ) { grenade.vz = -grenade.vz * 0.45; grenade.z = p.z; }
    if (grenade.y < 0.1) {
      grenade.y = 0.1;
      grenade.vy = Math.abs(grenade.vy) * 0.45;
      grenade.vx *= 0.7;
      grenade.vz *= 0.7;
      if (Math.abs(grenade.vy) < 0.8) grenade.vy = 0;
    }
    grenadeMesh.position.set(grenade.x, grenade.y, grenade.z);
    if (grenade.fuse <= 0) explodeGrenade();
  }

  function endRound(winner, reason) {
    if (state.phase !== 'live') return;
    state.phase = 'roundEnd';
    state.roundWinner = winner;
    state.roundReason = reason;
    state.roundEndTimer = ROUND.roundEndPause;
    state.spikeCarrierName = null;
    state.score[winner] += 1;
    const won = winner === 'ct';
    state.money += won ? ROUND.winBonus : ROUND.lossBonus;
    deps.hud.banner(
      won ? 'ROUND WON' : 'ROUND LOST',
      `${reason}  —  EMBER ${state.score.ct} : ${state.score.t} VIPER`,
      ROUND.roundEndPause,
    );
    if (won) audio.roundWin();
    else audio.roundLose();
  }

  function matchOver() {
    if (state.score.ct >= ROUND.winRounds || state.score.t >= ROUND.winRounds) return true;
    if (state.round >= ROUND.maxRounds && state.score.ct !== state.score.t) return true;
    return false;
  }

  function startRound() {
    state.roundTimer = ROUND.roundTime;
    state.buyTimer = ROUND.buyTime;
    state.phase = 'buy';
    state.planted = false;
    state.plantedSite = null;
    state.explodeTimer = 0;
    state.playerPlant = 0;
    state.playerDefuse = 0;
    player.reset(MAP.spawns.ct[state.round % MAP.spawns.ct.length]);
    bots.forEach((b, i) => {
      const list = b.team === 'ct' ? MAP.spawns.ct : MAP.spawns.t;
      resetBot(b, list[i % list.length], rng);
    });
    const carrier = bots.find((b) => b.team === 't' && b.role === 'carrier');
    if (!carrier) bots.find((b) => b.team === 't').role = 'carrier';
    refreshCarrierName();
    deps.hud.renderBuy(state, (id) => buy(id));
    deps.hud.banner(`ROUND ${state.round}`, 'Buy phase — gear up, then hold the yard', 3);
  }

  function buy(id) {
    if (state.phase !== 'buy') return false;
    if (id === 'grenade') {
      if (state.grenades >= 2 || state.money < GRENADE.price) return false;
      state.money -= GRENADE.price;
      state.grenades += 1;
    } else if (id === 'armor') {
      if (player.armor >= 100 || state.money < ARMOR_PRICE) return false;
      state.money -= ARMOR_PRICE;
      player.armor = 100;
    } else {
      const def = WEAPONS[id];
      if (!def || state.weapon.def.id === id || state.money < def.price) return false;
      state.money -= def.price;
      state.weapon = createWeaponState(id);
    }
    audio.buy();
    deps.hud.renderBuy(state, (next) => buy(next));
    return true;
  }

  function startMatch(seed) {
    rng = makeRng(seed === undefined ? SEED : seed);
    state.score.ct = 0;
    state.score.t = 0;
    state.round = 1;
    state.money = ROUND.startMoney;
    state.kills = 0;
    state.deaths = 0;
    state.weapon = createWeaponState('pistol');
    state.grenades = 0;
    state.matchWinner = null;
    deps.hud.hideEnd();
    startRound();
  }

  let prevFiring = false;
  let stepAccum = 0;

  function step(dt, input) {
    state.time += dt;
    state.shake = Math.max(0, state.shake - dt * 1.4);

    if (state.phase === 'buy') {
      state.buyTimer -= dt;
      // Player may move and look during buy; bots hold position.
      const walked = player.update(dt, input.move, world);
      if (walked > 0) {
        player.stepTimer += walked;
        if (player.stepTimer > 2.4) {
          player.stepTimer = 0;
          audio.step();
        }
      }
      if (state.buyTimer <= 0) {
        state.phase = 'live';
        deps.hud.hideBuy();
        deps.hud.banner('GO — HOLD THE YARD', state.spikeCarrierName ? `${state.spikeCarrierName} carries the spike` : '', 2.5);
      }
      return;
    }

    if (state.phase === 'roundEnd') {
      state.roundEndTimer -= dt;
      updateGrenade(dt);
      if (state.roundEndTimer <= 0) {
        if (matchOver()) {
          state.phase = 'matchEnd';
          const won = state.score.ct > state.score.t;
          state.matchWinner = won ? 'ct' : state.score.ct < state.score.t ? 't' : null;
          deps.hud.showEnd(won, state.score);
          if (won) audio.roundWin();
        } else {
          state.round += 1;
          startRound();
        }
      }
      return;
    }

    if (state.phase !== 'live') return;

    state.roundTimer -= dt;

    // --- player look + move
    const look = input.look;
    player.yaw -= look.dx * 0.0022 * input.sensitivity;
    player.pitch -= look.dy * 0.0022 * input.sensitivity;
    player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
    const walked = player.update(dt, input.move, world);
    if (walked > 0) {
      player.stepTimer += walked;
      if (player.stepTimer > 2.4) {
        player.stepTimer = 0;
        audio.step();
      }
    }

    // --- player weapon
    const w = state.weapon;
    updateWeapon(w, dt);
    state.spread = currentSpread(w, player.speed, player.crouched);
    const wantFire = input.firing && player.alive;
    const edge = wantFire && !prevFiring;
    prevFiring = input.firing;
    if (wantFire && (w.def.auto || edge)) {
      const eye = player.eye();
      _origin.set(eye.x, eye.y, eye.z);
      _dir.set(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
      const shot = fireWeapon(w, _dir, player.speed, player.crouched, rng);
      if (shot) {
        if (shot.dry) {
          audio.dryFire();
        } else {
          audio.shot(w.def.id);
          player.pitch += w.recoil * 0.55;
          viewmodel.kick += 0.03;
          const muzzlePos = _tmp.copy(_origin).addScaledVector(_dir, 0.7);
          effects.muzzle(muzzlePos.x, muzzlePos.y, muzzlePos.z, player.yaw, player.pitch);
          resolvePlayerShot(_origin, _dir, shot);
          state.shake = Math.min(0.4, state.shake + 0.03);
        }
      }
    }
    if (input.reload) startReload(w, audio);
    if (input.grenade && state.grenades > 0 && !grenade.active && player.alive) {
      state.grenades -= 1;
      const eye = player.eye();
      _dir.set(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch) + 0.25, -Math.cos(player.yaw) * Math.cos(player.pitch)).normalize();
      throwGrenade(grenade, { x: eye.x, y: eye.y - 0.1, z: eye.z }, _dir, 'player');
      grenadeMesh.visible = true;
      audio.click();
    }
    updateGrenade(dt);

    // --- defuse / plant progress for the player (defender: defuse).
    state.playerDefuse = 0;
    if (state.planted && player.alive) {
      const site = MAP.sites[state.plantedSite];
      const d = Math.hypot(player.pos.x - site.x, player.pos.z - site.z);
      if (d < site.r && input.use) {
        state.playerDefuse += dt;
        if (Math.floor(state.playerDefuse * 4) !== Math.floor((state.playerDefuse - dt) * 4)) audio.plantBeep();
        if (state.playerDefuse >= ROUND.defuseTime) {
          state.playerDefuse = 0;
          state.planted = false;
          audio.plantDone();
          endRound('ct', 'Spike defused');
          return;
        }
      }
    }

    // --- spike explosion clock
    if (state.planted) {
      state.explodeTimer -= dt;
      if (state.explodeTimer <= 0) {
        const site = MAP.sites[state.plantedSite];
        effects.explosion(site.x, 0.6, site.z);
        audio.explosion();
        const d = Math.hypot(player.pos.x - site.x, player.pos.z - site.z);
        if (player.alive && d < 9) {
          player.damage(120);
          if (!player.alive) state.deaths += 1;
        }
        state.planted = false;
        endRound('t', 'Spike detonated');
        return;
      }
    }

    // --- bots
    playerDesc.eyeY = player.eyeHeight;
    playerDesc.alive = player.alive;
    playerDesc.crouched = player.crouched;
    playerDesc.speed = player.speed;
    for (const b of bots) {
      const desc = botDescs.get(b);
      desc.alive = b.alive;
      desc.speed = b.speed;
      desc.crouched = false;
    }
    for (const b of bots) {
      if (!b.alive) continue;
      updateBot(b, dt, {
        world,
        rng,
        time: state.time,
        phase: 'live',
        enemies: botEnemies.get(b),
        planted: state.planted,
        spikePlanted: state.planted,
        plantedSite: state.plantedSite,
        onShoot(botShooter, dir, shot) {
          const mx = botShooter.pos.x - Math.sin(botShooter.yaw) * 0.5;
          const my = 1.45;
          const mz = botShooter.pos.z - Math.cos(botShooter.yaw) * 0.5;
          const distToPlayer = Math.hypot(player.pos.x - botShooter.pos.x, player.pos.z - botShooter.pos.z);
          effects.tracer(mx, my, mz, mx + dir.x * Math.min(30, distToPlayer + 4), my + dir.y * 8, mz + dir.z * Math.min(30, distToPlayer + 4), shot.def.tracer);
          botShooter.lastSeenByPlayerAt = state.time;
          if (distToPlayer < 30) audio.shot(shot.def.id);
          effects.muzzle(mx, my, mz, botShooter.yaw, 0);
        },
        onDamage(targetDesc, dmg, head, attacker) {
          if (targetDesc.isPlayer) damagePlayer(dmg, attacker.name, head);
          else damageBotTarget(targetDesc.ref, dmg, head, attacker.name);
        },
        onPlant(botPlanter, siteKey) {
          state.planted = true;
          state.plantedSite = siteKey;
          state.explodeTimer = ROUND.explodeTime;
          state.spikeCarrierName = null;
          audio.plantDone();
          deps.hud.banner('SPIKE PLANTED', `Defuse it at SITE ${siteKey} before it blows`, 3.5);
        },
        onDefuse(botDefuser) {
          state.planted = false;
          audio.plantDone();
          endRound('ct', `${botDefuser.name} defused the spike`);
        },
      });
    }

    // --- round end checks
    if (!state.planted) {
      if (aliveCount('t') === 0) {
        endRound('ct', 'Viper squad eliminated');
        return;
      }
      if (aliveCount('ct') === 0) {
        endRound('t', 'Ember squad eliminated');
        return;
      }
      if (state.roundTimer <= 0) {
        endRound('ct', 'Time expired — spike never planted');
        return;
      }
    } else {
      if (aliveCount('ct') === 0 && aliveCount('t') === 0) {
        endRound('t', 'Spike detonated');
        return;
      }
      if (state.roundTimer <= -ROUND.explodeTime) {
        endRound('t', 'Spike detonated');
      }
    }
  }

  return {
    state,
    player,
    bots,
    viewmodel,
    get weapon() {
      return state.weapon;
    },
    startMatch,
    startRound,
    buy,
    endRound,
    aliveCount,
    // Advance the simulation by real dt, sliced into fixed steps.
    update(dt, input) {
      stepAccum += Math.min(dt, 0.25);
      while (stepAccum >= STEP) {
        step(STEP, input);
        stepAccum -= STEP;
      }
    },
    // Deterministic staging for screenshots: put the game in a
    // known state without pointer lock or user input.
    stage(mode) {
      if (mode === 'menu') {
        state.phase = 'menu';
        return;
      }
      if (mode === 'action') {
        startMatch(SEED);
        // Jump straight into the live round, player mid-map looking
        // down the long lane at two visible attackers.
        state.phase = 'live';
        state.staged = true;
        state.buyTimer = 0;
        deps.hud.hideBuy();
        deps.hud.hideMenu();
        player.pos.set(-2, 0, 8);
        player.yaw = -0.5;
        player.pitch = 0.02;
        const t1 = bots.find((b) => b.name === 'RAZOR');
        const t2 = bots.find((b) => b.name === 'NIX');
        for (const [bot, bx, bz] of [[t1, 2, -2], [t2, 6, -4]]) {
          if (!bot) continue;
          bot.pos.set(bx, 0, bz);
          bot.group.position.set(bx, 0, bz);
          // Face the player so the visor reads in the shot.
          bot.yaw = Math.atan2(-(player.pos.x - bx), -(player.pos.z - bz));
          bot.group.rotation.y = bot.yaw;
        }
        state.weapon = createWeaponState('rifle');
        state.money = 3250;
        state.roundTimer = 87;
        deps.hud.hideBanner();
        return;
      }
      if (mode === 'won') {
        startMatch(SEED);
        state.phase = 'live';
        deps.hud.hideBuy();
        deps.hud.hideMenu();
        state.score.ct = 3;
        state.score.t = 2;
        state.round = 6;
        // Win the round on the spot: all attackers down.
        for (const b of bots) {
          if (b.team === 't') {
            b.alive = false;
            b.state = 'dead';
            b.group.rotation.x = -Math.PI / 2;
            b.group.position.y = 0.25;
          }
        }
        player.pos.set(-6, 0, -2);
        player.yaw = -1.2;
        state.weapon = createWeaponState('rifle');
        state.money = 6150;
        endRound('ct', 'Viper squad eliminated');
        state.phase = 'roundEnd';
        state.roundEndTimer = 4.0;
      }
    },
  };
}

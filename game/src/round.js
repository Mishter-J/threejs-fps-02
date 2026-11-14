// round.js — the round machine and the economy.
//
// Phases: buy (12 s, shop open) -> live (100 s, plant or eliminate) ->
// roundEnd (5 s, banner) -> next round, until one team takes 8 rounds
// and the match ends. Money is earned per kill, per plant and per round,
// and spent in the buy menu between rounds.

import { WEAPONS, BUY_CATALOG } from './weapons.js';
import { resetRound, ROUND_TIME, BUY_TIME, ROUND_END_TIME, MATCH_WIN_ROUNDS, BOMB_TIMER } from './state.js';
import { resetBotsForRound, transferBomb } from './bots.js';
import { ATK_SPAWN } from './map.js';
import * as audio from './audio.js';

export function aliveCount(state, team) {
  if (team === 'atk') {
    return (state.player.alive ? 1 : 0) + state.bots.filter((b) => b.team === 'atk' && b.alive).length;
  }
  return state.bots.filter((b) => b.team === 'def' && b.alive).length;
}

/** Fresh match: score, money and arsenal reset, then round one. */
export function startMatch(state) {
  state.score = { atk: 0, def: 0 };
  state.lossStreak = 0;
  state.round = 1;
  state.matchWinner = null;
  const p = state.player;
  p.money = 800;
  p.kills = 0;
  p.deaths = 0;
  p.grenades = 0;
  p.armor = 0;
  p.weapons = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
  p.current = 'pistol';
  startRound(state);
}

/** Set up one round: positions, health, the charge with the player. */
export function startRound(state) {
  resetRound(state);
  resetBotsForRound(state);
  const s = ATK_SPAWN[0];
  const p = state.player;
  p.x = s.x;
  p.z = s.z;
  p.yaw = s.yaw;
  p.pitch = 0;
  p.vx = 0;
  p.vz = 0;
  p.armor = 0;
  // Refill the magazines of everything owned; reserves stay as bought.
  for (const [id, owned] of Object.entries(p.weapons)) {
    owned.mag = WEAPONS[id].mag;
  }
  state.bomb.carrier = 'player';
}

/** Buy one catalog item during the buy phase. Returns a message. */
export function buyItem(state, id) {
  const p = state.player;
  if (state.phase !== 'buy') return { ok: false, msg: 'The buy phase is over.' };
  const item = BUY_CATALOG.find((c) => c.id === id);
  if (!item) return { ok: false, msg: 'No such item.' };
  if (p.money < item.price) {
    audio.playDenied();
    return { ok: false, msg: `Need $${item.price} — you have $${p.money}.` };
  }
  if (id === 'grenade') {
    p.money -= item.price;
    p.grenades = (p.grenades ?? 0) + 1;
  } else if (id === 'kevlar') {
    if (p.armor >= 100) return { ok: false, msg: 'Kevlar already at full.' };
    p.money -= item.price;
    p.armor = 100;
  } else if (id === 'ammo') {
    p.money -= item.price;
    for (const [wid, owned] of Object.entries(p.weapons)) {
      owned.reserve = WEAPONS[wid].reserve;
    }
  } else {
    if (p.weapons[id]) return { ok: false, msg: 'Already owned.' };
    p.money -= item.price;
    p.weapons[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    p.current = id;
  }
  audio.playBuy();
  return { ok: true, msg: `${item.name} bought.` };
}

function endRound(ctx, winner, reason) {
  const { state } = ctx;
  if (state.phase !== 'live') return;
  state.phase = 'roundEnd';
  state.phaseTime = ROUND_END_TIME;
  state.roundWinner = winner;
  state.roundReason = reason;
  const p = state.player;
  if (winner === 'atk') {
    state.score.atk++;
    state.lossStreak = 0;
    p.money += 3250;
    audio.playRoundWin();
    ctx.announce?.(roundTitle(winner, reason), 'Vanguard takes the round  ·  +$3250');
  } else {
    state.score.def++;
    state.lossStreak++;
    p.money += Math.min(3400, 1900 + 500 * (state.lossStreak - 1));
    audio.playRoundLose();
    ctx.announce?.(roundTitle(winner, reason), `Jackals take the round  ·  +$${Math.min(3400, 1900 + 500 * (state.lossStreak - 1))}`);
  }
  if (state.score.atk >= MATCH_WIN_ROUNDS || state.score.def >= MATCH_WIN_ROUNDS) {
    state.matchWinner = state.score.atk >= MATCH_WIN_ROUNDS ? 'atk' : 'def';
  }
}

function roundTitle(winner, reason) {
  const who = winner === 'atk' ? 'Vanguard wins the round' : 'Jackals win the round';
  const why = {
    elimination: 'enemy team eliminated',
    detonation: 'the charge detonated',
    defused: 'the charge was defused',
    time: 'time expired — charge never planted',
  }[reason] ?? reason;
  return `${who} — ${why}`;
}

/** The round machine, called once per fixed step. */
export function updateRound(ctx, dt) {
  const { state } = ctx;
  if (state.phase === 'menu' || state.phase === 'matchEnd') return;
  state.phaseTime -= dt;

  if (state.phase === 'buy') {
    if (state.phaseTime <= 0) {
      state.phase = 'live';
      state.phaseTime = ROUND_TIME;
      ctx.announce?.(`Round ${state.round} — plant the charge at A or B`, 'Hold E on a site to plant');
    }
    return;
  }

  if (state.phase === 'live') {
    // The planted charge ticks down, beeping faster as it nears zero.
    const bomb = state.bomb;
    if (bomb.state === 'planted') {
      bomb.timer -= dt;
      const whole = Math.ceil(bomb.timer);
      if (whole !== bomb.lastBeep) {
        bomb.lastBeep = whole;
        audio.playBeep(whole <= 5);
      }
      if (bomb.timer <= 0) {
        bomb.state = 'exploded';
        ctx.onBombDetonated?.();
        endRound(ctx, 'atk', 'detonation');
        return;
      }
    }
    if (bomb.state === 'defused') {
      endRound(ctx, 'def', 'defused');
      return;
    }
    const atkAlive = aliveCount(state, 'atk');
    const defAlive = aliveCount(state, 'def');
    if (defAlive === 0) {
      endRound(ctx, 'atk', 'elimination');
      return;
    }
    if (atkAlive === 0 && bomb.state !== 'planted') {
      endRound(ctx, 'def', 'elimination');
      return;
    }
    if (state.phaseTime <= 0) {
      // Time out: attackers lose unless the charge is already ticking.
      if (bomb.state === 'planted') {
        state.phaseTime = Math.max(state.phaseTime, 0.01);
        return;
      }
      endRound(ctx, 'def', 'time');
      return;
    }
    return;
  }

  if (state.phase === 'roundEnd') {
    if (state.phaseTime <= 0) {
      if (state.matchWinner) {
        state.phase = 'matchEnd';
        ctx.announce?.(
          state.matchWinner === 'atk' ? 'MATCH WON — Vanguard takes Dustline Yard!' : 'MATCH LOST — the Jackals hold the yard.',
          'Press Enter to play again',
        );
      } else {
        state.round++;
        startRound(state);
      }
    }
  }
}

/** The player fell while carrying the charge: pass it to a living ally. */
export function onPlayerDeath(state) {
  if (state.bomb.state === 'carried' && state.bomb.carrier === 'player') {
    transferBomb(state);
  }
}

// round.js — the round state machine: buy (8 s) → live (100 s) → over.
// A round ends by elimination, by the planted charge exploding, by a
// defuse, or by the clock (defenders win a scoreless round). Money is paid
// at the end of every round; the first team to 5 takes the match.
import {
  BOMB_SECONDS,
  LOSS_MONEY,
  MATCH_TARGET,
  PLANT_MONEY,
  ROUND_SECONDS,
  START_MONEY,
  WIN_MONEY,
  addMoney,
  resetForRound,
  setBanner,
} from './state.js';
import { sfx } from './audio.js';

export function createRoundController(S, W) {
  function startMatch() {
    S.round = 1;
    S.score.vanguard = 0;
    S.score.jackals = 0;
    S.money = START_MONEY;
    S.kills = 0;
    S.deaths = 0;
    S.player.owned = ['p9'];
    S.player.weapon = 'p9';
    S.player.ammo = { p9: { mag: 12, reserve: 36 } };
    S.player.grenades = 0;
    S.time = 0;
    W.spawnBots();
    resetForRound(S);
  }

  function nextRound() {
    S.round += 1;
    W.spawnBots();
    resetForRound(S);
  }

  function endRound(winner, reason) {
    if (S.phase !== 'live' && S.phase !== 'buy') return;
    S.phase = 'over';
    S.phaseT = 5;
    S.bomb.defuseT = 0;
    S.bomb.defuser = null;
    if (winner === 'vanguard') {
      S.score.vanguard += 1;
      addMoney(S, WIN_MONEY);
      S.result = 'Vanguard win the round — ' + reason;
      setBanner(S, 'ROUND WON — ' + reason, 4);
      sfx.win();
    } else {
      S.score.jackals += 1;
      addMoney(S, LOSS_MONEY);
      S.result = 'Jackals win the round — ' + reason;
      setBanner(S, 'ROUND LOST — ' + reason, 4);
      sfx.lose();
    }
  }

  function plantBomb(siteKey) {
    if (S.bomb.state !== 'carried' || S.phase !== 'live') return;
    const site = W.sites[siteKey];
    S.bomb.state = 'planted';
    S.bomb.site = siteKey;
    S.bomb.x = site.x;
    S.bomb.z = site.z;
    S.bomb.timer = BOMB_SECONDS;
    S.bomb.defuseT = 0;
    if (W.bombMesh) {
      W.bombMesh.position.set(site.x, 0, site.z);
      W.bombMesh.visible = true;
    }
    addMoney(S, PLANT_MONEY);
    setBanner(S, 'Charge planted at Site ' + siteKey + ' — defend it!', 4);
    sfx.plantBeep();
  }

  function defuseBomb() {
    if (S.bomb.state !== 'planted') return;
    S.bomb.state = 'defused';
    if (W.bombMesh) W.bombMesh.visible = false;
    endRound('jackals', 'charge defused by ' + (S.bomb.defuser || 'a Jackal'));
  }

  function explodeBomb() {
    if (S.bomb.state !== 'planted') return;
    S.bomb.state = 'exploded';
    if (W.bombMesh) W.bombMesh.visible = false;
    W.effects.explosion(S.bomb.x, 0.5, S.bomb.z);
    sfx.explosion();
    endRound('vanguard', 'charge detonated at Site ' + S.bomb.site);
  }

  // Called when a bot carrying the charge dies (or the player dies).
  // The charge passes to the nearest living Vanguard bot; if none is left
  // the player carries it again, and if the player is dead the objective
  // is gone and the round is decided by elimination alone.
  function transferBomb(deadBot) {
    const carrier = S.bots.find((b) => b.alive && b.team === 'vanguard');
    if (carrier) {
      S.bomb.carrier = carrier.id;
      carrier.role = 'carrier';
      return;
    }
    if (S.player.alive) {
      S.bomb.carrier = 'player';
      setBanner(S, 'You carry the charge now', 3);
      return;
    }
    S.bomb.state = 'dropped';
    S.bomb.carrier = null;
  }

  // One fixed step of the round clock and the win conditions.
  function step(dt) {
    if (S.phase === 'menu' || S.phase === 'match') return;
    if (S.phase === 'buy') {
      S.phaseT -= dt;
      if (S.phaseT <= 0) {
        S.phase = 'live';
        S.phaseT = ROUND_SECONDS;
        setBanner(S, 'Round ' + S.round + ' — plant the charge at A or B', 3);
      }
      return;
    }
    if (S.phase === 'live') {
      S.phaseT -= dt;
      if (S.bomb.state === 'planted') {
        S.bomb.timer -= dt;
        if (Math.floor(S.bomb.timer * 2) !== Math.floor((S.bomb.timer + dt) * 2)) {
          sfx.beep();
        }
        if (S.bomb.timer <= 0) {
          explodeBomb();
          return;
        }
      }
      const vAlive = S.bots.some((b) => b.alive && b.team === 'vanguard') || S.player.alive;
      const jAlive = S.bots.some((b) => b.alive && b.team === 'jackals');
      if (!jAlive) {
        endRound('vanguard', 'Jackals eliminated');
        return;
      }
      if (!vAlive) {
        endRound('jackals', 'Vanguard eliminated');
        return;
      }
      if (S.phaseT <= 0) {
        if (S.bomb.state === 'planted') return; // the timer decides it
        endRound('jackals', 'time expired — charge never planted');
      }
      return;
    }
    if (S.phase === 'over') {
      S.phaseT -= dt;
      if (S.phaseT > 0) return;
      if (S.score.vanguard >= MATCH_TARGET || S.score.jackals >= MATCH_TARGET) {
        S.phase = 'match';
        S.matchResult =
          S.score.vanguard >= MATCH_TARGET
            ? 'VANGUARD TAKE THE MATCH ' + S.score.vanguard + ' — ' + S.score.jackals
            : 'JACKALS TAKE THE MATCH ' + S.score.jackals + ' — ' + S.score.vanguard;
        if (S.score.vanguard >= MATCH_TARGET) sfx.win();
        else sfx.lose();
        return;
      }
      nextRound();
    }
  }

  return { startMatch, nextRound, endRound, plantBomb, defuseBomb, explodeBomb, transferBomb, step };
}

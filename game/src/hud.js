// hud.js — every pixel of interface is built here, in code, so index.html
// stays a bare shell: top bar (round, timer, score, money), team counts,
// health and ammo, a crosshair that opens with the current spread, the
// killfeed, a live minimap, the buy menu, the menu and match overlays, and
// the plant/defuse progress. Nothing here simulates; it only reads state.
import { BUY_ROWS, WEAPONS, buy } from './weapons.js';
import { currentSpread } from './combat.js';
import { PLANT_SECONDS } from './state.js';
import { segmentBlocked } from './collision.js';
import { initAudio, sfx } from './audio.js';

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export function createHud(S, W) {
  const root = el('div', 'hud', document.body);
  const topbar = el('div', 'topbar', root);
  const roundEl = el('span', 'pill', topbar);
  const timerEl = el('span', 'pill timer', topbar);
  const scoreEl = el('span', 'pill', topbar);
  const moneyEl = el('span', 'pill money', topbar);
  const teamsEl = el('div', 'teams', root);
  const vanguardEl = el('span', 'pill', teamsEl);
  const jackalsEl = el('span', 'pill', teamsEl);
  const bombEl = el('span', 'pill bomb', teamsEl, '💣 You carry the charge — hold E on a site to plant');

  const feedEl = el('div', 'feed', root);
  const mapWrap = el('div', 'mapwrap', root);
  const mapCanvas = el('canvas', '', mapWrap);
  mapCanvas.width = 172;
  mapCanvas.height = 142;
  const mapCtx = mapCanvas.getContext('2d');

  const cross = el('div', 'cross', root);
  const crossDot = el('div', 'cdot', cross);
  const crossLines = [];
  for (let i = 0; i < 4; i++) crossLines.push(el('div', 'cline c' + i, cross));

  const hitEl = el('div', 'hitmark', root, '✕');
  const bannerEl = el('div', 'banner', root);
  const plantWrap = el('div', 'plantwrap', root);
  const plantLabel = el('div', 'plantlabel', plantWrap, 'PLANTING…');
  const plantBar = el('div', 'plantbar', plantWrap);
  const plantFill = el('div', 'plantfill', plantBar);
  const promptEl = el('div', 'prompt', root);
  const vignette = el('div', 'vignette', root);
  const dirEl = el('div', 'dirhit', root);

  const hpWrap = el('div', 'hpwrap', root);
  const hpNum = el('div', 'hpnum', hpWrap, '100');
  el('span', 'hplabel', hpWrap, 'HP');
  const hpBar = el('div', 'hpbar', hpWrap);
  const hpFill = el('div', 'hpfill', hpBar);

  const ammoWrap = el('div', 'ammowrap', root);
  const ammoName = el('div', 'ammoname', ammoWrap, 'P9 Sidearm');
  const ammoNum = el('div', 'ammonum', ammoWrap);
  el('div', 'keys', root, 'WASD move · Shift walk · Ctrl crouch · R reload · 1–5 weapons · E plant · B buy · M mute');

  // --- buy menu ---------------------------------------------------------
  const buyEl = el('div', 'buy hidden', root);
  el('div', 'buytitle', buyEl, 'BUY MENU');
  const buyMoney = el('div', 'buymoney', buyEl);
  el('div', 'buyhint', buyEl, 'Click an item, or press its number key.');
  const buyRows = [];
  BUY_ROWS.forEach((row, i) => {
    const r = el('div', 'buyrow', buyEl);
    el('span', 'buyname', r, row.label);
    el('span', 'buydesc', r, row.desc);
    el('span', 'buyprice', r, '$' + row.price);
    r.addEventListener('click', () => buyRow(row.id));
    buyRows.push(r);
  });
  el('div', 'buyhint', buyEl, 'Press B to close. Keys 1–6 buy the row in order.');
  const buyMsg = el('div', 'buymsg', buyEl);

  // --- menu overlay -----------------------------------------------------
  const menuEl = el('div', 'overlay', root);
  const menuCard = el('div', 'card', menuEl);
  el('h1', '', menuCard, 'SANDLINE PROTOCOL');
  el('div', 'subtitle', menuCard, 'Tactical FPS — Dustline Yard');
  el(
    'p',
    '',
    menuCard,
    'Lead the Vanguard against five Jackal defenders. Plant the charge at Site A or Site B and defend it until it blows — or wipe the defence out. Money buys rifles, a scattergun, a marksman rifle and grenades between rounds. Stop to aim: firing on the move is punished.',
  );
  const deployBtn = el('button', 'bigbtn', menuCard, 'DEPLOY');
  deployBtn.addEventListener('click', () => deploy());
  el('div', 'controls', menuCard, 'Mouse look · WASD move · Shift walk slow · Ctrl crouch\nClick fire · R reload · 1–5 weapons · E plant · B buy · M mute');

  // --- match overlay ----------------------------------------------------
  const matchEl = el('div', 'overlay hidden', root);
  const matchCard = el('div', 'card', matchEl);
  const matchTitle = el('h1', '', matchCard, '');
  el('p', '', matchCard, 'First to 5 rounds takes the match. Your buy menu, your aim and your timing decide it — the Jackals will not wait.');
  const againBtn = el('button', 'bigbtn', matchCard, 'PLAY AGAIN');
  againBtn.addEventListener('click', () => playAgain());

  let lastMapAt = -1;
  let hitAt = -99;
  let hurtAt = -99;

  function deploy() {
    if (S.phase !== 'menu') return;
    initAudio();
    sfx.click();
    W.round.startMatch();
    menuEl.classList.add('hidden');
    W.canvas.requestPointerLock();
  }

  function playAgain() {
    if (S.phase !== 'match') return;
    sfx.click();
    W.round.startMatch();
    matchEl.classList.add('hidden');
    W.canvas.requestPointerLock();
  }

  function buyRow(id) {
    if (S.phase !== 'buy') return;
    const msg = buy(S, id);
    if (msg) {
      buyMsg.textContent = msg;
      sfx.buy();
    }
  }

  function toggleBuy() {
    if (S.phase !== 'buy' && S.phase !== 'live') return;
    buyEl.classList.toggle('hidden');
  }

  function showHitmarker(head, kill) {
    hitEl.textContent = kill ? '✕ KILL' : head ? '✕ HEADSHOT' : '✕';
    hitEl.classList.toggle('head', !!head);
    hitEl.classList.toggle('kill', !!kill);
    hitAt = performance.now();
  }

  function hurtFlash() {
    hurtAt = performance.now();
    const from = S.player.lastDamageFrom;
    const bot = S.bots.find((b) => b.name === from);
    if (bot && S.player.alive) {
      const dx = bot.pos.x - S.player.pos.x;
      const dz = bot.pos.z - S.player.pos.z;
      const bearing = Math.atan2(dx, dz);
      const rel = bearing + S.player.yaw;
      dirEl.style.transform = 'translate(-50%,-50%) rotate(' + (-rel) + 'rad)';
      dirEl.style.opacity = '0.9';
    }
  }

  function fmtTime(t) {
    const s = Math.max(0, Math.ceil(t));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function drawMinimap() {
    const ctx = mapCtx;
    const b = W.bounds;
    const sx = 172 / (b.x1 - b.x0);
    const sz = 142 / (b.z1 - b.z0);
    const X = (x) => (x - b.x0) * sx;
    const Z = (z) => (z - b.z0) * sz;
    ctx.fillStyle = '#141210';
    ctx.fillRect(0, 0, 172, 142);
    ctx.fillStyle = '#c9b18a';
    for (const c of W.colliders) {
      ctx.fillRect(X(c.x0), Z(c.z0), (c.x1 - c.x0) * sx, (c.z1 - c.z0) * sz);
    }
    for (const key of ['A', 'B']) {
      const s = W.sites[key];
      ctx.fillStyle = key === 'A' ? '#1f8a7a' : '#c65a2e';
      ctx.fillRect(X(s.x - 4), Z(s.z - 4), 8 * sx, 8 * sz);
      ctx.fillStyle = '#fff8e8';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(key, X(s.x), Z(s.z) + 4);
    }
    // Teammates: blue dots. Enemies: red dots only while recently seen.
    for (const bot of S.bots) {
      if (!bot.alive) continue;
      if (bot.team === 'vanguard') {
        ctx.fillStyle = '#5aa2ff';
        ctx.beginPath();
        ctx.arc(X(bot.pos.x), Z(bot.pos.z), 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (botSpotted(bot)) {
        ctx.fillStyle = '#ff5a3c';
        ctx.beginPath();
        ctx.arc(X(bot.pos.x), Z(bot.pos.z), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // The player: a white arrow that turns with the aim.
    const p = S.player;
    if (p.alive) {
      ctx.save();
      ctx.translate(X(p.pos.x), Z(p.pos.z));
      // Arrow drawn pointing north (-z); rotate so it points where the
      // player faces: east is +90 degrees on the map.
      ctx.rotate(Math.atan2(-Math.sin(p.yaw), Math.cos(p.yaw)));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(4, 4);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // An enemy counts as spotted when the player (or a teammate) has a clear
  // line of sight to them right now, or saw them in the last 3 seconds.
  function botSpotted(bot) {
    if (bot.lastSeenByPlayerAt && S.time - bot.lastSeenByPlayerAt < 3) return true;
    const p = S.player;
    if (!p.alive) return false;
    const d = Math.hypot(bot.pos.x - p.pos.x, bot.pos.z - p.pos.z);
    if (d > 45) return false;
    if (segmentBlocked(p.pos.x, 1.5, p.pos.z, bot.pos.x, 1.4, bot.pos.z, W.colliders)) return false;
    bot.lastSeenByPlayerAt = S.time;
    return true;
  }

  function update(now) {
    const p = S.player;
    // Top bar.
    roundEl.textContent = 'ROUND ' + S.round;
    const phaseLabel = S.phase === 'buy' ? 'BUY ' : S.phase === 'live' ? '' : S.phase.toUpperCase() + ' ';
    timerEl.textContent = phaseLabel + fmtTime(S.phaseT);
    timerEl.classList.toggle('urgent', S.phase === 'live' && S.phaseT < 15);
    scoreEl.textContent = S.score.vanguard + ' — ' + S.score.jackals;
    moneyEl.textContent = '$' + S.money;
    const vAlive = S.bots.filter((b) => b.alive && b.team === 'vanguard').length + (p.alive ? 1 : 0);
    const jAlive = S.bots.filter((b) => b.alive && b.team === 'jackals').length;
    vanguardEl.textContent = 'Vanguard ' + vAlive;
    jackalsEl.textContent = 'Jackals ' + jAlive;
    if (S.bomb.state === 'planted') {
      bombEl.textContent = '💣 Charge at Site ' + S.bomb.site + ' — ' + fmtTime(S.bomb.timer);
      bombEl.classList.add('danger');
    } else if (S.bomb.carrier === 'player' && p.alive) {
      bombEl.textContent = '💣 You carry the charge — hold E on a site to plant';
      bombEl.classList.remove('danger');
    } else if (S.bomb.state === 'carried') {
      const carrier = S.bots.find((b) => b.id === S.bomb.carrier);
      bombEl.textContent = '💣 ' + (carrier ? carrier.name : 'Teammate') + ' carries the charge';
      bombEl.classList.remove('danger');
    } else {
      bombEl.textContent = '💣 Charge ' + S.bomb.state;
      bombEl.classList.remove('danger');
    }
    // Health and ammo.
    hpNum.textContent = String(Math.max(0, Math.round(p.hp)));
    hpFill.style.width = Math.max(0, p.hp) + '%';
    hpFill.classList.toggle('low', p.hp <= 30);
    const w = WEAPONS[p.weapon];
    ammoName.textContent = w.name + (p.kevlar ? ' · Kevlar' : '');
    if (p.weapon === 'frag') {
      ammoNum.innerHTML = p.grenades + ' <small>/ 2</small>';
    } else {
      const a = p.ammo[p.weapon] || { mag: 0, reserve: 0 };
      ammoNum.innerHTML =
        (p.reloading > 0 ? '––' : a.mag) + ' <small>/ ' + a.reserve + '</small>';
    }
    // Crosshair gap follows the live spread: stopping to aim is visible.
    const gap = 5 + currentSpread(S) * 3.2;
    crossLines[0].style.transform = 'translate(-50%,-' + (gap + 9) + 'px)';
    crossLines[1].style.transform = 'translate(-50%,' + gap + 'px)';
    crossLines[2].style.transform = 'translate(-' + (gap + 9) + 'px,-50%)';
    crossLines[3].style.transform = 'translate(' + gap + 'px,-50%)';
    cross.style.opacity = S.phase === 'live' && p.alive ? '1' : '0.25';
    // Banner and result.
    if (S.bannerT > 0) {
      bannerEl.textContent = S.banner;
      bannerEl.style.opacity = '1';
    } else if (S.phase === 'over') {
      bannerEl.textContent = S.result;
      bannerEl.style.opacity = '1';
    } else {
      bannerEl.style.opacity = '0';
    }
    // Plant progress.
    if (p.plantT > 0 && p.alive) {
      plantWrap.style.display = 'block';
      plantFill.style.width = (p.plantT / PLANT_SECONDS) * 100 + '%';
    } else {
      plantWrap.style.display = 'none';
    }
    // Click-to-aim prompt when the pointer is not locked mid-round.
    promptEl.style.display =
      S.phase === 'live' && p.alive && document.pointerLockElement !== W.canvas ? 'block' : 'none';
    promptEl.textContent = 'Click the game to aim';
    // Hitmarker and hurt feedback fade out.
    hitEl.style.opacity = now - hitAt < 450 ? '1' : '0';
    vignette.style.opacity = now - hurtAt < 500 ? String(0.55 * (1 - (now - hurtAt) / 500)) : '0';
    dirEl.style.opacity = now - hurtAt < 900 ? String(0.9 * (1 - (now - hurtAt) / 900)) : '0';
    // Killfeed, newest last.
    const feedText = S.feed
      .filter((f) => S.time - f.t < 6)
      .map((f) => f.text)
      .join('\n');
    if (feedEl.textContent !== feedText) feedEl.textContent = feedText;
    // Buy menu state.
    buyMoney.textContent = '$' + S.money;
    if (S.phase !== 'buy') buyEl.classList.add('hidden');
    // Match overlay.
    if (S.phase === 'match') {
      matchTitle.textContent = S.matchResult;
      matchEl.classList.remove('hidden');
    }
    // Minimap at ~8 Hz — cheap, and enough for a tactical read.
    if (now - lastMapAt > 120) {
      lastMapAt = now;
      drawMinimap();
    }
    // Spectating label.
    if (!p.alive && p.spectating && S.phase === 'live') {
      const mate = S.bots.find((b) => b.id === p.spectating);
      bannerEl.textContent = 'SPECTATING ' + (mate ? mate.name : '');
      bannerEl.style.opacity = '1';
    }
  }

  return { update, deploy, playAgain, toggleBuy, buyRow, showHitmarker, hurtFlash };
}

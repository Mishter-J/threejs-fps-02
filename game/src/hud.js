// hud.js — every DOM update for the game. The markup lives in
// index.html; this module owns the cached element handles, the
// change-only writes (no layout thrash), the killfeed, the buy menu
// and the 2D minimap. No game logic lives here.

import { WEAPONS, GRENADE, ARMOR_PRICE, MAP } from './config.js';

const BUY_ITEMS = [
  { key: '1', id: 'smg', label: 'SWARM-7 SMG', price: WEAPONS.smg.price },
  { key: '2', id: 'rifle', label: 'VK-9 RIFLE', price: WEAPONS.rifle.price },
  { key: '3', id: 'sniper', label: 'LONGSHOT-50', price: WEAPONS.sniper.price },
  { key: '4', id: 'grenade', label: 'FRAG GRENADE', price: GRENADE.price },
  { key: '5', id: 'armor', label: 'KEVLAR VEST', price: ARMOR_PRICE },
];

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'),
    healthNum: $('health-num'),
    healthFill: $('health-fill'),
    armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    grenades: $('grenades'),
    timer: $('timer'),
    scoreCt: $('score-ct'),
    scoreT: $('score-t'),
    roundNum: $('round-num'),
    money: $('money'),
    objective: $('objective'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    killfeed: $('killfeed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    buyMenu: $('buy-menu'),
    buyRows: $('buy-rows'),
    buyMoney: $('buy-money'),
    menuScreen: $('menu-screen'),
    endScreen: $('end-screen'),
    endTitle: $('end-title'),
    endSub: $('end-sub'),
    pauseScreen: $('pause-screen'),
    minimap: $('minimap'),
    vignette: $('damage-vignette'),
    progressWrap: $('progress-wrap'),
    progressFill: $('progress-fill'),
    progressLabel: $('progress-label'),
    hint: $('hint'),
  };
  const mm = el.minimap.getContext('2d');
  const cache = {};
  let bannerTimer = 0;
  let hitTimer = 0;

  function setText(node, key, value) {
    if (cache[key] !== value) {
      cache[key] = value;
      node.textContent = value;
    }
  }

  function drawMinimap(state) {
    const W = 168;
    const H = 138;
    const sx = W / (MAP.halfW * 2 + 4);
    const sz = H / (MAP.halfD * 2 + 4);
    const toX = (x) => (x + MAP.halfW + 2) * sx;
    const toY = (z) => (z + MAP.halfD + 2) * sz;
    mm.clearRect(0, 0, W, H);
    mm.fillStyle = 'rgba(12, 12, 18, 0.82)';
    mm.fillRect(0, 0, W, H);
    mm.fillStyle = '#3a3340';
    mm.fillRect(toX(-MAP.halfW), toY(-MAP.halfD), MAP.halfW * 2 * sx, MAP.halfD * 2 * sz);
    // Walls.
    mm.fillStyle = '#8a6a55';
    for (const w of [...MAP.walls, ...MAP.crates]) {
      mm.fillRect(toX(w.x - w.w / 2), toY(w.z - w.d / 2), w.w * sx, w.d * sz);
    }
    // Sites.
    for (const key of ['A', 'B']) {
      const s = MAP.sites[key];
      mm.strokeStyle = key === 'A' ? '#3f7d6b' : '#9c3d2e';
      mm.lineWidth = 2;
      mm.beginPath();
      mm.arc(toX(s.x), toY(s.z), s.r * sx, 0, Math.PI * 2);
      mm.stroke();
      mm.fillStyle = '#fff';
      mm.font = 'bold 11px monospace';
      mm.fillText(key, toX(s.x) - 3, toY(s.z) + 4);
    }
    // Spike.
    if (state.planted) {
      const s = MAP.sites[state.plantedSite];
      mm.fillStyle = '#ffb347';
      mm.beginPath();
      mm.arc(toX(s.x), toY(s.z), 4, 0, Math.PI * 2);
      mm.fill();
    }
    // Bots: enemies only when recently seen or firing.
    for (const b of state.bots) {
      if (!b.alive) continue;
      const seen = state.time - (b.lastSeenByPlayerAt || -99) < 3;
      if (b.team === 'ct') {
        mm.fillStyle = '#5ec8a0';
        mm.beginPath();
        mm.arc(toX(b.pos.x), toY(b.pos.z), 3.5, 0, Math.PI * 2);
        mm.fill();
      } else if (seen) {
        mm.fillStyle = '#ff5a3c';
        mm.beginPath();
        mm.arc(toX(b.pos.x), toY(b.pos.z), 3.5, 0, Math.PI * 2);
        mm.fill();
      }
    }
    // Player arrow.
    const p = state.player;
    const px = toX(p.pos.x);
    const py = toY(p.pos.z);
    mm.save();
    mm.translate(px, py);
    mm.rotate(Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw)) + Math.PI / 2);
    mm.fillStyle = '#7fb069';
    mm.beginPath();
    mm.moveTo(0, -7);
    mm.lineTo(5, 5);
    mm.lineTo(-5, 5);
    mm.closePath();
    mm.fill();
    mm.restore();
  }

  return {
    el,
    showMenu() {
      el.menuScreen.classList.remove('hidden');
      el.endScreen.classList.add('hidden');
      el.hud.classList.add('hidden');
    },
    hideMenu() {
      el.menuScreen.classList.add('hidden');
      el.hud.classList.remove('hidden');
    },
    showEnd(won, score) {
      el.endTitle.textContent = won ? 'MATCH WON' : won === null ? 'MATCH DRAW' : 'MATCH LOST';
      el.endTitle.style.color = won ? '#7fb069' : won === null ? '#ffb347' : '#ff5a3c';
      el.endSub.textContent = `Final score — EMBER ${score.ct} : ${score.t} VIPER`;
      el.endScreen.classList.remove('hidden');
    },
    hideEnd() {
      el.endScreen.classList.add('hidden');
    },
    showPause(show) {
      el.pauseScreen.classList.toggle('hidden', !show);
    },
    banner(title, sub, seconds) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub || '';
      el.banner.classList.remove('hidden');
      bannerTimer = seconds || 3;
    },
    hideBanner() {
      el.banner.classList.add('hidden');
      bannerTimer = 0;
    },
    hitmark(head) {
      el.hitmarker.classList.remove('hidden');
      el.hitmarker.style.borderColor = head ? '#ff5a3c' : '#ffffff';
      hitTimer = 0.12;
    },
    kill(killer, victim, head) {
      const row = document.createElement('div');
      row.className = 'kill-row';
      row.innerHTML = '';
      const k = document.createElement('span');
      k.className = killer === 'YOU' ? 'kf-you' : 'kf-foe';
      k.textContent = killer;
      const mid = document.createElement('span');
      mid.className = 'kf-mid';
      mid.textContent = head ? ' \u2316 ' : ' \u2715 ';
      const v = document.createElement('span');
      v.className = victim === 'YOU' ? 'kf-you' : 'kf-foe';
      v.textContent = victim;
      row.append(k, mid, v);
      el.killfeed.prepend(row);
      while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
      setTimeout(() => row.remove(), 6000);
    },
    renderBuy(state, onBuy) {
      el.buyRows.innerHTML = '';
      for (const item of BUY_ITEMS) {
        const row = document.createElement('div');
        row.className = 'buy-row';
        const owned = item.id === 'grenade'
          ? state.grenades > 0
          : item.id === 'armor'
            ? state.player.armor > 0
            : state.weapon.def.id === item.id;
        const afford = state.money >= item.price;
        row.innerHTML = `<span class="buy-key">[${item.key}]</span> <span class="buy-name">${item.label}</span> <span class="buy-price">$${item.price}</span>`;
        if (owned) row.classList.add('owned');
        if (!afford && !owned) row.classList.add('poor');
        row.addEventListener('click', () => onBuy(item.id));
        el.buyRows.appendChild(row);
      }
      setText(el.buyMoney, 'buyMoney', `$${state.money}`);
      el.buyMenu.classList.remove('hidden');
    },
    hideBuy() {
      el.buyMenu.classList.add('hidden');
    },
    setHint(text) {
      setText(el.hint, 'hint', text);
    },
    update(state, dt) {
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) this.hideBanner();
      }
      if (hitTimer > 0) {
        hitTimer -= dt;
        if (hitTimer <= 0) el.hitmarker.classList.add('hidden');
      }
      const p = state.player;
      setText(el.healthNum, 'hp', String(Math.ceil(p.health)));
      el.healthFill.style.width = `${Math.max(0, p.health)}%`;
      el.healthFill.style.background = p.health > 50 ? '#7fb069' : p.health > 25 ? '#ffb347' : '#ff5a3c';
      setText(el.armorNum, 'armor', p.armor > 0 ? `ARMOR ${Math.ceil(p.armor)}` : '');
      const w = state.weapon;
      setText(el.ammoMag, 'mag', w.reloading > 0 ? '--' : String(w.mag));
      setText(el.ammoReserve, 'res', String(w.reserve));
      setText(el.weaponName, 'wname', w.def.name);
      setText(el.grenades, 'nades', `FRAG x${state.grenades}`);
      const t = Math.max(0, Math.ceil(state.roundTimer));
      setText(el.timer, 'timer', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
      setText(el.scoreCt, 'sct', String(state.score.ct));
      setText(el.scoreT, 'st', String(state.score.t));
      setText(el.roundNum, 'round', `ROUND ${state.round}`);
      setText(el.money, 'money', `$${state.money}`);
      const obj = state.phase === 'roundEnd' || state.phase === 'matchEnd'
        ? (state.roundReason || 'ROUND OVER')
        : state.planted
        ? `SPIKE PLANTED ${state.plantedSite} — DEFUSE IT (${Math.ceil(state.explodeTimer)}s)`
        : state.phase === 'buy'
          ? 'BUY PHASE — press B or click to buy, then the round starts'
          : state.spikeCarrierName
            ? `STOP THE SPIKE — ${state.spikeCarrierName} carries it`
            : 'ELIMINATE VIPER OR STOP THE SPIKE';
      setText(el.objective, 'obj', obj);
      // Crosshair gap grows with spread: stopping to aim pays.
      const gap = 4 + state.spread * 900;
      el.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
      el.crosshair.style.opacity = state.phase === 'live' && p.alive ? '1' : '0.25';
      // Damage vignette fades.
      const v = parseFloat(el.vignette.style.opacity || '0');
      if (v > 0) el.vignette.style.opacity = String(Math.max(0, v - dt * 1.8));
      // Plant / defuse progress.
      const prog = state.playerPlant > 0 ? state.playerPlant : state.playerDefuse > 0 ? state.playerDefuse : 0;
      const progMax = state.playerPlant > 0 ? 3 : 5;
      if (prog > 0) {
        el.progressWrap.classList.remove('hidden');
        el.progressFill.style.width = `${(prog / progMax) * 100}%`;
        setText(el.progressLabel, 'prog', state.playerPlant > 0 ? 'PLANTING…' : 'DEFUSING…');
      } else {
        el.progressWrap.classList.add('hidden');
      }
      drawMinimap(state);
    },
    flashDamage() {
      el.vignette.style.opacity = '0.85';
    },
  };
}

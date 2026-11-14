// hud.js — the DOM HUD: health, ammo, timer, score, money, kill feed,
// crosshair, minimap, buy menu and announcements.
//
// The HUD reads state and writes the DOM; it never writes game state
// except through the buy callback main.js provides. Text is only
// rewritten when it changes, so the HUD costs nothing most frames.

import { WEAPONS, BUY_CATALOG } from './weapons.js';
import { WALLS, SITES } from './map.js';
import { BOMB_TIMER } from './state.js';

const $ = (id) => document.getElementById(id);

export function createHud(onBuy) {
  const el = {
    healthBar: $('health-fill'), healthNum: $('health-num'), armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'), ammoRes: $('ammo-res'), weaponName: $('weapon-name'),
    money: $('money'), timer: $('timer'), score: $('score'), round: $('round-label'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'), feed: $('feed'),
    banner: $('banner'), bannerSub: $('banner-sub'),
    buyMenu: $('buy-menu'), buyItems: $('buy-items'), buyMoney: $('buy-money'), buyMsg: $('buy-msg'),
    minimap: $('minimap'), plantBar: $('plant-bar'), plantFill: $('plant-fill'),
    vignette: $('vignette'), bombStatus: $('bomb-status'),
    teamAtk: $('team-atk'), teamDef: $('team-def'),
    menu: $('menu'), menuTitle: $('menu-title'), menuSub: $('menu-sub'),
    reloadHint: $('reload-hint'),
  };
  const mm = el.minimap.getContext('2d');
  const cache = {};
  let hitAt = -10;
  let bannerUntil = 0;
  let vignetteUntil = 0;

  // Build the buy menu once from the catalog.
  for (const item of BUY_CATALOG) {
    const row = document.createElement('div');
    row.className = 'buy-row';
    row.innerHTML = `<span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
    row.addEventListener('click', () => {
      const r = onBuy(item.id);
      el.buyMsg.textContent = r.msg;
    });
    el.buyItems.appendChild(row);
  }

  function setText(node, key, value) {
    if (cache[key] !== value) {
      cache[key] = value;
      node.textContent = value;
    }
  }

  function drawMinimap(state, now) {
    const w = el.minimap.width;
    const h = el.minimap.height;
    const sx = w / 46;
    const sz = h / 38;
    const X = (x) => (x + 23) * sx;
    const Z = (z) => (z + 19) * sz;
    mm.clearRect(0, 0, w, h);
    mm.fillStyle = 'rgba(20, 16, 10, 0.72)';
    mm.fillRect(0, 0, w, h);
    // Walls.
    mm.fillStyle = '#c9b285';
    for (const b of WALLS) {
      mm.fillRect(X(b.minX), Z(b.minZ), (b.maxX - b.minX) * sx, (b.maxZ - b.minZ) * sz);
    }
    // Sites.
    for (const s of SITES) {
      mm.strokeStyle = s.id === 'A' ? '#ff6b5e' : '#5ec8e6';
      mm.lineWidth = 1.5;
      mm.beginPath();
      mm.arc(X(s.x), Z(s.z), s.r * sx, 0, Math.PI * 2);
      mm.stroke();
      mm.fillStyle = mm.strokeStyle;
      mm.font = 'bold 11px system-ui, sans-serif';
      mm.textAlign = 'center';
      mm.textBaseline = 'middle';
      mm.fillText(s.id, X(s.x), Z(s.z));
    }
    // Planted charge.
    if (state.bomb.state === 'planted') {
      mm.fillStyle = '#ffcf3d';
      mm.beginPath();
      mm.arc(X(state.bomb.x), Z(state.bomb.z), 4, 0, Math.PI * 2);
      mm.fill();
    }
    // Allies (blue) and the player (white arrow).
    for (const b of state.bots) {
      if (!b.alive) continue;
      if (b.team === 'atk') {
        mm.fillStyle = '#6db3ff';
        mm.beginPath();
        mm.arc(X(b.x), Z(b.z), 3, 0, Math.PI * 2);
        mm.fill();
      } else if (now - b.lastSeenAt < 3) {
        // Enemies show only briefly after someone on your team sees them.
        mm.fillStyle = '#ff5a4a';
        mm.beginPath();
        mm.arc(X(b.x), Z(b.z), 3, 0, Math.PI * 2);
        mm.fill();
      }
    }
    const p = state.player;
    if (p.alive) {
      mm.save();
      mm.translate(X(p.x), Z(p.z));
      mm.rotate(Math.atan2(Math.sin(p.yaw), -Math.cos(p.yaw)) + Math.PI);
      mm.fillStyle = '#ffffff';
      mm.beginPath();
      mm.moveTo(0, -6);
      mm.lineTo(4.5, 5);
      mm.lineTo(-4.5, 5);
      mm.closePath();
      mm.fill();
      mm.restore();
    }
  }

  return {
    el,

    showMenu(title, sub, button) {
      el.menu.style.display = 'flex';
      el.menuTitle.textContent = title;
      el.menuSub.textContent = sub;
      $('menu-button').textContent = button;
    },
    hideMenu() { el.menu.style.display = 'none'; },

    announce(text, sub = '') {
      el.banner.textContent = text;
      el.bannerSub.textContent = sub;
      el.banner.style.opacity = '1';
      el.bannerSub.style.opacity = '1';
      bannerUntil = performance.now() / 1000 + 3.2;
    },

    hitmark(head) {
      hitAt = performance.now() / 1000;
      el.hitmarker.className = head ? 'hit head' : 'hit';
      el.hitmarker.style.opacity = '1';
    },

    hurt() {
      vignetteUntil = performance.now() / 1000 + 0.5;
      el.vignette.style.opacity = '0.55';
    },

    setBuyOpen(open) {
      el.buyMenu.style.display = open ? 'block' : 'none';
      if (open) el.buyMsg.textContent = 'Click an item, or press its number key.';
    },

    update(state, now) {
      const p = state.player;
      const w = WEAPONS[p.current];
      const owned = p.weapons[p.current];
      // Health.
      el.healthBar.style.width = `${Math.max(0, p.hp)}%`;
      el.healthBar.style.background = p.hp > 50 ? '#7fc96b' : p.hp > 25 ? '#e8b23d' : '#e0523d';
      setText(el.healthNum, 'hp', `${Math.ceil(p.hp)}`);
      setText(el.armorNum, 'armor', p.armor > 0 ? `🛡 ${Math.ceil(p.armor)}` : '');
      // Weapon + ammo.
      setText(el.weaponName, 'wname', p.current === 'grenade' ? 'Frag-9 Grenade' : w.name);
      if (p.current === 'grenade') {
        setText(el.ammoMag, 'mag', `${p.grenades ?? 0}`);
        setText(el.ammoRes, 'res', 'throw with LMB');
      } else if (owned) {
        setText(el.ammoMag, 'mag', `${owned.mag}`);
        setText(el.ammoRes, 'res', `/ ${owned.reserve}`);
      }
      el.reloadHint.style.display = p.reloading > 0 ? 'block' : 'none';
      if (p.reloading > 0) {
        el.reloadHint.textContent = `Reloading… ${Math.ceil(p.reloading * 10) / 10}s`;
      }
      // Money, timer, score.
      setText(el.money, 'money', `$${p.money}`);
      const t = Math.max(0, Math.ceil(state.phaseTime));
      const mm2 = Math.floor(t / 60);
      const ss = String(t % 60).padStart(2, '0');
      const timerText = state.phase === 'buy' ? `BUY ${mm2}:${ss}` : state.phase === 'live' ? `${mm2}:${ss}` : state.phase.toUpperCase();
      setText(el.timer, 'timer', timerText);
      el.timer.style.color = state.phase === 'live' && t <= 15 ? '#ff6b5e' : '';
      setText(el.score, 'score', `${state.score.atk} — ${state.score.def}`);
      setText(el.round, 'round', `ROUND ${state.round}`);
      const atkAlive = (p.alive ? 1 : 0) + state.bots.filter((b) => b.team === 'atk' && b.alive).length;
      const defAlive = state.bots.filter((b) => b.team === 'def' && b.alive).length;
      setText(el.teamAtk, 'tatk', `Vanguard ${atkAlive}`);
      setText(el.teamDef, 'tdef', `Jackals ${defAlive}`);
      setText(el.buyMoney, 'bmoney', `$${p.money}`);
      // Bomb status line.
      let bombText = '';
      if (state.bomb.state === 'carried') bombText = state.bomb.carrier === 'player' ? '💣 You carry the charge — hold E on a site to plant' : '💣 An ally carries the charge';
      else if (state.bomb.state === 'planted') bombText = `💣 Charge planted at ${state.bomb.site} — ${Math.ceil(state.bomb.timer)}s`;
      else if (state.bomb.state === 'defused') bombText = 'Charge defused';
      else if (state.bomb.state === 'exploded') bombText = 'Charge detonated';
      setText(el.bombStatus, 'bomb', bombText);
      // Plant/defuse progress bar.
      const prog = p.planting > 0 ? p.planting / 3 : state.bomb.progress;
      if (prog > 0 && state.bomb.state !== 'planted') {
        el.plantBar.style.display = 'block';
        el.plantFill.style.width = `${Math.min(100, prog * 100)}%`;
      } else if (state.bomb.state === 'planted') {
        el.plantBar.style.display = 'block';
        el.plantFill.style.width = `${Math.max(0, (state.bomb.timer / BOMB_TIMER) * 100)}%`;
        el.plantFill.style.background = '#ffcf3d';
      } else {
        el.plantBar.style.display = 'none';
      }
      // Crosshair spread follows bloom + movement.
      const spread = 6 + p.bloom * 900 + Math.min(1, p.speed / 4.4) * 14;
      el.crosshair.style.setProperty('--gap', `${spread.toFixed(1)}px`);
      el.crosshair.style.opacity = p.alive && state.phase !== 'menu' ? '1' : '0';
      // Hitmarker + banner + vignette fade.
      if (now - hitAt > 0.18) el.hitmarker.style.opacity = '0';
      if (now > bannerUntil) {
        el.banner.style.opacity = '0';
        el.bannerSub.style.opacity = '0';
      }
      if (now > vignetteUntil) el.vignette.style.opacity = '0';
      // Kill feed.
      const feedHtml = state.feed.slice(0, 5).map((f) => `<div class="feed-row ${f.team}">${f.text}</div>`).join('');
      if (cache.feed !== feedHtml) {
        cache.feed = feedHtml;
        el.feed.innerHTML = feedHtml;
      }
      drawMinimap(state, now);
    },
  };
}

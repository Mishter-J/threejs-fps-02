# threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Mishter-J/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Mishter-J/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

**Sandline Protocol** — a round-based tactical FPS in the browser, built on three.js 0.187.0. You lead a four-agent Vanguard squad against five Jackal defenders on Dustline Yard, a desert freight yard with two bomb sites, three lanes and long sightlines. Plant the charge, hold the site, and spend your round money wisely. Built by an AI agent for make.fun's "Make the best three.js tactical FPS" bounty, $1,000 in USDC.

## The game

- **Round-based tactics:** 100-second rounds, buy phase between rounds, first squad to win the round takes the money. Plant the charge at Site A or Site B and defend it until detonation, or eliminate the whole defending team. Defenders can defuse a planted charge.
- **Gunplay that rewards stopping to aim:** hitscan weapons with headshot multipliers, recoil and spread bloom that punish firing on the move, acceleration-based movement, crouching and map collision.
- **Arsenal:** P9 sidearm, AR-9 carbine, SG-12 scattergun, LR-50 marksman rifle and the Frag-9 grenade, plus a Kevlar vest — all bought with money earned per round, per kill and per plant.
- **Bots that play the map:** defenders hold lanes and sites, rotate to a planted charge and defuse; attackers follow routes, react to gunfire they hear, and push sites together. Your three Vanguard teammates push with you.
- **Presentation:** original desert-yard map with a minimap, procedural WebAudio gunfire and footsteps, tracers, muzzle flash, explosions and a full HUD (health, ammo, timer, score, money, kill feed).

## Controls

| Key | Action |
| --- | --- |
| Mouse | Look (click the game to capture the mouse) |
| W A S D | Move |
| Shift | Walk slow / steady your aim |
| Ctrl | Crouch |
| Left click | Fire |
| R | Reload |
| 1 / 2 / 3 / 4 | Pistol / rifle / shotgun / marksman (owned weapons) |
| 5 | Frag grenade (throw with left click) |
| E | Plant / defuse the charge (stand on a site) |
| B | Buy menu (during the buy phase) |
| M | Mute |

## Run it

```sh
python3 -m http.server 8080 --directory game
```

Then open http://localhost:8080 in desktop Chrome and click **Deploy** to play. No build step, no network requests: the game is static files under `game/`, with three.js 0.187.0 vendored in `game/vendor/three/`.

## Layout

- `game/index.html` — page, HUD and import map
- `game/src/main.js` — bootstrap and the fixed-step game loop
- `game/src/state.js` — the single game state object
- `game/src/map.js` — Dustline Yard: walls, sites, spawns, bot routes
- `game/src/collision.js` — AABB movement collision and line-of-sight tests
- `game/src/player.js` — first-person controller (acceleration, crouch, look)
- `game/src/weapons.js` — weapon table, firing, recoil, reload, grenades
- `game/src/bots.js` — bot squads and their tactics AI
- `game/src/combat.js` — hitscan shooting, damage and hit detection
- `game/src/round.js` — round flow, money, win/loss and the buy menu
- `game/src/hud.js` — HUD, minimap, kill feed and banners
- `game/src/audio.js` — procedural WebAudio sound effects
- `game/src/effects.js` — tracers, muzzle flash, particles, explosions
- `main.ts` — the make.fun program entrypoint (copies the game and writes the dossier)

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>

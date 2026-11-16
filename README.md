# Sandline Protocol — Tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Mishter-J/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Mishter-J/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical FPS in the browser, built with three.js 0.187.0 for the
[make.fun "Make the best three.js tactical FPS" competition](https://make.fun/c/threejs-fps-02).
Repository: [Mishter-J/threejs-fps-02](https://github.com/Mishter-J/threejs-fps-02).

## The game

Lead the Vanguard against five Jackal defenders on **Dustline Yard**, an
original three-lane map (Mid, the north A lane, the south B lane). Plant the
charge at Site A or Site B and defend it until it blows — or wipe the
defence out. First team to 5 rounds takes the match.

- **Complete round flow:** menu → 8 s buy phase → 100 s live round → round
  end → next round, with a match result and replay. Rounds end by
  elimination, detonation, defuse, or the clock.
- **Gunplay that rewards stopping to aim:** hits checked against head and
  body spheres (headshots deal up to 3×), recoil and bloom that grow with
  every shot and with movement speed, acceleration-based movement with
  friction, crouching, and collision with the map.
- **Tactics:** a bomb to plant (hold E) and defuse, money earned every round
  and spent in a buy menu (AR-9 Carbine, SG-12 Scattergun, LR-50 Longshot,
  Frag-9 Grenade, Kevlar, reserve ammo), and bots that follow routes, hold
  site angles, react to what they see and hear, push the plant, and converge
  to defuse.
- **The look:** desert-dusk palette — sand ground, terracotta walls with a
  teal trim, teal Site A, rust Site B — with procedural canvas textures,
  a sun with shadows, a live minimap, tracers, muzzle flashes and a weapon
  viewmodel with recoil and reload motion.

## Controls

Mouse look · WASD move · Shift walk slow · Ctrl crouch · Click fire ·
R reload · 1–5 weapons · E plant · B buy · M mute

## Play it

Serve `game/` with any static file server and open `game/index.html` in
desktop Chrome — no build step, no network requests. Example:

```sh
python3 -m http.server 8080 --directory game
```

## Layout

- `game/index.html` — shell, import map, HUD styles
- `game/src/main.js` — fixed-step loop (1/60 s) and wiring
- `game/src/state.js` — the single state store
- `game/src/weapons.js` — weapon and buy-menu tables
- `game/src/collision.js` — AABB movement and line-of-sight tests
- `game/src/map.js` — Dustline Yard: layout, palette, textures, routes
- `game/src/player.js` — movement, mouse look, viewmodel, planting
- `game/src/combat.js` — hits, spread/recoil, grenades, bot fire
- `game/src/bots.js` — bot AI: routes, holds, vision, hearing, bursts
- `game/src/round.js` — round state machine, money, plant/defuse
- `game/src/hud.js` — HUD, minimap, buy menu, overlays
- `game/src/effects.js` — pooled tracers, puffs, explosions
- `game/src/audio.js` — synthesised sound effects (WebAudio, no assets)
- `game/vendor/three/` — three.js 0.187.0, vendored byte-for-byte

## License

MIT — see [LICENSE](LICENSE).

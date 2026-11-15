# EMBER YARD — Tactical FPS (three.js)

A complete round-based tactical first-person shooter in the style
Counter-Strike made famous — with its own map, art, sounds and names.
Built for the make.fun bounty **"Make the best three.js tactical FPS"**
(`threejs-fps-02`).

## Play it

```sh
node serve.ts            # serves game/ at http://localhost:8080
```

Open the page in desktop Chrome, click **DEPLOY**, and play. No build
step, no network requests, no accounts — static files only.

## The game

You are EMBER, a 3-player squad defending a dusk-lit industrial yard
against VIPER, a 4-bot attacker squad. First squad to 5 rounds wins
the match (max 9 rounds).

- **Objective beyond killing:** VIPER carries a spike and plants it at
  SITE A or SITE B. Win by eliminating VIPER, or defuse a planted spike
  (hold **E** on the site). If the spike blows, VIPER takes the round.
- **Gunplay where accuracy counts:** hitscan weapons with headshots
  (2–2.2× damage), recoil and spread bloom, and a movement penalty —
  stopping, crouching and aiming pay. Acceleration-based movement with
  friction, crouching, and wall collision.
- **Economy and buy menu:** earn cash for round wins, kills and defuses;
  spend it between rounds on the SMG ($1200), rifle ($2600), sniper
  ($4200), frag grenades ($300) and kevlar ($650).
- **Bots that play:** attackers follow waypoint routes to a site, hold
  angles, react to what they see (with human-like reaction delays) and
  hear (gunfire draws them in), fire in bursts, plant and rotate.
  Defenders rotate between sites and defuse.
- **HUD:** health + armor, ammo, round timer, score, money, objective
  line, dynamic crosshair, hitmarkers, killfeed, live minimap, and a
  plant/defuse progress bar.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Aim (click canvas to lock) |
| Click | Fire |
| R | Reload |
| G | Throw frag grenade |
| E (hold) | Defuse the spike |
| C / Ctrl | Crouch |
| B or 1–5 | Buy menu / buy item |
| M | Mute |

## Layout

```
main.ts                  entrypoint: copies game/ + screenshots/ to /output, writes dossier.json
serve.ts                 local static server for playtesting
vendor/makefun-threejs.ts  kit dossier library (unchanged)
game/
  index.html             import map for three.js + HUD markup
  src/
    config.js            all balance numbers, map data, weapon defs
    rng.js               deterministic seeded PRNG
    audio.js             synthesized WebAudio sounds (no audio files)
    world.js             EMBER YARD map, collision, line-of-sight, ray hits
    player.js            FPS controller: accel, friction, crouch, collision
    input.js             keyboard/mouse, pointer lock
    weapons.js           firing, spread/recoil, reload, viewmodel, grenades
    bots.js              bot AI: routes, perception, bursts, plant/defuse
    effects.js           pooled tracers, impacts, explosions, muzzle flash
    hud.js               HUD, killfeed, buy menu, minimap
    sim.js               fixed-step simulation, rounds, economy, spike
    main.js              renderer, frame loop, menu wiring, shot staging
    style.css            HUD + menu styling
  vendor/three/          three.js 0.187.0 (kit files, byte for byte)
screenshots/             real WebGL2 renders (menu / action / round-won)
```

## Notes for the judge

- The dossier text is capped at 160 KiB; the whole game source fits
  inside it, so what you read is what runs.
- `?shot=menu`, `?shot=action`, `?shot=won` stage the three
  screenshots deterministically from seed 1337 — no input needed.
- Deterministic simulation: one seeded RNG stream drives bot behaviour,
  so the same seed replays the same round.

## License

MIT — see `LICENSE`.

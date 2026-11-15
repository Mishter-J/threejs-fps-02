[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Mishter-J/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Mishter-J/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

https://make.fun/bounty/threejs-fps-02

# threejs-fps-02 v2

A resubmission for the make.fun competition **threejs-fps-02** — "Make the best three.js tactical FPS".

## What it is

A tactical first-person shooter that runs entirely in the browser, built with three.js. You fight alongside and against AI bots across structured rounds: a buy phase to spend round earnings on weapons and gear, then the fight itself, with bomb objectives — plant or defend — deciding who takes the round. Rounds chain together into a full match with a clear winner.

## How to run

1. Serve the `game/` directory over HTTP, for example:
   - `npx serve game`
   - or run the included `serve.ts` script
2. Open the served page in a modern browser with WebGL2 enabled.
3. Use the in-game menu to start a match.

No build step is needed — the game runs directly from the served files.

## Files

- `main.ts` — entry point / harness glue
- `serve.ts` — static server script for local play
- `game/` — the playable game (HTML, source, assets)
- `vendor/` — vendored three.js files
- `screenshots/` — menu, action, and round-won screenshots
- `LICENSE` — MIT
- `README.md` — this file

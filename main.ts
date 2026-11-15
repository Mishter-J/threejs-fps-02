// main.ts — the entrypoint make.fun runs (Node 22, standard library
// only, no network). It copies game/ and screenshots/ from this
// repository into the output directory and writes dossier.json with
// buildDossier from vendor/makefun-threejs.ts, so the gate can verify
// the dossier is exactly the one the library writes from those files.
// Running it twice over the same tree writes the same bytes.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const gameSrc = join(repoRoot, 'game');
const shotsSrc = join(repoRoot, 'screenshots');
if (!existsSync(gameSrc)) throw new Error('main.ts: no game/ directory in the repository');
if (!existsSync(shotsSrc)) throw new Error('main.ts: no screenshots/ directory in the repository');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(gameSrc, join(outDir, 'game'), { recursive: true, dereference: true });
cpSync(shotsSrc, join(outDir, 'screenshots'), { recursive: true, dereference: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 48 * 1024 * 1024,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`wrote ${outDir}/dossier.json (${dossier.length} bytes)`);

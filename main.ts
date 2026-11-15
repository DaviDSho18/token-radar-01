// Generate a self-contained research board from the sealed input. Nothing here uses the network
// or wall-clock time: the same snapshot and source assets must produce the same submission bytes.
import { copyFileSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier, PLAIN_NAME } from './vendor/makefun-board.ts';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const LIMITS = {
  sourceBytes: 65_536,
  boardBytes: 8 * 1024 * 1024,
  dossierBytes: 1_572_864,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
};
interface Options { input: string; output: string }
interface Asset { path: string; bytes: number }

function options(args: string[]): Options {
  const values: Options = { input: '/input/snapshot.json', output: process.env.MAKEFUN_OUTPUT_DIR ?? '/output' };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const match = /^(--input|--output)(?:=(.*))?$/.exec(args[i]!);
    if (!match) throw new Error(`unknown argument ${args[i]}; use --input <file|directory> [--output <directory>]`);
    const key = match[1]!.slice(2) as keyof Options;
    if (seen.has(key)) throw new Error(`--${key} was supplied twice`);
    const value = match[2] ?? args[++i];
    if (!value || value.startsWith('--')) throw new Error(`--${key} needs a non-empty path`);
    values[key] = value;
    seen.add(key);
  }
  return { input: resolve(values.input), output: resolve(values.output) };
}

function within(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function snapshotFile(path: string): string {
  let info;
  try {
    info = lstatSync(path);
    if (info.isDirectory()) {
      path = join(path, 'snapshot.json');
      info = lstatSync(path);
    }
  }
  catch { throw new Error(`cannot read snapshot at ${path}; use --input <file|directory> or mount /input/snapshot.json`); }
  if (!info.isFile()) throw new Error(`snapshot must resolve to a regular file: ${path}`);
  return path;
}

// Inspect assets before writing any outputs. Do not follow links or silently omit nested files.
function filesUnder(folder: string): Asset[] {
  if (!lstatSync(folder).isDirectory()) throw new Error(`asset directory missing: ${folder}`);
  const files: Asset[] = [];
  function walk(rel: string): void {
    for (const name of readdirSync(join(folder, rel)).sort()) {
      if (!PLAIN_NAME.test(name)) throw new Error(`unsupported asset name: ${join(folder, rel, name)}`);
      const path = join(rel, name);
      const st = lstatSync(join(folder, path));
      if (st.isDirectory()) walk(path);
      else if (st.isFile()) files.push({ path, bytes: st.size });
      else throw new Error(`asset is not a regular file: ${join(folder, path)}`);
    }
  }
  walk('');
  return files;
}

function checkAssets(dashboard: Asset[], screenshots: Asset[]): number {
  const names = dashboard.map((f) => f.path);
  if (!names.includes('index.html') || !names.some((n) => n.endsWith('.css')) || !names.some((n) => n.endsWith('.js'))) {
    throw new Error('dashboard needs index.html, a CSS file and a JavaScript file');
  }
  const bytes = dashboard.reduce((sum, f) => sum + f.bytes, 0);
  if (dashboard.length > LIMITS.dashboard.max_files || bytes >= LIMITS.sourceBytes) throw new Error(`dashboard has ${dashboard.length} files / ${bytes} bytes; keep source below 65536 bytes`);
  for (const file of dashboard) {
    if (/\.(html|css|js|mjs|svg|json|md|txt)$/i.test(file.path)) {
      const source = readFileSync(join(ROOT, 'dashboard', file.path), 'utf8');
      if (/https?:\/\//i.test(source)) throw new Error(`dashboard must name no network address: ${file.path}`);
    }
  }
  if (screenshots.length < 3 || screenshots.length > LIMITS.screenshots.max) throw new Error(`screenshots needs 3–4 images, found ${screenshots.length}`);
  for (const file of screenshots) {
    if (dirname(file.path) !== '.' || !/\.(png|jpe?g)$/i.test(file.path) || file.bytes > LIMITS.screenshots.max_bytes) {
      throw new Error(`screenshot must be a top-level PNG/JPEG no larger than 512 KiB: ${file.path}`);
    }
  }
  if (!readFileSync(join(ROOT, 'LICENSE'), 'utf8').startsWith('SPDX-License-Identifier: MIT\n')) throw new Error('root LICENSE must begin with the MIT SPDX line');
  return bytes;
}

function copyAssets(name: string, assets: Asset[], output: string): void {
  for (const asset of assets) {
    const target = join(output, name, asset.path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(ROOT, name, asset.path), target);
  }
}

function run(): void {
  const config = options(process.argv.slice(2));
  const input = snapshotFile(config.input);
  // Output may live under this repository (out/), but may not overwrite source or sealed input.
  if (within(config.output, ROOT) || within(config.output, input)
    || ['dashboard', 'screenshots', 'lib', 'vendor'].some((name) => within(join(ROOT, name), config.output))) {
    throw new Error('output must be separate from source assets and the snapshot');
  }
  const snapshot = parseSnapshot(readFileSync(input, 'utf8'));
  const result = buildRadar(snapshot);
  const problem = boardIssue(result.board, snapshot);
  if (problem) throw new Error(`board validation failed: ${problem}`);
  const board = JSON.stringify({ rows: result.board }) + '\n';
  if (Buffer.byteLength(board) > LIMITS.boardBytes) throw new Error('board.json exceeds 8 MiB');
  const dashboard = filesUnder(join(ROOT, 'dashboard'));
  const screenshots = filesUnder(join(ROOT, 'screenshots'));
  const sourceBytes = checkAssets(dashboard, screenshots);

  mkdirSync(config.output, { recursive: true });
  writeFileSync(join(config.output, 'board.json'), board);
  writeFileSync(join(config.output, 'data.js'), dataScript(result.radar));
  copyAssets('dashboard', dashboard, config.output);
  copyAssets('screenshots', screenshots, config.output);
  const dossier = buildDossier(config.output, {
    text_max_bytes: 65_536,
    screenshots: LIMITS.screenshots,
    dashboard: LIMITS.dashboard,
  });
  if (dossier.byteLength > LIMITS.dossierBytes) throw new Error(`dossier is ${dossier.byteLength} bytes; limit is 1.5 MiB`);
  writeFileSync(join(config.output, 'dossier.json'), dossier);

  process.stdout.write([
    `Token Radar ${result.radar.model_version} · snapshot ${snapshot.as_of}`,
    `${result.board.length} ranked rows · ${snapshot.watchlist.length}/${snapshot.watchlist.length} watchlist covered · ${result.radar.early_size} early candidates · ${result.radar.live_size} token-recorded comparators`,
    `${dashboard.length} dashboard files / ${sourceBytes} source bytes · ${screenshots.length} screenshots · ${dossier.byteLength} dossier bytes`,
    `Wrote board.json, data.js, dashboard/, screenshots/ and dossier.json to ${config.output}`,
    '',
  ].join('\n'));
}

try { run(); }
catch (error) {
  process.stderr.write(`Token Radar: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

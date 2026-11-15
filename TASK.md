Improve this token-radar-01 entry and rewrite its entrypoint `main.ts` in your own words.

Context: this repository is a make.fun competition entry. `main.ts` is the entrypoint the grader runs;
it reads the sealed snapshot, scores the protocols with `lib/model.ts`, writes `/output/board.json`,
`/output/data.js`, copies `dashboard/` and `screenshots/`, and writes `/output/dossier.json` with
`buildDossier` from `vendor/makefun-board.ts`. The current `main.ts` is the starter's; you are
replacing it with a version you author yourself, and you will also improve the model and the dashboard.

IMPORTANT — work in explicit narrated steps. Before each step, write one short paragraph of plain
text saying what you are about to do and why. Produce a separate text message for each step:
Step 1 — Read main.ts, lib/model.ts and the dashboard, and plan the improvements.
Step 2 — Improve lib/model.ts: sharpen the implied-value model and the farm steps (keep the same
         exported interface, so main.ts and the dashboard keep working).
Step 3 — Rewrite main.ts from scratch in your own structure, keeping the gate's shape exactly.
Step 4 — Run the entry locally and inspect the board, the dossier and the gate's own checks.
Step 5 — Revise main.ts: fix or improve one concrete thing you found, editing the file in place.
Step 6 — Re-run the entry to confirm the revision still passes, and summarize.

## The gate's shape (main.ts must keep it)

- Read the snapshot from `/input/snapshot.json` (or `--input <file|dir>`); outside the grader
  `MAKEFUN_OUTPUT_DIR` stands in for `/output`.
- Write `/output/board.json` (rows: 100..4000, each with slug/name/rank/implied_value_usd/farm_steps;
  ranks exactly 1..N; implied values non-rising as rank ascends; every watchlist slug present).
- Write `/output/data.js` for the dashboard, copy `dashboard/` and `screenshots/` to `/output`, and
  write `/output/dossier.json` with `buildDossier` from `vendor/makefun-board.ts` (text_max_bytes 65536).
- The dashboard must stay under 64 KB of source and name no http:// or https:// address.
- LICENSE at the root stays MIT (SPDX line first).

## How to verify

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node --experimental-strip-types main.ts \
  --input ../kits/token-radar-01/token-radar-01-kit/input/snapshot.json
```

Then inspect `out/board.json` (row count, rank coverage, implied-value ordering) and `out/dossier.json`.
Work only inside this repository.

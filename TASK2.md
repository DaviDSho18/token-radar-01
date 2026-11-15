Finish this token-radar-01 entry: verify the entrypoint `main.ts` and make one concrete revision to it.

Context: `main.ts` was just rewritten from scratch in an earlier session. It reads the sealed snapshot,
scores protocols with `lib/model.ts`, writes `/output/board.json` and `/output/data.js`, copies
`dashboard/` and `screenshots/`, and writes `/output/dossier.json` with `buildDossier` from
`vendor/makefun-board.ts`. Your job is to verify it and then improve one concrete thing, editing the
file in place (do not rewrite it wholesale).

IMPORTANT — work in explicit narrated steps. Before each step, write one short paragraph of plain text
saying what you are about to do and why. Produce a separate text message for each step:
Step 1 — Read main.ts and say what it does today.
Step 2 — Run the entry locally and report exactly what you observed.
Step 3 — Revise main.ts in place: fix or improve one concrete thing you found. Say which line you
         changed and why.
Step 4 — Re-run the entry to confirm the revision still produces a valid board and dossier.
Step 5 — Summarize the final behavior.

## How to run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node --experimental-strip-types main.ts \
  --input ../kits/token-radar-01/token-radar-01-kit/input/snapshot.json
```

Then check `out/board.json` (100..4000 rows, ranks exactly 1..N, implied values non-rising, every
watchlist slug present) and `out/dossier.json`. Work only inside this repository.

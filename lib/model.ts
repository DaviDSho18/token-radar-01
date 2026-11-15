// Snapshot-only valuation: a conservative TVL anchor, bounded momentum, and a listing-age discount.
// This is a hypothetical token market-cap proxy, not FDV, a launch probability, or a farmer payout.
// Momentum discounts outflows more than it rewards inflows; missing inputs get no growth premium
// and a short age prior. Listing age is not proof of an operating history or of a token-free history.
// No fees, revenue, supply, unlocks, eligibility or reward allocation are available in this snapshot.
// Watchlist coverage is mandatory; additional candidates must record no token identifiers.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.2,
  growth_weight: 0.35,
  growth_floor: -75,
  growth_cap: 100,
  maturity_floor: 0.5,
  maturity_range: 0.5,
  maturity_days: 730,
  unknown_age_days: 90,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** Dashboard rows carry the board's exact plan; optional additions preserve existing callers. */
export interface RadarRow {
  farm_steps?: string[];
  watchlisted?: boolean;
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  // Saturating positive momentum avoids extrapolating a single deposit into token value.
  // Negative momentum has twice the weight: TVL itself may still lag sustained withdrawals.
  const growthMult = 1 + model.growth_weight * (growthPct < 0
    ? 2 * growthPct / 100
    : growthPct / (100 + growthPct));
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + Math.sqrt(Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = Math.max(0, protocol.tvl_usd) * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  const excluded = /^(CEX|Bridge|Canonical Bridge|Cross Chain Bridge|Liquid Staking|Liquid Restaking|Restaked BTC)$/i;
  const product = /\b(wrapped|staked|staking)\b/i;
  const exchange = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
  return isPreToken(p) && !excluded.test(p.category ?? '') && !VERSIONED.test(p.name)
    && !product.test(p.name) && !exchange.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, maturityMult, age } = impliedValue(p, snapshot.as_of, model);
    return { p, implied, growthPct, growthMult, maturityMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Small, optional test budgets, not eligibility thresholds; smaller pools get less exposure. */
function capitalFor(p: SnapshotProtocol): number {
  return p.tvl_usd >= 100_000_000 ? 100 : 50;
}

/** A review horizon, never an invented qualification or snapshot window. */
function holdDaysFor(age: number | null): number {
  return age === null || age < 180 ? 14 : 30;
}

/** Categories suggest a workflow; the app's current supported assets and access rules decide it. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const where = `${p.name} on ${chain}`;
  const budget = `at most $${capital}`;
  if (c.includes('uncollateralized') || c.includes('rwa') || c.includes('cedefi')) return `For ${where}, verify KYC, jurisdiction, investor status and redemption terms first. Only if eligible, test ${budget} in a supported product; otherwise skip. Credit and custody losses are possible.`;
  if (c.includes('lend') || c === 'cdp' || c.includes('collateral')) return `If ${where} offers public supply, supply ${budget} of a supported asset without borrowing. For CDP-only access, inspect collateral and liquidation rules but skip debt solely to chase rewards.`;
  if (c.includes('bridge')) return `For ${where}, verify source and destination support and bridge a $10 test first, within a ${budget} total budget. Confirm receipt and the return route; a bridge transfer is not proof of reward eligibility.`;
  if (c.includes('leveraged') || c.includes('basis') || c.includes('options') || c.includes('perpetual') || c.includes('derivative')) return `For ${where}, use a demo first. Only if independently useful, test an unlevered supported workflow within ${budget}; skip if leverage or an uncovered trade is required. Never trade solely to manufacture volume.`;
  if (c.includes('dex') || c.includes('liquidity')) return `If ${where} supports it, make one $10 swap within a ${budget} budget and inspect fees and slippage first. LP only if you understand range management and impermanent loss; do not loop trades.`;
  if (c.includes('stak')) return `If publicly available, stake ${budget} of an asset supported by ${where}. Read slashing, receipt-token and withdrawal-queue terms first; test the minimum and keep the receipt transaction.`;
  if (c.includes('prediction')) return `For ${where}, check jurisdiction and market settlement rules. Only for a view you actually hold, risk at most $10 within a ${budget} budget; the full position can be lost. Otherwise skip.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield') || c.includes('farm') || c.includes('vault') || c.includes('indexes')) return `If ${where} has a public vault, inspect its underlying assets, strategy, curator fees and withdrawal queue. Test ${budget} in a supported unlevered vault and save the share receipt; skip opaque strategies.`;
  if (c.includes('stable') || c.includes('synthetic') || c.includes('reserve')) return `If ${where} permits it, test ${budget} via a supported mint or deposit route after checking backing, depeg exposure and redemption fees. Do not borrow or assume that USDC is supported.`;
  if (c.includes('insurance')) return `For ${where}, buy cover only for an exposure you already have after reading exclusions and claims terms. Limit any test premium to $10 within a ${budget} budget; premiums are spent, not recoverable deposits.`;
  return `For ${where}, find a documented public workflow and its supported assets first. If there is no suitable, independently useful action, skip; otherwise make the minimum test within ${budget}. Do not assume it accepts deposits.`;
}

/** Six actionable checkpoints with honest uncertainty, cost ranges and an exit path. */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const expensive = p.chains.length === 0 || chain === 'Ethereum' || chain === 'Bitcoin';
  const gas = expensive ? '$5–30' : '$0.10–3';
  return [
    {
      text: `Verify ${p.name}'s official app, contracts, supported network (${chain}), current token status and published rewards terms. The sealed record confirms neither a campaign nor your eligibility. If access or rules cannot be verified, stop.`,
      cost: '$0 research; do not connect or sign yet', time: '10–15 minutes',
    },
    {
      text: `Use one dedicated wallet with only the test budget; keep the seed offline. Check the spender and network before signing, approve only the amount needed, and retain native gas for a test withdrawal. Never share keys or create wallets to evade eligibility rules.`,
      cost: `up to $${capital} at risk plus ${gas} indicative gas per transaction; live quotes override this range`, time: '5–10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `within the $${capital} budget, not additional capital; ${gas} estimated gas per transaction plus quoted app fees`, time: '15–25 minutes; access checks may take longer',
    },
    {
      text: `Review the position weekly over a ${hold}-day research horizon. Check contract notices, net fees, peg or liquidation exposure and withdrawal availability. Repeat an action only when useful and allowed by published rules; no duration or transaction count guarantees points.`,
      cost: '$0 to inspect; capital may be lost or locked; no scheduled paid transactions', time: `${hold} days, 5 minutes each week`,
    },
    {
      text: `Test a small withdrawal or redemption before adding funds. Exit if access, fees or risk no longer suit you; account for queues and revoke unneeded approvals. Check rewards only through the verified app and reject seed requests or advance unlock payments.`,
      cost: `${gas} indicative gas per exit or revoke plus stated redemption fees; reserve separately from the test budget`, time: '10–20 minutes plus any documented exit queue',
    },
    {
      text: `Log ${p.slug}, ${chain}, dates, transaction hashes, capital, fees and any published points. Reconcile withdrawn funds with the starting balance. Treat hypothetical token value as unrelated to your allocation: rewards can be zero.`,
      cost: '$0 to keep a local log; record actual fees and losses', time: '5 minutes after each action',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((row) => ({ ...radarRow(row), watchlisted: watchlist.has(row.slug) })),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  const slugs = new Set<string>();
  for (const p of protocols) {
    if (!p.slug || p.slug.length > 128 || /\s/.test(p.slug) || !p.name.trim() || p.tvl_usd < 0) throw new SnapshotError(`invalid identity or negative TVL: ${p.slug}`);
    if (slugs.has(p.slug)) throw new SnapshotError(`duplicate protocol slug: ${p.slug}`);
    slugs.add(p.slug);
  }
  if (new Set(o.watchlist).size !== o.watchlist.length) throw new SnapshotError('duplicate watchlist slug');
  for (const slug of o.watchlist as string[]) if (!slugs.has(slug)) throw new SnapshotError(`watchlist slug not in protocols: ${slug}`);
  if (!Number.isFinite(Date.parse(`${o.as_of}T00:00:00Z`)) || new Date(`${o.as_of}T00:00:00Z`).toISOString().slice(0, 10) !== o.as_of) throw new SnapshotError('invalid as_of calendar date');
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows, expected 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'board contains duplicate slugs';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const row of board) {
    if (!known.has(row.slug) || !row.name.trim()) return `invalid board identity: ${row.slug}`;
    if (row.implied_value_usd > 100_000_000_000_000) return `${row.slug} exceeds the implied-value cap`;
  }
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

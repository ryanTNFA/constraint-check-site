// scorecard.mjs — assembles the Scorecard and the Desk data; exports recomputeWithPeers
// for the browser. Pure ES module: no Node built-ins.
//
// registry = {indicators: <registry/indicators.json>, nodes: <registry/nodes.json>}
// params   = <registry/params.json>
import { isNum, fnv1a } from './stats.mjs';
import { snapshotYearOf, buildSeries, computeDerived, buildReferenceTable, buildMatrix, seriesPairs } from './reference.mjs';
import { buildFeatures, comparatorSets, FEATURE_NAMES } from './comparators.mjs';
import { fitAllICRs, icrFor } from './icr.mjs';
import {
  icrSignal,
  peerGap,
  recencyMultiplier,
  indicatorSignal,
  indicatorWeight,
  comovement,
  buildFamilies,
} from './signals.mjs';
import { evaluateNode, rollupNode, rankNodes, statements, bootstrapRanks, applyTopSplitOverride } from './aggregate.mjs';
import { topSplit, RATE_SOURCES } from './topsplit.mjs';
import { growthUniverse, growthProblem } from './growth.mjs';

export const ENGINE_VERSION = '0.1.5';
export const DEFAULT_SETS = ['structural', 'regional', 'aspirational'];
export const DESK_SERIES = ['NY.GDP.PCAP.KD', 'NY.GDP.PCAP.KD.ZG', 'NE.GDI.FTOT.ZS', 'FR.INR.RINR', 'FS.AST.PRVT.GD.ZS', 'FP.CPI.TOTL.ZG'];
export const RATIONING_INDICATOR = 'IC.FRM.CRDC.FL.ZS';

function uniq(xs) {
  return [...new Set(xs)];
}

function membersOf(group) {
  if (!group) return [];
  if (Array.isArray(group)) return group;
  if (Array.isArray(group.members)) return group.members;
  return [];
}

/**
 * Accepts {indicators: indicators.json, nodes: nodes.json, static?: {monetary_regimes, fcs}} and
 * returns a flat, normalized registry. Indicators flagged `hidden_until_fixed: true` are removed
 * from `indicators` (so they are neither displayed nor counted anywhere downstream) and listed in
 * `hidden_indicators`. The optional static lists (v0.1.2) become `regime_set` (economies without
 * an independent monetary policy: regime_sensitive indicators are class C there) and `fcs_set`
 * (fragile and conflict-affected economies, excluded from structural comparator pools). The Desk's
 * recompute path passes no static lists: both effects are already baked into the Scorecard.
 */
export function normalizeRegistry(registry) {
  if (registry && registry.__normalized) return registry;
  const ind = registry && registry.indicators && Array.isArray(registry.indicators.indicators) ? registry.indicators : null;
  const nodes = registry && registry.nodes && Array.isArray(registry.nodes.nodes) ? registry.nodes : null;
  if (!ind || !nodes) throw new Error('registry must be {indicators: <indicators.json>, nodes: <nodes.json>}');
  const hidden = ind.indicators.filter((i) => i.hidden_until_fixed === true).map((i) => i.id);
  const st = (registry && registry.static) || {};
  const regimes = st.monetary_regimes || null;
  const regimeSet = new Set();
  const regimeKind = {};
  if (regimes) {
    for (const kind of Object.keys(regimes)) {
      if (kind.startsWith('_')) continue;
      for (const iso3 of membersOf(regimes[kind])) {
        regimeSet.add(iso3);
        regimeKind[iso3] = kind;
      }
    }
  }
  // v0.1.5: re-export hubs (static_trade_hubs.json) for regime_sensitive 'trade_hub' indicators.
  const hubs = st.trade_hubs || null;
  const hubSet = new Set(hubs ? membersOf(hubs.trade_hubs || []) : []);
  const fcs = st.fcs || null;
  const fcsSet = new Set();
  if (fcs) for (const k of Object.keys(fcs)) if (!k.startsWith('_') && Array.isArray(fcs[k])) for (const iso3 of fcs[k]) fcsSet.add(iso3);
  return {
    __normalized: true,
    rubric_version: ind.rubric_version,
    indicators: ind.indicators.filter((i) => i.hidden_until_fixed !== true),
    hidden_indicators: hidden,
    comovement_specs: ind.comovement_specs || [],
    connectors_not_built: (ind.connectors_not_built && ind.connectors_not_built.families) || [],
    node_defs: nodes.nodes,
    tests: nodes.tests,
    statement_labels: nodes.statements || {},
    regime_set: regimeSet,
    regime_kind: regimeKind,
    hub_set: hubSet,
    fcs_set: fcsSet,
    static_loaded: { monetary_regimes: !!regimes, fcs: !!fcs, trade_hubs: !!hubs },
  };
}

export const HUB_CLASS_NOTE = 'class C for this economy: a re-export or accounting hub, where trade costs inferred from output minus exports are unreliable';
export const LOW_VOICE_CLASS_NOTE = 'class C for this economy: very low voice and accountability, where firms may under-report bribery';
export const REGIME_CLASS_NOTE = 'class C for this economy: no independent monetary policy in the window (dollarized or currency board), so CPI inflation does not read national macro risk';

/** Seed for the bootstrap: FNV-1a hash of "iso3|rubric_version" (plus "|salt" when a salt is given). */
export function seedFor(iso3, rubricVersion, salt = null) {
  return fnv1a(`${iso3}|${rubricVersion}${salt === null || salt === undefined ? '' : `|${salt}`}`);
}

/**
 * Build the run context once per snapshot: series (with derived indicators), reference
 * values, comparator features, ICR fits for every indicator, the Desk matrix, and the
 * Stage 0 universe statistics.
 */
export function buildContext({ observations, countries, meta, registry, params }) {
  const R = normalizeRegistry(registry);
  const snapshotYear = snapshotYearOf(meta);
  const windowYears = params.snapshot_reference_window_years;
  const universe = countries.map((c) => c.iso3).sort();
  const countriesByIso = {};
  for (const c of countries) countriesByIso[c.iso3] = c;
  const raw = buildSeries(observations);
  const { series, unimplemented } = computeDerived(raw, { indicators: R.indicators }, countries, snapshotYear);
  const windowById = {};
  for (const ind of R.indicators) if (Number.isFinite(ind.reference_window_years)) windowById[ind.id] = ind.reference_window_years;
  const refs = buildReferenceTable(series, universe, snapshotYear, windowYears, windowById);
  const features = buildFeatures(refs, countries, R.fcs_set);
  // v0.1.5: low-voice set from the WGI voice and accountability estimate (params.candour).
  const cand = params.candour || null;
  const lowVoice = { set: new Set(), values: {}, threshold: cand ? cand.va_est_max : null, indicator: cand ? cand.indicator : null };
  if (cand && refs[cand.indicator]) {
    for (const [iso3, r] of Object.entries(refs[cand.indicator])) {
      if (r && r.available && isNum(r.value_ref) && r.value_ref <= cand.va_est_max) { lowVoice.set.add(iso3); lowVoice.values[iso3] = r.value_ref; }
    }
  }
  const fits = fitAllICRs({ indicators: R.indicators }, refs, features, params);
  const matrix = buildMatrix(
    refs,
    snapshotYear,
    R.indicators.map((i) => i.id),
  );
  const uni = growthUniverse({ series, countries, params, snapshotYear });
  const warnings = [];
  for (const id of unimplemented) warnings.push(`derived indicator ${id} is not implemented in the prototype; left unavailable`);
  for (const id of R.hidden_indicators || []) warnings.push(`indicator ${id} is hidden_until_fixed in the registry: treated as unavailable (not displayed, not counted)`);
  for (const ind of R.indicators) {
    const f = fits[ind.id];
    if (f && f.global && !f.global.ok && ind.class !== 'X') warnings.push(`ICR not fitted for ${ind.id}: ${f.global.reason} (n = ${f.global.n})`);
    if (f && f.global && f.global.ok && f.global.scale_method && f.global.scale_method !== 'mad') {
      warnings.push(
        `ICR scale for ${ind.id} fell back to the ${f.global.scale_method} estimator (n = ${f.global.n}): the MAD of residuals is zero because more than half of the economies share one value (zero-inflated series); t values are approximate and the fit should be read with care`,
      );
    }
  }
  if (!uni.convergence.ok) warnings.push(`convergence regression (G2) not fitted: ${uni.convergence.reason} (n = ${uni.convergence.n})`);
  if (!R.static_loaded.monetary_regimes) warnings.push('registry/static_monetary_regimes.json not loaded: regime_sensitive indicators keep their registry class everywhere (Panama-type dollarized economies are not downgraded)');
  if (!R.static_loaded.fcs) warnings.push('registry/static_fcs.json not loaded: fragile and conflict-affected economies are not excluded from structural comparator pools');
  return {
    registry: R,
    params,
    meta,
    snapshotYear,
    windowYears,
    universe,
    countries,
    countriesByIso,
    series,
    refs,
    features,
    fits,
    matrix,
    uni,
    unimplemented,
    lowVoice,
    warnings,
  };
}

/** Peer-gap block for one indicator record against a member list, using the Desk matrix. */
export function peerGapFromMatrix(ind, members, matrix, params) {
  if (!ind.available || ind.class === 'X' || !ind.direction) return null;
  const row = (matrix.indicators && matrix.indicators[ind.id]) || {};
  const peerValues = (members || []).map((m) => (row[m] ? row[m][0] : null));
  return peerGap(ind.value_ref, peerValues, ind.direction, params.peer_gap);
}

function signalForSet(ind, setName) {
  // The camels percentile rule is comparator-free: its signal is the same under every set.
  if (ind.signal_rule === 'workbook_4.7_percentile') return isNum(ind.signal) ? ind.signal : null;
  const pg = ind.peer_gap && ind.peer_gap[setName];
  return indicatorSignal(ind.signal_icr, pg ? pg.signal : null);
}

/** The readings an indicator record's signal rests on under one set: 'icr' and/or 'peer_gap'. */
export function readingsForSet(ind, setName) {
  if (ind.signal_rule === 'workbook_4.7_percentile') return ['percentile'];
  const out = [];
  if (isNum(ind.signal_icr)) out.push('icr');
  const pg = ind.peer_gap && ind.peer_gap[setName];
  if (pg && isNum(pg.signal)) out.push('peer_gap');
  return out;
}

/**
 * Workbook 4.7 camels-and-hippos signal: the percentile of theta's reference value among all economies with one,
 * oriented so that the binding side scores positive (registry direction -1: low theta binds); <= 10 -> +2, <= 25 -> +1,
 * >= 90 -> -2, >= 75 -> -1, else 0. Zero when |theta| < 2 SE in the latest year (the SE series is registry `se_id`).
 */
export function camelsSignal(ctx, ind, iso3, r) {
  const cache = (ctx.camelsCache = ctx.camelsCache || {});
  if (!cache[ind.id]) cache[ind.id] = Object.values(ctx.refs[ind.id] || {}).filter((x) => x && x.available && isNum(x.value_ref)).map((x) => x.value_ref).sort((a, b) => a - b);
  const all = cache[ind.id];
  const below = all.filter((v) => v < r.value_ref).length, ties = all.filter((v) => v === r.value_ref).length;
  const pct = all.length > 1 ? (100 * (below + 0.5 * (ties - 1))) / (all.length - 1) : 50;
  const p = ind.direction === -1 ? pct : 100 - pct;
  let signal = p <= 10 ? 2 : p <= 25 ? 1 : p >= 90 ? -2 : p >= 75 ? -1 : 0;
  const se = ind.se_id && ctx.refs[ind.se_id] && ctx.refs[ind.se_id][iso3];
  const seLatest = se && se.available && se.year === r.year ? se.value : null;
  const gated = signal !== 0 && (!isNum(seLatest) || Math.abs(r.value) < 2 * seLatest);
  if (gated) signal = 0;
  return { signal_rule: 'workbook_4.7_percentile', camels_percentile: pct, camels_se: isNum(seLatest) ? seLatest : null, camels_gated: gated, signal };
}

/**
 * Per-indicator records for one economy (Scorecard `indicators`).
 * v0.1.2: an indicator with `regime_sensitive: "monetary"` is class C for economies in the
 * registry's monetary-regime list (`class_registry` keeps the registry class, `class_note` says
 * why); an indicator with `fallback_for` carries no signal where that indicator is available in
 * the window (`suppressed: "fallback_not_needed"`); `formula` and `caveat` are carried for the Desk.
 */
export function buildIndicatorRecords(ctx, iso3, setMembers, activeSet) {
  const { registry: R, params, snapshotYear, refs, fits, matrix } = ctx;
  const out = [];
  const regime = R.regime_set && R.regime_set.has(iso3);
  for (const ind of R.indicators) {
    const r = (refs[ind.id] && refs[ind.id][iso3]) || null;
    const available = !!(r && r.available);
    const icr = available ? icrFor(fits, ind.id, iso3) : null;
    let cls = ind.class;
    let classNote = null;
    const sens = [].concat(ind.regime_sensitive || []);
    if (regime && sens.includes('monetary') && (cls === 'A' || cls === 'B')) {
      cls = 'C';
      classNote = `${REGIME_CLASS_NOTE} (${R.regime_kind[iso3] || 'hard peg'})`;
    }
    // v0.1.5: trade-cost measures in re-export hubs; self-reported bribery where voice is very low.
    if (sens.includes('trade_hub') && R.hub_set && R.hub_set.has(iso3) && (cls === 'A' || cls === 'B')) {
      cls = 'C';
      classNote = HUB_CLASS_NOTE;
    }
    if (sens.includes('low_voice') && ctx.lowVoice && ctx.lowVoice.set.has(iso3) && (cls === 'A' || cls === 'B')) {
      cls = 'C';
      classNote = `${LOW_VOICE_CLASS_NOTE} (voice and accountability ${ctx.lowVoice.values[iso3].toFixed(2)} ≤ ${ctx.lowVoice.threshold})`;
    }
    let suppressed = null;
    if (ind.fallback_for) {
      const primary = refs[ind.fallback_for] && refs[ind.fallback_for][iso3];
      if (primary && primary.available) suppressed = 'fallback_not_needed';
    }
    const rec = {
      id: ind.id,
      name: ind.name,
      source: ind.source,
      extra_group: ind.extra_group || null,
      formula: ind.formula || null,
      caveat: ind.caveat || null,
      class: cls,
      class_registry: ind.class,
      class_note: classNote,
      direction: ind.direction,
      transform: ind.transform || 'none',
      family: ind.family,
      test: ind.test,
      nodes: ind.nodes || [],
      slow: !!ind.slow,
      fallback_for: ind.fallback_for || null,
      suppressed,
      suppressed_note: suppressed ? `not scored: ${ind.fallback_for} is available in the window and this series is its fallback` : null,
      available,
      value: available ? r.value : null,
      year: available ? r.year : null,
      value_ref: available ? r.value_ref : null,
      year_ref: available ? r.year_ref : null,
      n_ref: available ? r.n_ref : 0,
      stale_value: r && !available ? r.stale_value : null,
      stale_year: r && !available ? r.stale_year : null,
      icr,
      peer_gap: {},
      signal_icr: null,
      signal_by_set: {},
      signal: null,
      recency_mult: null,
      weight: null,
    };
    if (available && cls !== 'X' && !suppressed && ind.scoring === 'camels_percentile') {
      // Workbook 4.7 for camels and hippos: theta's percentile among all economies, no peer gap, and no signal
      // when the latest theta is within two standard errors of zero (rubric changelog, 29 October 2026).
      const cs = camelsSignal(ctx, ind, iso3, r);
      Object.assign(rec, cs);
      for (const s of Object.keys(setMembers)) rec.signal_by_set[s] = cs.signal;
      rec.signal = cs.signal;
      rec.recency_mult = recencyMultiplier(snapshotYear - r.year_ref, params.recency, rec.slow);
      rec.weight = indicatorWeight(cls, rec.recency_mult, params.class_weights);
    } else if (available && cls !== 'X' && !suppressed) {
      rec.signal_icr = icr ? icrSignal(icr.t, ind.direction, params.icr.signal_thresholds) : null;
      for (const s of Object.keys(setMembers)) rec.peer_gap[s] = peerGapFromMatrix(rec, setMembers[s], matrix, params);
      for (const s of Object.keys(setMembers)) rec.signal_by_set[s] = signalForSet(rec, s);
      rec.signal = rec.signal_by_set[activeSet] ?? null;
      rec.recency_mult = recencyMultiplier(snapshotYear - r.year_ref, params.recency, rec.slow);
      rec.weight = indicatorWeight(cls, rec.recency_mult, params.class_weights);
    }
    out.push(rec);
  }
  return out;
}

/** Co-movement records for one economy (Scorecard `comovement`). */
export function buildComovementRecords(ctx, iso3) {
  const { registry: R, params, snapshotYear, series } = ctx;
  const out = [];
  for (const spec of R.comovement_specs) {
    const xIds = Array.isArray(spec.x) ? spec.x : [spec.x];
    const x = xIds.map((id) => (series[id] || {})[iso3]);
    const y = (series[spec.y] || {})[iso3];
    const cm = comovement(x, y, spec, params, snapshotYear);
    const mult = isNum(cm.year) ? recencyMultiplier(snapshotYear - cm.year, params.recency, false) : 0;
    cm.recency_mult = mult;
    cm.weight = isNum(cm.signal) ? indicatorWeight('C', mult, params.class_weights) : null;
    out.push(cm);
  }
  return out;
}

/**
 * Top split from the indicator records: ICR t of the real lending rate (FR.INR.RINR when it
 * has an ICR, else DERIV.REAL_LENDING_CPI; v0.1.1, recorded as rate_source), ICR t of
 * NE.GDI.FTOT.ZS and the DERIV.CREDIT_GROWTH value_ref.
 */
export function topSplitFromIndicators(indicators, params) {
  const byId = {};
  for (const i of indicators) byId[i.id] = i;
  const t = (id) => (byId[id] && byId[id].icr && isNum(byId[id].icr.t) ? byId[id].icr.t : null);
  let realRateT = null;
  let rateSource = null;
  for (const id of RATE_SOURCES) {
    const v = t(id);
    if (isNum(v)) {
      realRateT = v;
      rateSource = id;
      break;
    }
  }
  const cg = byId['DERIV.CREDIT_GROWTH'];
  const ncf = byId['DERIV.NET_CASHFLOW_BANKS'];
  return topSplit(
    {
      realRateT,
      rateSource,
      investmentT: t('NE.GDI.FTOT.ZS'),
      creditGrowth: cg && cg.available ? cg.value_ref : null,
      creditDepthT: t('FS.AST.PRVT.GD.ZS'),
      netCashflow: ncf && ncf.available ? ncf.value_ref : null,
    },
    params,
  );
}

/**
 * How many distinct voting families the registry can supply per node under the price-test rule:
 * families of class A/B indicators on the price test (all classes when the rule is all_vote),
 * families of any signal-bearing indicator on the other tests, and the co-movement specs.
 */
export function registryVotingCapacity(registry, nodeIds, params) {
  const R = normalizeRegistry(registry);
  const rule = (params && params.tiers && params.tiers.price_test_quantity_rule) || 'all_vote';
  const sets = {};
  for (const id of nodeIds) sets[id] = new Set();
  for (const ind of R.indicators) {
    if (ind.class === 'X') continue;
    const canVote = ind.test !== 'price' || rule === 'all_vote' || ind.class === 'A' || ind.class === 'B';
    if (!canVote) continue;
    for (const n of ind.nodes || []) if (sets[n]) sets[n].add(`${ind.test}|${ind.family}`);
  }
  for (const spec of R.comovement_specs) for (const n of [spec.node, ...(spec.also_nodes || [])]) if (sets[n]) sets[n].add(`changes|${spec.id}`);
  const out = {};
  for (const id of nodeIds) out[id] = sets[id].size;
  return out;
}

/**
 * The lean of a node judged by elimination (front-door PRD W2, decision D1): how many of its
 * evidence families point toward a problem (s > 0) and away (s < 0), and their weighted mean
 * signal. Every family counts here, voting or informing, since none decides a tier.
 */
export function eliminationLean(families) {
  const byId = new Map();
  for (const f of families || []) if (f.weight > 0 && isNum(f.signal) && !byId.has(f.id)) byId.set(f.id, f);
  const fams = [...byId.values()];
  let num = 0;
  let den = 0;
  for (const f of fams) {
    num += f.weight * f.signal;
    den += f.weight;
  }
  const mean = den > 0 ? num / den : null;
  return {
    families: fams.length,
    toward: fams.filter((f) => f.signal > 0).length,
    away: fams.filter((f) => f.signal < 0).length,
    neutral: fams.filter((f) => f.signal === 0).length,
    weighted_mean: mean,
    direction: mean === null || mean === 0 ? 'none' : mean > 0 ? 'toward' : 'away',
  };
}

/** Turn an evaluated node into one judged by elimination: evidence kept, tier 'elimination', no rating. */
function eliminationNode(ev) {
  const lean = eliminationLean(ev.families);
  const dir = lean.direction === 'none' ? 'no lean' : `leans ${lean.direction}`;
  return {
    ...ev,
    tier: 'elimination',
    tier_subreason: null,
    tier_reason: `judged by elimination (rubric 0.1.7, decision D1): not rated from public data alone; it becomes a candidate only if the other low-return areas are ruled out. Evidence ${dir}: ${lean.toward} famil${lean.toward === 1 ? 'y' : 'ies'} toward a problem, ${lean.away} away, ${lean.neutral} neutral; weighted mean signal ${isNum(lean.weighted_mean) ? Math.round(lean.weighted_mean * 100) / 100 : 'n/a'}`,
    cannot_tell_reason: null,
    cannot_tell_detail: null,
    blockers: { likely_binding: [], ruled_out: [] },
    tier_by_set: Object.fromEntries(Object.keys(ev.tier_by_set).map((s) => [s, 'elimination'])),
    fragility: null,
    load_bearing: [],
    elimination: lean,
  };
}

function unscoredNode(def, tier, reason) {
  return {
    id: def.id,
    label: def.label,
    short: def.short,
    parent: def.parent,
    tier,
    tier_subreason: null,
    tier_reason: reason,
    cannot_tell_reason: null,
    cannot_tell_detail: null,
    blockers: { likely_binding: [], ruled_out: [] },
    N: null,
    C: null,
    E: 0,
    R: null,
    F: 0,
    AB_count: 0,
    AB_pos: 0,
    tests: { price: null, changes: null, circumvention: null, camels: null },
    families: [],
    tier_by_set: {},
    fragility: null,
    load_bearing: [],
    connectors_missing: [],
    sub_nodes: null,
    top_split_override: false,
    scored: false,
  };
}

/**
 * Signals → families → nodes → tiers → ranking → statements, for a set of comparator
 * member lists. Shared by the batch engine and recomputeWithPeers so that both paths are
 * identical by construction.
 */
export function assembleVerdicts({ indicators, comovement: cm, setMembers, activeSet, registry, params, snapshotYear, topSplitRow = null, topSplit: topSplitObj = null, seed, bootstrap = true, excludeFromPool = [] }) {
  const R = normalizeRegistry(registry);
  const setNames = Object.keys(setMembers);
  // Sets that enter the fragility check and the bootstrap pool: those with members, minus any
  // default set the caller says a custom list replaces (v0.1.2, recomputeWithPeers), so that a
  // custom list equal to the structural members reproduces the batch bootstrap exactly.
  const setsWithMembers = setNames.filter((s) => Array.isArray(setMembers[s]) && setMembers[s].length > 0 && !(excludeFromPool || []).includes(s));
  const ts = topSplitObj || (topSplitRow ? { row: topSplitRow, classification: null } : { row: 'indeterminate', classification: null });
  const recordsBySet = {};
  for (const s of setNames) {
    recordsBySet[s] = [
      ...indicators
        .filter((i) => i.class !== 'X' && i.available && isNum(i.weight) && !i.suppressed)
        .map((i) => ({
          id: i.id,
          nodes: i.nodes,
          test: i.test,
          class: i.class,
          family: i.family,
          signal: signalForSet(i, s),
          weight: i.weight,
          year: i.year_ref,
          readings: readingsForSet(i, s),
          downgraded: !!i.class_note,
        })),
      ...(cm || [])
        .filter((c) => isNum(c.signal) && isNum(c.weight))
        .map((c) => ({
          id: c.id,
          nodes: [c.node, ...(c.also_nodes || [])],
          test: 'changes',
          class: 'C',
          family: c.family || c.id,
          signal: c.signal,
          weight: c.weight,
          year: c.year,
        })),
    ];
  }
  const defs = R.node_defs;
  const leafDefs = defs.filter((d) => d.diagnosable && !d.rollup_of && !d.desk_undiagnosable && !d.context_only && !d.elimination);
  // Nodes judged by elimination (N12, engine 0.1.5): computed for their evidence and lean, never tiered or ranked.
  const elimDefs = defs.filter((d) => d.diagnosable && d.elimination);
  const rollupDefs = defs.filter((d) => Array.isArray(d.rollup_of));
  const connectorFamiliesByNode = {};
  for (const c of R.connectors_not_built) {
    for (const n of c.nodes || []) (connectorFamiliesByNode[n] = connectorFamiliesByNode[n] || []).push(c.family);
  }
  const connectorsNotBuilt = Object.keys(connectorFamiliesByNode);
  // Class A/B indicators the registry computes per node (empty array = the node can never
  // leave cannot_tell under this registry; assignTier reports it as sub-reason no_ab_family).
  const registryABByNode = {};
  const registryABPriceByNode = {};
  for (const d of leafDefs) {
    registryABByNode[d.id] = [];
    registryABPriceByNode[d.id] = [];
  }
  for (const ind of R.indicators) {
    if (ind.class !== 'A' && ind.class !== 'B') continue;
    for (const n of ind.nodes || []) {
      if (registryABByNode[n]) registryABByNode[n].push(ind.id);
      if (ind.test === 'price' && registryABPriceByNode[n]) registryABPriceByNode[n].push(ind.id);
    }
  }
  // Evidence families a node needs before it can be ruled out (nodes.json, v0.1.2).
  const ruledOutRequiresByNode = {};
  for (const d of leafDefs) ruledOutRequiresByNode[d.id] = Array.isArray(d.ruled_out_requires_families) ? d.ruled_out_requires_families.slice() : [];
  // The most voting families the registry can supply per node (class A/B on the price test, any
  // class on the other tests, plus the co-movement specs): below E_below the node is a registry
  // coverage statement, not a data gap (sub-reason registry_coverage).
  const registryVotingMaxByNode = registryVotingCapacity(R, leafDefs.map((d) => d.id), params);

  const nodeInputs = {};
  for (const d of leafDefs) {
    const familiesBySet = {};
    for (const s of setNames) familiesBySet[s] = buildFamilies(recordsBySet[s], d.id);
    nodeInputs[d.id] = { familiesBySet, setsWithMembers };
  }
  const evalAll = (thresholdFactor) => {
    const ev = {};
    for (const d of leafDefs) {
      ev[d.id] = evaluateNode({
        nodeId: d.id,
        familiesBySet: nodeInputs[d.id].familiesBySet,
        activeSet,
        setsWithMembers,
        params,
        snapshotYear,
        connectorsNotBuilt,
        connectorFamilies: connectorFamiliesByNode[d.id] || [],
        registryAB: registryABByNode[d.id] || [],
        registryABPrice: registryABPriceByNode[d.id] || [],
        registryVotingMax: registryVotingMaxByNode[d.id] ?? null,
        ruledOutRequires: ruledOutRequiresByNode[d.id] || [],
        thresholdFactor,
      });
    }
    const rationing = indicators.find((i) => i.id === RATIONING_INDICATOR);
    const rationingSignal = rationing ? signalForSet(rationing, activeSet) : null;
    const financeIds = defs.filter((d) => d.diagnosable && (d.branch === 'finance' || d.id === 'N0')).map((d) => d.id);
    for (const id of financeIds) if (ev[id]) applyTopSplitOverride(ev[id], ts, rationingSignal, params);
    for (const d of rollupDefs) ev[d.id] = rollupNode(d, d.rollup_of.map((s) => ev[s]), params);
    return ev;
  };
  const evaluated = evalAll(1);
  for (const d of elimDefs) {
    const familiesBySet = {};
    for (const s of setNames) familiesBySet[s] = buildFamilies(recordsBySet[s], d.id);
    evaluated[d.id] = eliminationNode(evaluateNode({ nodeId: d.id, familiesBySet, activeSet, setsWithMembers, params, snapshotYear, fragility: 'sets' }));
  }

  const records = [];
  for (const d of defs) {
    if (!/^N\d/.test(d.id)) continue;
    if (evaluated[d.id]) {
      records.push({
        ...evaluated[d.id],
        label: d.label,
        short: d.short,
        parent: d.parent,
        connectors_missing: connectorFamiliesByNode[d.id] || [],
        scored: !d.elimination,
      });
    } else if (d.desk_undiagnosable) {
      records.push(unscoredNode(d, 'desk_undiagnosable', d.status_note || 'Cannot be judged from macro data; sector work required (Workbook N13)'));
    } else if (d.context_only) {
      records.push(unscoredNode(d, 'context_only', d.status_note || 'Context, not a removable constraint; enters the ICRs as controls (Workbook N9)'));
    }
  }
  const rollupIds = rollupDefs.map((d) => d.id);
  const topLevel = records.filter((r) => !rollupIds.includes(r.parent));
  const topLevelScored = topLevel.filter((r) => r.scored);
  const ranking = rankNodes(topLevelScored);
  const breadth = {};
  for (const r of topLevelScored) breadth[r.id] = 1.0;
  const rollups = {};
  for (const d of rollupDefs) rollups[d.id] = { def: d, subIds: d.rollup_of };
  const topLevelIds = topLevelScored.map((r) => r.id);
  const bs = bootstrap
    ? bootstrapRanks({ nodeInputs, rollups, topLevelIds, params, snapshotYear, connectorsNotBuilt, connectorFamiliesByNode, registryABByNode, registryABPriceByNode, registryVotingMaxByNode, ruledOutRequiresByNode, seed })
    : null;
  const likely = topLevelScored.filter((r) => r.tier === 'likely_binding').map((r) => r.id);
  const rk = params.ranking;
  const rankingOut = {
    ordered: ranking.ordered,
    scores: ranking.scores,
    breadth,
    modal_rank: bs ? bs.modal_rank : null,
    [`p_top${rk.top_k}`]: bs ? bs.p_top_k : null,
    p_ranked: bs ? bs.p_ranked : null,
    not_resampled: bs ? bs.not_resampled : null,
    bootstrap_draws: bs ? bs.draws : 0,
    bootstrap_pool: setsWithMembers.slice(),
    seed,
    likely_binding: likely,
    too_many_likely_binding: likely.length > rk.max_likely_binding_before_flag,
  };

  const tierBySet = {};
  const lbMap = new Map();
  for (const r of records) {
    if (!r.scored) continue;
    tierBySet[r.id] = r.tier_by_set;
    for (const f of r.load_bearing) {
      if (!lbMap.has(f)) lbMap.set(f, []);
      lbMap.get(f).push(r.id);
    }
  }
  const pert = rk.threshold_perturbation;
  const pick = (ev) => {
    const o = {};
    for (const id of Object.keys(ev).sort()) o[id] = ev[id].tier;
    return o;
  };
  const sensitivity = {
    tier_by_set: tierBySet,
    load_bearing_families: [...lbMap.keys()].sort().map((f) => ({ family: f, nodes: lbMap.get(f) })),
    threshold_sensitivity: {
      [`minus${Math.round(pert * 100)}`]: pick(evalAll(1 - pert)),
      [`plus${Math.round(pert * 100)}`]: pick(evalAll(1 + pert)),
    },
  };
  const st = statements(topLevel, ranking);
  return { nodes: records, ranking: rankingOut, statements: st, sensitivity, sets_with_members: setsWithMembers };
}

/**
 * Build the Scorecard for one economy. options: {seedSalt, generatedAt, bootstrap}.
 */
export function buildScorecard(ctx, iso3, options = {}) {
  const { registry: R, params, snapshotYear, meta } = ctx;
  const country = ctx.countriesByIso[iso3];
  if (!country) throw new Error(`unknown economy ${iso3}`);
  const sets = comparatorSets(iso3, ctx.features, ctx.series['NY.GDP.PCAP.PP.KD'], params);
  const setMembers = {};
  for (const s of DEFAULT_SETS) setMembers[s] = sets[s].members;
  const activeSet = 'structural';
  const indicators = buildIndicatorRecords(ctx, iso3, setMembers, activeSet);
  const cm = buildComovementRecords(ctx, iso3);
  const ts = topSplitFromIndicators(indicators, params);
  const salt = options.seedSalt === undefined ? null : options.seedSalt;
  const seed = seedFor(iso3, R.rubric_version, salt);
  const verdict = assembleVerdicts({
    indicators,
    comovement: cm,
    setMembers,
    activeSet,
    registry: R,
    params,
    snapshotYear,
    topSplit: ts,
    seed,
    bootstrap: options.bootstrap !== false,
  });
  const regionMembers = ctx.countries.filter((c) => c.region === country.region && c.iso3 !== iso3).map((c) => c.iso3);
  const icrLookup = (id) => {
    const rec = indicators.find((i) => i.id === id);
    return rec ? rec.icr : null;
  };
  const gp = growthProblem({
    uni: ctx.uni,
    country,
    series: ctx.series,
    refs: ctx.refs,
    features: ctx.features,
    sets,
    icr: icrLookup,
    params,
    snapshotYear,
    topSplit: ts,
    regionMembers,
  });
  const f = ctx.features[iso3] || {};
  const comparators = {};
  for (const s of DEFAULT_SETS) comparators[s] = { ...sets[s], members: sets[s].members };
  return {
    meta: {
      iso3,
      snapshot_id: meta.snapshot_id,
      snapshot_year: snapshotYear,
      rubric_version: R.rubric_version,
      engine_version: ENGINE_VERSION,
      generated_at: options.generatedAt || null,
      active_comparator_set: activeSet,
      seed,
      seed_salt: salt,
      hidden_indicators: (R.hidden_indicators || []).slice(),
      prototype: true,
    },
    country: {
      iso3,
      name: country.name,
      region: country.region,
      income_group: country.income_group,
      landlocked: country.landlocked ? 1 : 0,
      features: Object.fromEntries(FEATURE_NAMES.map((k) => [k, isNum(f[k]) ? f[k] : null])),
    },
    growth_problem: gp,
    top_split: ts,
    comparators,
    indicators,
    comovement: cm,
    nodes: verdict.nodes,
    ranking: verdict.ranking,
    sensitivity: verdict.sensitivity,
    statements: verdict.statements,
  };
}

/**
 * Browser recompute: the user supplies a peer list. Peer-gap signals are recomputed from
 * the matrix for the custom set (and for the three default sets, which stay available for
 * display in tier_by_set), ICR t values stay fixed, and the aggregation reruns with the custom
 * set active. The custom list REPLACES one default set in the fragility check and the bootstrap
 * pool (v0.1.2; `options.replaces`, default the Scorecard's active set), so passing the structural
 * members back in reproduces the batch tiers, ranks, modal ranks and P(top k) exactly.
 * Returns {nodes, ranking, statements, sensitivity, indicators, peers, replaces}.
 */
export function recomputeWithPeers(scorecard, matrix, peerIso3List, registry, params, options = {}) {
  const R = normalizeRegistry(registry);
  const iso3 = scorecard.meta.iso3;
  const snapshotYear = isNum(matrix.snapshot_year) ? matrix.snapshot_year : scorecard.meta.snapshot_year || snapshotYearOf(scorecard.meta);
  const peers = uniq((peerIso3List || []).filter((p) => p && p !== iso3));
  const replaces = options && DEFAULT_SETS.includes(options.replaces) ? options.replaces : scorecard.meta.active_comparator_set || 'structural';
  // the custom set takes the replaced set's position so the bootstrap's set draws map the same way
  const setMembers = {};
  for (const s of DEFAULT_SETS) {
    if (s === replaces) setMembers.custom = peers;
    setMembers[s] = (scorecard.comparators[s] && scorecard.comparators[s].members) || [];
  }
  if (!setMembers.custom) setMembers.custom = peers;
  const activeSet = 'custom';
  const indicators = scorecard.indicators.map((i) => {
    if (!i.available || i.class === 'X') return { ...i, peer_gap: {}, signal_by_set: {}, signal: null };
    // The camels percentile rule does not depend on comparators: keep its signal under every set.
    if (i.signal_rule === 'workbook_4.7_percentile') return { ...i, signal_by_set: Object.fromEntries(Object.keys(setMembers).map((s) => [s, i.signal])) };
    const pg = {};
    for (const s of Object.keys(setMembers)) pg[s] = peerGapFromMatrix(i, setMembers[s], matrix, params);
    const rec = { ...i, peer_gap: pg, signal_by_set: {} };
    for (const s of Object.keys(setMembers)) rec.signal_by_set[s] = signalForSet(rec, s);
    rec.signal = rec.signal_by_set[activeSet] ?? null;
    return rec;
  });
  const seed = isNum(scorecard.meta.seed) ? scorecard.meta.seed : seedFor(iso3, R.rubric_version, scorecard.meta.seed_salt ?? null);
  const v = assembleVerdicts({
    indicators,
    comovement: scorecard.comovement,
    setMembers,
    activeSet,
    registry: R,
    params,
    snapshotYear,
    topSplit: scorecard.top_split || { row: 'indeterminate', classification: null },
    seed,
    excludeFromPool: [replaces],
  });
  return {
    nodes: v.nodes,
    ranking: v.ranking,
    statements: v.statements,
    sensitivity: v.sensitivity,
    indicators,
    peers,
    replaces,
    active_comparator_set: activeSet,
  };
}

// ---------------------------------------------------------------------------
// Desk data
// ---------------------------------------------------------------------------

export function deskIndexEntry(sc, params) {
  const tiers = {};
  let eTotal = 0;
  for (const n of sc.nodes) {
    tiers[n.id] = n.tier;
    if (n.scored && !n.sub_nodes) eTotal += n.E;
  }
  return {
    iso3: sc.meta.iso3,
    name: sc.country.name,
    region: sc.country.region,
    income_group: sc.country.income_group,
    classification: sc.growth_problem.classification,
    top_split: sc.top_split.row,
    top_split_rate_source: sc.top_split.rate_source || null,
    tiers,
    top3: sc.ranking.ordered.slice(0, params.ranking.top_k),
    e_total: eTotal,
  };
}

export function deskCountryFile(ctx, sc) {
  const series = {};
  for (const id of DESK_SERIES) series[id] = seriesPairs(ctx.series, id, sc.meta.iso3);
  return { ...sc, series };
}

export function deskCountries(ctx) {
  return ctx.countries.map((c) => ({ ...c, features: ctx.features[c.iso3] || null }));
}

// ---------------------------------------------------------------------------------------------
// Evidence layer data (v0.1.5, evidence-viz-prd section 9). Pure functions; the CLI writes them.

const sig6 = (v) => (isNum(v) ? Number(v.toPrecision(6)) : null);

/**
 * One panel per series: {id, years: [first..last], v: {iso3: [value|null aligned with years]}}.
 * Covers every registry indicator with data plus derived series, for the economies universe.
 */
export function buildPanels(ctx) {
  const out = {};
  const uni = new Set(ctx.universe);
  for (const [id, byIso] of Object.entries(ctx.series)) {
    let lo = Infinity, hi = -Infinity;
    for (const [iso3, byYear] of Object.entries(byIso)) {
      if (!uni.has(iso3)) continue;
      for (const y of Object.keys(byYear)) { const n = +y; if (isNum(byYear[y])) { if (n < lo) lo = n; if (n > hi) hi = n; } }
    }
    if (!Number.isFinite(lo)) continue;
    const years = [];
    for (let y = lo; y <= hi; y++) years.push(y);
    const v = {};
    for (const [iso3, byYear] of Object.entries(byIso)) {
      if (!uni.has(iso3)) continue;
      const row = years.map((y) => sig6(byYear[y]));
      if (row.some((x) => x !== null)) v[iso3] = row;
    }
    out[id] = { id, years, v };
  }
  return out;
}

/**
 * Per-economy data coverage, so the Desk can grey out indicators with no data and point to the
 * years that have some without loading every panel: {iso3: {id: [first_year, last_year, n_years]}}.
 */
export function buildCoverage(panels) {
  const out = {};
  for (const [id, p] of Object.entries(panels)) {
    for (const [iso3, row] of Object.entries(p.v)) {
      let first = null, last = null, n = 0;
      row.forEach((x, i) => { if (x !== null) { n++; if (first === null) first = p.years[i]; last = p.years[i]; } });
      if (n) (out[iso3] ||= {})[id] = [first, last, n];
    }
  }
  return out;
}

/**
 * The engine's global income-conditional fits, for drawing and for the "adjusted for income and
 * structure" readout: {snapshot_year, window_years, fits: {id: {ok, n, r2, scale, scale_method,
 * transform, controls, coefficients, winsor, t: {iso3: t}, fitted: {iso3: fitted}}}}.
 */
export function buildFitsFile(ctx) {
  const fits = {};
  for (const ind of ctx.registry.indicators) {
    const f = ctx.fits[ind.id] && ctx.fits[ind.id].global;
    if (!f) continue;
    if (!f.ok) { fits[ind.id] = { ok: false, n: f.n, reason: f.reason }; continue; }
    const t = {}, fitted = {};
    for (const [iso3, p] of Object.entries(f.per)) { t[iso3] = sig6(p.t); fitted[iso3] = sig6(p.fitted); }
    fits[ind.id] = {
      ok: true, n: f.n, r2: sig6(f.r2), scale: sig6(f.scale), scale_method: f.scale_method,
      transform: ind.transform || 'none',
      controls: Object.keys(f.coefficients).filter((c) => c !== 'intercept' && f.coefficients[c] !== null),
      coefficients: Object.fromEntries(Object.entries(f.coefficients).map(([k, v]) => [k, sig6(v)])),
      winsor: { lo: sig6(f.winsor.lo), hi: sig6(f.winsor.hi) },
      t, fitted,
    };
  }
  return { snapshot_year: ctx.snapshotYear, window_years: ctx.windowYears, params_icr: ctx.params.icr, fits };
}

// signals.mjs — ICR signal, peer-gap signal, co-movement signal, recency, weights,
// and family deduplication. Pure ES module: no Node built-ins.
//
// Signals live in {−2, −1, 0, +1, +2} (indicator signals may be half-integers because
// the indicator signal is the median of the ICR and peer-gap signals). Positive means
// "consistent with this constraint binding"; the registry `direction` (+1 = higher
// value is more binding, −1 = higher is less binding) orients every rule.
import { isNum, median, mad, sign, ols } from './stats.mjs';

export const CLASS_ORDER = { A: 0, B: 1, C: 2, D: 3 };
export const TEST_ORDER = ['price', 'changes', 'circumvention', 'camels'];

export function betterClass(a, b) {
  if (!a) return b;
  if (!b) return a;
  return CLASS_ORDER[a] <= CLASS_ORDER[b] ? a : b;
}

function noNegZero(x) {
  return x === 0 ? 0 : x;
}

/**
 * ICR signal: mag = |t| ≥ strong ? 2 : |t| ≥ weak ? 1 : 0;  s_icr = direction · sign(t) · mag.
 */
export function icrSignal(t, direction, thresholds) {
  if (!isNum(t) || !direction) return null;
  const a = Math.abs(t);
  const mag = a >= thresholds.strong ? 2 : a >= thresholds.weak ? 1 : 0;
  return noNegZero(direction * sign(t) * mag);
}

/**
 * Peer-gap signal for one comparator set.
 * Rank the target among peers ∪ target from most binding (rank 1) to least. Ties take half a
 * rank (rubric v0.1.2, peer_gap.tie_rule = "half_rank"):
 *   more = peers strictly more binding; less = peers strictly less binding; ties = the rest
 *   rank_worst = 1 + more + ties/2;  n = peers + 1;  rank_best = 1 + less + ties/2
 *   +2 if rank_worst ≤ strong_worst; −2 if rank_best ≤ strong_best;
 *   +1 if rank_worst ≤ weak_worst;   −1 if rank_best ≤ weak_best;  else 0.
 * A target tied with every peer therefore sits in the middle and scores 0 (`tied: true` when
 * the target equals the peer median and the peer MAD is 0: a zero-inflated or ceiling series).
 * Under v0.1.1 only strictly-more-binding peers counted, so a fully tied target ranked first
 * and scored +2 (full electricity access among peers with full access read as binding).
 * Small-set rule: when n ≤ 7 a middle rank can satisfy both a worst-side and a best-side
 * condition; the engine then returns 0 and sets `ambiguous: true` (see README).
 * Also returns the gap to the peer median in units and in units of the peer MAD.
 * Requires at least min_peers_with_data peers with a value; otherwise signal is null.
 */
export function peerGap(targetValue, peerValues, direction, peerGapParams) {
  if (!isNum(targetValue) || !direction) return null;
  const peers = (peerValues || []).filter(isNum);
  const th = peerGapParams.rank_thresholds;
  const med = median(peers);
  const m = mad(peers);
  const base = {
    n: peers.length + 1,
    peers_with_data: peers.length,
    peer_median: med,
    peer_mad: m,
    gap_units: med === null ? null : targetValue - med,
    gap_mad: med === null || !(m > 0) ? null : (targetValue - med) / m,
  };
  if (peers.length < peerGapParams.min_peers_with_data) {
    return { ...base, rank_worst: null, rank_best: null, ties: 0, tied: false, signal: null, ambiguous: false, insufficient: true };
  }
  let more = 0;
  let less = 0;
  for (const v of peers) {
    const d = direction * (v - targetValue);
    if (d > 0) more++;
    else if (d < 0) less++;
  }
  const ties = peers.length - more - less;
  const halfRank = (peerGapParams.tie_rule || 'half_rank') === 'half_rank';
  const rankWorst = 1 + more + (halfRank ? ties / 2 : 0);
  const rankBest = halfRank ? 1 + less + ties / 2 : base.n - rankWorst + 1;
  const tied = ties > 0 && med !== null && targetValue === med && !(m > 0);
  const worstSide = rankWorst <= th.strong_worst ? 2 : rankWorst <= th.weak_worst ? 1 : 0;
  const bestSide = rankBest <= th.strong_best ? -2 : rankBest <= th.weak_best ? -1 : 0;
  let signal;
  let ambiguous = false;
  if (tied) {
    signal = 0;
  } else if (worstSide !== 0 && bestSide !== 0) {
    signal = 0;
    ambiguous = true;
  } else {
    signal = worstSide !== 0 ? worstSide : bestSide;
  }
  return { ...base, rank_worst: rankWorst, rank_best: rankBest, ties, tied, signal, ambiguous, insufficient: false };
}

/**
 * Recency multiplier from age = snapshot_year − year_ref using recency.bands
 * (first band with age ≤ max_age, bands sorted by max_age) else older_mult; for slow-moving
 * indicators mult = max(mult, slow_moving_floor).
 */
export function recencyMultiplier(age, recency, slow = false) {
  if (!isNum(age)) return 0;
  let mult = recency.older_mult;
  const bands = recency.bands.slice().sort((a, b) => a.max_age - b.max_age);
  for (const b of bands) {
    if (age <= b.max_age) {
      mult = b.mult;
      break;
    }
  }
  if (slow) mult = Math.max(mult, recency.slow_moving_floor);
  return mult;
}

/** Indicator signal = median of the available ICR and peer-gap signals (null if neither). */
export function indicatorSignal(sIcr, sPg) {
  const xs = [sIcr, sPg].filter(isNum);
  return xs.length ? median(xs) : null;
}

/** w = class_weights[class] × recency multiplier; class X yields null (no signal). */
export function indicatorWeight(cls, recencyMult, classWeights) {
  if (!cls || cls === 'X' || !isNum(classWeights[cls])) return null;
  return classWeights[cls] * recencyMult;
}

function diffAt(byYear, t) {
  if (!byYear) return null;
  const a = byYear[t];
  const b = byYear[t - 1];
  return isNum(a) && isNum(b) ? a - b : null;
}

/** log(n choose k) via lgamma-free summation (n is small: at most window_years). */
function logChoose(n, k) {
  let s = 0;
  for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
  return s;
}

/**
 * One-sided exact binomial tail: P(X ≥ k) for X ~ Binomial(n, 0.5).
 */
export function binomialUpperTail(k, n) {
  if (!Number.isInteger(k) || !Number.isInteger(n) || n < 0) return null;
  if (k <= 0) return 1;
  if (k > n) return 0;
  let p = 0;
  const ln2 = n * Math.log(2);
  for (let i = k; i <= n; i++) p += Math.exp(logChoose(n, i) - ln2);
  return Math.min(1, p);
}

/**
 * Co-movement signal from an exact binomial sign test (rubric v0.1.2, params.comovement):
 *   agree = pairs whose signs match the predicted relation; n = pairs with non-zero changes
 *   p_pred  = P(X ≥ agree | n, 0.5)        evidence for the predicted direction
 *   p_wrong = P(X ≥ n − agree | n, 0.5)    evidence for the wrong direction
 *   predicted direction: +2 if p_pred ≤ strong_p, +1 if ≤ weak_p, capped at predicted_sign_cap (1)
 *   wrong direction:     −2 if p_wrong ≤ strong_p, −1 if ≤ weak_p
 *   otherwise 0.
 * With weak_p 0.10 and strong_p 0.025 on 19 pairs the predicted sign needs 13 of 19 (0.684)
 * for +1, and the wrong sign 13 of 19 for −1 and 15 of 19 (0.789) for −2. The cap keeps the
 * Workbook 4.7 asymmetry (predicted sign at most +1; the wrong sign is the stronger message).
 * Replaces the v0.1.1 graded consistency bands (0.60 / 0.75), which fired inside the
 * sampling noise of a sign test on about 19 pairs (P(consistency ≥ 0.60 | n = 19) = 0.18).
 * Returns {signal, p_value, direction, p_predicted, p_wrong}.
 */
export function comovementSignal(agree, n, cm) {
  if (!Number.isInteger(agree) || !Number.isInteger(n) || n <= 0) return { signal: null, p_value: null, direction: null, p_predicted: null, p_wrong: null };
  const b = cm && cm.binomial;
  if (!b || !isNum(b.weak_p) || !isNum(b.strong_p)) {
    throw new Error('params.comovement.binomial = {weak_p, strong_p} is required (rubric v0.1.2 replaced comovement.graded)');
  }
  const cap = isNum(cm.predicted_sign_cap) ? cm.predicted_sign_cap : 2;
  const pPred = binomialUpperTail(agree, n);
  const pWrong = binomialUpperTail(n - agree, n);
  let signal = 0;
  let direction = 'none';
  if (agree > n - agree) {
    direction = 'predicted';
    if (pPred <= b.strong_p) signal = 2;
    else if (pPred <= b.weak_p) signal = 1;
    signal = Math.min(signal, cap);
  } else if (n - agree > agree) {
    direction = 'wrong';
    if (pWrong <= b.strong_p) signal = -2;
    else if (pWrong <= b.weak_p) signal = -1;
  }
  if (signal === 0) direction = direction === 'none' ? 'none' : `${direction} (not significant)`;
  return { signal, p_value: Math.min(pPred, pWrong), direction, p_predicted: pPred, p_wrong: pWrong };
}

/**
 * Co-movement (Test 2) for one comovement_specs entry.
 * Over the last window_years calendar years ending at the snapshot year, pair
 * Δy_t = y_t − y_{t−1} with Δx_{t−lag}; drop pairs where either change is zero;
 *   consistency = share of pairs with sign(Δy_t) = expected_sign · sign(Δx_{t−lag});
 * needs ≥ min_years pairs; signal = comovementSignal(agree, pairs, params.comovement).
 * Also the OLS slope of Δy on Δx.
 * `xByYear` may be one series or an array of candidate series (in order of preference, matching
 * an array `spec.x`, v0.1.2): the first candidate with at least min_years pairs is used and its
 * id is recorded as `x_source`.
 * The result is one family (id = spec id), class C, test "changes", year = last year used.
 */
export function comovement(xByYear, yByYear, spec, params, snapshotYear) {
  const cm = params.comovement;
  const first = snapshotYear - spec.window_years + 1;
  const xIds = Array.isArray(spec.x) ? spec.x : [spec.x];
  const xSeries = Array.isArray(xByYear) ? xByYear : [xByYear];
  let chosen = null;
  for (let i = 0; i < xIds.length; i++) {
    const xs = xSeries[i];
    const pairs = [];
    for (let t = first; t <= snapshotYear; t++) {
      const dy = diffAt(yByYear, t);
      const dx = diffAt(xs, t - spec.lag);
      if (!isNum(dy) || !isNum(dx)) continue;
      pairs.push({ t, dy, dx });
    }
    const nonzero = pairs.filter((p) => p.dy !== 0 && p.dx !== 0);
    const cand = { xId: xIds[i], pairs, nonzero };
    if (!chosen) chosen = cand;
    if (nonzero.length >= cm.min_years) {
      chosen = cand;
      break;
    }
  }
  const { xId, pairs, nonzero } = chosen || { xId: xIds[0], pairs: [], nonzero: [] };
  const out = {
    id: spec.id,
    node: spec.node,
    also_nodes: spec.also_nodes || [],
    x: xId,
    x_source: xId,
    x_candidates: xIds,
    y: spec.y,
    lag: spec.lag,
    expected_sign: spec.expected_sign,
    window: [first, snapshotYear],
    pairs: nonzero.length,
    pairs_with_zero_change: pairs.length - nonzero.length,
    years: nonzero.length ? [nonzero[0].t, nonzero[nonzero.length - 1].t] : null,
    year: nonzero.length ? nonzero[nonzero.length - 1].t : null,
    agree: null,
    consistency: null,
    p_value: null,
    direction: null,
    slope: null,
    signal: null,
    test_rule: cm.binomial ? { test: cm.test || 'binomial_one_sided', weak_p: cm.binomial.weak_p, strong_p: cm.binomial.strong_p, predicted_sign_cap: isNum(cm.predicted_sign_cap) ? cm.predicted_sign_cap : 2 } : null,
    class: 'C',
    test: 'changes',
    family: spec.id,
    insufficient: nonzero.length < cm.min_years,
  };
  if (out.insufficient) return out;
  let agree = 0;
  for (const p of nonzero) if (sign(p.dy) === spec.expected_sign * sign(p.dx)) agree++;
  out.agree = agree;
  out.consistency = agree / nonzero.length;
  const fit = ols(
    nonzero.map((p) => [1, p.dx]),
    nonzero.map((p) => p.dy),
  );
  out.slope = fit ? fit.beta[1] : null;
  const s = comovementSignal(agree, nonzero.length, cm);
  out.signal = s.signal;
  out.p_value = s.p_value;
  out.direction = s.direction;
  return out;
}

/**
 * Family deduplication for one node. `records` are signal-bearing records
 * ({id, nodes, test, class, family, signal, weight, year, readings?}); records whose signal or
 * weight is missing are skipped. Families are keyed by (test, family) so a family contributes
 * once per node per test. Family signal = median of member signals; weight = max member weight;
 * class = best member class (A best); year = newest member year; readings = the union of the
 * members' readings ('icr', 'peer_gap'), used by the ruled_out guard on a lone circumvention family.
 */
export function buildFamilies(records, nodeId) {
  const groups = new Map();
  for (const r of records) {
    if (!r.nodes || !r.nodes.includes(nodeId)) continue;
    if (!isNum(r.signal) || !isNum(r.weight)) continue;
    const key = `${r.test}|${r.family}`;
    let g = groups.get(key);
    if (!g) {
      g = { id: r.family, test: r.test, members: [] };
      groups.set(key, g);
    }
    g.members.push({ id: r.id, signal: r.signal, weight: r.weight, class: r.class, year: r.year, readings: Array.isArray(r.readings) ? r.readings : null, downgraded: !!r.downgraded });
  }
  const families = [];
  for (const g of groups.values()) {
    g.members.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    let cls = null;
    let weight = -Infinity;
    let year = null;
    let downgraded = false;
    const readings = new Set();
    for (const m of g.members) {
      cls = betterClass(cls, m.class);
      weight = Math.max(weight, m.weight);
      if (isNum(m.year) && (year === null || m.year > year)) year = m.year;
      for (const rd of m.readings || []) readings.add(rd);
      if (m.downgraded) downgraded = true;
    }
    families.push({
      id: g.id,
      test: g.test,
      class: cls,
      signal: median(g.members.map((m) => m.signal)),
      weight,
      year,
      indicators: g.members.map((m) => m.id),
      readings: [...readings].sort(),
      downgraded,
      members: g.members,
    });
  }
  families.sort(
    (a, b) => TEST_ORDER.indexOf(a.test) - TEST_ORDER.indexOf(b.test) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return families;
}

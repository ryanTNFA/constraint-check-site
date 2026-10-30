// Evidence layer chart math (evidence-viz-prd C1). Pure functions, shared by the browser and the
// tests. It reuses the engine's own reference rule, transforms, winsorization and Huber fit, so the
// income-only line drawn here is fitted exactly the way the engine fits its residuals.
import { isNum, median, mad, percentile } from '../../engine/src/stats.mjs';
import { huberIRLS } from '../../engine/src/stats.mjs';
import { transformValue, winsorize } from '../../engine/src/transforms.mjs';
import { referenceFor } from '../../engine/src/reference.mjs';

export const INCOME_ID = 'NY.GDP.PCAP.PP.KD';

/** Panel row -> {year: value} for referenceFor. */
export function byYearOf(panel, iso3) {
  const row = panel && panel.v[iso3];
  if (!row) return null;
  const o = {};
  panel.years.forEach((y, i) => { if (isNum(row[i])) o[y] = row[i]; });
  return o;
}

/** Reference value (engine rule: latest year in the window, 3-year mean) for every economy. */
/** "2022–24 average" for a multi-year reference value, or the single year. */
export function refSpan(r) { return r && r.n > 1 && r.from < r.year ? `${r.from}–${String(r.year).slice(-2)} average` : String(r ? r.year : ''); }
export function referenceTable(panel, asOfYear, windowYears) {
  const out = {};
  if (!panel) return out;
  for (const iso3 of Object.keys(panel.v)) {
    const by = byYearOf(panel, iso3);
    const r = referenceFor(by, asOfYear, windowYears);
    // from and n describe the average (up to three years ending at year); latest is the single latest value.
    if (r && r.available) out[iso3] = { value: r.value_ref, year: r.year_ref, from: [r.year_ref - 2, r.year_ref - 1, r.year_ref].find((y) => isNum(by[y])), n: r.n_ref, latest: r.value };
  }
  return out;
}

/** Scatter rows: economies with both a reference value and income, on the transformed scale. */
export function scatterRows(indPanel, incomePanel, { asOfYear, windowYears, transform }) {
  const ys = referenceTable(indPanel, asOfYear, windowYears);
  const xs = referenceTable(incomePanel, asOfYear, windowYears);
  const rows = [];
  for (const [iso3, y] of Object.entries(ys)) {
    const x = xs[iso3];
    if (!x || !(x.value > 0)) continue;
    const yt = transformValue(y.value, transform);
    if (!isNum(yt)) continue;
    rows.push({ iso3, x: Math.log(x.value), income: x.value, raw: y.value, y: yt, year: y.year, from: y.from, n: y.n, latest: y.latest });
  }
  return rows.sort((a, b) => a.x - b.x);
}

/**
 * The "data as of" years at which the economy has a point on the scatter and enough economies
 * have data to fit a line (at least minN). Newest first: [{year, n}].
 */
export function viableYears(indPanel, incomePanel, iso3, { years, windowYears, transform, minN }) {
  const out = [];
  for (const y of [...years].sort((a, b) => b - a)) {
    const rows = scatterRows(indPanel, incomePanel, { asOfYear: y, windowYears, transform });
    if (rows.length >= minN && rows.some((r) => r.iso3 === iso3)) out.push({ year: y, n: rows.length });
  }
  return out;
}

/** Inverse of the registry transforms (for drawing the fitted line in the indicator's own units). */
export function backTransform(yt, transform) {
  if (!isNum(yt)) return null;
  switch (transform || 'none') {
    case 'none': return yt;
    case 'log': return Math.exp(yt);
    case 'log1p': return Math.exp(yt) - 1;
    case 'logit': return 100 / (1 + Math.exp(-yt));
    default: throw new Error(`unknown transform: ${transform}`);
  }
}

/**
 * Linear income-only fit, the engine way: y winsorized at the given percentiles, Huber IRLS of y on
 * [1, log income], robust scale. Returns {ok, method, n, beta, scale, predict(x), t: {iso3}, resid: {iso3}}.
 */
export function linearFit(rows, { huberK = 1.345, winsor = [1, 99], minN = 40 } = {}) {
  if (rows.length < minN) return { ok: false, n: rows.length, reason: `fewer than ${minN} economies with data` };
  const w = winsorize(rows.map((r) => r.y), winsor);
  const X = rows.map((r) => [1, r.x]);
  const fit = huberIRLS(X, w.values, { k: huberK });
  if (!fit || fit.degenerate) return { ok: false, n: rows.length, reason: 'no spread in the data to fit' };
  const [a, b] = fit.beta;
  const t = {}, resid = {};
  rows.forEach((r, i) => { resid[r.iso3] = fit.residuals[i]; t[r.iso3] = fit.residuals[i] / fit.scale; });
  return { ok: true, method: 'linear', n: rows.length, beta: [a, b], scale: fit.scale, r2: fit.r2, predict: (x) => a + b * x, t, resid, winsor: { lo: w.lo, hi: w.hi } };
}

/**
 * LOWESS (Cleveland 1979): local linear regression with tricube weights over the nearest `span`
 * share of points, with `iterations` robustness passes (bisquare). Evaluated at every data x and
 * interpolated linearly between them. Residual scale is MAD/0.6745 of the residuals.
 */
export function lowessFit(rows, { span = 0.5, iterations = 2, winsor = [1, 99], minN = 40 } = {}) {
  if (rows.length < minN) return { ok: false, n: rows.length, reason: `fewer than ${minN} economies with data` };
  const xs = rows.map((r) => r.x);
  const ys = winsorize(rows.map((r) => r.y), winsor).values;
  const n = xs.length;
  const q = Math.max(3, Math.min(n, Math.round(span * n)));
  let robust = new Array(n).fill(1);
  let fitted = new Array(n).fill(0);
  for (let it = 0; it <= iterations; it++) {
    for (let i = 0; i < n; i++) {
      const d = xs.map((x) => Math.abs(x - xs[i]));
      const h = d.slice().sort((a, b) => a - b)[q - 1] || 1e-12;
      let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
      for (let j = 0; j < n; j++) {
        const u = d[j] / h;
        if (u >= 1) continue;
        const wj = (1 - u ** 3) ** 3 * robust[j];
        sw += wj; swx += wj * xs[j]; swy += wj * ys[j]; swxx += wj * xs[j] * xs[j]; swxy += wj * xs[j] * ys[j];
      }
      const den = sw * swxx - swx * swx;
      fitted[i] = Math.abs(den) < 1e-12 ? swy / (sw || 1) : ((swxx * swy - swx * swxy) + xs[i] * (sw * swxy - swx * swy)) / den;
    }
    if (it === iterations) break;
    const res = ys.map((y, i) => y - fitted[i]);
    const s = median(res.map(Math.abs)) || 1e-12;
    robust = res.map((r) => { const u = r / (6 * s); return Math.abs(u) < 1 ? (1 - u * u) ** 2 : 0; });
  }
  const res = ys.map((y, i) => y - fitted[i]);
  const scale = mad(res) / 0.6745 || 1e-9;
  const t = {}, resid = {};
  rows.forEach((r, i) => { resid[r.iso3] = r.y - fitted[i]; t[r.iso3] = (r.y - fitted[i]) / scale; });
  const predict = (x) => {
    if (x <= xs[0]) return fitted[0];
    if (x >= xs[n - 1]) return fitted[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    const span2 = xs[hi] - xs[lo];
    return span2 > 0 ? fitted[lo] + ((x - xs[lo]) / span2) * (fitted[hi] - fitted[lo]) : fitted[lo];
  };
  return { ok: true, method: 'lowess', n, span, scale, predict, t, resid };
}

/** Line and ±1 robust-scale band in the indicator's own units, on a grid of log incomes. */
export function lineAndBand(fit, rows, transform, points = 80) {
  if (!fit.ok || !rows.length) return [];
  const lo = rows[0].x, hi = rows[rows.length - 1].x;
  const out = [];
  for (let i = 0; i < points; i++) {
    const x = lo + ((hi - lo) * i) / (points - 1);
    const f = fit.predict(x);
    out.push({ x, income: Math.exp(x), y: backTransform(f, transform), lo: backTransform(f - fit.scale, transform), hi: backTransform(f + fit.scale, transform) });
  }
  return out;
}

/**
 * The verdict layer's own fit (income and structure) as a line against income: each economy's value net of its
 * structural terms (component-plus-residual), recentred so the cloud keeps its level. The vertical distance from the
 * line is then the engine's residual, and t is the engine's. ef: the fits.json summary merged with fits/<id>.json.
 */
export function structureFit(rows, ef) {
  if (!ef || !ef.ok || !ef.fitted || !ef.t || !ef.coefficients) return { ok: false, n: 0, reason: 'the verdict layer has no fit for this indicator' };
  const a = ef.coefficients.intercept, b = ef.coefficients.log_gdppc_ppp;
  if (!isNum(a) || !isNum(b)) return { ok: false, n: 0, reason: 'the verdict layer’s fit has no income term' };
  const kept = rows.filter((r) => isNum(ef.fitted[r.iso3]) && isNum(ef.t[r.iso3]));
  if (!kept.length) return { ok: false, n: 0, reason: 'no economy here is in the verdict layer’s fit' };
  const s = kept.map((r) => ef.fitted[r.iso3] - a - b * r.x), ms = s.reduce((x, y) => x + y, 0) / s.length;
  const t = Object.fromEntries(kept.map((r) => [r.iso3, ef.t[r.iso3]]));
  return {
    ok: true, method: 'structure', n: kept.length, scale: ef.scale, r2: ef.r2, controls: ef.controls || [],
    predict: (x) => a + ms + b * x, t, resid: t, rows: kept.map((r, i) => ({ ...r, y: r.y - s[i] + ms })),
  };
}

/** Rank (1 = highest value) of the target among itself plus peers with data; ties share a half rank. */
export function peerRank(values, target, peers) {
  const tv = values[target];
  if (!isNum(tv)) return null;
  const others = peers.filter((p) => p !== target && isNum(values[p]));
  const higher = others.filter((p) => values[p] > tv).length;
  const ties = others.filter((p) => values[p] === tv).length;
  return { rank: 1 + higher + ties / 2, of: others.length + 1, peersWithData: others.length, peersMissing: peers.filter((p) => p !== target && !isNum(values[p])) };
}

/** Percentile (0-100) of the target's residual among all residuals. */
export function residualPercentile(fit, target) {
  if (!fit.ok || !isNum(fit.resid[target])) return null;
  const all = Object.values(fit.resid);
  return (100 * all.filter((r) => r <= fit.resid[target]).length) / all.length;
}

// ---------- C2: peer comparison ----------

/** Median and interquartile range of the comparators' values (type-7 percentiles, as the engine). */
export function peerSummary(values, peers, target) {
  const vs = peers.filter((p) => p !== target && isNum(values[p])).map((p) => values[p]);
  if (!vs.length) return null;
  const med = percentile(vs, 50), q1 = percentile(vs, 25), q3 = percentile(vs, 75);
  const tv = values[target];
  const iqr = q3 - q1;
  return {
    n: vs.length, median: med, q1, q3, iqr,
    gap: isNum(tv) ? tv - med : null,
    gapIQR: isNum(tv) && iqr > 0 ? (tv - med) / iqr : null,
  };
}

// ---------- C3: over time ----------
/** Annual values for the listed economies between two years (inclusive): [{iso3, year, value}]. */
export function seriesRows(panel, isos, fromYear, toYear) {
  const out = [];
  if (!panel) return out;
  const set = new Set(isos);
  panel.years.forEach((y, i) => {
    if (y < fromYear || y > toYear) return;
    for (const iso3 of set) {
      const row = panel.v[iso3];
      if (row && isNum(row[i])) out.push({ iso3, year: y, value: row[i] });
    }
  });
  return out;
}

/** Share of years in the range with a value for this economy: below 0.5 the series is survey-like (sparse). */
export function coverage(rows, iso3, fromYear, toYear) {
  const n = rows.filter((r) => r.iso3 === iso3).length;
  return n / (toYear - fromYear + 1);
}

/** Convert levels to the change since each economy's first value in the range (same units). */
export function changeSinceStart(rows) {
  const first = {};
  for (const r of rows.slice().sort((a, b) => a.year - b.year)) if (!(r.iso3 in first)) first[r.iso3] = r.value;
  return rows.map((r) => ({ ...r, value: r.value - first[r.iso3] }));
}

/** Per-year comparator median and interquartile band, where at least `minPeers` comparators have data. */
export function peerBand(rows, peers, target, minPeers = 3) {
  const byYear = new Map();
  for (const r of rows) {
    if (r.iso3 === target || !peers.includes(r.iso3)) continue;
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year).push(r.value);
  }
  return [...byYear.entries()].filter(([, vs]) => vs.length >= minPeers)
    .map(([year, vs]) => ({ year, n: vs.length, median: percentile(vs, 50), q1: percentile(vs, 25), q3: percentile(vs, 75) }))
    .sort((a, b) => a.year - b.year);
}

/** Ordinary least-squares slope (units per year) of value on year; null with fewer than 3 points. */
export function slope(points) {
  const ps = points.filter((p) => isNum(p.year) && isNum(p.value));
  if (ps.length < 3) return null;
  const mx = ps.reduce((s, p) => s + p.year, 0) / ps.length, my = ps.reduce((s, p) => s + p.value, 0) / ps.length;
  let num = 0, den = 0;
  for (const p of ps) { num += (p.year - mx) * (p.value - my); den += (p.year - mx) ** 2; }
  return den > 0 ? num / den : null;
}

/** First and last value in the range for one series: {from, to, change, years: [first, last]}. */
export function endpoints(points) {
  const ps = points.filter((p) => isNum(p.value)).sort((a, b) => a.year - b.year);
  if (ps.length < 2) return null;
  const a = ps[0], b = ps[ps.length - 1];
  return { from: a.value, to: b.value, change: b.value - a.value, years: [a.year, b.year] };
}

// ---------- phase 2: node evidence (C9), firm obstacles (C7), growth record (C4) ----------

export const TEST_ORDER = ['price', 'changes', 'circumvention', 'camels'];

/**
 * C9 rows for one node (and its sub-nodes): the verdict layer's own numbers, so the strip shows what the
 * verdict used. x = t × direction, so right is always "more consistent with binding".
 * Returns {rows, missing, comove}: rows [{id, test, cls, t, x, rank, of, year, votes, family, node}],
 * missing [{id, test, cls, lastYear}] (no value in the window), comove = the engine's co-movement checks.
 */
export function stripRows(scorecard, nodeIds, set = 'structural') {
  const ids = new Set(nodeIds);
  const votes = new Map();
  for (const n of scorecard.nodes || []) {
    if (!ids.has(n.id)) continue;
    for (const f of n.families || []) for (const i of f.indicators || []) votes.set(i, votes.get(i) || !!f.votes);
  }
  const rows = [], missing = [];
  for (const ind of scorecard.indicators || []) {
    const node = (ind.nodes || []).find((x) => ids.has(x));
    if (!node || ind.test === 'context' || ind.class === 'X' || !ind.direction) continue;
    const t = ind.icr && isNum(ind.icr.t) ? ind.icr.t : null;
    if (!ind.available || t === null) {
      missing.push({ id: ind.id, test: ind.test, cls: ind.class, lastYear: ind.stale_year ?? null, node });
      continue;
    }
    const pg = ind.peer_gap && ind.peer_gap[set];
    rows.push({
      id: ind.id, test: ind.test, cls: ind.class, t, x: t * ind.direction, node,
      rank: pg && !pg.insufficient ? pg.rank_worst : null, of: pg && !pg.insufficient ? pg.n : null,
      year: ind.year_ref, votes: votes.get(ind.id) ?? false, family: ind.family,
    });
  }
  const order = (r) => TEST_ORDER.indexOf(r.test) === -1 ? 9 : TEST_ORDER.indexOf(r.test);
  const cls = (r) => 'ABCD'.indexOf(r.cls) === -1 ? 9 : 'ABCD'.indexOf(r.cls);
  rows.sort((a, b) => order(a) - order(b) || cls(a) - cls(b) || b.x - a.x);
  missing.sort((a, b) => order(a) - order(b) || cls(a) - cls(b));
  const comove = (scorecard.comovement || []).filter((c) => ids.has(c.node) || (c.also_nodes || []).some((x) => ids.has(x)));
  return { rows, missing, comove };
}

/**
 * Strip rows grouped as the verdict counts them: one row per evidence family (the node's family record gives its
 * signal and whether it votes). x is the mean of the members' binding-side distances; members keep each series.
 * The rank is shown only for one-series families, where it is unambiguous.
 */
export function familyRows(rows, scorecard, nodeIds) {
  const ids = new Set(nodeIds), rec = new Map();
  for (const n of scorecard.nodes || []) if (ids.has(n.id)) for (const f of n.families || []) rec.set(`${n.id}|${f.id}`, f);
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.node}|${r.family || r.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const out = [];
  for (const [key, members] of groups) {
    const f = rec.get(key) || {}, first = members[0];
    out.push({
      id: key, family: first.family || first.id, node: first.node, test: first.test, cls: f.class || first.cls,
      x: members.reduce((s, r) => s + r.x, 0) / members.length, t: members.reduce((s, r) => s + r.t, 0) / members.length,
      year: Math.max(...members.map((r) => r.year)), votes: f.votes ?? first.votes, signal: isNum(f.signal) ? f.signal : null,
      rank: members.length === 1 ? first.rank : null, of: members.length === 1 ? first.of : null, members,
    });
  }
  const order = (r) => TEST_ORDER.indexOf(r.test) === -1 ? 9 : TEST_ORDER.indexOf(r.test);
  const cls = (r) => 'ABCD'.indexOf(r.cls) === -1 ? 9 : 'ABCD'.indexOf(r.cls);
  return out.sort((a, b) => order(a) - order(b) || cls(a) - cls(b) || b.x - a.x);
}

/** The latest single observation at or before `asOf` and no older than `windowYears` (survey waves are not averaged). */
export function lastObs(panel, iso3, asOf, windowYears, before = Infinity) {
  const row = panel && panel.v[iso3];
  if (!row) return null;
  for (let i = panel.years.length - 1; i >= 0; i--) {
    const y = panel.years[i];
    if (y > asOf || y >= before) continue;
    if (asOf - y > windowYears) return null;
    if (isNum(row[i])) return { year: y, value: row[i] };
  }
  return null;
}

/**
 * C7 rows: per obstacle, the economy's latest wave, its previous wave, and the comparators' median of their latest waves.
 * panels: [{id, panel}]. Sorted by the latest share, largest first; obstacles with no latest wave are dropped.
 */
export function obstacleRows(panels, iso3, peers, asOf, windowYears) {
  const out = [];
  for (const { id, panel } of panels) {
    const latest = lastObs(panel, iso3, asOf, windowYears);
    if (!latest) continue;
    const prev = lastObs(panel, iso3, asOf, 3 * windowYears, latest.year);
    const pv = peers.filter((p) => p !== iso3).map((p) => lastObs(panel, p, asOf, windowYears)).filter(Boolean).map((o) => o.value);
    out.push({ id, latest, prev, peerMedian: pv.length >= 3 ? median(pv) : null, peersWithData: pv.length });
  }
  return out.sort((a, b) => b.latest.value - a.latest.value);
}

/** C4: a series indexed to 100 at `base` (or its first year after `base` with data); [{year, value}] for one economy. */
export function indexSeries(panel, iso3, base, toYear) {
  const row = panel && panel.v[iso3];
  if (!row) return [];
  const pts = panel.years.map((y, i) => ({ year: y, v: row[i] })).filter((p) => p.year >= base && p.year <= toYear && isNum(p.v) && p.v > 0);
  if (!pts.length) return [];
  const b = pts[0].v;
  return pts.map((p) => ({ year: p.year, value: (100 * p.v) / b, base: pts[0].year }));
}

// ---------- phase 4: the tests and the summary (C5, C6, C8, C10, C11) ----------

/** The economy's values as {year: value}, or {} (no row). */
const yearMap = (panel, iso3) => byYearOf(panel, iso3) || {};

/**
 * C6: year-on-year changes paired as the engine's co-movement test pairs them: Δy in year t with Δx in year
 * t − lag, over first..last. A pair agrees when sign(Δy) = expectedSign × sign(Δx); pairs where either change
 * is zero are kept for the chart but neither agree nor count (as the engine drops them).
 * Returns {rows: [{year, dy, dx, xYear, agree}], agree, n}; agree is null on a zero pair.
 */
export function comovePairs(xPanel, yPanel, iso3, { first, last, lag = 1, expectedSign = -1 }) {
  const x = yearMap(xPanel, iso3), y = yearMap(yPanel, iso3);
  const d = (s, t) => (isNum(s[t]) && isNum(s[t - 1]) ? s[t] - s[t - 1] : null);
  const rows = [];
  for (let t = first; t <= last; t++) {
    const dy = d(y, t), dx = d(x, t - lag);
    if (!isNum(dy) || !isNum(dx)) continue;
    rows.push({ year: t, dy, dx, xYear: t - lag, agree: dy === 0 || dx === 0 ? null : Math.sign(dy) === expectedSign * Math.sign(dx) });
  }
  const scored = rows.filter((r) => r.agree !== null);
  return { rows, agree: scored.filter((r) => r.agree).length, n: scored.length };
}

/** C5 cross-country: every economy with a reference value for both the price and the quantity: [{iso3, p, q, pYear, qYear}]. */
export function priceQtyRows(pPanel, qPanel, asOf, wP, wQ) {
  const P = referenceTable(pPanel, asOf, wP), Q = referenceTable(qPanel, asOf, wQ);
  return Object.keys(P).filter((k) => Q[k]).map((k) => ({ iso3: k, p: P[k].value, q: Q[k].value, pYear: P[k].year, qYear: Q[k].year }));
}

/**
 * C5 over time: the economy's own path, one point per year with both a price and a quantity: [{year, p, q}].
 * With k > 1 each point is the mean of the years y-k+1..y that have a value (at least two of them, and year y
 * itself), which steadies a noisy annual series as the engine's three-year reference value does.
 */
export function pricePath(pPanel, qPanel, iso3, from, to, k = 1) {
  const p = yearMap(pPanel, iso3), q = yearMap(qPanel, iso3);
  const mean = (s, y) => {
    if (!isNum(s[y])) return null;
    if (k <= 1) return s[y];
    const v = [];
    for (let t = y - k + 1; t <= y; t++) if (isNum(s[t])) v.push(s[t]);
    return v.length >= 2 ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const out = [];
  for (let y = from; y <= to; y++) { const a = mean(p, y), b = mean(q, y); if (isNum(a) && isNum(b)) out.push({ year: y, p: a, q: b }); }
  return out;
}

/**
 * C5 quadrant from the price and quantity distances (sd) from what income predicts. Within ±band of the line a
 * side is "as predicted". Returns {price, qty} each 'high' | 'low' | 'as predicted', or null without both.
 */
export function quadrant(tp, tq, band = 0.25) {
  if (!isNum(tp) || !isNum(tq)) return null;
  const side = (t) => (t > band ? 'high' : t < -band ? 'low' : 'as predicted');
  return { price: side(tp), qty: side(tq) };
}

/** C8: one indicator's reference values for the economy and its comparators, with the comparator median and the economy's rank. */
export function peerBars(panel, iso3, peers, asOf, windowYears) {
  const refs = referenceTable(panel, asOf, windowYears);
  const who = [iso3, ...peers.filter((p) => p !== iso3)];
  const rows = who.filter((k) => refs[k]).map((k) => ({ iso3: k, value: refs[k].value, year: refs[k].year }));
  const values = Object.fromEntries(rows.map((r) => [r.iso3, r.value]));
  return { rows, summary: peerSummary(values, peers, iso3), rank: peerRank(values, iso3, peers) };
}

/**
 * C10 row for a node and its sub-nodes: benchmarking is the median binding-side distance (sd from what income
 * and structure predict) of the indicators with a value, as in C9; the four test scores are the verdict layer's.
 * Returns {bench, nBench, toward, away, tests: {price, changes, circumvention, camels} (T or null), tier}.
 */
export function heatRow(scorecard, nodeIds, set = 'structural') {
  const { rows } = stripRows(scorecard, nodeIds, set);
  const xs = rows.map((r) => r.x);
  const node = (scorecard.nodes || []).find((n) => n.id === nodeIds[0]);
  const tests = {};
  for (const k of TEST_ORDER) { const t = node && node.tests ? node.tests[k] : null; tests[k] = t && isNum(t.T) && !t.not_observed ? t.T : null; }
  return {
    bench: xs.length ? median(xs) : null, nBench: xs.length,
    toward: xs.filter((x) => x >= 0.75).length, away: xs.filter((x) => x <= -0.75).length,
    tests, tier: node ? node.tier : null,
  };
}

/** C11: the economy's export shares by product group in one year (or its latest), largest first: {year, rows: [{id, name, share, prev}]}. */
export function exportShares(exports, year = null, back = 10) {
  if (!exports || !exports.years.length) return null;
  const yrs = exports.years;
  let i = yrs.length - 1;
  if (year != null) while (i >= 0 && yrs[i] > year) i--;
  if (i < 0) return null;
  const j = yrs.indexOf(yrs[i] - back);
  const rows = exports.groups.map((g) => ({ id: g.id, name: g.name, share: g.share[i] ?? 0, prev: j >= 0 ? g.share[j] ?? 0 : null }));
  return { year: yrs[i], prevYear: j >= 0 ? yrs[j] : null, total: exports.total_usd[i], rows: rows.sort((a, b) => b.share - a.share) };
}

// ---------- year player (C1 bubbles, C2 bar race) ----------

/**
 * One C1 frame per as-of year: the scatter (each row with the economy's population for bubble size), the
 * income-only fit and its line. fitter(rows) is linearFit or lowessFit with the page's options.
 * Returns [{year, rows: [{iso3, x, income, raw, y, year, pop}], fit, line}].
 */
export function playerFrames(indPanel, incomePanel, popPanel, { years, windowYears, transform, fitter, popWindow = 10 }) {
  return years.map((year) => {
    const rows = scatterRows(indPanel, incomePanel, { asOfYear: year, windowYears, transform });
    const pop = referenceTable(popPanel, year, popWindow);
    const fit = rows.length ? fitter(rows) : { ok: false, n: 0, reason: 'no economies with data' };
    return { year, rows: rows.map((r) => ({ ...r, pop: pop[r.iso3] ? pop[r.iso3].value : null })), fit, line: lineAndBand(fit, rows, transform) };
  });
}

/**
 * Fixed axes for a playback: x spans every income in every frame; y spans the pooled 2.5th to 97.5th
 * percentiles of all values, widened to keep the named economies (target and comparators) and the lines in
 * view, padded as chart 1 pads. Also the largest population, for the bubble scale. {x, y, popMax}.
 */
export function playerDomains(frames, keep, transform) {
  const keepSet = new Set(keep);
  const incomes = [], vals = [], must = [], pops = [];
  for (const f of frames) {
    for (const r of f.rows) {
      incomes.push(r.income);
      if (transform !== 'log' || r.raw > 0) vals.push(r.raw);
      if (keepSet.has(r.iso3)) must.push(r.raw);
      if (isNum(r.pop)) pops.push(r.pop);
    }
    for (const p of f.line) if (isNum(p.y)) must.push(p.y);
  }
  if (!vals.length) return null;
  let lo = percentile(vals, 2.5), hi = percentile(vals, 97.5);
  for (const v of must) { if (transform === 'log' && !(v > 0)) continue; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  let y;
  if (transform === 'log') y = [lo / 1.15, hi * 1.15];
  else {
    const pad = (hi - lo) * 0.06 || 1;
    y = [transform === 'log1p' || transform === 'logit' ? Math.max(0, lo - pad) : lo - pad, hi + pad];
  }
  return { x: [Math.min(...incomes), Math.max(...incomes)], y, popMax: pops.length ? Math.max(...pops) : null };
}

/** One C2 frame per as-of year: the reference value of each listed economy that has one. [{year, rows: [{iso3, value, year}]}]. */
export function raceFrames(panel, members, { years, windowYears }) {
  return years.map((year) => {
    const refs = referenceTable(panel, year, windowYears);
    return { year, rows: members.filter((k) => refs[k]).map((k) => ({ iso3: k, value: refs[k].value, year: refs[k].year })) };
  });
}

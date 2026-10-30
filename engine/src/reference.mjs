// reference.mjs — series index, derived indicators, and reference values.
// Pure ES module: no Node built-ins.
//
// Snapshot year  = the year in meta.snapshot_id (e.g. "2026-10-24" → 2026).
// Window         = params.snapshot_reference_window_years (W). A year y is inside
//                  the window when snapshot_year − y ≤ W and y ≤ snapshot_year.
// year_ref       = most recent in-window year with a non-null observation.
// value_ref      = mean of the non-null observations in the three years ending at
//                  year_ref (year_ref − 2 .. year_ref), over whichever are present.
// stale_value    = newest observation outside the window when nothing is inside it.
import { isNum, mean, sd } from './stats.mjs';

/** Year of the snapshot from meta.snapshot_id ("YYYY-MM-DD" or anything starting with a year). */
export function snapshotYearOf(meta) {
  const m = /(\d{4})/.exec(String(meta && meta.snapshot_id));
  if (!m) throw new Error(`cannot read a year from snapshot_id: ${meta && meta.snapshot_id}`);
  return Number(m[1]);
}

/**
 * Build series[indicator_id][iso3][year] = value from observation rows
 * ({indicator_id, iso3, year, value}; year and value may be strings).
 */
export function buildSeries(observations) {
  const series = {};
  for (const o of observations) {
    const v = typeof o.value === 'number' ? o.value : Number(o.value);
    if (!Number.isFinite(v)) continue;
    const y = typeof o.year === 'number' ? o.year : Number(o.year);
    if (!Number.isInteger(y)) continue;
    const ind = series[o.indicator_id] || (series[o.indicator_id] = {});
    const c = ind[o.iso3] || (ind[o.iso3] = {});
    c[y] = v;
  }
  return series;
}

/** Sorted numeric years of a {year: value} map. */
export function yearsOf(byYear) {
  if (!byYear) return [];
  return Object.keys(byYear)
    .map(Number)
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
}

/** [[year, value], ...] sorted by year, for Desk charts. */
export function seriesPairs(series, indicatorId, iso3) {
  const byYear = series[indicatorId] && series[indicatorId][iso3];
  return yearsOf(byYear).map((y) => [y, byYear[y]]);
}

function unionIso3(series, ids) {
  const set = new Set();
  for (const id of ids) for (const iso3 of Object.keys(series[id] || {})) set.add(iso3);
  return [...set].sort();
}

/** Year-by-year combination of component series; fn returns null for undefined years. */
function combineYearly(series, ids, fn) {
  const out = {};
  for (const iso3 of unionIso3(series, ids)) {
    const comps = ids.map((id) => (series[id] && series[id][iso3]) || null);
    if (comps.some((c) => !c)) continue;
    const years = yearsOf(comps[0]).filter((y) => comps.every((c) => isNum(c[y])));
    const res = {};
    for (const y of years) {
      const v = fn(...comps.map((c) => c[y]));
      if (isNum(v)) res[y] = v;
    }
    if (Object.keys(res).length) out[iso3] = res;
  }
  return out;
}

/** Rolling statistic over the trailing `width` years (all must be present). */
function rolling(series, id, width, fn) {
  const out = {};
  for (const [iso3, byYear] of Object.entries(series[id] || {})) {
    const res = {};
    for (const y of yearsOf(byYear)) {
      const vals = [];
      for (let k = width - 1; k >= 0; k--) {
        const v = byYear[y - k];
        if (!isNum(v)) break;
        vals.push(v);
      }
      if (vals.length < width) continue;
      const v = fn(vals);
      if (isNum(v)) res[y] = v;
    }
    if (Object.keys(res).length) out[iso3] = res;
  }
  return out;
}

export const DERIVED_IDS = [
  'DERIV.REAL_DEPOSIT',
  'DERIV.REAL_LENDING_CPI',
  'DERIV.CROWDING_OUT',
  'DERIV.CREDIT_GROWTH',
  'DERIV.NET_CASHFLOW_BANKS',
  'DERIV.EDU_UNEMP_RATIO',
  'DERIV.INFLATION_VOL',
  'STATIC.LANDLOCKED',
];

/** Fisher real rate in percent: 100 × ((1 + i/100) / (1 + π/100) − 1); null when 1 + π/100 ≤ 0. */
export function fisherReal(i, pi) {
  if (!isNum(i) || !isNum(pi)) return null;
  const d = 1 + pi / 100;
  if (!(d > 0)) return null;
  return 100 * ((1 + i / 100) / d - 1);
}

/**
 * Add the derived and static indicators to a series index (returns a new object).
 *   DERIV.REAL_DEPOSIT       = fisher(FR.INR.DPST, FP.CPI.TOTL.ZG) = 100·((1 + i/100)/(1 + π/100) − 1)
 *                              (v0.1.2: the Fisher real rate, as WDI's FR.INR.RINR; the simple
 *                              difference i − π of v0.1 overstates the negative real rate at high inflation)
 *   DERIV.REAL_LENDING_CPI   = fisher(FR.INR.LEND, FP.CPI.TOTL.ZG)    (v0.1.1; same family as FR.INR.RINR,
 *                              a strict fallback for it since v0.1.2: scorecard.mjs gives it no signal
 *                              where FR.INR.RINR is available)
 *   DERIV.CROWDING_OUT       = FS.AST.CGOV.GD.ZS / FS.AST.DOMS.GD.ZS   (null if denominator ≤ 0)
 *   DERIV.CREDIT_GROWTH      = 100 × mean of the three most recent annual log changes of
 *                              real private credit = FS.AST.PRVT.GD.ZS × NY.GDP.PCAP.KD × SP.POP.TOTL
 *                              (needs four consecutive years of positive real credit)
 *   DERIV.NET_CASHFLOW_BANKS = DERIV.CREDIT_GROWTH − FR.INR.RINR
 *   DERIV.EDU_UNEMP_RATIO    = SL.UEM.ADVN.ZS / SL.UEM.TOTL.ZS           (null if denominator ≤ 0)
 *   DERIV.INFLATION_VOL      = sample sd of FP.CPI.TOTL.ZG over the trailing five years (all present)
 *   STATIC.LANDLOCKED        = countries.json landlocked flag, dated at the snapshot year
 * Other registry indicators with source "derived" (e.g. DERIV.INVESTMENT_GAP_PRIVATE) are left
 * unavailable; the caller receives their ids in `unimplemented`.
 */
export function computeDerived(series, registry, countries, snapshotYear) {
  const out = { ...series };
  out['DERIV.REAL_DEPOSIT'] = combineYearly(out, ['FR.INR.DPST', 'FP.CPI.TOTL.ZG'], (d, i) => fisherReal(d, i));
  out['DERIV.REAL_LENDING_CPI'] = combineYearly(out, ['FR.INR.LEND', 'FP.CPI.TOTL.ZG'], (l, i) => fisherReal(l, i));
  out['DERIV.CROWDING_OUT'] = combineYearly(out, ['FS.AST.CGOV.GD.ZS', 'FS.AST.DOMS.GD.ZS'], (c, t) =>
    t > 0 ? c / t : null,
  );
  const realCredit = combineYearly(out, ['FS.AST.PRVT.GD.ZS', 'NY.GDP.PCAP.KD', 'SP.POP.TOTL'], (p, g, n) =>
    p > 0 && g > 0 && n > 0 ? p * g * n : null,
  );
  const dlog = {};
  for (const [iso3, byYear] of Object.entries(realCredit)) {
    const res = {};
    for (const y of yearsOf(byYear)) if (isNum(byYear[y - 1])) res[y] = Math.log(byYear[y]) - Math.log(byYear[y - 1]);
    if (Object.keys(res).length) dlog[iso3] = res;
  }
  out['DERIV.CREDIT_GROWTH'] = rolling({ dlog }, 'dlog', 3, (vals) => 100 * mean(vals));
  out['DERIV.NET_CASHFLOW_BANKS'] = combineYearly(out, ['DERIV.CREDIT_GROWTH', 'FR.INR.RINR'], (g, r) => g - r);
  out['DERIV.EDU_UNEMP_RATIO'] = combineYearly(out, ['SL.UEM.ADVN.ZS', 'SL.UEM.TOTL.ZS'], (a, t) => (t > 0 ? a / t : null));
  out['DERIV.INFLATION_VOL'] = rolling(out, 'FP.CPI.TOTL.ZG', 5, (vals) => sd(vals));
  const landlocked = {};
  for (const c of countries) landlocked[c.iso3] = { [snapshotYear]: c.landlocked ? 1 : 0 };
  out['STATIC.LANDLOCKED'] = landlocked;
  const unimplemented = (registry.indicators || [])
    .filter((ind) => (ind.source === 'derived' || ind.source === 'static') && !DERIVED_IDS.includes(ind.id))
    .map((ind) => ind.id);
  return { series: out, unimplemented };
}

/** Reference value for one economy and indicator; null when there is no observation at all. */
export function referenceFor(byYear, snapshotYear, windowYears) {
  const years = yearsOf(byYear).filter((y) => y <= snapshotYear);
  if (!years.length) return null;
  const inWin = years.filter((y) => snapshotYear - y <= windowYears);
  if (!inWin.length) {
    const sy = years[years.length - 1];
    return {
      available: false,
      value: null,
      year: null,
      value_ref: null,
      year_ref: null,
      n_ref: 0,
      stale_value: byYear[sy],
      stale_year: sy,
    };
  }
  const yr = inWin[inWin.length - 1];
  const vals = [yr, yr - 1, yr - 2].map((y) => byYear[y]).filter(isNum);
  return {
    available: true,
    value: byYear[yr],
    year: yr,
    value_ref: mean(vals),
    year_ref: yr,
    n_ref: vals.length,
    stale_value: null,
    stale_year: null,
  };
}

/** refs[indicator_id][iso3] = referenceFor(...) for every economy in the universe with any observation. */
export function buildReferenceTable(series, universe, snapshotYear, windowYears, windowById = {}) {
  // v0.1.3: an indicator may carry its own reference_window_years (registry), for slow-moving
  // prices published rarely (returns to schooling). Its age still drives the recency weight.
  const refs = {};
  const uni = new Set(universe);
  for (const [id, byIso] of Object.entries(series)) {
    const table = {};
    const w = Number.isFinite(windowById[id]) ? windowById[id] : windowYears;
    for (const [iso3, byYear] of Object.entries(byIso)) {
      if (!uni.has(iso3)) continue;
      const r = referenceFor(byYear, snapshotYear, w);
      if (r) table[iso3] = r;
    }
    refs[id] = table;
  }
  return refs;
}

/** Desk matrix: {snapshot_year, indicators: {id: {iso3: [value_ref, year_ref]}}} (available values only). */
export function buildMatrix(refs, snapshotYear, indicatorIds = null) {
  const ids = indicatorIds || Object.keys(refs).sort();
  const indicators = {};
  for (const id of ids) {
    const table = refs[id];
    if (!table) continue;
    const row = {};
    for (const iso3 of Object.keys(table).sort()) {
      const r = table[iso3];
      if (r.available) row[iso3] = [r.value_ref, r.year_ref];
    }
    indicators[id] = row;
  }
  return { snapshot_year: snapshotYear, indicators };
}

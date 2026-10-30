// icr.mjs — income-conditional residuals (global and within-region variants).
// Pure ES module: no Node built-ins.
//
// For an indicator with reference values across economies:
//   y_i = a + b·log_gdppc_ppp_i + c·log_population_i + d·resource_rents_i + e·landlocked_i + u_i
// fitted by Huber IRLS (stats.huberIRLS) on the transformed, winsorized cross-section.
// Reported per economy: residual u_i, t_i = u_i / s_final (s_final = MAD(u)/0.6745),
// percentile = 100 × share of fitted economies with residual ≤ u_i.
// Within-region variant: region dummies for regions with ≥ 5 economies in the fit,
// the largest such region being the reference category; reported as t_region.
import { huberIRLS, isNum } from './stats.mjs';
import { transformValue, winsorize } from './transforms.mjs';
import { hasAllFeatures } from './comparators.mjs';

/** Indicators that are ICR controls and therefore never get an ICR themselves. */
export const CONTROL_INDICATORS = new Set(['NY.GDP.PCAP.PP.KD', 'SP.POP.TOTL', 'NY.GDP.TOTL.RT.ZS', 'STATIC.LANDLOCKED']);

export const MIN_REGION_SIZE_FOR_DUMMY = 5;

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Upper-bound binary search: number of sorted values ≤ x. */
function countLE(sorted, x) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Fit one ICR. refTable is refs[indicator_id] ({iso3: reference record}); features from
 * comparators.buildFeatures. variant is 'global' or 'region'.
 * Returns {ok, n, r2, scale, iterations, converged, coefficients, winsor, dropped_columns,
 *          region_dummies, reference_region, per: {iso3: {y, fitted, residual, t, percentile}}}
 * or {ok: false, n, reason} when the fit cannot be made.
 */
export function fitICR({ transform, refTable, features, params, variant = 'global', extraControls = [] }) {
  const icr = params.icr;
  // v0.1.5: an indicator may add controls (registry icr_extra_controls, e.g. log_remoteness).
  const controls = [...icr.controls, ...(extraControls || []).filter((c) => !icr.controls.includes(c))];
  const rows = [];
  for (const iso3 of Object.keys(refTable || {}).sort()) {
    const r = refTable[iso3];
    if (!r || !r.available) continue;
    const y = transformValue(r.value_ref, transform);
    if (!isNum(y)) continue;
    const f = features[iso3];
    if (!hasAllFeatures(f) || !controls.every((c) => isNum(f[c]))) continue;
    rows.push({ iso3, y, f });
  }
  if (rows.length < icr.min_countries) return { ok: false, n: rows.length, reason: 'too_few_countries' };

  const w = winsorize(
    rows.map((r) => r.y),
    icr.winsorize_percentiles,
  );
  const columns = ['intercept', ...controls];
  const X = rows.map((r) => [1, ...controls.map((c) => r.f[c])]);
  let regionDummies = [];
  let referenceRegion = null;
  if (variant === 'region') {
    const counts = {};
    for (const r of rows) {
      const rg = r.f.region || '(none)';
      counts[rg] = (counts[rg] || 0) + 1;
    }
    const eligible = Object.keys(counts)
      .filter((rg) => counts[rg] >= MIN_REGION_SIZE_FOR_DUMMY)
      .sort((a, b) => counts[b] - counts[a] || cmp(a, b));
    referenceRegion = eligible.length ? eligible[0] : null;
    regionDummies = eligible.slice(1);
    for (const rg of regionDummies) {
      columns.push(`region:${rg}`);
      rows.forEach((r, i) => X[i].push((r.f.region || '(none)') === rg ? 1 : 0));
    }
  }
  // Drop constant non-intercept columns (e.g. no landlocked economy in the sample).
  const dropped = [];
  for (let c = columns.length - 1; c >= 1; c--) {
    const v0 = X[0][c];
    if (X.every((row) => row[c] === v0)) {
      dropped.push(columns[c]);
      columns.splice(c, 1);
      for (const row of X) row.splice(c, 1);
    }
  }
  const fit = huberIRLS(X, w.values, { k: icr.huber_k, maxIterations: icr.max_iterations, tol: 1e-8 });
  if (!fit) return { ok: false, n: rows.length, reason: 'singular_design' };
  if (fit.degenerate) {
    // Every residual is (nearly) identical: the cross-section carries no information about
    // deviations from expectation, so no t can be formed (see stats.huberIRLS).
    return { ok: false, n: rows.length, reason: 'degenerate_scale', scale_method: fit.scale_method };
  }
  const coefficients = {};
  columns.forEach((c, i) => {
    coefficients[c] = fit.beta[i];
  });
  for (const c of dropped) coefficients[c] = null;
  const sorted = fit.residuals.slice().sort((a, b) => a - b);
  const per = {};
  rows.forEach((r, i) => {
    const u = fit.residuals[i];
    per[r.iso3] = {
      y: w.values[i],
      fitted: w.values[i] - u,
      residual: u,
      t: u / fit.scale,
      percentile: (100 * countLE(sorted, u)) / sorted.length,
    };
  });
  return {
    ok: true,
    variant,
    n: rows.length,
    r2: fit.r2,
    scale: fit.scale,
    scale_method: fit.scale_method,
    iterations: fit.iterations,
    converged: fit.converged,
    coefficients,
    winsor: { lo: w.lo, hi: w.hi },
    dropped_columns: dropped.sort(),
    region_dummies: regionDummies,
    reference_region: referenceRegion,
    per,
  };
}

/**
 * Fit the global (and, if params.icr.within_region_variant, the within-region) ICR for
 * every registry indicator that is not a control. Returns {indicator_id: {global, region}}.
 */
export function fitAllICRs(registry, refs, features, params) {
  const fits = {};
  for (const ind of registry.indicators) {
    if (CONTROL_INDICATORS.has(ind.id)) continue;
    const table = refs[ind.id];
    if (!table || !Object.keys(table).length) {
      fits[ind.id] = { global: { ok: false, n: 0, reason: 'no_data' }, region: null };
      continue;
    }
    const args = { transform: ind.transform, refTable: table, features, params, extraControls: ind.icr_extra_controls || [] };
    fits[ind.id] = {
      global: fitICR({ ...args, variant: 'global' }),
      region: params.icr.within_region_variant ? fitICR({ ...args, variant: 'region' }) : null,
    };
  }
  return fits;
}

/** The ICR block for one economy and indicator, in the Scorecard shape; null if not fitted. */
export function icrFor(fits, indicatorId, iso3) {
  const f = fits[indicatorId];
  if (!f || !f.global || !f.global.ok) return null;
  const g = f.global.per[iso3];
  if (!g) return null;
  const rg = f.region && f.region.ok ? f.region.per[iso3] : null;
  return {
    residual: g.residual,
    t: g.t,
    percentile: g.percentile,
    n: f.global.n,
    r2: f.global.r2,
    t_region: rg ? rg.t : null,
    scale_method: f.global.scale_method || 'mad',
  };
}

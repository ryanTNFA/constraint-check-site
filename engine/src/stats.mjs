// stats.mjs — numerical primitives for the Constraint Check engine.
// Pure ES module: no Node built-ins, plain numbers in, plain numbers out.
// Every function treats null/undefined/NaN inputs as "missing" and drops them.

export function isNum(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

export function clean(xs) {
  const out = [];
  for (const x of xs) if (isNum(x)) out.push(x);
  return out;
}

export function sign(x) {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

export function sum(xs) {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export function mean(xs) {
  const c = clean(xs);
  if (c.length === 0) return null;
  return sum(c) / c.length;
}

/** Median; the average of the two middle values for an even count. */
export function median(xs) {
  const c = clean(xs).sort((a, b) => a - b);
  const n = c.length;
  if (n === 0) return null;
  const mid = n >> 1;
  return n % 2 === 1 ? c[mid] : (c[mid - 1] + c[mid]) / 2;
}

/** Median absolute deviation from the median (unscaled). */
export function mad(xs) {
  const c = clean(xs);
  if (c.length === 0) return null;
  const m = median(c);
  return median(c.map((x) => Math.abs(x - m)));
}

/** Sample standard deviation (n − 1 denominator); null when fewer than two values. */
export function sd(xs) {
  const c = clean(xs);
  const n = c.length;
  if (n < 2) return null;
  const m = sum(c) / n;
  let ss = 0;
  for (const x of c) ss += (x - m) * (x - m);
  return Math.sqrt(ss / (n - 1));
}

/**
 * Percentile with linear interpolation between order statistics
 * (the "type 7" definition used by R and numpy by default). p is in [0, 100].
 */
export function percentile(xs, p) {
  const c = clean(xs).sort((a, b) => a - b);
  const n = c.length;
  if (n === 0) return null;
  if (n === 1) return c[0];
  const h = ((n - 1) * p) / 100;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  if (lo === hi) return c[lo];
  return c[lo] + (h - lo) * (c[hi] - c[lo]);
}

/** Share of values ≤ x, times 100. */
export function percentileRank(xs, x) {
  const c = clean(xs);
  if (c.length === 0 || !isNum(x)) return null;
  let k = 0;
  for (const v of c) if (v <= x) k++;
  return (100 * k) / c.length;
}

export function weightedMean(values, weights) {
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const w = weights[i];
    if (!isNum(v) || !isNum(w) || w <= 0) continue;
    num += w * v;
    den += w;
  }
  return den > 0 ? num / den : null;
}

export function round(x, digits = 6) {
  if (!isNum(x)) return x === undefined ? null : x;
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

// ---------------------------------------------------------------------------
// Seeded randomness. Deterministic across Node and browsers.
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash of a string, returned as an unsigned integer. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: a small, fast 32-bit seeded generator returning uniforms in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, n) from a uniform generator. */
export function randInt(rng, n) {
  return Math.min(n - 1, Math.floor(rng() * n));
}

/** Fisher–Yates shuffle (copy) with a seeded generator. */
export function shuffle(xs, rng) {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

// ---------------------------------------------------------------------------
// Linear algebra: small dense systems.
// ---------------------------------------------------------------------------

/**
 * Solve A x = b by Gaussian elimination with partial pivoting.
 * A is an array of rows (k × k), b an array of length k. Returns null when the
 * system is singular (a pivot smaller than 1e-12 relative to the largest entry).
 */
export function solveLinear(A, b) {
  const k = b.length;
  const M = A.map((row, i) => row.slice().concat([b[i]]));
  let scale = 0;
  for (const row of A) for (const v of row) scale = Math.max(scale, Math.abs(v));
  const eps = 1e-12 * (scale || 1);
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) <= eps) return null;
    if (piv !== col) {
      const t = M[piv];
      M[piv] = M[col];
      M[col] = t;
    }
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let c = col; c <= k; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array(k);
  for (let i = 0; i < k; i++) x[i] = M[i][k] / M[i][i];
  return x;
}

/**
 * (Weighted) ordinary least squares via the normal equations.
 * X: array of rows (n × k), y: length n, w: optional weights (length n, ≥ 0).
 * Returns {beta, fitted, residuals, r2, n, k} or null when X'WX is singular.
 * r2 is the weighted R²: 1 − Σw·r² / Σw·(y − ȳ_w)².
 */
export function ols(X, y, w = null) {
  const n = y.length;
  if (n === 0) return null;
  const k = X[0].length;
  const XtWX = Array.from({ length: k }, () => new Array(k).fill(0));
  const XtWy = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    const wi = w ? w[i] : 1;
    if (wi === 0) continue;
    const xi = X[i];
    for (let a = 0; a < k; a++) {
      const xa = xi[a] * wi;
      XtWy[a] += xa * y[i];
      for (let b = a; b < k; b++) XtWX[a][b] += xa * xi[b];
    }
  }
  for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) XtWX[a][b] = XtWX[b][a];
  const beta = solveLinear(XtWX, XtWy);
  if (!beta) return null;
  const fitted = new Array(n);
  const residuals = new Array(n);
  let sw = 0;
  let swy = 0;
  for (let i = 0; i < n; i++) {
    let f = 0;
    for (let a = 0; a < k; a++) f += X[i][a] * beta[a];
    fitted[i] = f;
    residuals[i] = y[i] - f;
    const wi = w ? w[i] : 1;
    sw += wi;
    swy += wi * y[i];
  }
  const ybar = sw > 0 ? swy / sw : 0;
  let sse = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    const wi = w ? w[i] : 1;
    sse += wi * residuals[i] * residuals[i];
    sst += wi * (y[i] - ybar) * (y[i] - ybar);
  }
  const r2 = sst > 0 ? 1 - sse / sst : null;
  return { beta, fitted, residuals, r2, n, k };
}

/** Normal-consistent mean absolute deviation about the median: mean|r − median(r)| / 0.7979. */
export function meanAbsDev(xs) {
  const c = clean(xs);
  if (c.length === 0) return null;
  const m = median(c);
  return mean(c.map((x) => Math.abs(x - m))) / 0.7979;
}

/**
 * Huber M-estimation by iteratively reweighted least squares.
 *   start from OLS; repeat up to maxIterations:
 *     r = y − Xβ;  s = MAD(r) / 0.6745 (floored at scaleFloor);
 *     w_i = min(1, k·s / |r_i|)  (w_i = 1 when r_i = 0);
 *     β ← weighted OLS;  stop when max|Δβ| < tol.
 * Returns {beta, residuals, scale, scale_method, degenerate, weights, iterations, converged, r2, n} or null.
 * `scale` is the robust scale of the final residuals, used for t = u / scale.
 *
 * Scale collapse. When more than half of the residuals are identical (a zero-inflated
 * cross-section, for example an Enterprise Survey loss share that is exactly 0 for most
 * economies), MAD(r) is 0 and the spec's floor would make t = u / 1e-9 explode to the
 * billions while the IRLS weights collapse the fit onto the point mass. If MAD falls to
 * the floor at any iteration, the whole fit is rerun from the OLS start with the
 * normal-consistent mean absolute deviation about the median as the scale estimator
 * (`scale_method: "mean_abs_dev"`). If that is also at the floor the residuals are all
 * (nearly) identical and the fit is reported with `degenerate: true`; callers should treat
 * such a fit as uninformative. `scale_method` is "mad" for the ordinary case.
 */
export function huberIRLS(X, y, { k = 1.345, maxIterations = 50, tol = 1e-8, scaleFloor = 1e-9 } = {}) {
  const n = y.length;
  const start = ols(X, y);
  if (!start) return null;
  const residualsOf = (b) => {
    const r = new Array(n);
    for (let i = 0; i < n; i++) {
      let f = 0;
      for (let a = 0; a < b.length; a++) f += X[i][a] * b[a];
      r[i] = y[i] - f;
    }
    return r;
  };
  const estimators = {
    mad: (r) => mad(r) / 0.6745,
    mean_abs_dev: (r) => meanAbsDev(r),
  };
  const weightsOf = (r, s) => r.map((ri) => (Math.abs(ri) <= k * s ? 1 : (k * s) / Math.abs(ri)));
  const run = (method) => {
    const est = estimators[method];
    let fit = start;
    let beta = start.beta;
    let converged = false;
    let iterations = 0;
    let collapsed = false;
    let weights = new Array(n).fill(1);
    const scaleOf = (r) => {
      const s = est(r);
      if (!(s > scaleFloor)) collapsed = true;
      return Math.max(isNum(s) ? s : 0, scaleFloor);
    };
    for (let it = 1; it <= maxIterations; it++) {
      iterations = it;
      const r = residualsOf(beta);
      const s = scaleOf(r);
      if (collapsed) break;
      weights = weightsOf(r, s);
      const wfit = ols(X, y, weights);
      if (!wfit) break;
      let delta = 0;
      for (let a = 0; a < beta.length; a++) delta = Math.max(delta, Math.abs(wfit.beta[a] - beta[a]));
      beta = wfit.beta;
      fit = wfit;
      if (delta < tol) {
        converged = true;
        break;
      }
    }
    const residuals = residualsOf(beta);
    const scale = scaleOf(residuals);
    weights = weightsOf(residuals, scale);
    return { beta, residuals, scale, weights, iterations, converged, r2: fit.r2, n, collapsed };
  };
  let out = run('mad');
  let method = 'mad';
  if (out.collapsed) {
    out = run('mean_abs_dev');
    method = out.collapsed ? 'degenerate' : 'mean_abs_dev';
  }
  const { collapsed, ...rest } = out;
  return { ...rest, scale_method: method, degenerate: method === 'degenerate' };
}

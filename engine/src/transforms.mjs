// transforms.mjs — per-indicator transforms (registry `transform`) and winsorizing.
import { isNum, percentile } from './stats.mjs';

export const TRANSFORMS = ['none', 'log', 'log1p', 'logit'];

/**
 * Apply the registry transform to a raw value. Returns null when the value is
 * outside the transform's domain, which makes the indicator unavailable.
 *   none  → x
 *   log   → ln(x), requires x > 0
 *   log1p → ln(1 + x), requires x ≥ 0
 *   logit → x is a percentage: p = clamp(x/100, 0.005, 0.995); ln(p / (1 − p))
 */
export function transformValue(value, transform) {
  if (!isNum(value)) return null;
  switch (transform || 'none') {
    case 'none':
      return value;
    case 'log':
      return value > 0 ? Math.log(value) : null;
    case 'log1p':
      return value >= 0 ? Math.log(1 + value) : null;
    case 'logit': {
      const p = Math.min(0.995, Math.max(0.005, value / 100));
      return Math.log(p / (1 - p));
    }
    default:
      throw new Error(`unknown transform: ${transform}`);
  }
}

/**
 * Winsorize an array at the given percentiles (default [1, 99]).
 * Returns {values, lo, hi}; nulls are passed through unchanged.
 */
export function winsorize(values, percentiles = [1, 99]) {
  const lo = percentile(values, percentiles[0]);
  const hi = percentile(values, percentiles[1]);
  if (lo === null || hi === null) return { values: values.slice(), lo, hi };
  return {
    values: values.map((v) => (isNum(v) ? Math.min(hi, Math.max(lo, v)) : v)),
    lo,
    hi,
  };
}

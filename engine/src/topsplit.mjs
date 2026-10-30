// topsplit.mjs — the first-decision-node table (engine spec 3.7, Workbook 6.1).
// Pure ES module: no Node built-ins. Thresholds from params.top_split.
import { isNum } from './stats.mjs';

export const TOP_SPLIT_READINGS = {
  finance_supply: 'Supply of finance constrained; right branch (cost of finance)',
  low_demand: 'Low demand for investment; left branch (low returns)',
  credit_boom_no_investment:
    'Conflicting: credit booming at high real rates without investment; check macro risk, crowding out and consumer credit',
  not_investment_constrained: 'Investment not constrained; revisit the question (efficiency, structural change, inclusion)',
  investment_without_finance:
    'High investment despite thin finance: likely public or FDI-led; check private investment separately',
  indeterminate: 'Between rows; state the three statistics',
};

/** Short human label per row, for prose (the Growth Problem Statement) and the Desk. */
export const TOP_SPLIT_LABELS = {
  finance_supply: 'supply of finance constrained',
  low_demand: 'low demand for investment',
  credit_boom_no_investment: 'credit boom without investment',
  not_investment_constrained: 'investment not constrained',
  investment_without_finance: 'investment without finance',
  indeterminate: 'indeterminate',
};

/** The series that may supply the real-rate statistic, in order of preference (v0.1.1). */
export const RATE_SOURCES = ['FR.INR.RINR', 'DERIV.REAL_LENDING_CPI'];
export const RATE_SOURCE_LABELS = {
  'FR.INR.RINR': 'WDI real interest rate (lending rate deflated by the GDP deflator)',
  'DERIV.REAL_LENDING_CPI': 'CPI-deflated lending rate (Fisher: (1 + FR.INR.LEND)/(1 + FP.CPI.TOTL.ZG) − 1; the WDI real rate is missing in the window)',
};

/**
 * Classify the three statistics:
 *   rate       = high if real_rate_t ≥ rate_high_t; low if ≤ rate_low_t; else middle
 *   credit     = high if credit_growth ≥ credit_growth_high_pct AND private credit is not thin;
 *                else low. Thin (v0.1.2, credit_depth_thin_t): the ICR t of FS.AST.PRVT.GD.ZS is
 *                ≤ credit_depth_thin_t (−1.5, the ICR strong threshold), so growth from a very low
 *                base (Sierra Leone: 8 percent a year from 4 percent of GDP) does not read as a
 *                credit boom. Net cash flow from banks (credit growth − real rate, Workbook 6.1's
 *                second statistic) is recorded alongside as `net_cashflow_banks`.
 *   investment = low if investment_t ≤ investment_low_t; else not_low
 * Rows: high/low/low → finance_supply; low/low/low → low_demand; high/high/low →
 * credit_boom_no_investment; low/high/not_low → not_investment_constrained;
 * low/low/not_low → investment_without_finance; anything else (or a missing statistic) →
 * indeterminate.
 * `rateSource` names the series that supplied realRateT (v0.1.1: FR.INR.RINR when present,
 * else DERIV.REAL_LENDING_CPI); it is recorded as `rate_source` and mentioned in the reading.
 */
export function topSplit({ realRateT, investmentT, creditGrowth, rateSource = null, creditDepthT = null, netCashflow = null }, params) {
  const p = params.top_split;
  const stats = {
    real_rate_t: isNum(realRateT) ? realRateT : null,
    credit_growth: isNum(creditGrowth) ? creditGrowth : null,
    investment_t: isNum(investmentT) ? investmentT : null,
    credit_depth_t: isNum(creditDepthT) ? creditDepthT : null,
    net_cashflow_banks: isNum(netCashflow) ? netCashflow : null,
  };
  const core = ['real_rate_t', 'credit_growth', 'investment_t'];
  const missing = core.filter((k) => stats[k] === null);
  const thresholds = {
    rate_high_t: p.rate_high_t,
    rate_low_t: p.rate_low_t,
    investment_low_t: p.investment_low_t,
    credit_growth_high_pct: p.credit_growth_high_pct,
    credit_depth_thin_t: isNum(p.credit_depth_thin_t) ? p.credit_depth_thin_t : null,
  };
  const source = stats.real_rate_t === null ? null : rateSource || RATE_SOURCES[0];
  const sourceNote = source && source !== RATE_SOURCES[0] ? `; real rate from ${source} (${RATE_SOURCE_LABELS[source] || source})` : '';
  if (missing.length) {
    return {
      row: 'indeterminate',
      label: TOP_SPLIT_LABELS.indeterminate,
      reading: `${TOP_SPLIT_READINGS.indeterminate}; missing: ${missing.join(', ')}${sourceNote}`,
      stats,
      rate_source: source,
      classification: null,
      thresholds,
      missing,
    };
  }
  const rate = stats.real_rate_t >= p.rate_high_t ? 'high' : stats.real_rate_t <= p.rate_low_t ? 'low' : 'middle';
  const thinT = thresholds.credit_depth_thin_t;
  const depth = thinT === null || stats.credit_depth_t === null ? 'unknown' : stats.credit_depth_t <= thinT ? 'thin' : 'not_thin';
  const growthHigh = stats.credit_growth >= p.credit_growth_high_pct;
  const credit = growthHigh && depth !== 'thin' ? 'high' : 'low';
  const investment = stats.investment_t <= p.investment_low_t ? 'low' : 'not_low';
  let row = 'indeterminate';
  if (rate === 'high' && credit === 'low' && investment === 'low') row = 'finance_supply';
  else if (rate === 'low' && credit === 'low' && investment === 'low') row = 'low_demand';
  else if (rate === 'high' && credit === 'high' && investment === 'low') row = 'credit_boom_no_investment';
  else if (rate === 'low' && credit === 'high' && investment === 'not_low') row = 'not_investment_constrained';
  else if (rate === 'low' && credit === 'low' && investment === 'not_low') row = 'investment_without_finance';
  const depthNote = growthHigh && depth === 'thin' ? `; credit growth of ${Math.round(stats.credit_growth * 10) / 10} percent reads as low because private credit is thin (ICR t ${Math.round(stats.credit_depth_t * 100) / 100} ≤ ${thinT})` : '';
  return {
    row,
    label: TOP_SPLIT_LABELS[row],
    reading: `${TOP_SPLIT_READINGS[row]}${depthNote}${sourceNote}`,
    stats,
    rate_source: source,
    classification: { rate, credit, investment, credit_depth: depth, credit_growth_high: growthHigh },
    thresholds,
    missing: [],
  };
}

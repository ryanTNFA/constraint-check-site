// comparators.mjs — structural, regional and aspirational comparator sets.
// Pure ES module: no Node built-ins.
import { isNum, sd } from './stats.mjs';

export const INCOME_ORDER = ['Low income', 'Lower middle income', 'Upper middle income', 'High income'];
export const FEATURE_NAMES = ['log_gdppc_ppp', 'log_population', 'resource_rents', 'landlocked'];
export const FEATURE_SOURCES = {
  log_gdppc_ppp: 'NY.GDP.PCAP.PP.KD',
  log_population: 'SP.POP.TOTL',
  resource_rents: 'NY.GDP.TOTL.RT.ZS',
  landlocked: 'STATIC.LANDLOCKED',
};

/**
 * Comparator and ICR features per economy, from reference values:
 *   log_gdppc_ppp  = ln(value_ref of NY.GDP.PCAP.PP.KD)
 *   log_population = ln(value_ref of SP.POP.TOTL)
 *   resource_rents = value_ref of NY.GDP.TOTL.RT.ZS
 *   landlocked     = countries.json flag (0/1)
 *   fcs            = true when the economy is on registry/static_fcs.json (v0.1.2; `fcsSet`)
 */
export function buildFeatures(refs, countries, fcsSet = null) {
  const feats = {};
  const pick = (id, iso3) => {
    const r = refs[id] && refs[id][iso3];
    return r && r.available ? r : null;
  };
  for (const c of countries) {
    const g = pick('NY.GDP.PCAP.PP.KD', c.iso3);
    const p = pick('SP.POP.TOTL', c.iso3);
    const r = pick('NY.GDP.TOTL.RT.ZS', c.iso3);
    feats[c.iso3] = {
      log_gdppc_ppp: g && g.value_ref > 0 ? Math.log(g.value_ref) : null,
      log_population: p && p.value_ref > 0 ? Math.log(p.value_ref) : null,
      resource_rents: r ? r.value_ref : null,
      landlocked: c.landlocked ? 1 : 0,
      gdppc_ppp: g ? g.value_ref : null,
      gdppc_year: g ? g.year_ref : null,
      population: p ? p.value_ref : null,
      region: c.region || null,
      income_group: c.income_group || null,
      fcs: !!(fcsSet && fcsSet.has(c.iso3)) || c.fcs === true,
    };
  }
  addRemoteness(feats, countries);
  return feats;
}

/**
 * v0.1.5: remoteness = GDP-weighted mean great-circle distance (km) from the economy's capital to
 * every other economy's capital, GDP = GDP per capita (PPP) x population; log_remoteness is its log.
 * Used as an extra ICR control by indicators that ask for it (registry icr_extra_controls), so that
 * distance-driven measures such as bilateral trade costs are compared with what income AND location
 * predict. Economies without capital coordinates get null and drop out of those fits only.
 */
export function addRemoteness(feats, countries) {
  const pts = [];
  for (const c of countries) {
    const f = feats[c.iso3];
    const lat = Number(c.latitude), lon = Number(c.longitude);
    const gdp = f && isNum(f.gdppc_ppp) && isNum(f.population) ? f.gdppc_ppp * f.population : null;
    if (c.latitude === '' || c.latitude == null || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    pts.push({ iso3: c.iso3, lat: (lat * Math.PI) / 180, lon: (lon * Math.PI) / 180, gdp });
  }
  const R = 6371;
  for (const a of pts) {
    let num = 0, den = 0;
    for (const b of pts) {
      if (b.iso3 === a.iso3 || !isNum(b.gdp)) continue;
      const dlat = b.lat - a.lat, dlon = b.lon - a.lon;
      const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat) * Math.cos(b.lat) * Math.sin(dlon / 2) ** 2;
      const d = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
      num += b.gdp * d;
      den += b.gdp;
    }
    if (den > 0 && feats[a.iso3]) {
      feats[a.iso3].remoteness_km = num / den;
      feats[a.iso3].log_remoteness = Math.log(num / den);
    }
  }
  for (const iso of Object.keys(feats)) if (!('log_remoteness' in feats[iso])) { feats[iso].remoteness_km = null; feats[iso].log_remoteness = null; }
}

export function hasAllFeatures(f) {
  return !!f && FEATURE_NAMES.every((k) => isNum(f[k]));
}

export function isHighIncome(f) {
  return !!f && f.income_group === 'High income';
}

/**
 * Structural peers (rubric v0.1.2): z-score the continuous features (log income, log population,
 * resource rents) across all economies that have them and take the Euclidean distance in z-space
 * (Mahalanobis distance with a diagonal covariance). The binary landlocked feature enters as a
 * fixed penalty: a mismatch adds `landlocked_mismatch_penalty` (1) to the squared distance, the
 * cost of one standard deviation on a continuous feature, instead of being standardized by its own
 * 0.41 sd (which cost 5.98 and made it a hard filter: under v0.1.1 100 percent of landlocked
 * targets' peers were landlocked and 0 percent of coastal targets'). Candidates excluded: micro-states
 * (population < exclude_population_below) unless the target is one; high-income economies unless the
 * target is high income; economies on the fragile and conflict-affected list unless the target is on
 * it (exclude_fcs_if_target_not); economies whose income observation is more than
 * max_income_age_years older than the universe's latest income year. Keep the `size` nearest (ties
 * broken by iso3).
 */
export function structuralSet(targetIso, features, params) {
  const p = params.comparators.structural;
  const names = p.features || FEATURE_NAMES;
  const t = features[targetIso];
  const base = { rule: '', members: [], features: null, scales: null, distances: {}, excluded: {} };
  if (!hasAllFeatures(t)) {
    return { ...base, rule: 'structural: target lacks one or more comparator features', reason_empty: 'missing features' };
  }
  const universe = Object.keys(features)
    .filter((iso3) => hasAllFeatures(features[iso3]))
    .sort();
  const penalty = isNum(p.landlocked_mismatch_penalty) ? p.landlocked_mismatch_penalty : null;
  const scales = {};
  for (const k of names) {
    if (k === 'landlocked' && penalty !== null) {
      scales[k] = null;
      continue;
    }
    const s = sd(universe.map((iso3) => features[iso3][k]));
    scales[k] = s && s > 0 ? s : 1;
  }
  const latestIncomeYear = Math.max(...universe.map((iso3) => (isNum(features[iso3].gdppc_year) ? features[iso3].gdppc_year : -Infinity)));
  const maxAge = isNum(p.max_income_age_years) ? p.max_income_age_years : null;
  const targetMicro = t.population !== null && t.population < p.exclude_population_below;
  const targetHigh = isHighIncome(t);
  const targetFcs = !!t.fcs;
  const excluded = { population: 0, high_income: 0, fcs: 0, stale_income: 0 };
  const scored = [];
  for (const iso3 of universe) {
    if (iso3 === targetIso) continue;
    const f = features[iso3];
    if (!targetMicro && f.population !== null && f.population < p.exclude_population_below) {
      excluded.population++;
      continue;
    }
    if (p.exclude_high_income_if_target_not && !targetHigh && isHighIncome(f)) {
      excluded.high_income++;
      continue;
    }
    if (p.exclude_fcs_if_target_not && !targetFcs && f.fcs) {
      excluded.fcs++;
      continue;
    }
    if (maxAge !== null && Number.isFinite(latestIncomeYear) && isNum(f.gdppc_year) && latestIncomeYear - f.gdppc_year > maxAge) {
      excluded.stale_income++;
      continue;
    }
    let d2 = 0;
    for (const k of names) {
      if (k === 'landlocked' && penalty !== null) {
        if (f[k] !== t[k]) d2 += penalty;
        continue;
      }
      const z = (f[k] - t[k]) / scales[k];
      d2 += z * z;
    }
    scored.push([Math.sqrt(d2), iso3]);
  }
  scored.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const chosen = scored.slice(0, p.size);
  const distances = {};
  for (const [d, iso3] of chosen) distances[iso3] = d;
  const targetFeatures = {};
  for (const k of names) targetFeatures[k] = t[k];
  const continuous = names.filter((k) => !(k === 'landlocked' && penalty !== null));
  return {
    rule:
      `structural: ${p.size} nearest by Euclidean distance in z-scores of ${continuous.join(', ')} ` +
      `(diagonal Mahalanobis)${penalty !== null && names.includes('landlocked') ? `, with a landlocked mismatch adding ${penalty} to the squared distance (one sd of a continuous feature)` : ''}; ` +
      `micro-states below ${p.exclude_population_below} excluded${targetMicro ? ' (not applied: target is a micro-state)' : ''}; high-income economies ` +
      `${p.exclude_high_income_if_target_not && !targetHigh ? 'excluded' : 'included'}` +
      `${p.exclude_fcs_if_target_not ? `; fragile and conflict-affected economies ${targetFcs ? 'included (target is on the list)' : 'excluded'}` : ''}` +
      `${maxAge !== null && Number.isFinite(latestIncomeYear) ? `; candidates with an income observation before ${latestIncomeYear - maxAge} excluded` : ''}`,
    members: chosen.map((x) => x[1]),
    features: targetFeatures,
    scales,
    landlocked_mismatch_penalty: penalty,
    latest_income_year: Number.isFinite(latestIncomeYear) ? latestIncomeYear : null,
    distances,
    excluded,
  };
}

/**
 * Regional peers: same World Bank region; the same income group first, widening by
 * `income_band_steps` adjacent groups until `min_size` is reached; capped at
 * `max_size` nearest by log GDP per capita (PPP).
 */
export function regionalSet(targetIso, features, params) {
  const p = params.comparators.regional;
  const t = features[targetIso];
  if (!t || !t.region) {
    return { rule: 'regional: target has no region', members: [], income_steps: null, reason_empty: 'no region' };
  }
  const ti = INCOME_ORDER.indexOf(t.income_group);
  const candidates = Object.keys(features)
    .filter((iso3) => iso3 !== targetIso && features[iso3].region === t.region && isNum(features[iso3].log_gdppc_ppp))
    .sort();
  let step = 0;
  let members;
  if (ti < 0) {
    members = candidates.slice();
    step = null;
  } else {
    const within = (s) => candidates.filter((iso3) => {
      const ci = INCOME_ORDER.indexOf(features[iso3].income_group);
      return ci >= 0 && Math.abs(ci - ti) <= s;
    });
    members = within(0);
    while (members.length < p.min_size && step < INCOME_ORDER.length) {
      step += p.income_band_steps || 1;
      members = within(step);
    }
  }
  if (members.length > p.max_size) {
    const key = (iso3) => (isNum(t.log_gdppc_ppp) ? Math.abs(features[iso3].log_gdppc_ppp - t.log_gdppc_ppp) : 0);
    members = members
      .map((iso3) => [key(iso3), iso3])
      .sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
      .slice(0, p.max_size)
      .map((x) => x[1]);
  }
  return {
    rule:
      `regional: same region (${t.region}); income groups within ${step === null ? 'any' : step} step(s) of ` +
      `${t.income_group || 'unclassified'} until at least ${p.min_size}; capped at ${p.max_size} nearest by log GDP per capita (PPP)`,
    members: members.sort(),
    income_steps: step,
    reason_empty: members.length ? null : 'no other economy in the region with income data',
  };
}

/**
 * Aspirational peers: economies whose GDP per capita (PPP) `lookback_years` before the
 * target's reference year was within ±income_tolerance of the target's current level
 * (value_ref), and whose average per-capita growth since then,
 * 100·((v_now / v_then)^(1/years) − 1), is ≥ min_growth_pct; the `size` fastest growers.
 * v_now is the economy's own observation at its reference year.
 */
export function aspirationalSet(targetIso, features, gdpSeries, params) {
  const p = params.comparators.aspirational;
  const t = features[targetIso];
  if (!t || !isNum(t.gdppc_ppp) || !isNum(t.gdppc_year)) {
    return { rule: 'aspirational: target has no GDP per capita (PPP)', members: [], growth: {}, reason_empty: 'target lacks income data' };
  }
  const baseYear = t.gdppc_year - p.lookback_years;
  const growth = {};
  let inBand = 0;
  const scored = [];
  for (const iso3 of Object.keys(features).sort()) {
    if (iso3 === targetIso) continue;
    const f = features[iso3];
    const s = gdpSeries[iso3];
    if (!s || !isNum(f.gdppc_year)) continue;
    const vThen = s[baseYear];
    const vNow = s[f.gdppc_year];
    if (!isNum(vThen) || !isNum(vNow) || vThen <= 0 || vNow <= 0) continue;
    const years = f.gdppc_year - baseYear;
    if (years <= 0) continue;
    if (Math.abs(vThen / t.gdppc_ppp - 1) > p.income_tolerance) continue;
    inBand++;
    const g = 100 * ((vNow / vThen) ** (1 / years) - 1);
    if (g < p.min_growth_pct) continue;
    growth[iso3] = g;
    scored.push([g, iso3]);
  }
  scored.sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const members = scored.slice(0, p.size).map((x) => x[1]);
  const chosenGrowth = {};
  for (const iso3 of members) chosenGrowth[iso3] = growth[iso3];
  return {
    rule:
      `aspirational: GDP per capita (PPP) in ${baseYear} within ±${Math.round(p.income_tolerance * 100)}% of the target's ` +
      `current ${Math.round(t.gdppc_ppp)} and average growth since ≥ ${p.min_growth_pct}% a year; up to ${p.size} by growth`,
    members,
    base_year: baseYear,
    target_value: t.gdppc_ppp,
    candidates_in_band: inBand,
    growth: chosenGrowth,
    reason_empty: members.length
      ? null
      : inBand === 0
        ? `no economy had GDP per capita (PPP) within ±${Math.round(p.income_tolerance * 100)}% of ${Math.round(t.gdppc_ppp)} in ${baseYear}`
        : `${inBand} economies were in the income band in ${baseYear} but none grew ≥ ${p.min_growth_pct}% a year since`,
  };
}

/** All three sets for a target. gdpSeries is series['NY.GDP.PCAP.PP.KD']. */
export function comparatorSets(targetIso, features, gdpSeries, params) {
  return {
    structural: structuralSet(targetIso, features, params),
    regional: regionalSet(targetIso, features, params),
    aspirational: aspirationalSet(targetIso, features, gdpSeries || {}, params),
  };
}

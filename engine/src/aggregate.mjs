// aggregate.mjs — test scores, node scores, concordance, tiers with blockers, fragility,
// the N11 roll-up, ranking, bootstrap rank stability and the three statements.
// Pure ES module: no Node built-ins. Every threshold comes from params.tiers / params.ranking.
import { isNum, sign, mulberry32, shuffle } from './stats.mjs';
import { TEST_ORDER } from './signals.mjs';

export const TIER_ORDINAL = {
  ruled_out: -2,
  probably_not: -1,
  cannot_tell_data_gap: 0,
  cannot_tell_conflicting: 0,
  cannot_tell_weak: 0,
  candidate: 1,
  likely_binding: 2,
};

/** Within the cannot_tell tiers, the roll-up prefers the one that carries more evidence. */
const CANNOT_TELL_RANK = { cannot_tell_conflicting: 2, cannot_tell_weak: 1, cannot_tell_data_gap: 0 };
/** Within data gaps, the sub-reason that more data for this economy could resolve ranks first. */
const DATA_GAP_SUBREASON_RANK = { data_gap: 5, stale: 4, connector_not_built: 3, registry_coverage: 2, no_ab_price_family: 1, no_ab_family: 0 };

export function ordinal(tier) {
  return Object.prototype.hasOwnProperty.call(TIER_ORDINAL, tier) ? TIER_ORDINAL[tier] : 0;
}

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function fmt(x, d = 2) {
  if (!isNum(x)) return 'n/a';
  return String(Math.round(x * 10 ** d) / 10 ** d);
}

function uniq(xs) {
  return [...new Set(xs)];
}

export const PRICE_TEST_RULES = ['ab_only', 'exclude_C_D_when_AB_present', 'all_vote'];
export const PRICE_INFORMS_NOTE = 'quantity: informs, does not vote on the price test';
export const CAMELS_INFORMS_NOTE = 'class C/D: informs, does not vote on test 4';
export const PRICE_INFORMS_NOTE_V011 = 'quantity: informs, does not vote while price evidence exists';

function isAB(f) {
  return f.class === 'A' || f.class === 'B';
}

/**
 * T_k = Σ w_f·s_f / max(Σ w_f, floor) over the voting families with w_f > 0 assigned to test k.
 *
 * Price-test discipline (params.tiers.price_test_quantity_rule; Mindbook principle 1, a low
 * quantity is not necessarily a signal of scarcity):
 *   "ab_only" (rubric v0.1.2): on the price test only class A and B families vote. Class C and D
 *       families are returned under `informing`; when no class A/B family is present the price is
 *       not observed and the test is {T: null, not_observed: true} (the quantities still inform).
 *   "exclude_C_D_when_AB_present" (v0.1.1): C/D price families are excluded only when an A/B
 *       family is present; with none, every family votes.
 *   "all_vote" (v0.1): every family votes.
 * Test 4 (camels) follows params.tiers.camels_test_quantity_rule (rubric v0.1.6): with "ab_only", class C and D
 * camels families inform but do not vote, as on the price test. Tests 2 and 3 are never filtered.
 *
 * Weight floor (v0.1.2, params.tiers.test_weight_floor, 1.0 = the class A weight): a test whose
 * voting weight mass is thinner than the floor is shrunk toward zero, so one class C family at +1
 * gives T = 0.6 and one class A family keeps its full value. Without the floor T_k is the plain
 * weighted mean of v0.1.
 */
export function testScores(families, tests = TEST_ORDER, priceRule = null, floor = 0, camelsRule = 'all_vote') {
  const rule = priceRule || 'all_vote';
  if (!PRICE_TEST_RULES.includes(rule)) throw new Error(`unknown tiers.price_test_quantity_rule: ${priceRule}`);
  const fl = isNum(floor) && floor > 0 ? floor : 0;
  const out = {};
  for (const k of tests) {
    const fams = families.filter((f) => f.test === k && f.weight > 0);
    if (!fams.length) {
      out[k] = null;
      continue;
    }
    let voting = fams;
    let informing = [];
    if (k === 'price' && rule === 'ab_only') {
      voting = fams.filter(isAB);
      informing = fams.filter((f) => !isAB(f));
    } else if (k === 'price' && rule === 'exclude_C_D_when_AB_present' && fams.some(isAB)) {
      voting = fams.filter(isAB);
      informing = fams.filter((f) => !isAB(f));
    } else if (k === 'camels' && camelsRule === 'ab_only') {
      voting = fams.filter(isAB);
      informing = fams.filter((f) => !isAB(f));
    }
    if (!voting.length) {
      out[k] = { T: null, families: [], informing: informing.map((f) => f.id), not_observed: true, weight_mass: 0 };
      continue;
    }
    let num = 0;
    let den = 0;
    for (const f of voting) {
      num += f.weight * f.signal;
      den += f.weight;
    }
    out[k] = { T: num / Math.max(den, fl), families: voting.map((f) => f.id), informing: informing.map((f) => f.id), weight_mass: den, shrunk: fl > den };
  }
  return out;
}

/** Whether a test block holds a computed score. */
function hasT(t) {
  return !!t && isNum(t.T);
}

/**
 * Node statistics from its families (rubric v0.1.2, params.tiers.evidence_count_rule =
 * "voting_families"):
 *   N  = weighted mean of the available T_k with params.tiers.test_weights
 *        (price 2, changes 1, circumvention 1, camels 1; a missing weight counts 1)
 *   C  = number of tests with sign(T_k) = sign(N) and |T_k| ≥ concordance_abs_T_min (0 if N = 0)
 *   E  = number of distinct VOTING families with w_f > 0 (across tests); E_informing counts the
 *        class C/D price families that inform without voting (listed in `informing`)
 *   R  = newest year among class A or B families (null if none)
 *   AB_count = distinct class A/B families; AB_pos = those with s_f ≥ +1
 * Under v0.1.1 E counted informing families too, so E_below (3) and E_min (5) were met by
 * families whose signals were excluded from the vote (review finding 2).
 */
export function nodeStats(families, params) {
  const active = families.filter((f) => f.weight > 0);
  const T = params.tiers;
  const tests = testScores(active, TEST_ORDER, T.price_test_quantity_rule, T.test_weight_floor, T.camels_test_quantity_rule || 'all_vote');
  // Informing families are those a test's quantity rule keeps out of its score: the price test's and, under
  // camels_test_quantity_rule "ab_only" (rubric v0.1.6), test 4's. Neither counts toward E.
  const informingIds = new Set(['price', 'camels'].flatMap((k) => ((tests[k] && tests[k].informing) || []).map((id) => `${k}|${id}`)));
  const isInforming = (f) => informingIds.has(`${f.test}|${f.id}`);
  const countAll = T.evidence_count_rule === 'all_families';
  const voting = countAll ? active : active.filter((f) => !isInforming(f));
  const informing = active.filter(isInforming);
  const weights = T.test_weights || {};
  const Ts = [];
  const testWeights = {};
  let num = 0;
  let den = 0;
  for (const k of TEST_ORDER) {
    if (!hasT(tests[k])) continue;
    const w = isNum(weights[k]) ? weights[k] : 1;
    Ts.push(tests[k].T);
    testWeights[k] = w;
    num += w * tests[k].T;
    den += w;
  }
  const N = den > 0 ? num / den : null;
  const cmin = T.concordance_abs_T_min;
  let C = 0;
  if (N !== null && N !== 0) for (const t of Ts) if (sign(t) === sign(N) && Math.abs(t) >= cmin) C++;
  const votingIds = uniq(voting.map((f) => f.id));
  const E = votingIds.length;
  const E_all = uniq(active.map((f) => f.id)).length;
  const informingOnlyIds = uniq(informing.map((f) => f.id)).filter((id) => !votingIds.includes(id));
  const downgradedPrice = uniq(informing.filter((f) => f.downgraded).flatMap((f) => f.indicators || [f.id]));
  const ab = new Map();
  for (const f of voting) {
    if (f.class !== 'A' && f.class !== 'B') continue;
    const prev = ab.get(f.id);
    if (!prev) ab.set(f.id, { signal: f.signal, year: f.year });
    else {
      prev.signal = Math.max(prev.signal, f.signal);
      if (isNum(f.year) && (!isNum(prev.year) || f.year > prev.year)) prev.year = f.year;
    }
  }
  let R = null;
  let AB_pos = 0;
  let AB_above0 = 0;
  for (const v of ab.values()) {
    if (isNum(v.year) && (R === null || v.year > R)) R = v.year;
    if (v.signal >= 1) AB_pos++;
    if (v.signal > (T.ruled_out.no_AB_family_signal_above ?? 0)) AB_above0++;
  }
  const missing = TEST_ORDER.filter((k) => !hasT(tests[k]));
  return {
    tests,
    N,
    C,
    E,
    E_all,
    E_informing: informingOnlyIds.length,
    downgraded_price_indicators: downgradedPrice,
    R,
    AB_count: ab.size,
    AB_pos,
    AB_above0,
    all_class_D: voting.length > 0 && voting.every((f) => f.class === 'D'),
    missing_tests: missing,
    price_not_observed: !!(tests.price && tests.price.not_observed),
    families: active,
    voting_ids: votingIds,
    informing_families: informing.map((f) => ({ id: f.id, signal: f.signal, class: f.class })),
    circumvention_voting: voting.filter((f) => f.test === 'circumvention').map((f) => ({ id: f.id, signal: f.signal, readings: f.readings || [] })),
    test_weights: testWeights,
    price_informing: (tests.price && tests.price.informing) || [],
    camels_informing: (tests.camels && tests.camels.informing) || [],
  };
}

/** Tier thresholds scaled by a factor; magnitude thresholds only (counts and ages are left alone). */
export function scaleThresholds(tiers, factor) {
  const t = JSON.parse(JSON.stringify(tiers));
  if (factor === 1) return t;
  const scale = (obj, keys) => {
    for (const k of keys) if (isNum(obj[k])) obj[k] = obj[k] * factor;
  };
  scale(t.likely_binding, ['N_min', 'T1_min', 'no_test_below']);
  scale(t.candidate, ['N_min', 'N_alt_min']);
  scale(t.conflicting, ['T_pos_min', 'T_neg_max']);
  scale(t.probably_not, ['N_max', 'N_alt_max']);
  scale(t.ruled_out, ['N_max', 'T1_max', 'T3_max']);
  if (isNum(t.concordance_abs_T_min)) t.concordance_abs_T_min *= factor;
  return t;
}

function blockers(conds) {
  return conds.filter((c) => !c[0]).map((c) => c[1]);
}

/**
 * The seven-step tier assignment (engine spec 3.6, README 7). `stats` from nodeStats; ctx carries
 * {params, snapshotYear, F, nodeId, connectorsNotBuilt (array of node ids), connectorFamilies,
 * registryAB (class A/B indicator ids the registry assigns to the node, any test),
 * registryABPrice (the same on the price test), ruledOutRequires (family ids at least one of
 * which must be present before ruled_out)}.
 * Returns {tier, subreason, reason, blockers: {likely_binding, ruled_out}}.
 */
export function assignTier(stats, ctx) {
  const P = ctx.params.tiers;
  const F = ctx.F || 0;
  const { N, C, E, R, AB_count, AB_pos, AB_above0, tests } = stats;
  const Einf = stats.E_informing || 0;
  const age = R === null ? null : ctx.snapshotYear - R;
  const Tof = (k) => (hasT(tests[k]) ? tests[k].T : null);
  const missingList = stats.missing_tests.map((k) => (k === 'price' && stats.price_not_observed ? 'T_price (price not observed: quantities only)' : `T_${k}`));
  const missing = missingList.length ? ` (no evidence for ${missingList.join(', ')}: no voting evidence)` : '';
  const infTxt = Einf ? `; ${Einf} quantity famil${Einf === 1 ? 'y informs' : 'ies inform'} without voting` : '';

  // 1. cannot_tell_data_gap
  //    params.tiers.evidence_count_rule: "voting_families" (v0.1.2 default) counts voting families
  //    in E everywhere; "voting_for_extreme_tiers" lets informing families count toward E_below
  //    here but not toward E_min in steps 3 and 4; "all_families" is v0.1.1 (nodeStats then
  //    already counts every family in E).
  const gap = P.cannot_tell_data_gap;
  const Egap = P.evidence_count_rule === 'voting_for_extreme_tiers' && isNum(stats.E_all) ? stats.E_all : E;
  const recentAB = AB_count > 0 && age !== null && age <= gap.staleness_limit_years;
  if (Egap < gap.E_below || !recentAB) {
    let subreason = 'data_gap';
    let reason;
    const fams = (ctx.connectorFamilies || []).join(', ');
    const regMax = isNum(ctx.registryVotingMax) ? ctx.registryVotingMax : null;
    const down = stats.downgraded_price_indicators || [];
    const priceWhy = stats.price_not_observed
      ? down.length
        ? ` (price not observed: ${down.join(', ')} downgraded to class C for this economy, no independent monetary policy)`
        : ` (price not observed: the registry's class A/B price famil${(ctx.registryABPrice || []).length === 1 ? 'y has' : 'ies have'} no data in the window for this economy)`
      : '';
    if (E === 0 && Einf === 0 && (ctx.connectorsNotBuilt || []).includes(ctx.nodeId)) {
      subreason = 'connector_not_built';
      reason = `cannot_tell (connector not built): no evidence family computed for this node; the Workbook's families${fams ? ` (${fams})` : ''} need connectors that the prototype does not build`;
    } else if (AB_count === 0 && Array.isArray(ctx.registryAB) && ctx.registryAB.length === 0) {
      // The registry computes no class A or B indicator for this node at all, so no economy
      // can ever leave cannot_tell here: a registry coverage statement, not a data gap.
      subreason = 'no_ab_family';
      reason = `cannot_tell (no class A/B family in registry): ${Einf + E} class C/D famil${Einf + E === 1 ? 'y' : 'ies'} inform; registry v0.1 computes no class A or B evidence family for this node${fams ? `; the Workbook's families (${fams}) need connectors that the prototype does not build` : ''}`;
    } else if (stats.price_not_observed && Array.isArray(ctx.registryABPrice) && ctx.registryABPrice.length === 0 && Egap < gap.E_below) {
      // A/B evidence exists on other tests but the registry has no class A/B price for the node:
      // the price is never observed here under this registry (Workbook P1).
      subreason = 'no_ab_price_family';
      reason = `cannot_tell (no class A/B price in registry): the price test is not observed because registry v0.1 computes no class A or B price family for this node (${Einf} quantity famil${Einf === 1 ? 'y informs' : 'ies inform'} without voting); E = ${E} voting famil${E === 1 ? 'y' : 'ies'} < ${gap.E_below}${fams ? `; the Workbook's families (${fams}) need connectors that the prototype does not build` : ''}`;
    } else if (Egap < gap.E_below && regMax !== null && regMax < gap.E_below && !down.length) {
      // The registry cannot supply E_below voting families for this node for any economy.
      subreason = 'registry_coverage';
      reason = `cannot_tell (registry coverage): registry v0.1 can supply at most ${regMax} voting evidence famil${regMax === 1 ? 'y' : 'ies'} for this node, below E_below = ${gap.E_below}, so no economy can leave cannot_tell here until more class A/B evidence is connected; this economy: E = ${E}${infTxt}${fams ? `; the Workbook's families (${fams}) need connectors that the prototype does not build` : ''}`;
    } else if (AB_count > 0 && !recentAB) {
      subreason = 'stale';
      reason = `cannot_tell (stale): E = ${E}${infTxt}; the newest class A/B family dates from ${R}, ${age} years old, beyond the ${gap.staleness_limit_years}-year staleness limit`;
    } else if (Egap < gap.E_below) {
      reason = `cannot_tell (data gap): E = ${E} < ${gap.E_below} voting evidence families${AB_count === 0 ? '; no class A or B family' : ''}${infTxt}${priceWhy}`;
    } else {
      reason = `cannot_tell (data gap): E = ${E} but no class A or B family (only class C/D evidence)${infTxt}${priceWhy}`;
    }
    return { tier: 'cannot_tell_data_gap', subreason, reason, blockers: { likely_binding: [], ruled_out: [] } };
  }

  // 2. cannot_tell_conflicting
  const Ts = TEST_ORDER.filter((k) => isNum(Tof(k)));
  const pos = Ts.filter((k) => Tof(k) >= P.conflicting.T_pos_min);
  const neg = Ts.filter((k) => Tof(k) <= P.conflicting.T_neg_max);
  if (pos.length && neg.length) {
    return {
      tier: 'cannot_tell_conflicting',
      subreason: 'conflicting',
      reason: `cannot_tell (conflicting): T_${pos[0]} = ${fmt(Tof(pos[0]))} ≥ ${fmt(P.conflicting.T_pos_min)} while T_${neg[0]} = ${fmt(Tof(neg[0]))} ≤ ${fmt(P.conflicting.T_neg_max)}; possibly heterogeneity (binding for a sub-sector or region)`,
      blockers: { likely_binding: [], ruled_out: [] },
    };
  }

  // Guards shared by the two extreme tiers (v0.1.2).
  const dissentMin = isNum(P.extreme_tier_informing_dissent_min_abs) ? P.extreme_tier_informing_dissent_min_abs : null;
  const informing = stats.informing_families || [];
  const dissentAgainstRuleOut = dissentMin === null ? [] : informing.filter((f) => f.signal >= dissentMin);
  const dissentAgainstBinding = dissentMin === null ? [] : informing.filter((f) => f.signal <= -dissentMin);
  const dissentTxt = (list) => list.map((f) => `${f.id} ${f.signal > 0 ? '+' : ''}${fmt(f.signal)}`).join(', ');

  // 3. ruled_out
  const ro = P.ruled_out;
  const Tp = Tof('price');
  const Tc = Tof('circumvention');
  const required = Array.isArray(ctx.ruledOutRequires) ? ctx.ruledOutRequires : [];
  const presentIds = new Set(stats.voting_ids || []);
  const requiredPresent = !required.length || required.some((id) => presentIds.has(id));
  const circ = stats.circumvention_voting || [];
  const loneCircOk = !(ro.lone_circumvention_family_needs_peer_gap && circ.length === 1 && !(circ[0].readings || []).includes('peer_gap'));
  const condsRO = [
    [N <= ro.N_max, `N = ${fmt(N)} > ${fmt(ro.N_max)}`],
    [C >= ro.C_min, `C = ${C} < ${ro.C_min}${missing}`],
    [isNum(Tp) && Tp <= ro.T1_max, isNum(Tp) ? `T_price = ${fmt(Tp)} > ${fmt(ro.T1_max)}` : stats.price_not_observed ? 'T_price not observed (no class A/B price family; quantities inform only)' : 'T_price not computed'],
    [isNum(Tc) && Tc <= ro.T3_max, isNum(Tc) ? `T_circumvention = ${fmt(Tc)} > ${fmt(ro.T3_max)}` : 'T_circumvention not computed (no circumvention evidence)'],
    [loneCircOk, circ.length === 1 ? `T_circumvention rests on one family (${circ[0].id}) read from its ICR alone: no peer gap (fewer than min_peers_with_data peers with data), so a lone circumvention family cannot carry the rule-out` : ''],
    [E >= ro.E_min, `E = ${E} < ${ro.E_min} voting families${infTxt}`],
    [AB_above0 === 0, `${AB_above0} class A/B famil${AB_above0 === 1 ? 'y' : 'ies'} with s > ${fmt(ro.no_AB_family_signal_above ?? 0)}`],
    [AB_count >= 2, `AB_count = ${AB_count} < 2`],
    [age !== null && age <= ro.R_max_age, `newest A/B evidence ${age === null ? 'missing' : `${age} years old > ${ro.R_max_age}`}`],
    [dissentAgainstRuleOut.length === 0, dissentAgainstRuleOut.length ? `informing quantit${dissentAgainstRuleOut.length === 1 ? 'y dissents' : 'ies dissent'} against the rule-out (${dissentTxt(dissentAgainstRuleOut)})` : ''],
    [requiredPresent, required.length ? `the Workbook's rule-out evidence for this node (${required.join(', ')}) is not computed (connector not built)` : ''],
    [F <= ro.F_max, 'F = 1 (tier fragile across comparator sets or leave-one-family-out)'],
  ];
  const blockRO = blockers(condsRO);
  if (!blockRO.length) {
    return {
      tier: 'ruled_out',
      subreason: null,
      reason: `ruled_out: N = ${fmt(N)} ≤ ${fmt(ro.N_max)}; C = ${C} ≥ ${ro.C_min}; T_price = ${fmt(Tp)} ≤ ${fmt(ro.T1_max)}; T_circumvention = ${fmt(Tc)} ≤ ${fmt(ro.T3_max)}; E = ${E} ≥ ${ro.E_min}; no class A/B family positive; AB_count = ${AB_count}; newest A/B evidence ${age} years old; no informing quantity dissents${required.length ? `; required evidence (${required.join(', ')}) present` : ''}; F = 0`,
      blockers: { likely_binding: [], ruled_out: [] },
    };
  }

  // 4. likely_binding
  const lb = P.likely_binding;
  const below = Ts.filter((k) => Tof(k) <= lb.no_test_below);
  const condsLB = [
    [N >= lb.N_min, `N = ${fmt(N)} < ${fmt(lb.N_min)}`],
    [C >= lb.C_min, `C = ${C} < ${lb.C_min}${missing}`],
    [E >= lb.E_min, `E = ${E} < ${lb.E_min} voting families${infTxt}`],
    [isNum(Tp) && Tp >= lb.T1_min, isNum(Tp) ? `T_price = ${fmt(Tp)} < ${fmt(lb.T1_min)}` : stats.price_not_observed ? 'T_price not observed (no class A/B price family; quantities inform only)' : 'T_price not computed'],
    [below.length === 0, below.length ? `T_${below[0]} = ${fmt(Tof(below[0]))} ≤ ${fmt(lb.no_test_below)}` : ''],
    [AB_pos >= lb.AB_positive_families_min, `AB_pos = ${AB_pos} < ${lb.AB_positive_families_min} class A/B families with s ≥ +1`],
    [dissentAgainstBinding.length === 0, dissentAgainstBinding.length ? `informing quantit${dissentAgainstBinding.length === 1 ? 'y dissents' : 'ies dissent'} against the verdict (${dissentTxt(dissentAgainstBinding)})` : ''],
    [F <= lb.F_max, 'F = 1 (tier fragile across comparator sets or leave-one-family-out)'],
  ];
  const blockLB = blockers(condsLB);
  if (!blockLB.length) {
    return {
      tier: 'likely_binding',
      subreason: null,
      reason: `likely_binding: N = ${fmt(N)} ≥ ${fmt(lb.N_min)}; C = ${C} ≥ ${lb.C_min}; E = ${E} ≥ ${lb.E_min}; T_price = ${fmt(Tp)} ≥ ${fmt(lb.T1_min)}; no test ≤ ${fmt(lb.no_test_below)}; AB_pos = ${AB_pos} ≥ ${lb.AB_positive_families_min}; no informing quantity dissents; F = 0`,
      blockers: { likely_binding: [], ruled_out: blockRO },
    };
  }

  // 5. candidate
  const cd = P.candidate;
  const candMain = N >= cd.N_min && C >= cd.C_min;
  const candAlt = N >= cd.N_alt_min;
  if (candMain || candAlt) {
    if (stats.all_class_D) {
      return {
        tier: 'cannot_tell_weak',
        subreason: 'composite_only',
        reason: `cannot_tell (weak): composite indices only (every voting family is class D), so N = ${fmt(N)} cannot support candidate`,
        blockers: { likely_binding: blockLB, ruled_out: blockRO },
      };
    }
    const rule = candMain
      ? `N = ${fmt(N)} ≥ ${fmt(cd.N_min)} and C = ${C} ≥ ${cd.C_min}`
      : `N = ${fmt(N)} ≥ ${fmt(cd.N_alt_min)} (alternative rule; C = ${C} < ${cd.C_min})`;
    return {
      tier: 'candidate',
      subreason: candMain ? 'main' : 'alt',
      reason: `candidate: ${rule}. likely_binding blocked: ${blockLB.join('; ')}`,
      blockers: { likely_binding: blockLB, ruled_out: blockRO },
    };
  }

  // 6. probably_not
  // v0.1.4b: the alternative rule mirrors candidate's (N <= N_alt_max with any C), so a node whose
  // voting evidence sits on one test can be cleared as well as flagged. ruled_out keeps its full bar.
  const pn = P.probably_not;
  const pnMain = N <= pn.N_max && C >= pn.C_min;
  const pnAlt = isNum(pn.N_alt_max) && N <= pn.N_alt_max;
  if ((pnMain || pnAlt) && !stats.all_class_D) {
    const rule = pnMain
      ? `N = ${fmt(N)} ≤ ${fmt(pn.N_max)} and C = ${C} ≥ ${pn.C_min}`
      : `N = ${fmt(N)} ≤ ${fmt(pn.N_alt_max)} (alternative rule; C = ${C} < ${pn.C_min})`;
    return {
      tier: 'probably_not',
      subreason: pnMain ? 'main' : 'alt',
      reason: `probably_not: ${rule}. ruled_out blocked: ${blockRO.join('; ')}`,
      blockers: { likely_binding: blockLB, ruled_out: blockRO },
    };
  }

  // 7. cannot_tell_weak
  const candBlock = [];
  if (N < cd.N_min) candBlock.push(`N = ${fmt(N)} < ${fmt(cd.N_min)}`);
  else if (C < cd.C_min) candBlock.push(`C = ${C} < ${cd.C_min}${missing}`);
  if (N < cd.N_alt_min) candBlock.push(`N = ${fmt(N)} < ${fmt(cd.N_alt_min)} (alternative rule)`);
  const pnBlock = [];
  if (N > pn.N_max) pnBlock.push(`N = ${fmt(N)} > ${fmt(pn.N_max)}`);
  if (C < pn.C_min) pnBlock.push(`C = ${C} < ${pn.C_min}${missing}`);
  if (isNum(pn.N_alt_max) && N > pn.N_alt_max) pnBlock.push(`N = ${fmt(N)} > ${fmt(pn.N_alt_max)} (alternative rule)`);
  return {
    tier: 'cannot_tell_weak',
    subreason: 'weak',
    reason: `cannot_tell (weak): N = ${fmt(N)}, C = ${C}, E = ${E}${infTxt}; evidence exists but points nowhere clearly. candidate blocked: ${candBlock.join('; ')}. probably_not blocked: ${pnBlock.join('; ')}`,
    blockers: { likely_binding: blockLB, ruled_out: blockRO },
  };
}

/** Data-gap sub-reasons that no economy's data can resolve: the registry has no route to the evidence. */
const STRUCTURAL_GAP_SUBREASONS = new Set(['connector_not_built', 'no_ab_family', 'no_ab_price_family', 'registry_coverage']);
export const CANNOT_TELL_REASONS = ['not_connected', 'no_recent_data', 'one_kind', 'mixed'];

/**
 * Plain reason behind a cannot_tell tier (engine 0.1.5, front-door PRD W1), so the Desk does not
 * parse rule strings. Display only: no tier depends on it.
 *   not_connected   structural data gap (connector_not_built, no_ab_family, no_ab_price_family, registry_coverage)
 *   no_recent_data  economy-specific data gap (data_gap, stale)
 *   one_kind        weak with C ≤ 1: only one test speaks with any strength
 *   mixed           conflicting, or weak with C ≥ 2
 * Returns {cannot_tell_reason, cannot_tell_detail: {subreason, speaking_tests, scored_tests, missing_tests, lean}},
 * both null for any other tier. speaking_tests are those with |T| ≥ concordance_abs_T_min (the ones C counts
 * when they agree with N); scored_tests have any T; missing_tests have none. The lean is sign(N) with band 'clear' from
 * params.tiers.cannot_tell_lean_clear_abs_N, else 'slight'; null when N is missing or zero.
 */
export function cannotTellInfo(rec, params) {
  if (typeof rec.tier !== 'string' || !rec.tier.startsWith('cannot_tell')) return { cannot_tell_reason: null, cannot_tell_detail: null };
  const sub = rec.tier_subreason;
  let reason;
  if (rec.tier === 'cannot_tell_data_gap') reason = STRUCTURAL_GAP_SUBREASONS.has(sub) ? 'not_connected' : 'no_recent_data';
  else if (rec.tier === 'cannot_tell_conflicting') reason = 'mixed';
  else reason = (rec.C ?? 0) >= 2 ? 'mixed' : 'one_kind';
  const tests = rec.tests || {};
  const scored = TEST_ORDER.filter((k) => tests[k] && isNum(tests[k].T)).map((k) => ({ test: k, T: tests[k].T }));
  const cmin = params && params.tiers && isNum(params.tiers.concordance_abs_T_min) ? params.tiers.concordance_abs_T_min : 0;
  const clear = params && params.tiers && isNum(params.tiers.cannot_tell_lean_clear_abs_N) ? params.tiers.cannot_tell_lean_clear_abs_N : null;
  const lean = isNum(rec.N) && rec.N !== 0
    ? { direction: rec.N > 0 ? 'toward' : 'away', band: clear !== null && Math.abs(rec.N) >= clear ? 'clear' : 'slight', N: rec.N }
    : null;
  return {
    cannot_tell_reason: reason,
    cannot_tell_detail: {
      subreason: sub || null,
      speaking_tests: scored.filter((s) => Math.abs(s.T) >= cmin),
      scored_tests: scored,
      missing_tests: TEST_ORDER.filter((k) => !scored.some((s) => s.test === k)),
      lean,
    },
  };
}

/**
 * Rubric 0.1.8 (front-door PRD W4): the params for a named evidence setting, params.tiers deep-merged with
 * params.settings[name].tiers. Enforces the asymmetry of docs/calibration-review.md section 4.5: a setting may
 * raise any bar, and may lower the bar for candidate, but may never loosen probably_not, ruled_out or the number of
 * voting families needed to leave cannot_tell. A setting that tries throws, so a bad params file cannot ship.
 */
export function paramsForSetting(params, name) {
  const S = params.settings || {};
  if (!name || name === (S.default || 'standard')) return params;
  if (!S[name] || name.startsWith('_') || !S[name].tiers) throw new Error(`unknown evidence setting: ${name}`);
  const merge = (t, s) => {
    for (const [k, v] of Object.entries(s)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) merge((t[k] = t[k] && typeof t[k] === 'object' ? { ...t[k] } : {}), v);
      else t[k] = v;
    }
    return t;
  };
  const tiers = merge(JSON.parse(JSON.stringify(params.tiers)), S[name].tiers);
  const base = params.tiers;
  const looser = [];
  const atMost = (path, a, b) => { if (isNum(a) && isNum(b) && a > b) looser.push(path); };   // a must not exceed b
  const atLeast = (path, a, b) => { if (isNum(a) && isNum(b) && a < b) looser.push(path); };
  atMost('probably_not.N_max', tiers.probably_not.N_max, base.probably_not.N_max);
  atMost('probably_not.N_alt_max', tiers.probably_not.N_alt_max, base.probably_not.N_alt_max);
  atLeast('probably_not.C_min', tiers.probably_not.C_min, base.probably_not.C_min);
  // ruled_out: a higher *_max, *_above or age limit is looser; a lower *_min is looser
  for (const k of Object.keys(base.ruled_out)) {
    if (/(_max|_above|_age)$/.test(k)) atMost(`ruled_out.${k}`, tiers.ruled_out[k], base.ruled_out[k]);
    else if (/_min$/.test(k)) atLeast(`ruled_out.${k}`, tiers.ruled_out[k], base.ruled_out[k]);
  }
  atLeast('cannot_tell_data_gap.E_below', tiers.cannot_tell_data_gap.E_below, base.cannot_tell_data_gap.E_below);
  if (looser.length) throw new Error(`evidence setting ${name} loosens the bar for ruling out (${looser.join(', ')}); the asymmetry forbids it`);
  return { ...params, tiers };
}

/** The direction a tier gives a reader: 'look' (candidate, likely_binding), 'not' (probably_not, ruled_out), else 'cannot'. */
export function tierDirection(tier) {
  if (tier === 'candidate' || tier === 'likely_binding') return 'look';
  if (tier === 'probably_not' || tier === 'ruled_out') return 'not';
  return 'cannot';
}

/**
 * One robustness mark per rated node (front-door PRD W4 and Q7): 'depends_on_setting' when the direction differs
 * between the evidence settings, else 'depends_on_comparators' when it differs between the comparator sets with
 * members (tier_by_set), else 'holds'. Both flags are kept for the hover detail.
 */
export function robustnessMark(tierBySetting, tierBySet, setsCompared = null) {
  const dirs = new Set(Object.values(tierBySetting || {}).map(tierDirection));
  const sets = Object.entries(tierBySet || {}).filter(([s]) => !setsCompared || setsCompared.includes(s)).map(([, t]) => tierDirection(t));
  const bySetting = dirs.size > 1;
  const byComparators = new Set(sets).size > 1;
  return { mark: bySetting ? 'depends_on_setting' : byComparators ? 'depends_on_comparators' : 'holds', settings_differ: bySetting, comparators_differ: byComparators };
}

function withoutFamily(families, id) {
  return families.filter((f) => f.id !== id);
}

function publicFamilies(families, priceInforming = [], camelsInforming = []) {
  const informing = new Set([...priceInforming.map((id) => `price|${id}`), ...camelsInforming.map((id) => `camels|${id}`)]);
  return families.map((f) => {
    const votes = !informing.has(`${f.test}|${f.id}`);
    return {
      id: f.id,
      test: f.test,
      class: f.class,
      signal: f.signal,
      weight: f.weight,
      year: f.year,
      indicators: f.indicators,
      readings: f.readings || [],
      votes,
      vote_note: votes ? null : f.test === 'camels' ? CAMELS_INFORMS_NOTE : PRICE_INFORMS_NOTE,
    };
  });
}

/**
 * Evaluate one leaf node.
 *   familiesBySet: {setName: families} (from signals.buildFamilies under each comparator set)
 *   activeSet: the set whose families define the node's statistics
 *   setsWithMembers: array of set names that have at least one member (empty sets do not
 *                    enter the fragility check but are still reported in tier_by_set)
 *   thresholdFactor: scales the magnitude thresholds (bootstrap, ±20% sensitivity)
 *   fragility: 'full' (sets + leave-one-family-out) or 'sets' (sets only; used in the bootstrap)
 * F = 1 if the tier (computed with F = 0) differs by more than one ordinal step across the
 * comparator sets with members, or under any single VOTING family's removal from the active set
 * (v0.1.2: informing families are not removed one by one; they never changed a vote).
 */
export function evaluateNode({
  nodeId,
  familiesBySet,
  activeSet,
  setsWithMembers,
  params,
  snapshotYear,
  connectorsNotBuilt = [],
  connectorFamilies = [],
  registryAB = null,
  registryABPrice = null,
  registryVotingMax = null,
  ruledOutRequires = [],
  thresholdFactor = 1,
  fragility = 'full',
}) {
  const p = thresholdFactor === 1 ? params : { ...params, tiers: scaleThresholds(params.tiers, thresholdFactor) };
  const ctx = { params: p, snapshotYear, nodeId, connectorsNotBuilt, connectorFamilies, registryAB, registryABPrice, registryVotingMax, ruledOutRequires };
  const setNames = Object.keys(familiesBySet);
  const stats = {};
  for (const s of setNames) stats[s] = nodeStats(familiesBySet[s] || [], p);
  const base = stats[activeSet];
  const tier0 = assignTier(base, { ...ctx, F: 0 });
  const tier0BySet = {};
  for (const s of setNames) tier0BySet[s] = s === activeSet ? tier0.tier : assignTier(stats[s], { ...ctx, F: 0 }).tier;
  const compared = setNames.filter((s) => s === activeSet || (setsWithMembers || setNames).includes(s));
  const ords = compared.map((s) => ordinal(tier0BySet[s]));
  let F = Math.max(...ords) - Math.min(...ords) > 1 ? 1 : 0;
  let fragileSets = F === 1;
  let fragileLofo = false;
  const loadBearing = [];
  if (fragility === 'full') {
    for (const fid of base.voting_ids) {
      const t = assignTier(nodeStats(withoutFamily(familiesBySet[activeSet], fid), p), { ...ctx, F: 0 }).tier;
      if (t !== tier0.tier) loadBearing.push(fid);
      if (Math.abs(ordinal(t) - ordinal(tier0.tier)) > 1) {
        F = 1;
        fragileLofo = true;
      }
    }
  }
  const final = assignTier(base, { ...ctx, F });
  const tierBySet = {};
  for (const s of setNames) tierBySet[s] = s === activeSet ? final.tier : assignTier(stats[s], { ...ctx, F }).tier;
  const tests = {};
  for (const k of TEST_ORDER) {
    const t = base.tests[k];
    tests[k] = t
      ? { T: isNum(t.T) ? t.T : null, families: t.families, informing: t.informing || [], not_observed: !!t.not_observed, weight_mass: t.weight_mass ?? null, shrunk: !!t.shrunk }
      : null;
  }
  const informing = base.price_informing || [];
  const rule = p.tiers.price_test_quantity_rule || 'all_vote';
  let priceTestNote = null;
  if (base.price_not_observed) {
    priceTestNote = `Price not observed: no class A/B price family for this economy, so T_price is not computed and N rests on the other tests; ${informing.length} class C/D quantity famil${informing.length === 1 ? 'y informs' : 'ies inform'} but do${informing.length === 1 ? 'es' : ''} not vote (${informing.join(', ')}; rule ${rule})`;
  } else if (informing.length) {
    priceTestNote =
      `T_price is computed from the ${tests.price.families.length} class A/B price famil${tests.price.families.length === 1 ? 'y' : 'ies'} (${tests.price.families.join(', ')}); ` +
      `${informing.length} class C/D quantity famil${informing.length === 1 ? 'y informs' : 'ies inform'} but do${informing.length === 1 ? 'es' : ''} not vote (${informing.join(', ')}; rule ${rule})`;
  }
  const dissentMin = isNum(p.tiers.extreme_tier_informing_dissent_min_abs) ? p.tiers.extreme_tier_informing_dissent_min_abs : null;
  const informingDissent = dissentMin === null ? [] : (base.informing_families || []).filter((f) => Math.abs(f.signal) >= dissentMin && (isNum(base.N) ? sign(f.signal) !== sign(base.N) : true)).map((f) => f.id);
  return {
    id: nodeId,
    tier: final.tier,
    tier_subreason: final.subreason,
    tier_reason: final.reason,
    ...cannotTellInfo({ tier: final.tier, tier_subreason: final.subreason, C: base.C, N: base.N, tests }, p),
    blockers: final.blockers,
    N: base.N,
    N_weights: base.test_weights,
    C: base.C,
    E: base.E,
    E_all: base.E_all,
    E_informing: base.E_informing,
    R: base.R,
    F,
    AB_count: base.AB_count,
    AB_pos: base.AB_pos,
    tests,
    price_test_note: priceTestNote,
    informing: informing.slice(),
    informing_dissent: informingDissent,
    families: publicFamilies(base.families, informing, base.camels_informing || []),
    tier_by_set: tierBySet,
    fragility: { across_sets: fragileSets, leave_one_family_out: fragileLofo, sets_compared: compared },
    load_bearing: loadBearing.sort(),
    sub_nodes: null,
    top_split_override: false,
  };
}

/**
 * Top-split override (engine spec 3.7, Workbook 6.1; extended in rubric v0.1.2): a finance node
 * at likely_binding is downgraded to candidate with `top_split_override: true` when the top-split
 * row is low_demand, or (params.top_split.override_when_rate_low) when the real lending rate is
 * classified 'low' in any row, unless IC.FRM.CRDC.FL.ZS has signal +2 (Class A rationing
 * override, logged in `top_split_note`). `topSplit` may be the row id (v0.1) or the top-split
 * object ({row, classification}). Mutates and returns the node.
 */
export function applyTopSplitOverride(node, topSplit, rationingSignal, params = null) {
  node.top_split_override = false;
  const row = typeof topSplit === 'string' ? topSplit : topSplit && topSplit.row;
  const rate = topSplit && typeof topSplit === 'object' && topSplit.classification ? topSplit.classification.rate : null;
  const rateLow = !!(params && params.top_split && params.top_split.override_when_rate_low && rate === 'low');
  if (node.tier !== 'likely_binding' || !(row === 'low_demand' || rateLow)) return node;
  const why = row === 'low_demand' ? `the top-split row is low_demand` : `the real lending rate reads low in the top split (row ${row})`;
  if (rationingSignal === 2) {
    node.top_split_note = `${why} but the Class A rationing override applies: IC.FRM.CRDC.FL.ZS signal = +2, so likely_binding stands`;
    return node;
  }
  node.tier = 'candidate';
  node.top_split_override = true;
  node.top_split_override_row = row;
  node.tier_reason =
    `candidate (downgraded from likely_binding by the top split): ${why}, so a finance node cannot be likely binding ` +
    `without Class A rationing evidence (IC.FRM.CRDC.FL.ZS signal = ${isNum(rationingSignal) ? rationingSignal : 'n/a'}, needs +2). Original: ${node.tier_reason}`;
  return node;
}

function subreasonLabel(sr) {
  switch (sr) {
    case 'conflicting': return 'conflicting';
    case 'weak': return 'weak';
    case 'composite_only': return 'composite indices only';
    case 'stale': return 'stale';
    case 'connector_not_built': return 'connector not built';
    case 'no_ab_family': return 'no class A/B family in registry';
    case 'no_ab_price_family': return 'no class A/B price in registry';
    case 'registry_coverage': return 'registry coverage (too few voting families)';
    case 'data_gap': return 'data gap';
    default: return sr || 'data gap';
  }
}

/**
 * Roll-up node (N11): tier = most binding sub-node tier on the ordinal scale (cannot_tell = 0).
 * Ties among the cannot_tell tiers are broken by evidence (v0.1.2): conflicting before weak before
 * data gap, then the sub-node with more voting families, then the higher N, then registry order
 * (under v0.1.1 the higher N won, so a one-indicator class C sub-node could represent N11 over
 * sub-nodes holding class A/B evidence). E, AB_count and AB_pos count DISTINCT families across
 * the sub-nodes (es_tax_gifts and es_informality are shared by two sub-nodes each). The roll-up
 * carries its own reason, grouping the sub-nodes by tier, and the representative's sub-reason.
 * `params` (engine 0.1.5) only sets the band of the cannot_tell lean.
 */
export function rollupNode(def, subRecords, params = null) {
  const subs = subRecords.filter(Boolean);
  const key = (r) => [ordinal(r.tier), CANNOT_TELL_RANK[r.tier] ?? 0, isNum(r.E) ? r.E : -1, isNum(r.N) ? r.N : -Infinity];
  let best = null;
  for (const r of subs) {
    if (!best) {
      best = r;
      continue;
    }
    const a = key(r);
    const b = key(best);
    for (let i = 0; i < a.length; i++) {
      if (a[i] > b[i]) {
        best = r;
        break;
      }
      if (a[i] < b[i]) break;
    }
  }
  const sets = best ? Object.keys(best.tier_by_set) : [];
  const tierBySet = {};
  for (const s of sets) {
    let o = -Infinity;
    let t = null;
    for (const r of subs) {
      const rt = r.tier_by_set[s];
      if (ordinal(rt) > o) {
        o = ordinal(rt);
        t = rt;
      }
    }
    tierBySet[s] = t;
  }
  let R = null;
  for (const r of subs) if (isNum(r.R) && (R === null || r.R > R)) R = r.R;
  // distinct families across sub-nodes
  const haveFamilies = subs.some((r) => Array.isArray(r.families));
  const votingIds = new Set();
  const informingIds = new Set();
  const ab = new Map();
  for (const r of subs) {
    for (const f of r.families || []) {
      if (f.votes === false) informingIds.add(f.id);
      else votingIds.add(f.id);
      if (f.class === 'A' || f.class === 'B') ab.set(f.id, Math.max(ab.get(f.id) ?? -Infinity, f.signal));
    }
  }
  for (const id of votingIds) informingIds.delete(id);
  const E = haveFamilies ? votingIds.size : subs.reduce((a, r) => a + r.E, 0);
  const AB_count = haveFamilies ? ab.size : subs.reduce((a, r) => a + r.AB_count, 0);
  const AB_pos = haveFamilies ? [...ab.values()].filter((s) => s >= 1).length : subs.reduce((a, r) => a + r.AB_pos, 0);
  // grouped description of the sub-nodes
  const groups = new Map();
  for (const r of subs) {
    const g = r.tier.startsWith('cannot_tell') ? subreasonLabel(r.tier_subreason) : r.tier;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r.id.replace(/^N11\./, ''));
  }
  const grouped = [...groups.entries()].map(([g, ids]) => `${g} (${ids.join(', ')})`).join('; ');
  let subreason = best ? best.tier_subreason : 'data_gap';
  if (best && best.tier === 'cannot_tell_data_gap') {
    // the sub-reason that more data for this economy could resolve wins
    let bestRank = -1;
    for (const r of subs) {
      if (r.tier !== 'cannot_tell_data_gap') continue;
      const rk = DATA_GAP_SUBREASON_RANK[r.tier_subreason] ?? 0;
      if (rk > bestRank) {
        bestRank = rk;
        subreason = r.tier_subreason;
      }
    }
  }
  const reason = best
    ? `roll-up of ${subs.length} sub-nodes: ${grouped}. Representative: ${best.id} (${best.tier}${best.tier_subreason ? `: ${subreasonLabel(best.tier_subreason)}` : ''}). ${best.id}: ${best.tier_reason}`
    : 'roll-up: no scored sub-node';
  const tier = best ? best.tier : 'cannot_tell_data_gap';
  return {
    id: def.id,
    tier,
    tier_subreason: subreason,
    tier_reason: reason,
    ...cannotTellInfo({ tier, tier_subreason: subreason, C: best ? best.C : 0, N: best ? best.N : null, tests: best ? best.tests : {} }, params),
    blockers: best ? best.blockers : { likely_binding: [], ruled_out: [] },
    N: best ? best.N : null,
    N_weights: best ? best.N_weights || null : null,
    C: best ? best.C : 0,
    E,
    E_informing: informingIds.size,
    R,
    F: Math.max(0, ...subs.map((r) => r.F)),
    AB_count,
    AB_pos,
    tests: best ? best.tests : { price: null, changes: null, circumvention: null, camels: null },
    price_test_note: best ? best.price_test_note || null : null,
    informing: [...informingIds].sort(),
    informing_dissent: uniq(subs.flatMap((r) => r.informing_dissent || [])).sort(),
    families: [],
    tier_by_set: tierBySet,
    fragility: best ? best.fragility : null,
    load_bearing: uniq(subs.flatMap((r) => r.load_bearing)).sort(),
    sub_nodes: subs.map((r) => r.id),
    sub_node_tiers: Object.fromEntries(subs.map((r) => [r.id, { tier: r.tier, subreason: r.tier_subreason, N: r.N, E: r.E }])),
    rollup_from: best ? best.id : null,
    top_split_override: false,
  };
}

/**
 * Ranking: candidate and likely_binding top-level nodes ordered by N × breadth
 * (breadth = 1.0 in the prototype), ties broken by node id.
 */
export function rankNodes(records, breadth = {}) {
  const eligible = records.filter((r) => r.tier === 'candidate' || r.tier === 'likely_binding');
  const scores = {};
  for (const r of eligible) scores[r.id] = r.N * (isNum(breadth[r.id]) ? breadth[r.id] : 1.0);
  const ordered = eligible.map((r) => r.id).sort((a, b) => scores[b] - scores[a] || cmp(a, b));
  return { ordered, scores };
}

/**
 * Statements for the Desk, over top-level nodes in tree order (look_hard in ranking order).
 * N13 (desk_undiagnosable) and N12 (elimination, engine 0.1.5) are listed under cannot_tell.
 */
export function statements(records, ranking) {
  const stop = [];
  const cannot = [];
  for (const r of records) {
    if (r.tier === 'ruled_out' || r.tier === 'probably_not') stop.push(r.id);
    else if (r.tier && (r.tier.startsWith('cannot_tell') || r.tier === 'desk_undiagnosable' || r.tier === 'elimination')) cannot.push(r.id);
  }
  return { stop_arguing: stop, look_hard: ranking.ordered.slice(), cannot_tell: cannot };
}

/**
 * Bootstrap rank stability. nodeInputs: {leafNodeId: {familiesBySet, setsWithMembers}};
 * rollups: {rollupNodeId: {def, subIds}}; topLevelIds: node ids that rank (sub-nodes excluded).
 * Each draw: thresholds scaled by a uniform factor in [1 − p, 1 + p]; a random comparator set
 * among those with members; a random bootstrap_subset_share of each node's VOTING families
 * (v0.1.2: never fewer than E_below of them, so a node with E_below voting families is kept
 * whole and reported under `not_resampled`; informing families are always kept); tiers
 * evaluated (fragility across sets); candidates ranked by N.
 * Returns {draws, modal_rank, p_top_k, p_ranked, rank_counts, not_resampled}.
 */
export function bootstrapRanks({ nodeInputs, rollups, topLevelIds, params, snapshotYear, connectorsNotBuilt, connectorFamiliesByNode, registryABByNode = null, registryABPriceByNode = null, registryVotingMaxByNode = null, ruledOutRequiresByNode = null, seed }) {
  const rk = params.ranking;
  const eBelow = params.tiers.cannot_tell_data_gap.E_below;
  const rng = mulberry32(seed >>> 0);
  const draws = rk.bootstrap_draws;
  const counts = {};
  for (const id of topLevelIds) counts[id] = {};
  const leafIds = Object.keys(nodeInputs);
  // voting family ids per node and set (the subset is drawn from these)
  const votingBySet = {};
  const resampled = {};
  for (const id of leafIds) {
    votingBySet[id] = {};
    resampled[id] = false;
    for (const s of Object.keys(nodeInputs[id].familiesBySet)) {
      votingBySet[id][s] = nodeStats(nodeInputs[id].familiesBySet[s] || [], params).voting_ids.slice().sort();
    }
  }
  for (let d = 0; d < draws; d++) {
    const factor = 1 - rk.threshold_perturbation + 2 * rk.threshold_perturbation * rng();
    const evaluated = {};
    for (const id of leafIds) {
      const inp = nodeInputs[id];
      const setNames = Object.keys(inp.familiesBySet);
      const withMembers = (inp.setsWithMembers || setNames).filter((s) => setNames.includes(s));
      const pool = withMembers.length ? withMembers : setNames;
      const set = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
      const famIds = votingBySet[id][set] || [];
      const n = famIds.length;
      const keepN = n <= eBelow ? n : Math.max(eBelow, Math.round(rk.bootstrap_subset_share * n));
      if (keepN < n) resampled[id] = true;
      const keep = new Set(shuffle(famIds, rng).slice(0, keepN));
      const dropped = new Set(famIds.filter((f) => !keep.has(f)));
      const sub = {};
      for (const s of setNames) sub[s] = (inp.familiesBySet[s] || []).filter((f) => !dropped.has(f.id));
      evaluated[id] = evaluateNode({
        nodeId: id,
        familiesBySet: sub,
        activeSet: set,
        setsWithMembers: withMembers,
        params,
        snapshotYear,
        connectorsNotBuilt,
        connectorFamilies: connectorFamiliesByNode ? connectorFamiliesByNode[id] : [],
        registryAB: registryABByNode ? registryABByNode[id] || [] : null,
        registryABPrice: registryABPriceByNode ? registryABPriceByNode[id] || [] : null,
        registryVotingMax: registryVotingMaxByNode ? registryVotingMaxByNode[id] ?? null : null,
        ruledOutRequires: ruledOutRequiresByNode ? ruledOutRequiresByNode[id] || [] : [],
        thresholdFactor: factor,
        fragility: 'sets',
      });
    }
    for (const [rid, r] of Object.entries(rollups || {})) {
      evaluated[rid] = rollupNode(r.def, r.subIds.map((s) => evaluated[s]), params);
    }
    const top = topLevelIds.map((id) => evaluated[id]).filter(Boolean);
    const { ordered } = rankNodes(top);
    ordered.forEach((id, i) => {
      const rank = i + 1;
      counts[id][rank] = (counts[id][rank] || 0) + 1;
    });
  }
  const modal = {};
  const pTop = {};
  const pRanked = {};
  for (const id of topLevelIds) {
    const c = counts[id];
    let best = null;
    let bestCount = -1;
    let ranked = 0;
    let top = 0;
    for (const [rankStr, n] of Object.entries(c)) {
      const rank = Number(rankStr);
      ranked += n;
      if (rank <= rk.top_k) top += n;
      if (n > bestCount || (n === bestCount && rank < best)) {
        best = rank;
        bestCount = n;
      }
    }
    modal[id] = best;
    pTop[id] = draws ? top / draws : 0;
    pRanked[id] = draws ? ranked / draws : 0;
  }
  const notResampled = topLevelIds.filter((id) => {
    if (rollups && rollups[id]) return rollups[id].subIds.every((s) => resampled[s] === false);
    return resampled[id] === false;
  });
  return { draws, modal_rank: modal, p_top_k: pTop, p_ranked: pRanked, rank_counts: counts, not_resampled: notResampled };
}

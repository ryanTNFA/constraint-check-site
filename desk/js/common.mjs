// @ts-check
// Shared helpers for the Desk. Pure ES module, no dependencies.

export const TIER_ORDER = ['likely_binding', 'candidate', 'cannot_tell_conflicting', 'cannot_tell_weak', 'cannot_tell_data_gap', 'probably_not', 'ruled_out',
  'desk_undiagnosable'];
export const TIER_LABEL = {
  likely_binding: 'Likely binding',
  candidate: 'Candidate',
  cannot_tell_conflicting: 'Cannot tell: conflicting',
  cannot_tell_weak: 'Cannot tell: weak evidence',
  cannot_tell_data_gap: 'Cannot tell: data gap',
  probably_not: 'Probably not binding',
  ruled_out: 'Ruled out',
  desk_undiagnosable: 'Not diagnosable from the desk',
  context_only: 'Context, not a constraint',
  elimination: 'Judged by elimination',
};
export const TIER_ORD = { ruled_out: -2, probably_not: -1, cannot_tell_data_gap: 0, cannot_tell_conflicting: 0, cannot_tell_weak: 0, desk_undiagnosable: 0,
  context_only: 0, elimination: 0, candidate: 1, likely_binding: 2 };

/**
 * The first decision (N0) is the fork at the root of the tree, not an area: its four tests are the finance tests, so its
 * score is the finance side's. A positive score says credit is dear or rationed (the finance branch); a negative one says
 * finance is cheap and available, which is the low-returns branch. Its tier is therefore a direction, never a constraint
 * rating (both sides are constraints), and every page words it with FORK_WORDS (Ryan, 6 November 2026).
 */
export const FORK = 'N0';
export const FORK_WORDS = {
  likely_binding: 'Points to costly finance',
  candidate: 'Leans to finance',
  cannot_tell_conflicting: 'Cannot tell which side: conflicting',
  cannot_tell_weak: 'Cannot tell which side',
  cannot_tell_data_gap: 'Cannot tell which side: data gap',
  probably_not: 'Leans to low returns',
  ruled_out: 'Points to low returns',
};
/** The branch the first decision points to: 'finance', 'returns', or null when it cannot tell. @param {string | null | undefined} tier */
export function forkSideOf(tier) {
  if (tier === 'candidate' || tier === 'likely_binding') return 'finance';
  if (tier === 'probably_not' || tier === 'ruled_out') return 'returns';
  return null;
}
/** The first decision's tier in words. @param {string | null | undefined} tier */
export function forkWords(tier) { return (tier && FORK_WORDS[tier]) || tierLabel(tier); }
/** The engine's label for a node's tier, with the fork worded as a direction. @param {string} id @param {string | null | undefined} tier */
export function tierLabelOf(id, tier) { return id === FORK ? forkWords(tier) : tierLabel(tier); }

/** Where the Desk data lives. Override with ?data=/out/desk-data to view another output folder. */
export function dataBase() {
  const p = new URLSearchParams(location.search).get('data');
  if (p && /^\/[A-Za-z0-9_\-./]*$/.test(p) && !p.includes('..')) return p.replace(/\/$/, '');
  return '/growth-test-site/desk/data';
}
/** Keep the data= switch on internal links. */
export function withData(url) {
  const p = new URLSearchParams(location.search).get('data');
  if (!p || dataBase() === '/growth-test-site/desk/data') return url;
  return `${url}${url.includes('?') ? '&' : '?'}data=${encodeURIComponent(p)}`;
}

/** Normalize growth_problem G-statistics across the engine's shape and the spec sketch. */
export function gNorm(g = {}) {
  const G1 = g.G1 || {}, G2 = g.G2 || {}, G3 = g.G3 || {}, G4 = g.G4 || {}, G5 = g.G5 || {}, G6 = g.G6 || {};
  const G7 = g.G7 || {}, G10 = g.G10 || {}, G11 = g.G11 || {}, G12 = g.G12 || {};
  const first = (...xs) => { const f = xs.find((x) => x !== undefined && x !== null); return f === undefined ? null : f; };
  const ic = (o) => (o && o.icr ? o.icr : o && o.t != null ? { t: o.t, percentile: o.percentile } : null);
  const stat = (o) => ({ id: o && o.id ? o.id : null, value: first(o && o.value_ref, o && o.value), year: first(o && o.year_ref, o && o.year),
    t: ic(o) ? first(ic(o).t) : null, percentile: ic(o) ? first(ic(o).percentile) : null });
  return {
    g1: { avg10: first(G1.avg_10y, G1.avg10), avg20: first(G1.avg_20y, G1.avg20), peers10: first(G1.structural_median_10y, G1.peers_median10),
      peers20: first(G1.structural_median_20y, G1.peers_median20), region10: first(G1.region_median_10y, G1.region_median10),
      region20: first(G1.region_median_20y, G1.region_median20), rank: first(G1.rank_in_structural), n: first(G1.structural_n, G1.n_structural),
      years10: G1.years_10y || null },
    g2: { t: first(G2.t), residual: first(G2.residual_pp, G2.residual), n: first(G2.n), method: G2.method || '' },
    g3: { peakYear: first(G3.peak_year), peakValue: first(G3.peak_value), latestYear: first(G3.latest_year), latestValue: first(G3.latest_value),
      yearsSince: first(G3.years_since_peak), shortfall: first(G3.shortfall_pct) },
    g4: { reported: !!G4.reported, breakYear: first(G4.break_year), change: first(G4.change_pp), before: first(G4.mean_before), after: first(G4.mean_after),
      method: G4.method || '', direction: G4.direction || null },
    g5: { sd: first(G5.sd), peers: first(G5.structural_median_sd, G5.peers_median_sd), pct: first(G5.universe_percentile, G5.percentile_universe),
      window: first(G5.window_years) },
    g6: { ...stat(G6), split: G6.private_split || '' },
    g7: { savings: stat(G7.savings), cab: stat(G7.current_account), fdi: stat(G7.fdi) },
    g10: { exports: stat(G10.exports), eci: stat(G10.complexity || G10.eci) },
    g11: stat(G11),
    g12: G12,
  };
}

/** The kinds of cannot_tell_data_gap the engine distinguishes (tier_subreason), with a short label and what would resolve them. */
export const DATA_GAP_KINDS = {
  data_gap: { label: 'data gap', resolves: 'more recent data for this economy' },
  stale: { label: 'evidence too old', resolves: 'a newer observation of the class A/B family' },
  connector_not_built: { label: 'connector not built', resolves: 'a connector for the Workbook family (no economy can be scored here yet)' },
  no_ab_family: { label: 'no class A/B evidence in registry v0.1', resolves: 'a class A/B indicator in the registry (no economy can leave cannot tell here)' },
  no_ab_price_family: { label: 'no class A/B price in registry', resolves: 'a class A/B price indicator in the registry (the price is never observed here)' },
  registry_coverage: { label: 'registry coverage: too few voting families',
    resolves: 'more high-quality (class A/B) evidence in the tool: today it cannot supply enough independent measures for this area' },
};
/** True when the sub-reason is a statement about the registry, not about this economy's data. */
export const isRegistryGap = (sub) => sub === 'no_ab_family' || sub === 'no_ab_price_family' || sub === 'registry_coverage' || sub === 'connector_not_built';

/** Short label for a tier sub-reason. */
export function subreasonLabel(sub) {
  if (!sub) return '';
  if (DATA_GAP_KINDS[sub]) return DATA_GAP_KINDS[sub].label;
  if (sub === 'conflicting') return 'conflicting tests';
  if (sub === 'weak') return 'weak evidence';
  if (sub === 'composite_only') return 'composite indices only';
  if (sub === 'main') return 'main rule';
  if (sub === 'alt') return 'alternative rule (N ≥ 1)';
  return String(sub).replace(/_/g, ' ');
}

/**
 * The four plain reasons behind "cannot tell" (front-door PRD W1). The engine (0.1.5) writes the code on
 * every cannot_tell node as `cannot_tell_reason`; cannotTellCode falls back to the tier for older files
 * and for ratings shown under another comparator set, where the engine's code describes the structural set.
 */
export const CANNOT_TELL_PLAIN = {
  not_connected: { label: 'not connected yet', short: 'Not connected', gapInTool: true },
  no_recent_data: { label: 'no recent data', short: 'No recent data', gapInTool: false },
  one_kind: { label: 'one kind of evidence', short: 'One kind of evidence', gapInTool: false },
  mixed: { label: 'evidence points both ways', short: 'Mixed', gapInTool: false },
};
/**
 * The plain reason code of a cannot-tell node (CANNOT_TELL_PLAIN key), or null for any other tier.
 * @param {any} n a node of the scorecard
 * @returns {string | null}
 */
export function cannotTellCode(n) {
  if (!n || !isCannotTell(n.tier)) return null;
  if (n.cannot_tell_reason && CANNOT_TELL_PLAIN[n.cannot_tell_reason]) return n.cannot_tell_reason;
  const sub = n.tier_subreason || n.cannot_tell_subreason || null;
  if (n.tier === 'cannot_tell_data_gap') return isRegistryGap(sub) ? 'not_connected' : 'no_recent_data';
  if (n.tier === 'cannot_tell_conflicting') return 'mixed';
  const sp = Object.values(n.tests || {}).filter((t) => t && typeof t.T === 'number' && Math.abs(t.T) >= 0.5).map((t) => t.T);
  if (sp.some((T) => T > 0) && sp.some((T) => T < 0)) return 'mixed'; // engine 0.1.7: speaking tests on both sides
  return (n.C ?? 0) >= 2 ? 'mixed' : 'one_kind';
}
/**
 * The lean of an unclear area, for a mark that cannot be mistaken for a verdict: an arrow, never a fill.
 * For "one kind of evidence" cells the engine's lean (sign of N, slight under 0.5); for N12 the
 * elimination lean. Returns {direction: 'toward'|'away', band: 'slight'|'clear', mark, words} or null.
 */
export function leanOf(n) {
  if (!n) return null;
  let direction = null, band = 'slight';
  if (n.tier === 'elimination' && n.elimination) {
    if (n.elimination.direction === 'none') return null;
    direction = n.elimination.direction;
    const strong = Math.abs(n.elimination.weighted_mean ?? 0) >= 0.5;
    band = strong && (direction === 'toward' ? n.elimination.away === 0 : n.elimination.toward === 0) ? 'clear' : 'slight';
  } else if (cannotTellCode(n) === 'one_kind') {
    const l = n.cannot_tell_detail && n.cannot_tell_detail.lean;
    if (l) { direction = l.direction; band = l.band; }
    else if (n.N != null && n.N !== 0) { direction = n.N > 0 ? 'toward' : 'away'; band = Math.abs(n.N) >= 0.5 ? 'clear' : 'slight'; }
  }
  if (!direction) return null;
  const mark = direction === 'toward' ? (band === 'clear' ? '↑' : '↗') : (band === 'clear' ? '↓' : '↘');
  return { direction, band, mark, words: `${band === 'clear' ? 'leans' : 'leans slightly'} ${direction === 'toward' ? 'toward' : 'away from'} a problem` };
}

/** Short clause for why a node is "cannot tell" (works with engine `tier_subreason` and the older mock field). */
export function reasonClause(n) {
  if (!n) return '';
  if (n.tier === 'desk_undiagnosable') return 'sector work required';
  if (n.tier === 'context_only') return 'context, not a constraint';
  if (n.tier === 'elimination') return 'judged by elimination';
  const code = cannotTellCode(n);
  if (code) return CANNOT_TELL_PLAIN[code].label;
  return tierLabel(n.tier).toLowerCase();
}
/** The reason clause only when it says more than the tier badge already does. */
export function reasonClauseExtra(n) {
  if (!n) return '';
  const code = cannotTellCode(n);
  if (!code) return '';
  const lean = leanOf(n);
  return `${CANNOT_TELL_PLAIN[code].label}${lean ? `; ${lean.words}` : ''}`;
}
export const USER_TIERS = ['likely_binding', 'candidate', 'cannot_tell_conflicting', 'cannot_tell_weak', 'cannot_tell_data_gap', 'probably_not', 'ruled_out'];
export const TEST_ORDER = ['price', 'changes', 'circumvention', 'camels'];
export const TEST_NUM = { price: 1, changes: 2, circumvention: 3, camels: 4 };

/** True for the three cannot-tell tiers. @param {string | null | undefined} t */
export const isCannotTell = (t) => typeof t === 'string' && t.startsWith('cannot_tell');
/** The engine's label for a tier ('—' for none). @param {string | null | undefined} t */
export const tierLabel = (t) => TIER_LABEL[t] || (t ? t.replace(/_/g, ' ') : '—');
/** The CSS class for a tier: t-<tier>, t-context for none. @param {string | null | undefined} t */
export const tierClass = (t) => `t-${t || 'context'}`;

/** SVG fill and ink for a tier; hatch patterns are defined by the tree renderer. */
export function tierPaint(tier) {
  switch (tier) {
    case 'likely_binding': return { fill: 'var(--tier-binding)', ink: 'var(--tier-binding-ink)' };
    case 'candidate': return { fill: 'var(--tier-candidate)', ink: 'var(--tier-candidate-ink)' };
    case 'probably_not': return { fill: 'var(--tier-probnot)', ink: 'var(--tier-probnot-ink)' };
    case 'ruled_out': return { fill: 'var(--tier-ruled)', ink: 'var(--tier-ruled-ink)' };
    case 'cannot_tell_weak': return { fill: 'url(#hatch)', ink: 'var(--tier-cannot-ink)' };
    case 'cannot_tell_conflicting': return { fill: 'url(#crosshatch)', ink: 'var(--tier-cannot-ink)' };
    case 'cannot_tell_data_gap': return { fill: 'var(--tier-cannot)', ink: 'var(--tier-cannot-ink)', dash: true };
    default: return { fill: 'var(--tier-context)', ink: 'var(--tier-context-ink)' };
  }
}

/**
 * Fetch a JSON file, uncached. With optional, a missing or unreachable file is null instead of a throw.
 * @param {string} url
 * @param {{optional?: boolean}} [opts]
 * @returns {Promise<any>}
 */
export async function getJSON(url, { optional = false } = {}) {
  let r;
  try { r = await fetch(url, { cache: 'no-store' }); }
  catch (e) { if (optional) return null; throw new Error(`${url}: ${e.message}`); }
  if (!r.ok) { if (optional) return null; throw new Error(`${url}: HTTP ${r.status}`); }
  return r.json();
}

/**
 * The registry the pages read: indicators, nodes and params, with lookups by id and the connectors not built.
 * @returns {Promise<{indicators: any, nodes: any, params: any, indicatorById: Record<string, any>, nodeById: Record<string, any>, connectorsNotBuilt: any[]}>}
 */
export async function loadRegistry() {
  const [indicators, nodes, params] = await Promise.all([
    getJSON('/growth-test-site/registry/indicators.json'), getJSON('/growth-test-site/registry/nodes.json'), getJSON('/growth-test-site/registry/params.json'),
  ]);
  return {
    indicators, nodes, params,
    indicatorById: Object.fromEntries(indicators.indicators.map((i) => [i.id, i])),
    nodeById: Object.fromEntries(nodes.nodes.map((n) => [n.id, n])),
    connectorsNotBuilt: (indicators.connectors_not_built && indicators.connectors_not_built.families) || [],
  };
}

// ---------- formatting ----------
const MINUS = '−';
/**
 * A number for display: thousands separated, d decimals below 1,000, a true minus sign; '—' for nothing.
 * @param {number | string | null | undefined} x
 * @param {number} [d] decimal places
 * @returns {string}
 */
export function fmt(x, d = 2) {
  if (x == null || Number.isNaN(x)) return '—';
  if (typeof x !== 'number') return String(x);
  const abs = Math.abs(x);
  let s;
  if (abs >= 100000) s = x.toLocaleString('en-US', { maximumFractionDigits: 0 });
  else if (abs >= 1000) s = x.toLocaleString('en-US', { maximumFractionDigits: Math.min(d, 1) });
  else s = x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  return s.replace(/-/g, MINUS);
}
/** fmt() with an explicit sign (+1.20, −0.40). @param {number | null | undefined} x @param {number} [d] @returns {string} */
export function fmtSigned(x, d = 2) {
  if (x == null || Number.isNaN(x)) return '—';
  const s = fmt(Math.abs(x), d);
  return x > 0 ? `+${s}` : x < 0 ? `${MINUS}${s}` : s;
}
/** A whole number for display, a true minus sign; '—' for nothing. @param {number | null | undefined} x @returns {string} */
export function fmtInt(x) { return x == null ? '—' : Math.round(x).toLocaleString('en-US').replace(/-/g, MINUS); }
/** A signal (−2 to +2) to two decimals with its sign. @param {number | null | undefined} s @returns {string} */
export function fmtSignal(s) {
  if (s == null) return '—';
  const v = Math.round(s * 100) / 100;
  return v > 0 ? `+${v}` : v < 0 ? `${MINUS}${Math.abs(v)}` : '0';
}
/** Decimal places that suit an indicator value. */
export function decimalsFor(ind, v) {
  if (v == null) return 2;
  const a = Math.abs(v);
  if (ind && ind.id && /HCI\.OVRL|EST$|ECI|CROWDING|RATIO|LPI/.test(ind.id)) return 2;
  if (a >= 1000) return 0;
  if (a >= 100) return 1;
  if (a >= 10) return 1;
  return 2;
}
/** An indicator value with the decimals that suit it (decimalsFor). @param {any} ind the indicator @param {number | null | undefined} v @returns {string} */
export function fmtValue(ind, v) { return fmt(v, decimalsFor(ind, v)); }

/** HTML-escape a string (&, <, >, ", '). @param {unknown} s @returns {string} */
export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/**
 * Tiny element builder. attrs: class, dataset, on<event> (a listener), anything else as an attribute; null, undefined
 * and false attributes are skipped. Children are nodes or text (never markup: there is no html: attribute, so a
 * narrative string cannot inject elements; C10). Nested arrays are flattened.
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...any} children
 * @returns {HTMLElement & {[prop: string]: any}} the element; callers set tag-specific properties (href, value) on it
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

// ---------- theme ----------
/** Apply the saved theme (auto, light or dark) and wire the shell's Theme button. The choice is the one thing kept in browser storage. */
export function initTheme() {
  const btn = document.getElementById('theme-toggle');
  const root = document.documentElement;
  const read = () => { try { return localStorage.getItem('desk-theme') || 'auto'; } catch { return 'auto'; } };
  const apply = (mode) => {
    if (mode === 'light' || mode === 'dark') root.setAttribute('data-theme', mode); else root.removeAttribute('data-theme');
    if (btn) btn.textContent = `Theme: ${mode[0].toUpperCase()}${mode.slice(1)}`;
    try { if (mode === 'auto') localStorage.removeItem('desk-theme'); else localStorage.setItem('desk-theme', mode); } catch { /* ignore */ }
  };
  apply(read());
  if (btn) btn.addEventListener('click', () => { const order = ['auto', 'light', 'dark']; apply(order[(order.indexOf(read()) + 1) % order.length]); });
}

// ---------- evidence settings (front-door PRD W4, rubric 0.1.8) ----------
export const SETTINGS = ['cautious', 'standard', 'exploratory'];
export const SETTING_LABEL = { cautious: 'Cautious', standard: 'Standard', exploratory: 'Exploratory' };
export const SETTING_HINT = {
  cautious: 'Harder to rate anything: three independent measures and stronger scores needed.',
  standard: 'The default, and the only reading to cite.',
  exploratory: 'Easier to flag an area for a closer look; never easier to rule one out.',
};
/** The evidence setting in the page link (#setting=); Standard when absent or unknown. */
export function currentSetting() {
  const s = readHash().get(HASH.setting);
  return SETTINGS.includes(s) ? s : 'standard';
}
/** Plain words for the engine's robustness mark (W4, Q7: one mark, detail on hover). */
export const ROBUST_PLAIN = {
  holds: 'Holds under every reading',
  depends_on_setting: 'Depends on the reading',
  depends_on_comparators: 'Depends on the comparison countries',
};
/**
 * The robustness detail on hover: the rating under each reading, and whether the comparators change it.
 * @param {any} n a node of the scorecard
 * @param {(tier: string) => string} plain plain words for a tier
 * @returns {string}
 */
export function robustDetail(n, plain) {
  if (!n || !n.robustness) return '';
  const by = n.tier_by_setting || {};
  const parts = SETTINGS.filter((s) => by[s]).map((s) => `${SETTING_LABEL[s]} reading → ${plain(by[s]).toLowerCase().replace(/^unclear: /, 'unclear ' +
    '(').replace(/^(unclear \(.*)$/, '$1)')}`);
  const extra = n.robustness.comparators_differ ? ' The rating also changes with the choice of comparison countries.' : '';
  return `${parts.join(' · ')}.${extra}`;
}

// ---------- URL hash state (reproducible links): the one reader and writer of location.hash ----------
// Growth Test PRD, Part 6C, C4. No other module touches location.hash or history: they call readHash, writeHash,
// setHashKeys or currentHash, and listen for 'desk-hash' (dispatched by writeHash) or 'hashchange' (the browser's
// own event, for back and forward) to redraw.
/** The hash keys, by what they hold. The country pages' state, the top bar's setting, teaching mode, the Analyst View's chart choices. */
export const HASH = {
  set: 'set', peers: 'peers', overrides: 'o', setting: 'setting', lesson: 'lesson', predict: 'predict',
  fit: 'fit', asof: 'asof', add: 'add', label: 'label', yrs: 'yrs', view: 'view', peerlines: 'peerlines', since: 'since', measure: 'measure',
  pqp: 'pqp', pqq: 'pqq', pqaxes: 'pqaxes',
};
/** The keys that follow the user from tab to tab (shell.mjs): only what every country page understands. */
export const CARRIED_KEYS = [HASH.set, HASH.peers, HASH.overrides, HASH.setting, HASH.lesson, HASH.predict];
/** Teaching mode's keys (lesson.mjs): a page rewriting its state must not drop them. */
export const TEACHING_KEYS = [HASH.lesson, HASH.predict];
/** The hash as URLSearchParams. */
export function readHash() { return new URLSearchParams(location.hash.replace(/^#/, '')); }
/** The hash as a string to append to a link ('' when empty). */
export function currentHash() { return hashString(readHash()); }
function hashString(p) { const s = p.toString(); return s ? `#${s}` : ''; }
/**
 * Write the hash from URLSearchParams (or a plain object), keeping the path and the query unless `query` replaces it.
 * replaceState by default (no history entry); `push` adds one when the URL changes. Either way the page hears about it:
 * writeHash dispatches 'desk-hash' on window with {hash, params}, since replaceState fires no hashchange.
 */
export function writeHash(params, { push = false, query = null } = {}) {
  const p = params instanceof URLSearchParams ? params : new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v != null && v !== false).map(([k,
    v]) => [k, String(v)]));
  const url = location.pathname + (query == null ? location.search : query) + hashString(p);
  if (push && url !== location.pathname + location.search + location.hash) history.pushState(null, '', url);
  else history.replaceState(null, '', url);
  window.dispatchEvent(new CustomEvent('desk-hash', { detail: { hash: location.hash, params: p } }));
}
/** Set (or with null, delete) a few keys of the hash, leaving the rest as they are. */
export function setHashKeys(changes) {
  const p = readHash();
  for (const [k, v] of Object.entries(changes)) { if (v == null || v === '' || v === false) p.delete(k); else p.set(k, String(v)); }
  writeHash(p);
}
/** The country pages' state from the hash: comparison set, edited peers, overrides and the evidence setting. */
export function parseHash() {
  const p = readHash();
  const out = { set: p.get(HASH.set) || null, peers: null, overrides: {}, setting: SETTINGS.includes(p.get(HASH.setting)) ? p.get(HASH.setting) : 'standard' };
  const peers = p.get(HASH.peers);
  if (peers != null) out.peers = peers.split(',').map((s) => s.trim()).filter(Boolean);
  const o = p.get(HASH.overrides);
  if (o) {
    for (const part of o.split('|')) {
      const [node, tier, note] = part.split(':');
      if (node && tier && USER_TIERS.includes(tier)) out.overrides[node] = { tier, note: safeDecode(note || '') };
    }
  }
  return out;
}
function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s; } }
/** Write the country pages' state to the hash (the inverse of parseHash); other keys the page does not own are kept. */
export function writeState(state) {
  const p = new URLSearchParams();
  const set = state.activeSet || state.set;
  if (set && set !== 'structural') p.set(HASH.set, set);
  if (Array.isArray(state.peers)) p.set(HASH.peers, state.peers.join(','));
  const ov = Object.entries(state.overrides || {});
  if (ov.length) p.set(HASH.overrides, ov.map(([n, v]) => `${n}:${v.tier}:${encodeURIComponent(v.note || '')}`).join('|'));
  // the evidence setting is chosen in the top bar (shell.mjs); keep it unless the caller sets it
  const setting = state.setting || currentSetting();
  if (setting !== 'standard') p.set(HASH.setting, setting);
  const cur = readHash();
  for (const k of TEACHING_KEYS) if (cur.get(k) != null) p.set(k, cur.get(k));
  writeHash(p);
}

// ---------- indicator helpers ----------
const UNIT_OVERRIDES = {
  'DERIV.REAL_DEPOSIT': '%', 'DERIV.REAL_LENDING_CPI': '%', 'DERIV.CROWDING_OUT': 'share of domestic credit', 'DERIV.CREDIT_GROWTH': '% a ' +
    'year', 'DERIV.NET_CASHFLOW_BANKS': 'percentage points',
  'DERIV.EDU_UNEMP_RATIO': 'ratio', 'DERIV.INFLATION_VOL': 'pp (s.d.)', 'ECI_HS92': 'index', 'STATIC.LANDLOCKED': '1 = landlocked',
  GGXWDG_NGDP: '% of GDP', GGXCNL_NGDP: '% of GDP', NGSD_NGDP: '% of GDP', NID_NGDP: '% of GDP', NGDP_RPCH: '%', BCA_NGDPD: '% of GDP',
};
/** The unit to show beside an indicator's value, from the overrides, the name's parenthesis or the id. @param {any} ind @returns {string} */
export function unitHint(ind) {
  if (!ind) return '';
  if (UNIT_OVERRIDES[ind.id]) return UNIT_OVERRIDES[ind.id];
  const m = String(ind.name || '').match(/\(([^()]*)\)\s*$/);
  if (m) return m[1].replace(/-/g, '–');
  if (/\.ZS$|\.ZG$/.test(ind.id)) return '%';
  return '';
}
/** An indicator's name without its trailing unit parenthesis. @param {any} ind @returns {string} */
export function shortName(ind) { return String(ind.name || ind.id).replace(/\s*\([^()]*\)\s*$/, ''); }
export const SOURCE_LABEL = { worldbank_wdi: 'World Bank WDI', worldbank_zip: 'World Bank (bulk CSV)', weo: 'IMF WEO', eci: 'Growth Lab Atlas',
  derived: 'Derived', static: 'Static' };
const ES_VIA_WDI = /^IC\.(FRM|TAX\.GIFT|ELC\.(OUTG|DURS))/;
export const EXTRA_GROUPS = {
  es360: { label: 'World Bank Enterprise Surveys (Data360)', url: 'https://www.enterprisesurveys.org/en/data' },
  es_micro: { label: 'World Bank Enterprise Surveys (microdata, economy aggregates)', url: 'https://www.enterprisesurveys.org/en/data' },
  imf: { label: 'IMF (SDMX)', url: 'https://data.imf.org' },
  escap: { label: 'ESCAP-World Bank Trade Cost Database', url: 'https://www.unescap.org/resources/escap-world-bank-trade-cost-database' },
  prindex: { label: 'Prindex', url: 'https://www.prindex.net/data/' },
  rts: { label: 'Returns to schooling (Montenegro-Patrinos)',
    url: 'https://documents.worldbank.org/en/publication/documents-reports/documentdetail/830831468147839247' },
  barrolee: { label: 'Barro-Lee', url: 'https://barrolee.github.io/BarroLeeDataSet/' },
  gfdd: { label: 'World Bank GFDD', url: 'https://www.worldbank.org/en/publication/gfdr/data/global-financial-development-database' },
  doingbiz: { label: 'World Bank Doing Business (historical)', url: 'https://archive.doingbusiness.org/' },
  atlas: { label: 'Growth Lab Atlas trade data', url: 'https://atlas.hks.harvard.edu/' },
  itu: { label: 'ITU ICT Price Baskets', url: 'https://www.itu.int/en/ITU-D/Statistics/Pages/ICTprices/default.aspx' },
  camels: { label: 'Growth Lab HS92 trade with industry intensity vectors (Rajan-Zingales, Ciccone-Papaioannou, Hummels-Schaur)',
    url: 'https://atlas.hks.harvard.edu/' },
};
/** The source's web page for an indicator, or null. @param {any} ind @returns {string | null} */
export function sourceLink(ind) {
  if (!ind) return null;
  switch (ind.source) {
    case 'worldbank_wdi': return `https://data.worldbank.org/indicator/${ind.id}`;
    case 'worldbank_zip':
      if (/\.EST$/.test(ind.id)) return 'https://www.worldbank.org/en/publication/worldwide-governance-indicators';
      if (/^HD\.HCI/.test(ind.id)) return 'https://databank.worldbank.org/source/human-capital-index';
      return `https://data.worldbank.org/indicator/${ind.id}`;
    case 'weo': return 'https://www.imf.org/en/Publications/SPROLLS/world-economic-outlook-databases';
    case 'eci': return 'https://atlas.hks.harvard.edu/rankings';
    case 'extra': return (EXTRA_GROUPS[ind.extra_group] || {}).url || null;
    default: return null;
  }
}
/** The source's name for an indicator, as the site cites it. @param {any} ind @returns {string} */
export function sourceLabel(ind) {
  if (!ind) return '';
  if (ind.source === 'worldbank_zip' && /\.EST$/.test(ind.id)) return 'World Bank WGI';
  if (ind.source === 'worldbank_zip' && /^HD\.HCI/.test(ind.id)) return 'World Bank HCI';
  if (ind.source === 'extra') return (EXTRA_GROUPS[ind.extra_group] || {}).label || ind.extra_group || 'extra';
  // Enterprise Surveys series published through WDI: name the survey, so the same data never shows two sources (W5)
  if (ind.source === 'worldbank_wdi' && ES_VIA_WDI.test(ind.id)) return 'World Bank Enterprise Surveys, via WDI';
  return SOURCE_LABEL[ind.source] || ind.source;
}

/** Age-based staleness: true when the newest observation is older than the staleness limit. */
export function isStale(yearRef, snapshotYear, limit) { return yearRef != null && snapshotYear - yearRef > limit; }

/**
 * Display code for a node: sub-nodes show their parent's code ("N11.corruption" → "N11"), since the slug repeats the name
 * beside it. Exports keep the full id.
 */
export function nodeCode(id) { return String(id).replace(/^(N\d+)\..+$/, '$1'); }
/** A node's short name from the registry, or its id. @param {any} registry @param {string} id @returns {string} */
export function nodeShort(registry, id) { const n = registry.nodeById[id]; return n ? n.short : id; }
/** A node's label from the registry, or its id. @param {any} registry @param {string} id @returns {string} */
export function nodeLabel(registry, id) { const n = registry.nodeById[id]; return n ? n.label : id; }

/**
 * D7: why a test was not computed, in two kinds: 'not_defined' when the registry has no specification, vector or
 * class A/B measure for this test on this node (a gap in the tool, the same for every economy), 'no_data' when it has
 * one but this economy has no usable value in the window.
 * @param {string} test price | changes | circumvention | camels
 * @param {string} nodeId
 * @param {any} registry
 * @returns {'not_defined' | 'no_data'}
 */
export function missingTestKind(test, nodeId, registry) {
  const inds = registry.indicators.indicators;
  const has = (pred) => inds.some((i) => (i.nodes || []).includes(nodeId) && pred(i));
  if (test === 'changes') {
    const specs = registry.indicators.comovement_specs || [];
    return specs.some((s) => s.node === nodeId || (s.also_nodes || []).includes(nodeId)) ? 'no_data' : 'not_defined';
  }
  if (test === 'camels') return has((i) => i.test === 'camels') ? 'no_data' : 'not_defined';
  if (test === 'circumvention') return has((i) => i.test === 'circumvention') ? 'no_data' : 'not_defined';
  return has((i) => i.test === 'price' && (i.class === 'A' || i.class === 'B')) ? 'no_data' : 'not_defined';
}
/** Plain label for missingTestKind. */
export const MISSING_TEST_LABEL = { not_defined: 'no test defined', no_data: 'no data' };

/** Reason text for a test that was not computed for a node. */
export function missingTestReason(test, nodeId, registry) {
  const specs = (registry.indicators.comovement_specs || []).filter((s) => s.node === nodeId || (s.also_nodes || []).includes(nodeId));
  const nb = registry.connectorsNotBuilt.filter((f) => f.nodes.includes(nodeId));
  if (test === 'camels') return registry.indicators.indicators.some((i) => i.test === 'camels' && /^(CHF?|HG)\./.test(i.id) && (i.nodes || []).includes(nodeId))
    ? 'In the "4 · Camels and hippos" tab under the strip: the firm-level version (from the Enterprise Surveys) votes where it passed its power check; the ' +
      'trade-based tilt and the presence version (the hippo gap) each vote only where they passed their gates, and are shown either way.'
    : 'Not computed: no intensity vector or survey sensitivity is connected for this area yet.';
  if (test === 'changes') return specs.length ? 'Not computed: the co-movement specification for this node had too few year pairs.' : 'Not computed: rubric ' +
    'v0.1 has no co-movement specification for this node.';
  if (test === 'circumvention') return `Not computed: no circumvention family with usable data for this node${nb.length ? `; connectors not built: ` +
    `${nb.map((f) => `${f.family} (${f.source})`).join('; ')}` : ''}.`;
  return 'Not computed: no price family with usable data for this node.';
}

/** 'a, b and c' from a list, skipping empties. @param {Array<string | null | undefined>} items @param {string} [conj] @returns {string} */
export function englishList(items, conj = 'and') {
  const a = items.filter(Boolean);
  if (a.length <= 1) return a.join('');
  if (a.length === 2) return `${a[0]} ${conj} ${a[1]}`;
  return `${a.slice(0, -1).join(', ')} ${conj} ${a[a.length - 1]}`;
}

/** Offer a text file for download. @param {string} filename @param {string} text @param {string} [type] MIME type */
export function downloadText(filename, text, type = 'text/markdown') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

/** A query-string parameter of the page's URL, or null. @param {string} name @returns {string | null} */
export function qs(name) { return new URLSearchParams(location.search).get(name); }

// Shared helpers for the Desk. Pure ES module, no dependencies.

export const TIER_ORDER = ['likely_binding', 'candidate', 'cannot_tell_conflicting', 'cannot_tell_weak', 'cannot_tell_data_gap', 'probably_not', 'ruled_out', 'desk_undiagnosable'];
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
export const TIER_ORD = { ruled_out: -2, probably_not: -1, cannot_tell_data_gap: 0, cannot_tell_conflicting: 0, cannot_tell_weak: 0, desk_undiagnosable: 0, context_only: 0, elimination: 0, candidate: 1, likely_binding: 2 };

/** Where the Desk data lives. Override with ?data=/out/desk-data to view another output folder. */
export function dataBase() {
  const p = new URLSearchParams(location.search).get('data');
  if (p && /^\/[A-Za-z0-9_\-./]*$/.test(p) && !p.includes('..')) return p.replace(/\/$/, '');
  return '/constraint-check-site/desk/data';
}
/** Keep the data= switch on internal links. */
export function withData(url) {
  const p = new URLSearchParams(location.search).get('data');
  if (!p || dataBase() === '/constraint-check-site/desk/data') return url;
  return `${url}${url.includes('?') ? '&' : '?'}data=${encodeURIComponent(p)}`;
}

/** Normalize growth_problem G-statistics across the engine's shape and the spec sketch. */
export function gNorm(g = {}) {
  const G1 = g.G1 || {}, G2 = g.G2 || {}, G3 = g.G3 || {}, G4 = g.G4 || {}, G5 = g.G5 || {}, G6 = g.G6 || {}, G7 = g.G7 || {}, G10 = g.G10 || {}, G11 = g.G11 || {}, G12 = g.G12 || {};
  const first = (...xs) => { const f = xs.find((x) => x !== undefined && x !== null); return f === undefined ? null : f; };
  const ic = (o) => (o && o.icr ? o.icr : o && o.t != null ? { t: o.t, percentile: o.percentile } : null);
  const stat = (o) => ({ id: o && o.id ? o.id : null, value: first(o && o.value_ref, o && o.value), year: first(o && o.year_ref, o && o.year), t: ic(o) ? first(ic(o).t) : null, percentile: ic(o) ? first(ic(o).percentile) : null });
  return {
    g1: { avg10: first(G1.avg_10y, G1.avg10), avg20: first(G1.avg_20y, G1.avg20), peers10: first(G1.structural_median_10y, G1.peers_median10), peers20: first(G1.structural_median_20y, G1.peers_median20), region10: first(G1.region_median_10y, G1.region_median10), region20: first(G1.region_median_20y, G1.region_median20), rank: first(G1.rank_in_structural), n: first(G1.structural_n, G1.n_structural), years10: G1.years_10y || null },
    g2: { t: first(G2.t), residual: first(G2.residual_pp, G2.residual), n: first(G2.n), method: G2.method || '' },
    g3: { peakYear: first(G3.peak_year), peakValue: first(G3.peak_value), latestYear: first(G3.latest_year), latestValue: first(G3.latest_value), yearsSince: first(G3.years_since_peak), shortfall: first(G3.shortfall_pct) },
    g4: { reported: !!G4.reported, breakYear: first(G4.break_year), change: first(G4.change_pp), before: first(G4.mean_before), after: first(G4.mean_after), method: G4.method || '', direction: G4.direction || null },
    g5: { sd: first(G5.sd), peers: first(G5.structural_median_sd, G5.peers_median_sd), pct: first(G5.universe_percentile, G5.percentile_universe), window: first(G5.window_years) },
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
  registry_coverage: { label: 'registry coverage: too few voting families', resolves: 'more high-quality (class A/B) evidence in the tool: today it cannot supply enough independent measures for this area' },
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
export function cannotTellCode(n) {
  if (!n || !isCannotTell(n.tier)) return null;
  if (n.cannot_tell_reason && CANNOT_TELL_PLAIN[n.cannot_tell_reason]) return n.cannot_tell_reason;
  const sub = n.tier_subreason || n.cannot_tell_subreason || null;
  if (n.tier === 'cannot_tell_data_gap') return isRegistryGap(sub) ? 'not_connected' : 'no_recent_data';
  if (n.tier === 'cannot_tell_conflicting') return 'mixed';
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
    band = Math.abs(n.elimination.weighted_mean ?? 0) >= 0.5 && (direction === 'toward' ? n.elimination.away === 0 : n.elimination.toward === 0) ? 'clear' : 'slight';
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

export const isCannotTell = (t) => typeof t === 'string' && t.startsWith('cannot_tell');
export const tierLabel = (t) => TIER_LABEL[t] || (t ? t.replace(/_/g, ' ') : '—');
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

export async function getJSON(url, { optional = false } = {}) {
  let r;
  try { r = await fetch(url, { cache: 'no-store' }); }
  catch (e) { if (optional) return null; throw new Error(`${url}: ${e.message}`); }
  if (!r.ok) { if (optional) return null; throw new Error(`${url}: HTTP ${r.status}`); }
  return r.json();
}

export async function loadRegistry() {
  const [indicators, nodes, params] = await Promise.all([
    getJSON('/constraint-check-site/registry/indicators.json'), getJSON('/constraint-check-site/registry/nodes.json'), getJSON('/constraint-check-site/registry/params.json'),
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
export function fmtSigned(x, d = 2) {
  if (x == null || Number.isNaN(x)) return '—';
  const s = fmt(Math.abs(x), d);
  return x > 0 ? `+${s}` : x < 0 ? `${MINUS}${s}` : s;
}
export function fmtInt(x) { return x == null ? '—' : Math.round(x).toLocaleString('en-US').replace(/-/g, MINUS); }
export function fmtSignal(s) { if (s == null) return '—'; const v = Math.round(s * 100) / 100; return v > 0 ? `+${v}` : v < 0 ? `${MINUS}${Math.abs(v)}` : '0'; }
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
export function fmtValue(ind, v) { return fmt(v, decimalsFor(ind, v)); }

export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/** Tiny element builder. attrs: class, html, dataset, on<event>, anything else as attribute. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
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
  const s = new URLSearchParams(location.hash.replace(/^#/, '')).get('setting');
  return SETTINGS.includes(s) ? s : 'standard';
}
/** Plain words for the engine's robustness mark (W4, Q7: one mark, detail on hover). */
export const ROBUST_PLAIN = {
  holds: 'Holds under every reading',
  depends_on_setting: 'Depends on the reading',
  depends_on_comparators: 'Depends on the comparison countries',
};
export function robustDetail(n, plain) {
  if (!n || !n.robustness) return '';
  const by = n.tier_by_setting || {};
  const parts = SETTINGS.filter((s) => by[s]).map((s) => `${SETTING_LABEL[s]} reading → ${plain(by[s]).toLowerCase().replace(/^unclear: /, 'unclear (').replace(/^(unclear \(.*)$/, '$1)')}`);
  const extra = n.robustness.comparators_differ ? ' The rating also changes with the choice of comparison countries.' : '';
  return `${parts.join(' · ')}.${extra}`;
}

// ---------- URL hash state (reproducible links) ----------
export function parseHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  const out = { set: p.get('set') || null, peers: null, overrides: {}, setting: SETTINGS.includes(p.get('setting')) ? p.get('setting') : 'standard' };
  const peers = p.get('peers');
  if (peers != null) out.peers = peers.split(',').map((s) => s.trim()).filter(Boolean);
  const o = p.get('o');
  if (o) {
    for (const part of o.split('|')) {
      const [node, tier, note] = part.split(':');
      if (node && tier && USER_TIERS.includes(tier)) out.overrides[node] = { tier, note: safeDecode(note || '') };
    }
  }
  return out;
}
function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s; } }
export function writeHash(state) {
  const p = new URLSearchParams();
  const set = state.activeSet || state.set;
  if (set && set !== 'structural') p.set('set', set);
  if (Array.isArray(state.peers)) p.set('peers', state.peers.join(','));
  const ov = Object.entries(state.overrides || {});
  if (ov.length) p.set('o', ov.map(([n, v]) => `${n}:${v.tier}:${encodeURIComponent(v.note || '')}`).join('|'));
  // the evidence setting is chosen in the top bar (nav.mjs); keep it unless the caller sets it
  const setting = state.setting || currentSetting();
  if (setting !== 'standard') p.set('setting', setting);
  const s = p.toString();
  history.replaceState(null, '', location.pathname + location.search + (s ? `#${s}` : ''));
}

// ---------- indicator helpers ----------
const UNIT_OVERRIDES = {
  'DERIV.REAL_DEPOSIT': '%', 'DERIV.REAL_LENDING_CPI': '%', 'DERIV.CROWDING_OUT': 'share of domestic credit', 'DERIV.CREDIT_GROWTH': '% a year', 'DERIV.NET_CASHFLOW_BANKS': 'percentage points',
  'DERIV.EDU_UNEMP_RATIO': 'ratio', 'DERIV.INFLATION_VOL': 'pp (s.d.)', 'ECI_HS92': 'index', 'STATIC.LANDLOCKED': '1 = landlocked',
  GGXWDG_NGDP: '% of GDP', GGXCNL_NGDP: '% of GDP', NGSD_NGDP: '% of GDP', NID_NGDP: '% of GDP', NGDP_RPCH: '%', BCA_NGDPD: '% of GDP',
};
export function unitHint(ind) {
  if (!ind) return '';
  if (UNIT_OVERRIDES[ind.id]) return UNIT_OVERRIDES[ind.id];
  const m = String(ind.name || '').match(/\(([^()]*)\)\s*$/);
  if (m) return m[1].replace(/-/g, '–');
  if (/\.ZS$|\.ZG$/.test(ind.id)) return '%';
  return '';
}
export function shortName(ind) { return String(ind.name || ind.id).replace(/\s*\([^()]*\)\s*$/, ''); }
export const SOURCE_LABEL = { worldbank_wdi: 'World Bank WDI', worldbank_zip: 'World Bank (bulk CSV)', weo: 'IMF WEO', eci: 'Growth Lab Atlas', derived: 'Derived', static: 'Static' };
export const EXTRA_GROUPS = {
  es360: { label: 'World Bank Enterprise Surveys (Data360)', url: 'https://www.enterprisesurveys.org/en/data' },
  imf: { label: 'IMF (SDMX)', url: 'https://data.imf.org' },
  escap: { label: 'ESCAP-World Bank Trade Cost Database', url: 'https://www.unescap.org/resources/escap-world-bank-trade-cost-database' },
  prindex: { label: 'Prindex', url: 'https://www.prindex.net/data/' },
  rts: { label: 'Returns to schooling (Montenegro-Patrinos)', url: 'https://documents.worldbank.org/en/publication/documents-reports/documentdetail/830831468147839247' },
  barrolee: { label: 'Barro-Lee', url: 'https://barrolee.github.io/BarroLeeDataSet/' },
  gfdd: { label: 'World Bank GFDD', url: 'https://www.worldbank.org/en/publication/gfdr/data/global-financial-development-database' },
  doingbiz: { label: 'World Bank Doing Business (historical)', url: 'https://archive.doingbusiness.org/' },
  atlas: { label: 'Growth Lab Atlas trade data', url: 'https://atlas.hks.harvard.edu/' },
  camels: { label: 'Growth Lab HS92 trade with industry intensity vectors (Rajan-Zingales, Ciccone-Papaioannou, Hummels-Schaur)', url: 'https://atlas.hks.harvard.edu/' },
};
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
export function sourceLabel(ind) {
  if (!ind) return '';
  if (ind.source === 'worldbank_zip' && /\.EST$/.test(ind.id)) return 'World Bank WGI';
  if (ind.source === 'worldbank_zip' && /^HD\.HCI/.test(ind.id)) return 'World Bank HCI';
  if (ind.source === 'extra') return (EXTRA_GROUPS[ind.extra_group] || {}).label || ind.extra_group || 'extra';
  return SOURCE_LABEL[ind.source] || ind.source;
}

/** Age-based staleness: true when the newest observation is older than the staleness limit. */
export function isStale(yearRef, snapshotYear, limit) { return yearRef != null && snapshotYear - yearRef > limit; }

/** Display code for a node: sub-nodes show their parent's code ("N11.corruption" → "N11"), since the slug repeats the name beside it. Exports keep the full id. */
export function nodeCode(id) { return String(id).replace(/^(N\d+)\..+$/, '$1'); }
export function nodeShort(registry, id) { const n = registry.nodeById[id]; return n ? n.short : id; }
export function nodeLabel(registry, id) { const n = registry.nodeById[id]; return n ? n.label : id; }

/** Reason text for a test that was not computed for a node. */
export function missingTestReason(test, nodeId, registry) {
  const specs = (registry.indicators.comovement_specs || []).filter((s) => s.node === nodeId || (s.also_nodes || []).includes(nodeId));
  const nb = registry.connectorsNotBuilt.filter((f) => f.nodes.includes(nodeId));
  if (test === 'camels') return registry.indicators.indicators.some((i) => i.test === 'camels' && i.id.startsWith('CH.') && (i.nodes || []).includes(nodeId))
    ? 'Shown in the "4 · Camels and hippos" tab under the strip, but not yet counted: the camels test has not yet passed its placebo check.'
    : 'Not computed: no industry intensity vector is connected for this node yet (the prototype has finance, schooling and transport time).';
  if (test === 'changes') return specs.length ? 'Not computed: the co-movement specification for this node had too few year pairs.' : 'Not computed: rubric v0.1 has no co-movement specification for this node.';
  if (test === 'circumvention') return `Not computed: no circumvention family with usable data for this node${nb.length ? `; connectors not built: ${nb.map((f) => `${f.family} (${f.source})`).join('; ')}` : ''}.`;
  return 'Not computed: no price family with usable data for this node.';
}

export function englishList(items, conj = 'and') {
  const a = items.filter(Boolean);
  if (a.length <= 1) return a.join('');
  if (a.length === 2) return `${a[0]} ${conj} ${a[1]}`;
  return `${a.slice(0, -1).join(', ')} ${conj} ${a[a.length - 1]}`;
}

export function downloadText(filename, text, type = 'text/markdown') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

export function qs(name) { return new URLSearchParams(location.search).get(name); }

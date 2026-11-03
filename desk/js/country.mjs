// Orchestrator for the two country pages (front-door PRD W3): the Bottom line (country.html, the front door)
// and Areas (areas.html, the tree, the cards and the analyst panels). Each render function draws only when its
// container is on the page, so both pages share one source of truth for the comparison set, peers and overrides.
import { tabHref, refreshNav } from './nav.mjs';
import { nodeCode, getJSON, loadRegistry, initTheme, h, fmt, fmtSigned, fmtInt, fmtValue, tierClass, TIER_ORDER, parseHash, writeHash, qs, unitHint, shortName, sourceLink, sourceLabel, isStale, englishList, downloadText, dataBase, withData, gNorm, reasonClause, DATA_GAP_KINDS, isRegistryGap, SETTING_LABEL } from './common.mjs';
import { renderTree, compactTree } from './tree.mjs';
import { createCard, plainTier, PLAIN_TIER, bottomLine, fcsNote, refSpan, robustChip } from './card.mjs';
import { renderComparators, SET_PLAIN } from './comparators.mjs';
import { buildMemo, memoHTML } from './memo.mjs';
import { buildBriefing } from './briefing.mjs';

initTheme();
const iso = (qs('iso') || '').toUpperCase();
const DATA = dataBase();
const $ = (id) => document.getElementById(id);

const state = {
  iso, registry: null, scorecard: null, countries: [], matrix: null, narrative: null, fcs: null, index: null,
  engine: null, engineStatus: { ok: false, message: '' },
  activeSet: 'structural', peers: null, overrides: {}, view: null, viewBase: null, setting: 'standard', lastRecompute: '',
};
let card = null;
const PAGE = document.body.dataset.page === 'areas' ? 'areas' : 'bottom';
const on = (id) => !!document.getElementById(id);

function showError(msg) { const e = $('page-error'); e.hidden = false; e.textContent = msg; $('country-name').textContent = 'Snapshot unavailable'; }
const short = (id) => (state.registry && state.registry.nodeById[id] ? state.registry.nodeById[id].short : id);
const nodeOf = (id) => state.view.nodes.find((n) => n.id === id);
const snapshotYear = () => state.scorecard.meta.snapshot_year || Number(String(state.scorecard.meta.snapshot_id).slice(0, 4));
const isMock = () => !!(state.scorecard.meta.mock || /mock/.test(String(state.scorecard.meta.engine_version || '')));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const nameOf = (iso3) => { const c = (state.countries || []).find((x) => x.iso3 === iso3); return c ? c.name : iso3; };

function baseView() {
  const sc = state.scorecard;
  return { nodes: sc.nodes.map((n) => ({ ...n })), ranking: sc.ranking, statements: sc.statements, sensitivity: sc.sensitivity, indicators: sc.indicators, setKey: sc.meta.active_comparator_set || 'structural', note: '' };
}
/** Context for the plain-language helpers in card.mjs. */
function plainCtx() {
  const ind = state.view.indicators || state.scorecard.indicators;
  return { indicators: ind, byId: Object.fromEntries(ind.map((r) => [r.id, r])), setKey: state.view.setKey || state.activeSet, fallbackSet: state.activeSet, country: state.scorecard.country.name, registry: state.registry, nodes: state.view.nodes, view: state.view, snapshotYear: snapshotYear() };
}

async function main() {
  if (!iso) { showError('No economy selected. Open this page as country.html?iso=XXX or pick an economy from the list.'); return; }
  try {
    const [registry, scorecard, countries, fcs, index] = await Promise.all([loadRegistry(), getJSON(`${DATA}/${iso}.json`), getJSON(`${DATA}/countries.json`, { optional: true }), getJSON('/constraint-check-site/registry/static_fcs.json', { optional: true }), getJSON(`${DATA}/index.json`, { optional: true })]);
    state.registry = registry; state.scorecard = scorecard; state.countries = countries || []; state.fcs = fcs; state.index = index;
  } catch (e) { showError(`Could not load the snapshot for ${iso}: ${e.message}. The engine CLI (or desk/dev/mock.mjs) must write ${DATA}/${iso}.json first.`); return; }
  state.narrative = await getJSON(`/constraint-check-site/synth/narratives/${iso}.json`, { optional: true });
  try {
    const mod = await import('/constraint-check-site/engine/src/scorecard.mjs');
    if (typeof mod.recomputeWithPeers === 'function') { state.engine = mod; state.engineStatus = { ok: true, message: '' }; }
    else state.engineStatus = { ok: false, message: '/constraint-check-site/engine/src/scorecard.mjs loaded but does not export recomputeWithPeers().' };
  } catch (e) { state.engineStatus = { ok: false, message: `the engine module /engine/src/scorecard.mjs could not be imported (${e.message}).` }; }

  const hs = parseHash();
  state.activeSet = hs.set && state.scorecard.comparators[hs.set] ? hs.set : (state.scorecard.meta.active_comparator_set || 'structural');
  state.peers = hs.peers; state.overrides = hs.overrides || {}; state.setting = hs.setting;
  state.view = baseView();
  document.title = `${state.scorecard.country.name} · ${PAGE === 'areas' ? 'Areas' : 'Bottom line'} · Constraint Check`;

  if (on('drawer')) {
    card = createCard({
      drawer: $('drawer'), scrim: $('scrim'), registry: state.registry,
      getState: () => state,
      onOverride: (id, ov) => { if (ov) state.overrides[id] = ov; else delete state.overrides[id]; writeHash(state); renderTreePanel(); renderStatements(); renderOverridesBox(); refreshNav(); },
      onOpenNode: (id) => card.open(id),
    });
  }

  renderHeader(); renderGrowth(); renderLegend();
  await applyComparators();
  renderAll();
  if (on('provenance-body')) renderProvenance();
  if (on('proposal-body')) renderBriefingBox();
  if (on('export-body')) renderExport();
  wireSectionLinks();
  refreshNav();
  // Areas opens an area card directly from a link (areas.html?iso=KEN&node=N3; old country.html&node= links redirect here)
  const openId = new URLSearchParams(location.search).get('node');
  if (card && openId && state.registry.nodeById[openId]) card.open(openId);
  const section = new URLSearchParams(location.search).get('section');
  if (section && on(section)) goTo(section);
  window.addEventListener('hashchange', () => { const p = parseHash(); state.overrides = p.overrides || {}; renderTreePanel(); renderStatements(); renderOverridesBox(); });
  // the evidence setting is chosen in the top bar (nav.mjs, W4); the ratings on this page follow it
  window.addEventListener('desk-setting', (e) => { state.setting = e.detail.setting; state.view = applySetting(state.viewBase); writeHash(state); renderAll(); });
}

// ---------------- section links: scroll without touching the state hash ----------------
function goTo(id) {
  const el = $(id); if (!el) return;
  const det = el.closest('details'); if (det && !det.open) det.open = true;
  const inner = el.querySelector(':scope > details'); if (inner && !inner.open) inner.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}
function wireSectionLinks() {
  // the URL hash holds the comparator set and the overrides, so in-page links must not replace it
  for (const a of document.querySelectorAll('.subnav a[href^="#"], a.banner-link[href^="#"]')) {
    a.addEventListener('click', (e) => { const id = a.getAttribute('href').slice(1); if ($(id)) { e.preventDefault(); goTo(id); } });
  }
}

// ---------------- comparators / recompute ----------------
/**
 * W4: the ratings under the chosen evidence setting. The engine stores each rated node's tier under every setting
 * (tier_by_setting) for the comparison countries in use, so this only swaps tiers; Standard returns the view as is.
 * A fallback view (no in-browser engine, non-default set) has settings computed for another set, so it stays Standard.
 */
function applySetting(view) {
  if (!view || state.setting === 'standard' || view.fallback) return view;
  const label = SETTING_LABEL[state.setting];
  const nodes = view.nodes.map((n) => {
    const t = n.tier_by_setting && n.tier_by_setting[state.setting];
    if (!t || t === n.tier) return n;
    return { ...n, tier: t, cannot_tell_reason: null, cannot_tell_detail: null, tier_reason: `${plainTier(t)} under the ${label} reading (Standard: ${plainTier(n.tier).toLowerCase()}). The rule text that follows is the Standard computation. ${n.tier_reason}` };
  });
  return { ...view, nodes, setting: state.setting };
}
async function applyComparators() {
  await applyComparatorsRaw();
  state.viewBase = state.view;
  state.view = applySetting(state.viewBase);
}
async function applyComparatorsRaw() {
  const sc = state.scorecard; const base = baseView();
  const defaultMembers = sc.comparators[state.activeSet] ? sc.comparators[state.activeSet].members : [];
  const isDefault = state.activeSet === (sc.meta.active_comparator_set || 'structural') && !Array.isArray(state.peers);
  if (isDefault) { state.view = base; state.lastRecompute = ''; writeHash(state); return; }
  const peers = Array.isArray(state.peers) ? state.peers : defaultMembers;
  if (state.engine) {
    try {
      if (!state.matrix) state.matrix = await getJSON(`${DATA}/matrix.json`);
      const t0 = performance.now();
      // the custom list replaces the active default set in the fragility check and the bootstrap pool (engine v0.1.2)
      const res = state.engine.recomputeWithPeers(sc, state.matrix, peers, { indicators: state.registry.indicators, nodes: state.registry.nodes }, state.registry.params, { replaces: state.activeSet });
      const ms = Math.round(performance.now() - t0);
      const nodes = Array.isArray(res.nodes) ? res.nodes.map((n) => ({ ...(base.nodes.find((b) => b.id === n.id) || {}), ...n })) : base.nodes;
      state.view = { nodes, ranking: res.ranking || base.ranking, statements: res.statements || base.statements, sensitivity: res.sensitivity || base.sensitivity, indicators: Array.isArray(res.indicators) ? res.indicators : base.indicators, setKey: res.active_comparator_set || 'custom', note: '' };
      state.lastRecompute = `Recomputed in the browser with ${peers.length} peers in ${ms} ms (engine ${state.engine.ENGINE_VERSION || ''}; the edited list stands in for the ${res.replaces || state.activeSet} set).`;
    } catch (e) {
      console.error(e);
      state.view = fallbackView(base); state.lastRecompute = `Recompute failed: ${e.message}. Showing the engine's precomputed ratings for the ${state.activeSet} set.`;
    }
  } else state.view = fallbackView(base);
  writeHash(state);
}
function fallbackView(base) {
  const nodes = base.nodes.map((n) => (n.tier_by_set && n.tier_by_set[state.activeSet] ? { ...n, ...(n.tier_by_set[state.activeSet] === n.tier ? {} : { cannot_tell_reason: null, cannot_tell_detail: null }), tier: n.tier_by_set[state.activeSet], tier_reason: n.tier_by_set[state.activeSet] === n.tier ? n.tier_reason : `${plainTier(n.tier_by_set[state.activeSet])} under the ${state.activeSet} set (precomputed by the engine; the rule text below describes the structural-set computation). ${n.tier_reason}` } : n));
  return { nodes, ranking: base.ranking, statements: base.statements, indicators: base.indicators, setKey: state.activeSet, fallback: true, note: 'Ranking and statements are shown for the default set; the engine module is not available for a browser recompute.' };
}

function renderAll() {
  renderSettingNote(); renderTreePanel(); renderStatements(); renderPeersLine(); renderOverridesBox(); renderHeaderMeta(); renderCompactTree();
  if (on('topsplit-body')) renderTopSplit();
  if (on('ranking-body')) renderRanking();
  if (on('comparators-body')) renderComparatorsPanel();
  if (card) card.refresh();
}

// W4: say plainly when the page is not showing the release
function renderSettingNote() {
  if (!on('setting-note')) return;
  const el = $('setting-note');
  if (state.setting === 'standard') { el.hidden = true; return; }
  el.hidden = false;
  el.replaceChildren(h('strong', {}, `${SETTING_LABEL[state.setting]} reading, not the one to cite.`),
    state.viewBase && state.viewBase.fallback
      ? ' This reading needs the in-browser engine for these comparison countries, so the page shows Standard.'
      : ` ${state.setting === 'exploratory' ? 'It makes it easier to flag an area for a closer look, never easier to rule one out. The figures are the same under every reading; only the ratings change.' : 'It needs more and stronger evidence before rating anything.'} Standard is the only reading to cite. None of the three readings has been tested against expert diagnoses yet.`);
}

// ---------------- header ----------------
function renderHeader() {
  const sc = state.scorecard; const c = sc.country; const m = sc.meta;
  $('country-name').textContent = c.name; $('country-iso').textContent = c.iso3;
  $('banner-text').textContent = `In a first test on 35 published expert diagnoses, it rarely dismissed a constraint they found binding (6 of 100) but said “cannot tell” most of the time. The final test has not run; ratings are uncalibrated and may be wrong. Use it to decide what to ask, not what to fund.${isMock() ? ' THE NUMBERS ON THIS PAGE ARE MOCK DATA from desk/dev/mock.mjs, not engine output.' : ''}${DATA !== '/constraint-check-site/desk/data' ? ` Data served from ${DATA}.` : ''}`;
  const note = fcsNote(state.fcs, c.iso3, c.name);
  const el = $('fcs-note');
  if (note) { el.hidden = false; el.textContent = note; } else el.hidden = true;
  $('versions').textContent = `Public data snapshot ${m.snapshot_id || '—'} · rubric ${m.rubric_version || '—'} · engine ${m.engine_version || '—'} · generated ${m.generated_at ? String(m.generated_at).replace('T', ' ').replace(/:\d\d(\.\d+)?Z$/, ' UTC') : '—'}${state.fcs && state.fcs.source ? ` · fragile and conflict-affected list: ${state.fcs.source}` : ''}.`;
  renderHeaderMeta();
}
function activeMembers() {
  const sc = state.scorecard;
  return Array.isArray(state.peers) ? state.peers : (sc.comparators[state.activeSet] ? sc.comparators[state.activeSet].members : []);
}
/** V4: the compact tree beside the Bottom line title, from the view in force (reading, comparison set, overrides). */
function renderCompactTree() {
  if (!on('ctree-host')) return;
  const iso = state.scorecard.country.iso3;
  $('ctree-host').replaceChildren(
    compactTree({ registry: state.registry, nodes: state.view.nodes, overrides: state.overrides, href: (id) => tabHref('/constraint-check-site/desk/areas.html', iso, `&node=${encodeURIComponent(id)}`) }),
    h('p', { class: 'ctree-key' }, 'One square per area, coloured by its rating; an arrow on a grey square is its lean, toward (↑) or away from (↓) a problem. Hover for the name; click for the evidence. No total.'));
}
function renderHeaderMeta() {
  const sc = state.scorecard; const c = sc.country; const m = sc.meta;
  const members = activeMembers();
  $('meta-list').replaceChildren(
    h('li', {}, `${c.region} · ${c.income_group}${c.landlocked ? ' · landlocked' : ''}`),
    h('li', {}, 'Public data as of ', h('strong', {}, m.snapshot_id || '—')),
    h('li', { title: englishList(members.map(nameOf)) }, 'Compared with ', h('strong', {}, `${members.length} ${Array.isArray(state.peers) ? 'countries you chose' : ({ structural: 'similar economies', regional: 'regional neighbours', aspirational: 'faster growers' }[state.activeSet] || 'countries')}`)),
  );
}
function renderPeersLine() {
  if (!on('peers-line')) return;
  const members = activeMembers(); const c = state.scorecard.country.name;
  const how = SET_PLAIN[state.activeSet] ? SET_PLAIN[state.activeSet](c) : `the ${state.activeSet} set`;
  // the Bottom line keeps this to one line; Areas explains how each set is built
  const kind = Array.isArray(state.peers) ? 'countries you chose' : ({ structural: 'similar economies', regional: 'regional neighbours', aspirational: 'faster growers that were once as rich' }[state.activeSet] || 'countries');
  $('peers-line').textContent = PAGE === 'bottom'
    ? `Compared with ${members.length} ${kind}; the list is under Areas.`
    : `Compared with ${members.length} countries: ${how}${Array.isArray(state.peers) ? ', edited by you' : ''}. ${members.length ? `${englishList(members.map(nameOf))}.` : ''}`;
}

// ---------------- growth problem ----------------
function renderGrowth() {
  const sc = state.scorecard; const g = sc.growth_problem || {}; const gn = gNorm(g); const c = sc.country.name;
  const stmt = String(g.statement || '');
  // lead with the question the statement ends on; the top-split reading moves to the analyst panel
  const qm = stmt.match(/The relevant question is therefore:\s*([^.?]*)[.?]/);
  // the Bottom line drops the analyst's qualifier ("when the growth record shows no dominant pattern"); Areas keeps it
  const q = qm ? qm[1].trim() : '';
  $('growth-question').textContent = q ? `The question for ${c}: ${PAGE === 'bottom' ? q.replace(/\s+when the growth record .*$/, '').replace(/ given income$/, ' for its income level') : q}?` : '';
  if (!on('growth-statement')) return; // the Bottom line shows the question only
  const cleaned = stmt.replace(/\s*Provisional top-split reading:[^()]*(\([^)]*\))?\.?/g, '').trim();
  $('growth-statement').textContent = cleaned || 'No growth problem statement in the file.';
  $('growth-class').textContent = g.classification ? `Growth pattern: ${g.classification.replace(/_/g, ' ')}` : '';
  const series = (sc.series && sc.series['NY.GDP.PCAP.KD']) || [];
  $('spark').replaceChildren(sparkline(series, gn.g3.peakYear));
  const inv = sc.series && sc.series['NE.GDI.FTOT.ZS'];
  const lastInv = inv && inv.length ? inv[inv.length - 1] : null;
  $('spark-cap').textContent = `GDP per capita, constant 2015 US$, ${series.length ? `${series[0][0]}–${series[series.length - 1][0]}` : 'no series in the file'}; peak marked${gn.g3.peakYear ? ` (${gn.g3.peakYear})` : ''}.${lastInv ? ` Investment (gross fixed capital formation): ${fmt(lastInv[1], 1)}% of GDP in ${lastInv[0]} (G6 uses the three-year mean).` : ''}`;
  const { g1, g2, g3, g4, g5, g6, g7, g10, g11, g12 } = gn;
  const cell = (lab, val, sub, na) => h('div', { class: 'stat' }, h('span', { class: 'lab' }, lab), h('span', { class: `val num${na ? ' na' : ''}` }, val), sub ? h('span', { class: 'sub' }, sub) : null);
  const w10 = (g.G1 && g.G1.window_10y) || null;
  const w20 = (g.G1 && g.G1.window_20y) || null;
  $('g-grid').replaceChildren(
    cell(`G1 · growth, 10-year avg${w10 ? ` (${w10[0]}–${w10[1]})` : ''}`, g1.avg10 != null ? `${fmt(g1.avg10, 2)}%` : '—', `20-year${w20 ? ` (${w20[0]}–${w20[1]})` : ''} ${fmt(g1.avg20, 2)}% · peers ${fmt(g1.peers10, 2)}% · region ${fmt(g1.region10, 2)}%${g1.years10 && w10 && (g1.years10[0] !== w10[0] || g1.years10[1] !== w10[1]) ? ` · observed ${g1.years10[0]}–${g1.years10[1]}` : ''}`),
    cell('G1 · rank among structural peers', g1.rank != null ? `${g1.rank} of ${g1.n}` : '—', 'by 10-year average growth'),
    cell('G2 · convergence residual', fmtSigned(g2.t, 2), `t · Huber, region dummies${g2.n ? ` · n ${g2.n}` : ''}`),
    cell('G3 · peak year', g3.peakYear ?? '—', g3.yearsSince != null ? `${g3.yearsSince} years ago · ${fmt(g3.shortfall, 1)}% below peak` : ''),
    cell('G4 · growth break', g4.reported ? String(g4.breakYear) : 'none', g4.change != null ? `${fmtSigned(g4.change, 2)} pp (${fmt(g4.before, 1)} → ${fmt(g4.after, 1)}) · ${g4.method}` : '', !g4.reported),
    cell('G5 · volatility (s.d., 20y)', fmt(g5.sd, 2), `peers median ${fmt(g5.peers, 2)} · universe pct ${g5.pct == null ? '—' : Math.round(g5.pct)}`),
    cell('G6 · investment residual', fmtSigned(g6.t, 2), `GFCF ${fmt(g6.value, 1)}% of GDP (${g6.year ?? '—'}) · private split unavailable`),
    cell('G7 · savings residual', fmtSigned(g7.savings.t, 2), `savings ${fmt(g7.savings.value, 1)}% · CAB ${fmtSigned(g7.cab.value, 1)}% · FDI ${fmt(g7.fdi.value, 1)}%`),
  );
  $('g-context').textContent = `Context — G10 exports residual t ${fmtSigned(g10.exports.t, 2)}, complexity (ECI) residual t ${g10.eci.t == null ? 'not available' : fmtSigned(g10.eci.t, 2)}; G11 unemployment ${fmt(g11.value, 1)}% (t ${fmtSigned(g11.t, 2)}); G12 population ${fmtInt(g12.population)}, urban ${fmt(g12.urban_share, 1)}%, resource rents ${fmt(g12.resource_rents, 1)}% of GDP, ${g12.landlocked ? 'landlocked' : 'coastal'}.`;
}

function sparkline(series, peakYear) {
  const W = 560, H = 180, m = { top: 20, right: 70, bottom: 26, left: 12 };
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'spark'); svg.setAttribute('role', 'img');
  if (!series.length) { svg.setAttribute('aria-label', 'No GDP per capita series'); return svg; }
  const ys = series.map((p) => p[0]), vs = series.map((p) => p[1]);
  const y0 = Math.min(...ys), y1 = Math.max(...ys), v0 = 0, v1 = Math.max(...vs) * 1.08;
  const X = (y) => m.left + (y - y0) / (y1 - y0) * (W - m.left - m.right);
  const Y = (v) => m.top + (1 - (v - v0) / (v1 - v0)) * (H - m.top - m.bottom);
  const el = (t, a, txt) => { const e = document.createElementNS(svgNS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (txt != null) e.textContent = txt; svg.append(e); return e; };
  el('line', { x1: m.left, x2: W - m.right, y1: Y(0), y2: Y(0), class: 'axis' });
  el('path', { d: series.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' '), class: 'line' });
  let peak = series[0]; for (const p of series) if (p[1] > peak[1]) peak = p;
  if (peakYear != null) { const f = series.find((p) => p[0] === peakYear); if (f) peak = f; }
  el('line', { x1: X(peak[0]), x2: X(peak[0]), y1: Y(peak[1]), y2: Y(0), class: 'axis peak-line' });
  el('circle', { cx: X(peak[0]), cy: Y(peak[1]), r: 4, class: 'peak' });
  const peakX = X(peak[0]); const anchor = peakX > W - m.right - 110 ? 'end' : 'start';
  el('text', { x: peakX + (anchor === 'end' ? -8 : 8), y: Y(peak[1]) - 7, 'text-anchor': anchor, class: 'label-strong' }, `peak ${peak[0]}: ${fmt(peak[1], 0)}`);
  const last = series[series.length - 1];
  el('text', { x: X(last[0]) + 6, y: Y(last[1]) + 4 }, `${fmt(last[1], 0)}`);
  el('text', { x: m.left, y: H - 7 }, String(y0));
  el('text', { x: W - m.right, y: H - 7, 'text-anchor': 'end' }, String(last[0]));
  svg.setAttribute('aria-label', `GDP per capita from ${y0} to ${last[0]}; peak ${peak[0]} at ${fmt(peak[1], 0)}; latest ${fmt(last[1], 0)}.`);
  return svg;
}

// ---------------- top split (analyst panel) ----------------
const TOPSPLIT_PATTERN = {
  finance_supply: 'fit a finance-supply problem',
  low_demand: 'fit low demand for investment, which points to the low-returns branch',
  credit_boom_no_investment: 'conflict: credit is growing fast but investment is low (check macro risk, crowding out and consumer credit)',
  not_investment_constrained: 'do not show an investment problem',
  investment_without_finance: 'show investment without bank finance, likely public or foreign-led',
  indeterminate: 'do not match any standard pattern',
};
function renderTopSplit() {
  const ts = state.scorecard.top_split || {}; const th = ts.thresholds || state.registry.params.top_split; const s = ts.stats || {};
  const c = state.scorecard.country.name;
  const rows = [
    ['finance_supply', 'high', 'low', 'low', 'Supply of finance constrained: points to the finance branch (top of the tree)'],
    ['low_demand', 'low', 'low', 'low', 'Low demand for investment: points to the low-returns branch (bottom of the tree)'],
    ['credit_boom_no_investment', 'high', 'high', 'low', 'Conflicting: check macro risk, crowding out, consumer credit'],
    ['not_investment_constrained', 'low', 'high', 'not low', 'Revisit the question'],
    ['investment_without_finance', 'low', 'low', 'not low', 'Likely public or FDI-led investment'],
    ['indeterminate', 'anything else', '', '', 'Between rows; state the three statistics'],
  ];
  const cls = ts.classification || {};
  const n0 = nodeOf('N0'); const n3 = nodeOf('N3');
  const leansFinance = n0 && (n0.tier === 'candidate' || n0.tier === 'likely_binding');
  const notFinance = n0 && (n0.tier === 'probably_not' || n0.tier === 'ruled_out');
  $('topsplit-h').textContent = leansFinance ? `Finance or low returns? The evidence leans to finance for ${c} (not established).` : notFinance ? `Finance or low returns? Probably not a finance problem in ${c}.` : `Finance or low returns? Not settled for ${c}.`;
  const body = $('topsplit-body'); body.replaceChildren();
  const rateTxt = cls.rate === 'high' ? `the real lending rate is high for ${c}'s income` : cls.rate === 'low' ? `the real lending rate is low for ${c}'s income` : `the real lending rate is about what ${c}'s income predicts`;
  const creditTxt = s.credit_growth != null ? `private credit grew ${cls.credit === 'high' ? 'fast' : 'slowly'} (${fmt(s.credit_growth, 1)}% a year after inflation, three-year average)` : 'private credit growth is not available';
  const invTxt = cls.investment === 'low' ? 'investment is low for its income' : 'investment is not low for its income';
  body.append(h('p', { class: 'prose' }, `Three quick statistics ${TOPSPLIT_PATTERN[ts.row] || TOPSPLIT_PATTERN.indeterminate}: ${rateTxt}, ${creditTxt}, and ${invTxt}.`));
  if (n0) {
    const n0Tier = plainTier(n0.tier).toLowerCase();
    body.append(h('p', { class: 'prose' }, isCannotTellTier(n0.tier)
      ? `The fuller finance evidence, which adds rationing, co-movement and working-around measures, is mixed, so the tool rates this fork ‘${n0Tier}’. Treat the pattern as a hypothesis to check, not a finding.`
      : `The fuller finance evidence, which adds rationing, co-movement and working-around measures, rates the finance side ‘${n0Tier}’. Open the first area in the tree for the evidence.`));
  }
  if (ts.rate_source && ts.rate_source !== 'FR.INR.RINR') body.append(h('p', { class: 'note' }, `Real rate from ${ts.rate_source}: the CPI-deflated lending rate stands in because the WDI real rate (FR.INR.RINR) is missing in the window.`));
  if (Array.isArray(ts.missing) && ts.missing.length) body.append(h('p', { class: 'note' }, `Missing statistics: ${ts.missing.map((k) => k.replace(/_/g, ' ')).join(', ')}.`));
  const depthTxt = cls.credit_depth === 'thin' ? ' · private credit is thin (ICR t ≤ ' + th.credit_depth_thin_t + '), so growth does not read as high' : '';
  body.append(h('div', { class: 'stat-grid', style: 'margin-top:12px' },
    h('div', { class: 'stat' }, h('span', { class: 'lab' }, 'Real lending rate, ICR t'), h('span', { class: 'val num' }, fmtSigned(s.real_rate_t)), h('span', { class: 'sub' }, `${cls.rate ? `read as ${cls.rate} · ` : ''}high if ≥ ${th.rate_high_t}; low if ≤ ${th.rate_low_t}${ts.rate_source ? ` · source ${ts.rate_source}` : ''}`)),
    h('div', { class: 'stat' }, h('span', { class: 'lab' }, 'Real private credit growth'), h('span', { class: 'val num' }, s.credit_growth != null ? `${fmt(s.credit_growth, 2)}%` : '—'), h('span', { class: 'sub' }, `${cls.credit ? `read as ${cls.credit} · ` : ''}3-year average; high if ≥ ${th.credit_growth_high_pct}%${s.credit_depth_t != null ? ` · private credit ICR t ${fmtSigned(s.credit_depth_t, 2)}` : ''}${s.net_cashflow_banks != null ? ` · net cash flow from banks ${fmtSigned(s.net_cashflow_banks, 1)} pp` : ''}${depthTxt}`)),
    h('div', { class: 'stat' }, h('span', { class: 'lab' }, 'Investment (GFCF), ICR t'), h('span', { class: 'val num' }, fmtSigned(s.investment_t)), h('span', { class: 'sub' }, `${cls.investment ? `read as ${String(cls.investment).replace(/_/g, ' ')} · ` : ''}low if ≤ ${th.investment_low_t}`))));
  // the pattern against the verdicts that fold in more evidence
  const label = ts.label || (ts.row || 'indeterminate').replace(/_/g, ' ');
  const verdicts = [n0, n3].filter(Boolean).map((n) => `${nodeCode(n.id)} ${short(n.id).replace(/\?$/, '').toLowerCase()} is ${plainTier(n.tier).toLowerCase()}${n.N != null ? ` (N ${fmtSigned(n.N)})` : ''}`);
  const tail = cls.rate === 'low' ? ' A finance area cannot be rated likely while the real rate reads low here (the engine caps it at worth a closer look).' : '';
  body.append(h('p', { class: 'small muted', style: 'margin-top:10px' }, `Pattern: the “${label}” row of the first-decision table (rate ${cls.rate || '—'}, credit growth ${cls.credit || '—'}, investment ${String(cls.investment || '—').replace(/_/g, ' ')}). This is a pattern, not a verdict: ${englishList(verdicts) || 'the finance areas are not scored'}.${tail}`));
  const tbl = h('table', { class: 'data topsplit-table' }, h('thead', {}, h('tr', {}, h('th', { class: 'col-row' }, 'Row'), h('th', {}, 'Rate'), h('th', {}, 'Credit growth'), h('th', {}, 'Investment'), h('th', { class: 'col-reading' }, 'Reading'))));
  const tb = h('tbody');
  for (const r of rows) tb.append(h('tr', { style: r[0] === ts.row ? 'font-weight:600' : '', 'aria-current': r[0] === ts.row ? 'true' : null }, h('td', { class: 'col-row' }, r[0] === ts.row ? '▸ ' : '', r[0].replace(/_/g, ' ')), h('td', {}, r[1]), h('td', {}, r[2]), h('td', {}, r[3]), h('td', { class: 'col-reading' }, r[4])));
  tbl.append(tb);
  body.append(h('div', { class: 'table-wrap', style: 'margin-top:12px' }, tbl));
}
const isCannotTellTier = (t) => typeof t === 'string' && (t.startsWith('cannot_tell') || t === 'desk_undiagnosable');

// ---------------- tree ----------------
function renderLegend() {
  if (!on('tree-legend')) return;
  const el = $('tree-legend'); el.replaceChildren();
  for (const t of TIER_ORDER) { if (t === 'desk_undiagnosable') continue; el.append(h('span', {}, h('span', { class: `swatch ${tierClass(t)}`, 'aria-hidden': 'true' }), PLAIN_TIER[t])); }
  el.append(h('span', {}, h('span', { class: 'swatch t-context', 'aria-hidden': 'true' }), 'Context, or needs sector study'));
  el.append(h('span', {}, h('span', { class: 'swatch', 'aria-hidden': 'true', style: 'border:2px dashed var(--accent)' }), 'Your override'));
}
function renderTreePanel() {
  if (!on('tree-wrap')) return;
  renderTree($('tree-wrap'), { registry: state.registry, nodes: state.view.nodes, overrides: state.overrides, onOpen: (id) => card.open(id), tooltipEl: $('tooltip'), plainCtx: plainCtx() });
  const tip = $('tooltip'); if (tip.parentElement !== document.body) document.body.append(tip);
}

// ---------------- statements ----------------
function joinEls(parts) {
  const out = [];
  parts.forEach((p, i) => { if (i) out.push(i === parts.length - 1 ? (parts.length > 2 ? ', and ' : ' and ') : ', '); out.push(...[p].flat()); });
  return out;
}
/** A link to an area's card at the Areas level, carrying the comparison set, peers and overrides. */
function areaLink(id, label, cls = '') {
  const a = h('a', { href: tabHref('/constraint-check-site/desk/areas.html', iso, `&node=${encodeURIComponent(id)}`), class: cls || null }, label);
  a.addEventListener('click', () => { a.href = tabHref('/constraint-check-site/desk/areas.html', iso, `&node=${encodeURIComponent(id)}`); });
  return a;
}
/**
 * The Bottom line (front-door PRD W3, section 3.3): three lists generated by bottomLine(), the same logic as the
 * memo, so the page and the memo never disagree. Each line: the area in plain words, one reason from its top
 * evidence, and "Why?" to its card at the Areas level. Robustness marks arrive with the evidence settings (W4).
 */
function renderStatements() {
  if (!on('statements-body')) return;
  const ctx = plainCtx();
  const bl = bottomLine(ctx);
  const c = state.scorecard.country.name;
  const body = $('statements-body'); body.replaceChildren();
  const why = (id) => areaLink(id, 'Why?', 'bl-why');
  const ovMark = (id) => (state.overrides[id] ? h('span', { class: 'bl-ov' }, `your override: ${plainTier(state.overrides[id].tier).toLowerCase()}`) : null);
  const line = (id, name, text, grade, node) => h('li', {},
    h('span', { class: 'bl-area' }, areaLink(id, cap(name))),
    grade ? h('span', { class: 'bl-grade' }, grade) : null,
    robustChip(node),
    h('span', { class: 'bl-text' }, text), ' ', why(id), ovMark(id));
  const names = (items) => joinEls(items.map((x) => [areaLink(x.id, x.short), state.overrides[x.id] ? h('span', { class: 'bl-ov' }, `your override: ${plainTier(state.overrides[x.id].tier).toLowerCase()}`) : ''].filter(Boolean)));
  const list = (cls, title, sub) => h('section', { class: `bl-list ${cls}` }, h('h2', {}, title), sub ? h('p', { class: 'bl-sub' }, sub) : null);

  // 1. what you can stop arguing about
  const s1 = list('bl-stop', 'What you can stop arguing about', null);
  const stops = [...bl.ruled.map((x) => ({ x, grade: 'Ruled out' })), ...bl.probNot.map((x) => ({ x, grade: 'Probably not' }))];
  if (stops.length) {
    s1.append(h('ul', {}, stops.map(({ x, grade }) => line(x.id, x.short, `${x.away ? `${cap(x.away.text)}.` : 'Most measures point away from a problem.'}${x.counter ? ` But ${x.counter.text}.` : ''}`, grade, x.node))));
    if (bl.probNot.length) s1.append(h('p', { class: 'bl-note' }, '“Probably not” is weaker than “ruled out”: do not drop a program on it alone.'));
  } else {
    s1.append(h('p', { class: 'bl-none' }, h('strong', {}, `Nothing can be ruled out for ${c} yet.`), ` ${shareText()}`));
    const away = bl.awayLeans.slice(0, 3);
    if (away.length) s1.append(h('p', { class: 'bl-note' }, 'Leaning away, below the bar (not a verdict): ', ...joinEls(away.map((x) => [areaLink(x.id, x.short)])), '.'));
  }

  // 2. what deserves a closer look, by lean
  const s2 = list('bl-look', 'What deserves a closer look', 'Not established: confirm in-country before relying on any of these. The tag beside each area says whether it stays on this list under all three readings in the top bar (Cautious, Standard, Exploratory); tap it to see each.');
  // robust lines first (W4), then by score
  const firm = (x) => (x.node.robustness && x.node.robustness.mark === 'holds' ? 0 : 1);
  const look = bl.look.slice().sort((a, b) => firm(a) - firm(b) || (b.node.N ?? 0) - (a.node.N ?? 0));
  if (look.length) {
    s2.append(h('ul', {}, look.map((x) => line(x.id, x.ev !== x.node ? x.evShort : x.short,
      x.facts.length ? `${cap(x.facts[0].text)}.` : 'See the evidence card.', x.node.tier === 'likely_binding' ? 'Likely' : null, x.node))));
  } else {
    s2.append(h('p', { class: 'bl-none' }, h('strong', {}, `No area stands out for ${c} yet.`)));
    const toward = bl.towardLeans.slice(0, 3);
    if (toward.length) s2.append(h('p', { class: 'bl-note' }, 'Leaning toward a problem, below the bar (not a verdict): ', ...joinEls(toward.map((x) => [areaLink(x.id, x.short)])), '.'));
  }

  // 3. what the public data can't settle, grouped by reason, each with its next step
  const s3 = list('bl-unclear', 'What the public data can’t settle, and what would', null);
  if (!bl.nUnclear) s3.append(h('p', { class: 'bl-none' }, 'Nothing: every area has a rating.'));
  else {
    const g = bl.groups;
    const grp = (items, label, next) => (items.length ? h('li', {}, h('span', { class: 'bl-reason' }, `${label} (${items.length})`), h('span', { class: 'bl-text' }, ...names(items), '. '), h('span', { class: 'bl-next' }, next)) : null);
    const elim = g.elimination.map((x) => x.node.elimination && x.node.elimination.direction !== 'none' ? ` Today it leans ${x.node.elimination.direction === 'toward' ? 'toward' : 'away from'} a problem.` : '').join('');
    s3.append(h('ul', {},
      grp(g.oneKind, 'Only one kind of evidence', `Next: a second kind of evidence (a price, a response to change, or firms working around it) would settle it.${bl.closest ? ` Of these, ${bl.closest.short} comes nearest to a rating (it leans ${bl.closest.node.N > 0 ? 'toward' : 'away from'} a problem).` : ''}`),
      grp(g.mixed, 'Evidence points both ways', 'Next: check whether it binds for some sectors or regions only.'),
      grp(g.dataGap, `Too little recent data for ${c}`, 'Next: a newer survey or data year would settle it.'),
      grp(g.toolGap, 'Not connected to the tool yet', `Next: a new measure in the tool; no data for ${c} changes it today.`),
      grp(g.sector, 'Needs a sector study', 'Next: sector work.'),
      g.elimination.length ? h('li', {}, h('span', { class: 'bl-reason' }, `Judged by elimination (${g.elimination.length})`), h('span', { class: 'bl-text' }, ...names(g.elimination), '. '),
        h('span', { class: 'bl-next' }, `Self-discovery asks whether firms are held back from trying new products. Next: rule out the other causes of low returns first.${elim} `),
        sdLink()) : null));
    if (bl.firmsTop) {
      const r = bl.firmsTop.r; const m = String(r.name || '').match(/choosing (.+?) as their biggest obstacle/i);
      const what = m ? m[1] : shortName(r).toLowerCase();
      s3.append(h('p', { class: 'bl-note' }, `Firms rank ${what} as their biggest obstacle (${fmt(r.value_ref, 0)}% name it first, ${refSpan(r)}). Complaints alone cannot establish a constraint${bl.firmsTop.toolGap ? ', and the tool has no measure of its cost yet' : ''}, so it is not rated.`));
    }
  }
  body.append(s1, s2, s3);
  renderAssistanceBox(bl);
  if (state.view.note) body.append(h('p', { class: 'note' }, state.view.note));
}
function sdLink() {
  const a = h('a', { href: tabHref('/constraint-check-site/desk/selfdiscovery.html', iso) }, 'Read more →');
  a.addEventListener('click', () => { a.href = tabHref('/constraint-check-site/desk/selfdiscovery.html', iso); });
  return a;
}
/**
 * Front-door PRD W8: "What this means for U.S. assistance", in The New Foreign Assistance's voice and labelled as such,
 * after the three lists. It translates each list into the decision it informs and never says "fund this". It argues for a
 * way of choosing, not for a country, sector or program (W8.4).
 */
function renderAssistanceBox(bl) {
  if (!on('assistance-box')) return;
  const c = state.scorecard.country.name;
  // U.S. assistance does not go to high-income economies; the exit line fits countries that still receive aid
  const income = state.scorecard.country.income_group || '';
  if (income === 'High income') { $('assistance-box').replaceChildren(); return; }
  const aidRecipient = income === 'Low income' || income === 'Lower middle income';
  const list = (items) => englishList(items.map((x) => x.short));
  const stops = [...bl.ruled, ...bl.probNot];
  const g = bl.groups;
  const firstGap = g.dataGap.length ? 'measure what is missing for this country first' : g.oneKind.length ? `find a second kind of evidence on ${list(g.oneKind.slice(0, 2))}` : 'start with a field visit';
  $('assistance-box').replaceChildren(
    h('span', { class: 'kicker' }, 'The New Foreign Assistance’s view · not part of any rating'),
    h('h2', {}, 'What this means for U.S. assistance'),
    h('ul', {},
      h('li', {}, h('strong', {}, 'Choose before spending. '), stops.length
        ? `Programs aimed at ${list(stops)} need new evidence first: the public data argue against ${stops.length === 1 ? 'it' : 'them'} as what holds investment back here.`
        : `Nothing can be ruled out for ${c} yet, so no area should be assumed not to matter.`),
      h('li', {}, h('strong', {}, 'Look first where the evidence points. '), bl.look.length
        ? `The public data point first to ${list(bl.look.map((x) => (x.ev !== x.node ? { short: x.evShort } : x)))}, which is not established. Check it with ${c}’s government, firms and researchers before anything is designed.`
        : `No area stands out, so the first step is to ${firstGap}.`),
      h('li', {}, h('strong', {}, 'Measure what can’t be settled. '), 'The cheapest next step is often to collect the missing evidence. Each “can’t settle” line above says what that is.'),
      aidRecipient ? h('li', {}, h('strong', {}, 'Aim for the exit. '), `The goal is growth that lets ${c} rely on trade and investment instead of aid. Fixing what truly holds growth back is how that happens; spending on what doesn’t changes little.`) : null),
    h('p', { class: 'small' }, h('a', { href: withData('/constraint-check-site/desk/methods.html#mcc') }, 'Why this way of choosing →'), ' ', h('a', { href: 'https://thenewforeignassistance.org', target: '_blank', rel: 'noopener' }, 'About The New Foreign Assistance →')));
}
function shareText() {
  const ix = state.index; if (!ix || !Array.isArray(ix.countries) || !ix.countries.length) return '';
  const none = ix.countries.filter((c) => !Object.entries(c.tiers || {}).some(([id, t]) => !/^N11\./.test(id) && (t === 'ruled_out' || t === 'probably_not'))).length;
  const k = Math.round((none / ix.countries.length) * 10);
  return k >= 3 ? `This is common: about ${k} in 10 countries have nothing on this list. ` : '';
}
function renderOverridesBox() {
  if (!on('overrides-box')) return;
  const box = $('overrides-box'); box.replaceChildren();
  const ovs = Object.entries(state.overrides);
  if (!ovs.length) { if (PAGE === 'areas') box.append(h('p', { class: 'small muted' }, 'None yet. Open an area and use “Your override” at the end of its card.')); return; }
  const ul = h('ul', { class: 'diff-list' });
  for (const [id, v] of ovs) { const n = nodeOf(id); ul.append(h('li', {}, h('strong', {}, `${nodeCode(id)} ${short(id)}`), h('span', { class: `tier-badge ${tierClass(n && n.tier)}` }, h('span', {}, `tool: ${plainTier(n && n.tier)}`)), h('span', { class: 'arrow' }, '→'), h('span', { class: `tier-badge ${tierClass(v.tier)}` }, h('span', {}, `you: ${plainTier(v.tier)}`)), h('span', { class: 'muted' }, v.note), card ? h('button', { class: 'btn quiet small', type: 'button', onclick: () => card.open(id) }, 'Edit') : areaLink(id, 'Edit', 'btn quiet small'), h('button', { class: 'btn quiet small', type: 'button', onclick: () => { delete state.overrides[id]; writeHash(state); renderTreePanel(); renderStatements(); renderOverridesBox(); refreshNav(); } }, 'Remove'))); }
  box.append(h('div', { class: 'note alert', style: 'margin-top:16px' }, h('strong', {}, 'Your overrides'), ' (your judgment, shown next to the tool\'s; encoded in this page\'s URL so the link reproduces them)', ul));
}

// ---------------- ranking (analyst panel) ----------------
const ordinalWord = (k) => { const v = k % 100; const s = ['th', 'st', 'nd', 'rd']; return `${k}${s[(v - 20) % 10] || s[v] || s[0]}`; };
function renderRanking() {
  const rk = state.view.ranking || {}; const body = $('ranking-body'); body.replaceChildren();
  const p = state.registry.params.ranking;
  const draws = rk.bootstrap_draws || p.bootstrap_draws;
  const pTop = rk[`p_top${p.top_k}`] || rk.p_top3 || {};
  $('ranking-sub').textContent = `Ordered by score. Stability comes from ${draws} re-runs that drop some measures (keeping ${Math.round(p.bootstrap_subset_share * 100)}%), swap the comparison sets and move the thresholds by up to ±${Math.round(p.threshold_perturbation * 100)}%. This measures how stable the order is, not the chance that an area is the binding constraint.`;
  if (!(rk.ordered || []).length) { body.append(h('p', { class: 'note' }, 'No area reaches ‘worth a closer look’ under the active comparison countries, so there is nothing to order.')); }
  else {
    const notResampled = new Set(rk.not_resampled || []);
    const tbl = h('table', { class: 'data rank-table' }, h('thead', {}, h('tr', {}, h('th', { class: 'num' }, '#'), h('th', {}, 'Area'), h('th', {}, 'Rating'), h('th', { class: 'num col-score' }, 'Score N × breadth'), h('th', {}, `How often in the top ${p.top_k}`))));
    const tb = h('tbody');
    rk.ordered.forEach((id, i) => {
      const n = nodeOf(id);
      const nr = notResampled.has(id);
      const pv = pTop[id]; const mr = (rk.modal_rank || {})[id];
      const pTxt = pv == null ? '—' : pv >= 0.995 ? `in all ${draws} re-runs` : pv <= 0.005 ? 'in none of the re-runs' : `in ${Math.round(pv * 100)}% of ${draws} re-runs`;
      tb.append(h('tr', {},
        h('td', { class: 'num' }, String(i + 1)),
        h('td', { class: 'node-cell' }, h('button', { class: 'btn quiet small', type: 'button', onclick: () => card.open(id) }, `${nodeCode(id)} ${short(id)}`), n && n.sub_nodes ? h('span', { class: 'sub' }, `roll-up of ${n.sub_nodes.length} sub-areas${n.rollup_from ? `, rated through ${short(n.rollup_from).toLowerCase()}` : ''}`) : null, h('span', { class: 'sub' }, `N ${fmtSigned(n && n.N)}`)),
        h('td', {}, h('span', { class: `tier-badge ${tierClass(n && n.tier)}` }, h('span', {}, plainTier(n && n.tier)))),
        h('td', { class: 'num col-score' }, fmt((rk.scores || {})[id], 2)),
        h('td', { title: nr ? 'not resampled: at most 3 voting families, so family subsets are not drawn; comparator sets and thresholds still vary' : `P(top ${p.top_k}) = ${fmt(pv, 2)}` }, `${pTxt}${mr != null ? ` (most often ${ordinalWord(mr)})` : ''}${nr ? '*' : ''}`)));
    });
    tbl.append(tb);
    body.append(h('div', { class: 'table-wrap' }, tbl));
    if ([...notResampled].some((id) => rk.ordered.includes(id))) body.append(h('p', { class: 'small muted', style: 'margin-top:6px' }, '* Not resampled: the area has at most 3 voting measures, so the re-runs keep them all and vary only the comparison set and the thresholds.'));
  }
  if (rk.too_many_likely_binding) body.append(h('p', { class: 'note alert' }, `More than ${p.max_likely_binding_before_flag} areas are rated likely: the protocol flags this and asks the team to revisit the growth question and the comparison sets.`));
  const others = Object.entries(pTop).filter(([id, v]) => v > 0 && !(rk.ordered || []).includes(id)).sort((a, b) => b[1] - a[1]);
  if (others.length) body.append(h('p', { class: 'small muted', style: 'margin-top:10px' }, `Not ordered today but in the top ${p.top_k} in some re-runs: ${others.map(([id, v]) => `${short(id)} (${Math.round(v * 100)}%)`).join(', ')}.`));
  const sens = state.view.sensitivity || state.scorecard.sensitivity || {};
  const lb = sens.load_bearing_families || [];
  if (lb.length) body.append(h('p', { class: 'small muted', style: 'margin-top:6px' }, `Measures a rating depends on (removing one changes it${state.view.setKey === 'custom' ? '; under your edited set' : ''}): ${lb.map((x) => (x.family ? `${x.family.replace(/_/g, ' ')} (${(x.nodes || []).join(', ')})` : `${x.family || x} (${x.node || ''})`)).join('; ')}.`));
}

// ---------------- comparators (analyst panel) ----------------
function renderComparatorsPanel() {
  renderComparators($('comparators-body'), {
    scorecard: state.scorecard, baseline: state.scorecard.nodes, view: state.view, activeSet: state.activeSet, peers: state.peers, countries: state.countries,
    engineStatus: state.engineStatus, lastRecompute: state.lastRecompute, minPeers: state.registry.params.peer_gap.min_peers_with_data, nodeShort: short,
    onSwitch: async (set) => { state.activeSet = set; state.peers = null; await applyComparators(); renderAll(); },
    onPeers: async (list) => { state.peers = list; await applyComparators(); renderAll(); },
    onReset: async () => { state.activeSet = state.scorecard.meta.active_comparator_set || 'structural'; state.peers = null; await applyComparators(); renderAll(); },
  });
}

// ---------------- provenance (analyst panel) ----------------
function renderProvenance() {
  const sc = state.scorecard; const m = sc.meta; const reg = state.registry; const limit = reg.params.recency.staleness_limit_years; const sy = snapshotYear();
  $('provenance-sub').textContent = `Snapshot ${m.snapshot_id}, generated ${m.generated_at || '—'}; rubric ${m.rubric_version}; engine ${m.engine_version}; reference window ${m.reference_window_years || reg.params.snapshot_reference_window_years} years; staleness limit ${limit} years; ${sc.indicators.filter((r) => r.value_ref != null).length} of ${sc.indicators.length} registry indicators have a reference value for ${sc.country.name}. A reference value is the mean of the latest three years in the window where they exist; the year column shows the span.`;
  const body = $('provenance-body'); body.replaceChildren();
  const filter = h('input', { type: 'search', id: 'prov-filter', placeholder: 'Filter by name, id, node or class', 'aria-label': 'Filter indicators', size: '36' });
  body.append(h('div', { class: 'controls', style: 'margin-bottom:10px' }, h('div', { class: 'field' }, h('label', { for: 'prov-filter' }, 'Filter'), filter)));
  const order = { A: 0, B: 1, C: 2, D: 3, X: 4 };
  const rows = sc.indicators.slice().sort((a, b) => (order[a.class] - order[b.class]) || ((a.value_ref == null) - (b.value_ref == null)) || a.id.localeCompare(b.id));
  const tbl = h('table', { class: 'data' }, h('thead', {}, h('tr', {}, h('th', {}, 'Indicator'), h('th', { class: 'num' }, 'Value'), h('th', { class: 'num' }, 'Years'), h('th', {}, 'Source'), h('th', {}, 'Class · test'), h('th', {}, 'Nodes'), h('th', {}, 'Flags'))));
  const tb = h('tbody');
  const draw = () => {
    const q = filter.value.trim().toLowerCase(); tb.replaceChildren();
    for (const r of rows) {
      const hay = `${r.name} ${r.id} ${(r.nodes || []).join(' ')} ${r.class} ${r.family} ${r.source}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      const flags = [];
      const regInd = reg.indicatorById[r.id] || {};
      const formula = r.formula || regInd.formula || null;
      if (r.value_ref == null && r.stale_year != null) flags.push(h('span', { class: 'flag warn' }, `outside window: newest ${r.stale_year}`));
      else if (r.value_ref == null) flags.push(h('span', { class: 'flag' }, r.source === 'derived' && /unavailable/.test(String(formula || '')) ? 'not available in prototype' : 'no data in window'));
      else if (isStale(r.year_ref, sy, limit)) flags.push(h('span', { class: 'flag warn' }, `stale: ${sy - r.year_ref} years`));
      if (r.recency_mult != null && r.recency_mult < 1 && r.value_ref != null && r.class !== 'X') flags.push(h('span', { class: 'flag' }, `recency × ${r.recency_mult}`));
      if (r.n_ref != null && r.n_ref > 1) flags.push(h('span', { class: 'flag' }, `${r.n_ref}-year mean`));
      if (r.suppressed) flags.push(h('span', { class: 'flag', title: r.suppressed_note || '' }, `fallback, not scored (${r.fallback_for} available)`));
      if (r.class_note) flags.push(h('span', { class: 'flag warn', title: r.class_note }, `class ${r.class} here (registry ${r.class_registry}): no independent monetary policy`));
      const link = sourceLink(r);
      const multi = r.value_ref != null && r.n_ref != null && r.n_ref > 1;
      tb.append(h('tr', { style: r.value_ref == null ? 'color:var(--muted)' : '' },
        h('td', {}, shortName(r), h('span', { class: 'sub mono' }, r.id)),
        h('td', { class: 'num' }, r.value_ref != null ? `${fmtValue(r, r.value_ref)} ` : r.stale_value != null ? `${fmtValue(r, r.stale_value)} ` : '—', h('span', { class: 'muted small' }, r.value_ref != null || r.stale_value != null ? unitHint(r) : ''), multi ? h('span', { class: 'sub' }, `mean ${refSpan(r)}${r.value != null && r.value !== r.value_ref ? `; ${r.year_ref} alone ${fmtValue(r, r.value)}` : ''}`) : null),
        h('td', { class: 'num' }, r.value_ref != null ? refSpan(r) : r.stale_year != null ? String(r.stale_year) : '—'),
        h('td', {}, link ? h('a', { href: link, target: '_blank', rel: 'noopener' }, sourceLabel(r)) : sourceLabel(r), formula ? h('span', { class: 'sub mono' }, formula) : null),
        h('td', {}, `${r.class} · ${r.test}`),
        h('td', {}, (r.nodes || []).join(' ') || h('span', { class: 'muted' }, 'context')),
        h('td', {}, flags)));
    }
  };
  draw(); filter.addEventListener('input', draw);
  tbl.append(tb); body.append(h('div', { class: 'table-wrap', style: 'max-height:560px;overflow:auto' }, tbl));
  // the kinds of "cannot tell: data gap", registry statements listed apart from true data gaps
  const gapNodes = state.scorecard.nodes.filter((n) => n.tier === 'cannot_tell_data_gap');
  const note = h('div', { class: 'note', style: 'margin-top:16px' });
  const eBelow = String(reg.params.tiers.cannot_tell_data_gap.E_below);
  note.append(h('p', {}, h('strong', {}, `Six kinds of "unclear: data gap" (rubric ${m.rubric_version}).`), ' Two are about this economy: ', h('em', {}, 'data gap'), ` (fewer than ${eBelow} voting families with data in the window, or no class A/B family) and `, h('em', {}, 'evidence too old'), ` (the newest class A/B family is older than ${limit} years). Four are statements about the registry, which no amount of data for this economy can change: `, h('em', {}, 'connector not built'), ' (no family computed for the node at all), ', h('em', {}, 'no class A/B evidence in registry'), ' (only class C/D indicators are assigned to the node), ', h('em', {}, 'no class A/B price in registry'), ' (the price test is never observed, so the quantities inform but do not vote), and ', h('em', {}, 'registry coverage'), ` (the registry cannot supply ${eBelow} voting families for the node). Quantities on the price test never vote under rubric 0.1.2; they are shown on the cards as informing families.`));
  const econGaps = gapNodes.filter((n) => !isRegistryGap(n.tier_subreason));
  const regGaps = gapNodes.filter((n) => isRegistryGap(n.tier_subreason));
  if (econGaps.length) note.append(h('p', {}, h('strong', {}, 'Data gaps for this economy: '), econGaps.map((n, i) => h('span', {}, i ? '; ' : '', `${nodeCode(n.id)} ${short(n.id)}`, ` — ${reasonClause(n)}`)), '.'));
  if (regGaps.length) {
    const byKind = {};
    for (const n of regGaps) (byKind[n.tier_subreason] = byKind[n.tier_subreason] || []).push(n);
    note.append(h('p', {}, h('strong', {}, 'Registry statements (not data gaps): '), Object.entries(byKind).map(([k, ns], i) => h('span', {}, i ? '; ' : '', h('em', {}, (DATA_GAP_KINDS[k] || {}).label || k), ': ', ns.map((n) => `${nodeCode(n.id)} ${short(n.id)}`).join(', '))), '.'));
  }
  const ul = h('ul', { class: 'small', style: 'margin:6px 0 0' });
  for (const f of reg.connectorsNotBuilt) ul.append(h('li', {}, h('strong', {}, f.family), ` (Class ${f.class}) → ${f.nodes.map((id) => `${nodeCode(id)} ${short(id)}`).join(', ')}: ${f.source}`));
  note.append(h('p', { style: 'margin-top:8px' }, 'Connectors not built in rubric ', m.rubric_version, ':'), ul);
  body.append(note);
}

// ---------------- export ----------------
// "Bring your own AI" (docs/proposal-review.md): the idea and this Snapshot's evidence go into one Markdown file for the
// user's own AI assistant. Nothing is sent anywhere; the Desk runs no model.
function renderBriefingBox() {
  const body = $('proposal-body'); body.replaceChildren();
  const titleIn = h('input', { type: 'text', id: 'idea-title', placeholder: 'For example: Rural mini-grid program', autocomplete: 'off' });
  const ideaIn = h('textarea', { id: 'idea-text', placeholder: 'What it does, for whom and where; roughly how big; and how it is meant to raise private investment or growth. The more specific, the better the answer.' });
  const status = h('span', { class: 'small muted', 'aria-live': 'polite' }, '');
  const flash = (msg) => { status.textContent = msg; setTimeout(() => { status.textContent = ''; }, 4000); };
  const make = () => buildBriefing({ idea: ideaIn.value, title: titleIn.value, memo: memoText(), view: state.view, scorecard: state.scorecard, registry: state.registry, activeSet: state.activeSet, setting: state.setting, pageUrl: location.href.split('#')[0] });
  const ready = () => { if (ideaIn.value.trim()) return true; flash('Describe the idea first.'); ideaIn.focus(); return false; };
  const words = (t) => t.split(/\s+/).filter(Boolean).length.toLocaleString('en-US');
  body.append(
    h('div', { class: 'briefing-form' },
      h('div', { class: 'field' }, h('label', { for: 'idea-title' }, 'Short title (optional)'), titleIn),
      h('div', { class: 'field' }, h('label', { for: 'idea-text' }, 'Your program idea'), ideaIn)),
    h('div', { class: 'briefing-actions' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => { if (!ready()) return; const t = make(); downloadText(`${iso}-idea-briefing.md`, t); flash(`Downloaded ${iso}-idea-briefing.md (about ${words(t)} words).`); } }, 'Download the briefing file'),
      h('button', { class: 'btn', type: 'button', onclick: async () => { if (!ready()) return; const t = make(); try { await navigator.clipboard.writeText(t); flash(`Copied (about ${words(t)} words). Paste it into your AI assistant.`); } catch { flash('Copy failed; use Download instead.'); } } }, 'Copy it instead'),
      status),
    h('ol', { class: 'briefing-steps small' },
      h('li', {}, 'Describe the idea above and download the file. It holds instructions for the AI, your idea, the growth-diagnostics method, and every piece of evidence on this page.'),
      h('li', {}, 'Open the AI assistant you already use, attach the file or paste it in, and ask it to follow the instructions.'),
      h('li', {}, 'Read the answer critically. The AI can be wrong, and this tool’s ratings are not yet validated: check the indicators it cites against this page before relying on it.')),
    h('p', { class: 'small muted' }, 'The file uses the comparison countries and any overrides currently on this page. A built-in review is a possible future feature (docs/proposal-review.md).'));
}

function renderExport() {
  const body = $('export-body'); body.replaceChildren();
  const status = h('span', { class: 'small muted', 'aria-live': 'polite' }, '');
  const flash = (msg) => { status.textContent = msg; setTimeout(() => { status.textContent = ''; }, 2500); };
  body.append(h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center' },
    h('button', { class: 'btn primary', type: 'button', onclick: () => copyMemoRich().then(flash) }, 'Copy for email or Word'),
    h('button', { class: 'btn', type: 'button', onclick: () => flash(printMemo()) }, 'Print or save as PDF'),
    h('button', { class: 'btn quiet', type: 'button', onclick: downloadMemo, title: 'A plain-text file (Markdown) that opens in any text editor or in Word' }, `Download as text (${iso}-memo.md)`),
    h('button', { class: 'btn quiet', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(location.href); flash('Link copied.'); } catch { flash(location.href); } } }, 'Copy link to this view'),
    status));
  body.append(h('p', { class: 'small muted', style: 'margin-top:8px' }, 'The link encodes the comparison countries, edited peers and your overrides.'));
}
function memoText() { return buildMemo({ scorecard: state.scorecard, view: state.view, registry: state.registry, overrides: state.overrides, activeSet: state.activeSet, peers: state.peers, narrative: state.narrative, fcs: state.fcs, countries: state.countries, plain: plainCtx(), setting: state.setting }); }
function downloadMemo() { downloadText(`${iso}-memo.md`, memoText()); }
async function copyMemoRich() {
  const md = memoText(); const html = memoHTML(md, { title: `Constraint Check memo: ${state.scorecard.country.name}` });
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html.body], { type: 'text/html' }), 'text/plain': new Blob([md], { type: 'text/plain' }) })]);
      return 'Copied with formatting: paste into an email or Word.';
    }
    await navigator.clipboard.writeText(md); return 'Copied as plain text (this browser cannot copy formatting).';
  } catch { return 'The browser blocked the clipboard; use Print or save as PDF instead.'; }
}
function printMemo() {
  const md = memoText(); const html = memoHTML(md, { title: `Constraint Check memo: ${state.scorecard.country.name}` });
  const w = window.open('', '_blank');
  if (!w) return 'The browser blocked the print window; allow pop-ups for this page, or download the .md file.';
  w.document.open(); w.document.write(html.page); w.document.close();
  w.focus(); setTimeout(() => { try { w.print(); } catch { /* the reader can print from the window */ } }, 250);
  return 'Opened the memo in a new window for printing.';
}

// Read-only debug hook for manual checks in the console (no behaviour depends on it).
window.deskDebug = { state, memoText, openNode: (id) => card && card.open(id) };

main().catch((e) => { console.error(e); showError(`Unexpected error: ${e.message}`); });

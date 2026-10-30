// Snapshot page orchestrator.
import { nodeCode, getJSON, loadRegistry, initTheme, h, fmt, fmtSigned, fmtInt, fmtValue, tierClass, TIER_ORDER, parseHash, writeHash, qs, unitHint, shortName, sourceLink, sourceLabel, isStale, englishList, downloadText, dataBase, withData, gNorm, reasonClause, DATA_GAP_KINDS, isRegistryGap } from './common.mjs';
import { renderTree } from './tree.mjs';
import { createCard, plainTier, PLAIN_TIER, bottomLine, fcsNote, refSpan } from './card.mjs';
import { renderComparators, SET_PLAIN } from './comparators.mjs';
import { buildMemo, memoHTML } from './memo.mjs';
import { renderProposal } from './proposal.mjs';

initTheme();
const iso = (qs('iso') || '').toUpperCase();
const DATA = dataBase();
const $ = (id) => document.getElementById(id);

const state = {
  iso, registry: null, scorecard: null, countries: [], matrix: null, narrative: null, fcs: null, index: null,
  engine: null, engineStatus: { ok: false, message: '' },
  activeSet: 'structural', peers: null, overrides: {}, view: null, lastRecompute: '', proposalParas: [],
};
let card = null;

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
  document.querySelector('a.brand').href = withData('/constraint-check-site/desk/');
  document.querySelector('.topnav a').href = withData('/constraint-check-site/desk/');
  const snapLink = $('nav-snapshot'); if (snapLink) { snapLink.href = withData(`/constraint-check-site/desk/country.html?iso=${iso}`); snapLink.addEventListener('click', () => { snapLink.href = withData(`/constraint-check-site/desk/country.html?iso=${iso}${location.hash}`); }); }
  const ev = $('nav-evidence'); if (ev) ev.href = withData(`/constraint-check-site/desk/evidence.html?iso=${iso}`);
  // The summary page reads the same overrides (o=) from the link, so carry the current hash at click time.
  const sm = $('nav-summary'); if (sm) sm.addEventListener('click', () => { sm.href = withData(`/constraint-check-site/desk/summary.html?iso=${iso}${location.hash}`); });
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
  state.peers = hs.peers; state.overrides = hs.overrides || {};
  state.view = baseView();
  document.title = `${state.scorecard.country.name} · Snapshot · Constraint Check Desk`;

  card = createCard({
    drawer: $('drawer'), scrim: $('scrim'), registry: state.registry,
    getState: () => state,
    onOverride: (id, ov) => { if (ov) state.overrides[id] = ov; else delete state.overrides[id]; writeHash(state); renderTreePanel(); renderStatements(); renderOverridesBox(); },
    onOpenNode: (id) => card.open(id),
  });

  renderHeader(); renderGrowth(); renderLegend();
  await applyComparators();
  renderAll();
  renderProvenance();
  renderProposal($('proposal-body'), { getState: () => state, registry: state.registry, onOpenNode: (id) => card.open(id), onParagraphs: (list) => { state.proposalParas = list; } });
  renderExport();
  wireSectionLinks();
  // Links from the Evidence page open a node card directly: country.html?iso=KEN&node=N3.
  const openId = new URLSearchParams(location.search).get('node');
  if (openId && state.registry.nodeById[openId]) card.open(openId);
  $('btn-memo-top').addEventListener('click', () => goTo('export'));
  window.addEventListener('hashchange', () => { const p = parseHash(); state.overrides = p.overrides || {}; renderTreePanel(); renderStatements(); renderOverridesBox(); });
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
async function applyComparators() {
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
  const nodes = base.nodes.map((n) => (n.tier_by_set && n.tier_by_set[state.activeSet] ? { ...n, tier: n.tier_by_set[state.activeSet], tier_reason: n.tier_by_set[state.activeSet] === n.tier ? n.tier_reason : `${plainTier(n.tier_by_set[state.activeSet])} under the ${state.activeSet} set (precomputed by the engine; the rule text below describes the structural-set computation). ${n.tier_reason}` } : n));
  return { nodes, ranking: base.ranking, statements: base.statements, indicators: base.indicators, setKey: state.activeSet, note: 'Ranking and statements are shown for the default set; the engine module is not available for a browser recompute.' };
}

function renderAll() { renderTreePanel(); renderStatements(); renderPeersLine(); renderTopSplit(); renderRanking(); renderComparatorsPanel(); renderOverridesBox(); if (card) card.refresh(); renderHeaderMeta(); }

// ---------------- header ----------------
function renderHeader() {
  const sc = state.scorecard; const c = sc.country; const m = sc.meta;
  $('country-name').textContent = c.name; $('country-iso').textContent = c.iso3;
  $('banner-text').textContent = `Constraint Check has not yet been tested against expert growth diagnoses. Its ratings are uncalibrated and may be wrong. Use it to decide what to ask, not what to fund.${isMock() ? ' THE NUMBERS ON THIS PAGE ARE MOCK DATA from desk/dev/mock.mjs, not engine output.' : ''}${DATA !== '/constraint-check-site/desk/data' ? ` Data served from ${DATA}.` : ''}`;
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
function renderHeaderMeta() {
  const sc = state.scorecard; const c = sc.country; const m = sc.meta;
  const members = activeMembers();
  $('meta-list').replaceChildren(
    h('li', {}, `${c.region} · ${c.income_group}${c.landlocked ? ' · landlocked' : ''}`),
    h('li', {}, 'Public data as of ', h('strong', {}, m.snapshot_id || '—')),
    h('li', {}, 'Compared with ', h('strong', {}, `${members.length} countries`), ` (${state.activeSet}${Array.isArray(state.peers) ? ', edited' : ''})`),
  );
}
function renderPeersLine() {
  const members = activeMembers(); const c = state.scorecard.country.name;
  const how = SET_PLAIN[state.activeSet] ? SET_PLAIN[state.activeSet](c) : `the ${state.activeSet} set`;
  $('peers-line').textContent = `Compared with ${members.length} countries: ${how}${Array.isArray(state.peers) ? ', edited by you' : ''}. ${members.length ? `${englishList(members.map(nameOf))}.` : ''} Change them under For analysts.`;
}

// ---------------- growth problem ----------------
function renderGrowth() {
  const sc = state.scorecard; const g = sc.growth_problem || {}; const gn = gNorm(g); const c = sc.country.name;
  const stmt = String(g.statement || '');
  // lead with the question the statement ends on; the top-split reading moves to the analyst panel
  const qm = stmt.match(/The relevant question is therefore:\s*([^.?]*)[.?]/);
  $('growth-question').textContent = qm ? `The question for ${c}: ${qm[1].trim()}?` : '';
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
  const el = $('tree-legend'); el.replaceChildren();
  for (const t of TIER_ORDER) { if (t === 'desk_undiagnosable') continue; el.append(h('span', {}, h('span', { class: `swatch ${tierClass(t)}`, 'aria-hidden': 'true' }), PLAIN_TIER[t])); }
  el.append(h('span', {}, h('span', { class: 'swatch t-context', 'aria-hidden': 'true' }), 'Context, or needs sector study'));
  el.append(h('span', {}, h('span', { class: 'swatch', 'aria-hidden': 'true', style: 'border:2px dashed var(--accent)' }), 'Your override'));
}
function renderTreePanel() {
  renderTree($('tree-wrap'), { registry: state.registry, nodes: state.view.nodes, overrides: state.overrides, onOpen: (id) => card.open(id), tooltipEl: $('tooltip'), plainCtx: plainCtx() });
  const tip = $('tooltip'); if (tip.parentElement !== document.body) document.body.append(tip);
}

// ---------------- statements ----------------
function joinEls(parts) {
  const out = [];
  parts.forEach((p, i) => { if (i) out.push(i === parts.length - 1 ? (parts.length > 2 ? ', and ' : ' and ') : ', '); out.push(...[p].flat()); });
  return out;
}
function renderStatements() {
  const ctx = plainCtx();
  const bl = bottomLine(ctx);
  const c = state.scorecard.country.name;
  const body = $('statements-body'); body.replaceChildren();
  const btn = (id, label) => h('button', { class: 'linklike', type: 'button', onclick: () => card.open(id) }, label);
  const ovMark = (id) => (state.overrides[id] ? h('span', { class: 'muted small' }, ` (your override: ${plainTier(state.overrides[id].tier).toLowerCase()})`) : null);
  const names = (items) => joinEls(items.map((x) => [btn(x.id, x.short), ovMark(x.id)].filter(Boolean)));
  const counterLines = (items) => h('ul', {}, items.map((x) => h('li', {},
    h('span', { class: 'n' }, btn(x.id, cap(x.short))), ': ',
    x.away ? `${cap(x.away.text)}.` : 'Most measures point away from a problem.',
    x.counter ? ` But ${x.counter.text}.` : ' No scored measure points the other way.',
    x.years ? ` Evidence ${x.years}.` : '')));

  // 1. what can stop: ruled out, then probably not (a separate, weaker heading)
  const b1 = h('div', { class: 'statement' });
  if (bl.ruled.length || bl.probNot.length) {
    b1.append(h('span', { class: 'kicker' }, bl.ruled.length ? 'Ruled out' : 'Probably not'));
    if (bl.ruled.length) { b1.append(h('p', {}, 'You can stop arguing about ', ...names(bl.ruled), '.'), counterLines(bl.ruled)); }
    if (bl.probNot.length) {
      b1.append(h('p', { class: bl.ruled.length ? 'stmt-second' : '' }, h('strong', {}, 'Probably not the main constraint'), ' (moderate confidence): ', ...names(bl.probNot), '.'), counterLines(bl.probNot));
      b1.append(h('p', { class: 'small muted', style: 'margin-top:8px' }, 'This is about what holds back private investment, not about household needs. ‘Probably not’ is not a rule-out: do not drop a program on it alone.'));
    }
  } else {
    b1.append(h('span', { class: 'kicker' }, 'Nothing ruled out yet'));
    b1.append(h('p', {}, h('strong', {}, `Nothing can be ruled out for ${c} yet.`)));
    b1.append(h('p', { class: 'small', style: 'margin-top:8px' }, `For ${bl.nUnclear} of ${bl.nAreas} areas the public data are too thin, point both ways, or need a sector study. ${shareText()}You can still check a specific program idea (below), see what leans one way without meeting the bar, and open any area to see which data would settle it.`));
    b1.append(leansBlock(bl, btn));
  }
  // 2. worth a closer look
  const b2 = h('div', { class: 'statement' }, h('span', { class: 'kicker' }, 'Worth a closer look'));
  if (bl.look.length) {
    b2.append(h('p', {}, h('strong', {}, 'Worth a closer look'), ' (not established): ', ...joinEls(bl.look.map((x) => (x.ev !== x.node ? [btn(x.id, x.evShort), `, part of ‘${x.short}’`, ovMark(x.id)] : [btn(x.id, x.short), ovMark(x.id)]).filter(Boolean))), '.'));
    b2.append(h('ul', {}, bl.look.map((x) => h('li', {}, h('span', { class: 'n' }, btn(x.id, cap(x.ev !== x.node ? x.evShort : x.short))), ': ', x.facts.length ? `${cap(x.facts.map((f) => f.text).join('; and '))}.` : 'See the evidence card.', x.node.tier === 'likely_binding' ? ' Still to be confirmed in-country.' : ' Not established: confirm in-country before relying on it.'))));
  } else {
    b2.append(h('p', {}, h('strong', {}, `No area stands out for ${c} yet.`)));
    b2.append(h('p', { class: 'small', style: 'margin-top:8px' }, 'No area reaches ‘worth a closer look’ under the current comparison countries.'));
    if (bl.ruled.length || bl.probNot.length) b2.append(leansBlock(bl, btn, { towardOnly: true }));
  }
  // 3. unclear, grouped by why (the why sets the next step)
  const b3 = h('div', { class: 'statement' }, h('span', { class: 'kicker' }, 'Unclear'));
  if (!bl.nUnclear) b3.append(h('p', {}, h('strong', {}, 'Nothing.'), ' Every area has a rating.'));
  else {
    const g = bl.groups;
    b3.append(h('p', {}, `We cannot tell about ${bl.nUnclear} area${bl.nUnclear === 1 ? '' : 's'}, for different reasons:`));
    const ul = h('ul', { class: 'reasons' });
    if (g.mixed.length) ul.append(h('li', {}, h('strong', {}, `Evidence too weak or pointing both ways (${g.mixed.length}): `), ...names(g.mixed), '.', bl.closest ? ` Closest to a call: ${bl.closest.short} (leans ${bl.closest.node.N > 0 ? 'toward' : 'away from'} a problem).` : ''));
    if (g.toolGap.length) ul.append(h('li', {}, h('strong', {}, `The tool has no adequate measure yet (${g.toolGap.length}): `), ...names(g.toolGap), `. This is a gap in the tool, not in ${c}'s data; ask an economist.`));
    if (g.dataGap.length) ul.append(h('li', {}, h('strong', {}, `Too little recent data for ${c} (${g.dataGap.length}): `), ...names(g.dataGap), '. New data would settle it.'));
    if (g.sector.length) ul.append(h('li', {}, h('strong', {}, `Needs a sector study (${g.sector.length}): `), ...names(g.sector), '.'));
    b3.append(ul);
    if (bl.firmsTop) {
      const r = bl.firmsTop.r; const m = String(r.name || '').match(/choosing (.+?) as their biggest obstacle/i);
      const what = m ? m[1] : shortName(r).toLowerCase();
      b3.append(h('p', { class: 'small', style: 'margin-top:8px' }, `Firms rank ${what} as their biggest obstacle (${fmt(r.value_ref, 0)}% name it first, Enterprise Surveys ${refSpan(r)}), but complaints alone cannot establish a constraint${bl.firmsTop.toolGap ? ', and the tool has no measure of its cost yet' : ''}.`));
    }
  }
  body.append(b1, b2, b3);
  if (state.view.note) body.append(h('p', { class: 'note', style: 'grid-column:1/-1' }, state.view.note));
}
function leansBlock(bl, btn, { towardOnly = false } = {}) {
  const wrap = h('div', { class: 'leans' }, h('h3', { class: 'stmt-sub' }, 'Leans, below the bar (not a verdict)'));
  const ul = h('ul');
  const line = (label, items) => {
    if (!items.length) return null;
    const first = items[0];
    return h('li', {}, `${label}: `, ...joinEls(items.slice(0, 3).map((x) => [btn(x.id, x.short)])), '.', first.fact ? ` ${cap(first.short)}: ${first.fact.text}.` : '');
  };
  const a = line('Leans toward a problem', bl.towardLeans); const b = towardOnly ? null : line('Leans away', bl.awayLeans);
  if (a) ul.append(a); if (b) ul.append(b);
  if (!ul.children.length) ul.append(h('li', {}, 'Nothing leans clearly either way.'));
  wrap.append(ul);
  return wrap;
}
function shareText() {
  const ix = state.index; if (!ix || !Array.isArray(ix.countries) || !ix.countries.length) return '';
  const none = ix.countries.filter((c) => !Object.entries(c.tiers || {}).some(([id, t]) => !/^N11\./.test(id) && (t === 'ruled_out' || t === 'probably_not'))).length;
  const k = Math.round((none / ix.countries.length) * 10);
  return k >= 3 ? `This is common: about ${k} in 10 countries have no rule-out. ` : '';
}
function renderOverridesBox() {
  const box = $('overrides-box'); box.replaceChildren();
  const ovs = Object.entries(state.overrides);
  if (!ovs.length) return;
  const ul = h('ul', { class: 'diff-list' });
  for (const [id, v] of ovs) { const n = nodeOf(id); ul.append(h('li', {}, h('strong', {}, `${nodeCode(id)} ${short(id)}`), h('span', { class: `tier-badge ${tierClass(n && n.tier)}` }, h('span', {}, `tool: ${plainTier(n && n.tier)}`)), h('span', { class: 'arrow' }, '→'), h('span', { class: `tier-badge ${tierClass(v.tier)}` }, h('span', {}, `you: ${plainTier(v.tier)}`)), h('span', { class: 'muted' }, v.note), h('button', { class: 'btn quiet small', type: 'button', onclick: () => card.open(id) }, 'Edit'), h('button', { class: 'btn quiet small', type: 'button', onclick: () => { delete state.overrides[id]; writeHash(state); renderTreePanel(); renderStatements(); renderOverridesBox(); } }, 'Remove'))); }
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
function renderExport() {
  const body = $('export-body'); body.replaceChildren();
  const status = h('span', { class: 'small muted', 'aria-live': 'polite' }, '');
  const flash = (msg) => { status.textContent = msg; setTimeout(() => { status.textContent = ''; }, 2500); };
  body.append(h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center' },
    h('button', { class: 'btn primary', type: 'button', onclick: () => copyMemoRich().then(flash) }, 'Copy for email or Word'),
    h('button', { class: 'btn', type: 'button', onclick: () => flash(printMemo()) }, 'Print or save as PDF'),
    h('button', { class: 'btn quiet', type: 'button', onclick: downloadMemo }, `Download ${iso}-memo.md`),
    h('button', { class: 'btn quiet', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(location.href); flash('Link copied.'); } catch { flash(location.href); } } }, 'Copy link to this view'),
    status));
  body.append(h('p', { class: 'small muted', style: 'margin-top:8px' }, 'The link encodes the comparison countries, edited peers and your overrides. Paragraphs from Check a program idea are included when you have run one.'));
}
function memoText() { return buildMemo({ scorecard: state.scorecard, view: state.view, registry: state.registry, overrides: state.overrides, activeSet: state.activeSet, peers: state.peers, narrative: state.narrative, fcs: state.fcs, proposals: state.proposalParas, countries: state.countries, plain: plainCtx() }); }
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

// Evidence page (evidence-viz-prd): a node rail with the C9 evidence strip, C4 growth record, C7 firm obstacles and C11
// composition (views in evidence_node.mjs); under a node, its tests C5, C6 and C8 (evidence_tests.mjs); then C1 income-trend
// scatter, C2 peer comparison and C3 over time for one indicator; the year player (player.mjs) animates C1 and C2.
import { refreshNav } from './shell.mjs';
import { nodeCode, getJSON, loadRegistry, initTheme, h, fmt, fmtSigned, qs, unitHint, shortName, sourceLink, sourceLabel, dataBase, withData, downloadText, tierLabel, tierClass, HASH, readHash, writeHash, currentHash } from './common.mjs';
import { INCOME_ID, refSpan, scatterRows, structureFit, linearFit, lowessFit, lineAndBand, peerRank, residualPercentile, backTransform, referenceTable, viableYears, peerSummary, seriesRows, coverage, changeSinceStart, peerBand, slope, endpoints, stripRows, playerFrames, playerDomains, raceFrames } from './evidence_math.mjs';
import { createControls, bubbleChart, barRace } from './player.mjs';
import { reducedMotion } from './motion.mjs';
import { renderRail, renderNodeHead, drawStrip, drawGrowth, drawObstacles, drawComposition, nodeScope, VIEWS } from './evidence_node.mjs';
import { pqChoices, drawPriceQty, drawComove, drawBypass, drawCamels, CAMEL_VECTORS, CAMEL_FACTOR } from './evidence_tests.mjs';

initTheme();
const DATA = dataBase();
const $ = (id) => document.getElementById(id);
const CLASS_LABEL = { A: 'price', B: 'behaviour', C: 'quantity or perception', D: 'composite index', X: 'context' };
// Longer readings for the subtitle; the full key is the #class-key table in evidence.html (Workbook 4.6).
const CLASS_LONG = { A: 'a price or hard measure of rationing', B: 'behaviour that works around the constraint', C: 'a quantity, access measure or perception', D: 'a composite index, never decisive', X: 'context, no vote' };
// `custom` has no preset members: the comparators are only the economies the user adds (as published charts do).
const SET_LABEL = { structural: 'structural', regional: 'regional', aspirational: 'aspirational', custom: 'chosen' };
const setName = (c) => `${SET_LABEL[state.set]}${state.set !== 'custom' && c && c.added.length ? ' and added' : ''}`;
const panelCache = new Map();

const state = {
  iso: (qs('iso') || 'KEN').toUpperCase(),
  ind: qs('ind') || null,
  node: qs('node') || null,
  // Two views (PRD 8.1): the node (strip and test tabs) or one indicator (charts 1 to 3).
  panel: qs('panel') === 'indicator' ? 'indicator' : 'node',
  test: qs('test') || null,
  set: 'structural', fit: 'structure', asOf: null, added: [], c3years: 20, c3view: 'levels', c3peers: 'lines',
  c4since: 1990, c7measure: 'TOP', nodeOut: null,
  c5price: null, c5qty: null, c5axes: 'resid', outs: {},
  registry: null, countries: [], byIso: {}, scorecard: null, fits: null, index: null,
  current: null,
};

function readHashState() {
  const p = readHash();
  if (p.get('set') && SET_LABEL[p.get('set')]) state.set = p.get('set');
  if (['linear', 'lowess', 'structure'].includes(p.get('fit'))) state.fit = p.get('fit');
  if (p.get('asof')) state.asOf = Number(p.get('asof'));
  // `label` is the pre-November name of `add`; old links keep working.
  const add = p.get('add') || p.get('label');
  if (add) state.added = add.split(',').filter(Boolean);
  if (['10', '20', '30'].includes(p.get('yrs'))) state.c3years = Number(p.get('yrs'));
  if (p.get('view') === 'change') state.c3view = 'change';
  if (p.get('peerlines') === 'band') state.c3peers = 'band';
  if (['1960', '1980', '1990', '2000'].includes(p.get('since'))) state.c4since = Number(p.get('since'));
  if (p.get('measure') === 'major') state.c7measure = 'MAJOR';
  if (p.get('pqp')) state.c5price = p.get('pqp');
  if (p.get('pqq')) state.c5qty = p.get('pqq');
  if (p.get('pqaxes') === 'raw') state.c5axes = 'raw';
}
function writeUrl(push = false) {
  const q = new URLSearchParams(location.search);
  q.set('iso', state.iso); q.set('node', state.node); q.set('ind', state.ind);
  if (state.panel === 'indicator') q.set('panel', 'indicator'); else q.delete('panel');
  if (state.test) q.set('test', state.test); else q.delete('test');
  const p = new URLSearchParams();
  if (state.set !== 'structural') p.set('set', state.set);
  // keep the country pages' state (peers, overrides, evidence setting) so the top bar carries it on
  const prev = readHash();
  for (const k of [HASH.peers, HASH.overrides, HASH.setting]) if (prev.get(k) != null) p.set(k, prev.get(k));
  if (state.fit !== 'structure') p.set('fit', state.fit);
  if (state.asOf && state.asOf !== snapYear()) p.set('asof', String(state.asOf));
  if (state.added.length) p.set('add', state.added.join(','));
  if (state.c3years !== 20) p.set('yrs', String(state.c3years));
  if (state.c3view !== 'levels') p.set('view', state.c3view);
  if (state.c3peers !== 'lines') p.set('peerlines', state.c3peers);
  if (state.c4since !== 1990) p.set('since', String(state.c4since));
  if (state.c7measure !== 'TOP') p.set('measure', 'major');
  if (state.c5price) p.set('pqp', state.c5price);
  if (state.c5qty) p.set('pqq', state.c5qty);
  if (state.c5axes !== 'resid') p.set('pqaxes', state.c5axes);
  writeHash(p, { push, query: `?${q.toString()}` });
}

const snapYear = () => (state.index && state.index.snapshot_year) || 2026;
/** Data vintage for footers and exports: snapshot id and rubric version. */
const vintage = () => (state.index ? `Snapshot ${state.index.snapshot_id}, rubric ${state.index.rubric_version}.` : '');
const nameOf = (iso3) => (state.byIso[iso3] ? state.byIso[iso3].name : iso3);
const css = (v, fb) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb;

async function panel(id) {
  if (!panelCache.has(id)) panelCache.set(id, getJSON(`${DATA}/panel/${encodeURIComponent(id)}.json`, { optional: true }));
  return panelCache.get(id);
}

function showError(msg) { const e = $('page-error'); e.hidden = false; e.textContent = msg; }

// ---------- controls ----------
const thresholds = () => (state.registry.params.icr && state.registry.params.icr.signal_thresholds) || { weak: 0.75, strong: 1.5 };
const windowOf = (ind) => ind.reference_window_years || (state.fits && state.fits.window_years) || 12;

/** The economy's coverage of an indicator: [first_year, last_year, n_years], or null (none, or coverage not loaded). */
const covOf = (id) => (state.coverage && state.coverage[id]) || null;

/** Option text: the full name (the parenthetical tells "comprehensive" from "non-tariff", DB06-15 from DB16-20),
 *  the source, the economy's latest year and the class; `also` names the other nodes it informs. */
function indText(i, also = []) {
  const cls = i.class || 'X', cov = covOf(i.id);
  return [i.name || i.id, sourceLabel(i), cov ? `${nameOf(state.iso)} ${cov[1]}` : null, `class ${cls}, ${CLASS_LABEL[cls]}`,
    also.length ? `also ${also.join(', ')}` : null].filter(Boolean).join(' · ');
}

function indOption(i, also = []) {
  const base = indText(i, also);
  if (!state.coverage) return h('option', { value: i.id }, base);
  const cov = covOf(i.id), asOf = state.asOf || snapYear();
  if (!cov) return h('option', { value: i.id, disabled: i.id !== state.ind ? '' : null }, `${base} · no data for ${nameOf(state.iso)}`);
  if (cov[1] < asOf - windowOf(i)) return h('option', { value: i.id, class: 'ev-opt-old' }, `${base} · outside the window`);
  return h('option', { value: i.id }, base);
}

function buildIndicatorSelect() {
  const R = state.registry;
  const sel = $('c-ind');
  sel.replaceChildren();
  const fits = state.fits.fits;
  const usable = (ind) => ind.id !== INCOME_ID && fits[ind.id] && fits[ind.id].ok;
  const nodes = R.nodes.nodes.filter((n) => n.diagnosable && !n.rollup_of);
  // Each indicator appears under every node it informs (the first copy is the one the select shows as chosen).
  const placed = new Set(), find = [];
  for (const n of nodes) {
    const inds = R.indicators.indicators.filter((i) => usable(i) && (i.nodes || []).includes(n.id) && i.class !== 'X');
    if (!inds.length) continue;
    const g = h('optgroup', { label: `${nodeCode(n.id)} ${n.short}` });
    for (const i of inds.sort((a, b) => (a.class || 'Z').localeCompare(b.class || 'Z') || shortName(a).localeCompare(shortName(b)))) {
      const also = (i.nodes || []).filter((x) => x !== n.id).map(nodeCode);
      g.append(indOption(i, also));
      if (!placed.has(i.id)) find.push([i, `${nodeCode(n.id)} · ${indText(i, also)}`]);
      placed.add(i.id);
    }
    if (g.children.length) sel.append(g);
  }
  const ctx = R.indicators.indicators.filter((i) => usable(i) && !placed.has(i.id));
  if (ctx.length) {
    const g = h('optgroup', { label: 'Context and other' });
    for (const i of ctx.sort((a, b) => shortName(a).localeCompare(shortName(b)))) { g.append(indOption(i)); find.push([i, `Context · ${indText(i)}`]); }
    sel.append(g);
  }
  state.findText = new Map(find.map(([i, t]) => [t, i.id]));
  $('c-ind-list').replaceChildren(...find.filter(([i]) => covOf(i.id) || !state.coverage).map(([, t]) => h('option', { value: t })));
  if (!state.ind && state.node) state.ind = defaultIndFor(state.node);
  if (!state.ind || !R.indicatorById[state.ind] || !usable(R.indicatorById[state.ind])) state.ind = 'FR.INR.RINR';
  sel.value = state.ind;
}

/** The indicator charted below when a rail entry is picked. */
function defaultIndFor(view) {
  const R = state.registry, fits = state.fits.fits;
  const usable = (i) => i.id !== INCOME_ID && fits[i.id] && fits[i.id].ok;
  if (view === 'growth') return R.indicatorById['NY.GDP.PCAP.KD.ZG'] && usable(R.indicatorById['NY.GDP.PCAP.KD.ZG']) ? 'NY.GDP.PCAP.KD.ZG' : state.ind;
  if (view === 'composition') return ['ATLAS.TOP5', 'NE.EXP.GNFS.ZS'].find((id) => R.indicatorById[id] && usable(R.indicatorById[id])) || state.ind;
  if (view === 'firms') return (state.nodeOut && state.nodeOut.ids && state.nodeOut.ids[0]) || `ES.OBST_FIN_${state.c7measure}`;
  const scope = new Set(nodeScope(R, view));
  const inds = R.indicators.indicators.filter((i) => usable(i) && (i.nodes || []).some((n) => scope.has(n)));
  const has = (i) => !state.coverage || !!state.coverage[i.id];
  return (inds.find((i) => has(i) && ['A', 'B'].includes(i.class)) || inds.find(has) || inds[0] || { id: state.ind }).id;
}

/** Show a rail entry: its view at the top, and a sensible indicator in the charts below. */
function pickView(view) {
  state.node = view;
  state.ind = defaultIndFor(view);
  state.panel = 'node';
  state.test = null;
  $('c-ind').value = state.ind;
  writeUrl(true);
  render().then(() => $('sec-node').scrollIntoView({ block: 'start' }));
}

/** Open the indicator view for one indicator; the browser's Back button returns to the node. */
function openIndicator(id) {
  state.ind = id;
  $('c-ind').value = id;
  state.panel = 'indicator';
  writeUrl(true);
  // Move focus with the view, so a keyboard pick (Enter on a strip row or a C8 panel) does not drop focus to the top of the page.
  return render().then(() => { if ($('main').classList.contains('ev-split')) $('view-ind').scrollTop = 0; else $('view-ind').scrollIntoView({ block: 'start' }); const head = $('detail-head'); if (!head.hasAttribute('tabindex')) head.setAttribute('tabindex', '-1'); head.focus({ preventScroll: true }); });
}
function backToNode() {
  state.panel = 'node';
  writeUrl(true);
  render().then(() => { $('sec-node').scrollIntoView({ block: 'start' }); const t = document.querySelector('#test-tabs [aria-selected="true"]'); if (t) t.focus({ preventScroll: true }); });
}

/** Chart one indicator below (from a C9 or C7 row). */
function pickIndicator(id) {
  if (!state.registry.indicatorById[id] || !state.fits.fits[id] || !state.fits.fits[id].ok) return;
  openIndicator(id);
}

function buildControls() {
  const cs = $('c-country');
  for (const c of state.countries.slice().sort((a, b) => a.name.localeCompare(b.name))) cs.append(h('option', { value: c.iso3 }, c.name));
  cs.value = state.iso;
  const dl = $('dl-countries');
  for (const c of state.countries) dl.append(h('option', { value: c.name }));
  const asof = $('c-asof');
  for (let y = snapYear(); y >= 2005; y--) asof.append(h('option', { value: String(y) }, y === snapYear() ? `${y} (latest)` : String(y)));
  asof.value = String(state.asOf || snapYear());
  $('c-set').value = state.set;
  $('c-fit').value = state.fit;
  buildIndicatorSelect();

  cs.addEventListener('change', async () => { state.iso = cs.value; await loadCountry(); buildIndicatorSelect(); render(); });
  $('c-ind').addEventListener('change', () => openIndicator($('c-ind').value));
  // The search box: picking a suggestion (its full text) opens that indicator and clears the box.
  $('c-ind-find').addEventListener('input', (e) => {
    const id = state.findText && state.findText.get(e.target.value);
    if (!id) return;
    e.target.value = ''; e.target.blur();
    $('c-ind').value = id; openIndicator(id);
  });
  $('back-node').addEventListener('click', backToNode);
  // Back and Forward move between the two views (and between nodes) without reloading.
  window.addEventListener('popstate', () => {
    const q = new URLSearchParams(location.search);
    state.panel = q.get('panel') === 'indicator' ? 'indicator' : 'node';
    state.test = q.get('test') || null;
    if (q.get('node')) state.node = q.get('node');
    if (q.get('ind') && state.registry.indicatorById[q.get('ind')]) { state.ind = q.get('ind'); $('c-ind').value = state.ind; }
    render();
  });
  $('c-set').addEventListener('change', () => { state.set = $('c-set').value; render(); });
  $('c-fit').addEventListener('change', () => { state.fit = $('c-fit').value; render(); });
  asof.addEventListener('change', () => setAsOf(Number(asof.value)));
  const lab = $('c-label');
  lab.addEventListener('change', () => {
    const c = state.countries.find((x) => x.name.toLowerCase() === lab.value.trim().toLowerCase() || x.iso3 === lab.value.trim().toUpperCase());
    if (c && c.iso3 !== state.iso && !state.added.includes(c.iso3)) { state.added.push(c.iso3); render(); }
    lab.value = '';
  });
  // "+ Pack" beside every chart's downloads: keep this chart, as drawn now, for a pack built across nodes and indicators.
  document.querySelectorAll('.ev-actions[data-chart]').forEach((a) => {
    // "Slide": a 16:9 PNG for a deck, titled with the question, the readout left out (UX #21).
    a.querySelector('[data-kind="png"]').after(h('button', { class: 'btn small', 'data-kind': 'slide', type: 'button', title: 'A 16:9 PNG for slides: title, chart and source line, without the readout' }, 'Slide'));
    a.append(h('button', { class: 'btn small', 'data-kind': 'pin', type: 'button', title: 'Add this chart, as drawn now, to your pack' }, '+ Pack'));
  });
  document.querySelectorAll('.ev-actions[data-chart] button[data-kind]').forEach((b) => b.addEventListener('click', () => {
    const chart = b.closest('.ev-actions').dataset.chart, kind = b.dataset.kind;
    if (kind === 'pin') pinChart(chart, b); else if (kind === 'slide') exportSlide(chart); else if (kind === 'csv') exportCSV(chart); else if (kind === 'svg') exportSVG(chart); else exportPNG(chart);
  }));
  $('c3-years').value = String(state.c3years); $('c3-view').value = state.c3view; $('c3-peers').value = state.c3peers;
  $('c3-years').addEventListener('change', () => { state.c3years = Number($('c3-years').value); render(); });
  $('c3-view').addEventListener('change', () => { state.c3view = $('c3-view').value; render(); });
  $('c3-peers').addEventListener('change', () => { state.c3peers = $('c3-peers').value; render(); });
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => setAsOf(snapYear())));
  $('c5-price').addEventListener('change', () => { state.c5price = $('c5-price').value; writeUrl(); renderTests(state.current); });
  $('c5-qty').addEventListener('change', () => { state.c5qty = $('c5-qty').value; writeUrl(); renderTests(state.current); });
  $('c5-axes').value = state.c5axes;
  $('c5-axes').addEventListener('change', () => { state.c5axes = $('c5-axes').value; writeUrl(); renderTests(state.current); });
  const tb = $('toolbar'), tog = $('tb-toggle');
  tog.addEventListener('click', () => { const open = tb.classList.toggle('open'); tog.setAttribute('aria-expanded', String(open)); tog.lastElementChild.textContent = open ? 'Done' : 'Change'; });
  $('ev-sub').addEventListener('click', (e) => { if (e.target.closest('a[href="#class-key"]')) $('class-key').open = true; });
  $('pack').addEventListener('click', exportPack);
  $('pins').addEventListener('click', exportPins);
  $('pins-clear').addEventListener('click', () => { state.pins = []; savePins(); showPins(); });
  state.pins = loadPins(); showPins();
  $('copy-link').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); $('copy-link').textContent = 'Link copied'; } catch { $('copy-link').textContent = 'Copy failed'; }
    setTimeout(() => { $('copy-link').textContent = 'Copy link'; }, 1600);
  });
  initPlayer();
  const tbar = $('toolbar');
  const setTb = () => document.documentElement.style.setProperty('--tb-h', `${tbar.offsetHeight}px`);
  setTb();
  if (window.ResizeObserver) new ResizeObserver(setTb).observe(tbar);
  let t = null;
  // Crossing 1,400 px opens or closes the side panel; the charts then redraw at their new widths.
  if (WIDE.addEventListener) WIDE.addEventListener('change', () => { showPanel(); window.dispatchEvent(new Event('resize')); });
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (state.current) { const c = state.current; c.dy = null; c.flip = null; c.c3dy = null; if (player && player.on) buildPlayer(c).then(() => showPlayer(player.year, 0)); else { draw(c); drawBars(c); } drawLines(c); renderNodeView(c); } }, 150); });
}

/**
 * The "Back to 2026" nudge in the control bar: shown while the page is set to a past year, unless the
 * latest year has no value for this economy and indicator (then going back would only empty the charts).
 */
function syncBack(c) {
  const snap = snapYear(), cov = covOf(c.ind.id);
  const latestHasData = !state.coverage || (cov && snap - cov[1] <= c.W);
  const show = c.asOf !== snap && latestHasData;
  $('toolbar').classList.toggle('ev-past', show);
  document.querySelectorAll('[data-back]').forEach((b) => {
    b.hidden = !show;
    // An arrow alone in the desktop bar, so the year stays readable (the title and label name the year); spelled out in the phone summary row.
    b.textContent = b.closest('.ev-asof-row') ? '↩' : `Back to ${snap}`;
    b.setAttribute('aria-label', `Back to the latest data (${snap})`);
    b.title = `Return to the latest data (${snap})`;
  });
}

function setAsOf(y) {
  state.asOf = y;
  $('c-asof').value = String(y);
  buildIndicatorSelect();
  render();
}

async function loadCountry() {
  [state.scorecard, state.coverage] = await Promise.all([
    getJSON(`${DATA}/${state.iso}.json`, { optional: true }),
    getJSON(`${DATA}/coverage/${state.iso}.json`, { optional: true }),
  ]);
  refreshNav();
}

// ---------- compute ----------
/** The engine's fit settings, for the income-only lines (chart 1 and C5). */
function fitOpts() {
  const icr = state.fits.params_icr || {};
  return { huberK: icr.huber_k || 1.345, winsor: icr.winsorize_percentiles || [1, 99], minN: icr.min_countries || 40 };
}

async function compute() {
  const R = state.registry;
  const ind = R.indicatorById[state.ind];
  const [ip, inc] = await Promise.all([panel(ind.id), panel(INCOME_ID)]);
  if (!ip || !inc) return { ind, error: `No panel data for ${ind.id}.` };
  const asOf = state.asOf || snapYear();
  const W = windowOf(ind);
  const transform = ind.transform || 'none';
  const rawRows = scatterRows(ip, inc, { asOfYear: asOf, windowYears: W, transform });
  const opts = fitOpts();
  const engineFit = await fitFor(ind.id);
  // "Income and structure": the verdict layer's own fit, drawn as values net of structure against income (UX #23).
  const sfit = state.fit !== 'structure' ? null : asOf === snapYear() ? structureFit(rawRows, engineFit)
    : { ok: false, n: 0, reason: `the rating’s fit exists for the ${snapYear()} snapshot only` };
  const rows = sfit && sfit.ok ? sfit.rows.map((r) => ({ ...r, raw: backTransform(r.y, transform) })) : rawRows;
  // Where the rating has no fit (an earlier as-of year, an indicator it does not fit), draw the income-only line and say why.
  const fit = sfit && sfit.ok ? sfit : state.fit === 'lowess' ? lowessFit(rows, opts) : linearFit(rows, opts);
  if (sfit && !sfit.ok) fit.fallback = sfit.reason;
  const sc = state.scorecard;
  const setInfo = state.set !== 'custom' && sc && sc.comparators && sc.comparators[state.set];
  const preset = (setInfo && setInfo.members) || [];
  const added = state.added.filter((x) => x !== state.iso && !preset.includes(x));
  const peers = [...preset, ...added];
  const values = Object.fromEntries(rawRows.map((r) => [r.iso3, r.raw]));
  const engineT = asOf === snapYear() && engineFit && engineFit.ok && engineFit.t ? engineFit.t[state.iso] : null;
  const limit = (R.params.recency && R.params.recency.staleness_limit_years) || 8;
  // C2: latest reference values for the economy and its comparators (no income needed).
  const refs = referenceTable(ip, asOf, W);
  const refVals = Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, v.value]));
  const barRows = [state.iso, ...peers.filter((p) => p !== state.iso)].filter((k) => refs[k]).map((k) => ({ iso3: k, value: refs[k].value, year: refs[k].year, from: refs[k].from, n: refs[k].n, latest: refs[k].latest }));
  // C3: annual series over the chosen span.
  const from = asOf - state.c3years + 1;
  const who = [state.iso, ...peers];
  let series = seriesRows(ip, who, from, asOf);
  const sparse = coverage(series, state.iso, from, asOf) < 0.5;
  if (state.c3view === 'change') series = changeSinceStart(series);
  const band = peerBand(series, peers, state.iso);
  return {
    ind, rows, fit, transform, asOf, W, peers, preset, added, setInfo, values, engineT, engineFit, limit,
    refs, refVals, barRows, summary: peerSummary(refVals, peers, state.iso), rank2: peerRank(refVals, state.iso, peers),
    series, band, from, sparse,
    trendT: slope(series.filter((r) => r.iso3 === state.iso)), trendM: slope(band.map((b) => ({ year: b.year, value: b.median }))),
    band,
    endT: endpoints(series.filter((r) => r.iso3 === state.iso)), endM: endpoints(band.map((b) => ({ year: b.year, value: b.median }))),
    target: rows.find((r) => r.iso3 === state.iso) || null,
    where: whereData(ind, ip, inc, rows, fit, asOf, W, transform, opts.minN),
    line: lineAndBand(fit, rows, transform),
    rank: peerRank(values, state.iso, peers),
    pct: residualPercentile(fit, state.iso),
  };
}

/**
 * When the economy has no point (or no line can be fitted) at this as-of year, find where its data are:
 * {cov: [first, last, n] | null, suggest: as-of year to jump to | null, why}. Null when nothing is missing.
 */
function whereData(ind, ip, inc, rows, fit, asOf, W, transform, minN) {
  const own = ip.v[state.iso];
  const missing = !fit.ok || !rows.some((r) => r.iso3 === state.iso);
  if (!missing && own && seriesRows(ip, [state.iso], asOf - state.c3years + 1, asOf).length >= 2) return null;
  const yrs = own ? ip.years.filter((y, i) => own[i] !== null) : [];
  const cov = yrs.length ? [yrs[0], yrs[yrs.length - 1], yrs.length] : null;
  if (!cov) return { cov, suggest: null };
  const choices = [];
  for (let y = snapYear(); y >= 2005; y--) choices.push(y);
  const near = (list) => list.sort((a, b) => Math.abs(a - asOf) - Math.abs(b - asOf) || b - a)[0];
  const fitYears = viableYears(ip, inc, state.iso, { years: choices, windowYears: W, transform, minN }).map((v) => v.year).filter((y) => y !== asOf);
  if (fitYears.length) return { cov, suggest: near(fitYears), why: 'fit' };
  // No year gives both a point and a line: at least show the economy's own value (charts 2 and 3).
  const own2 = choices.filter((y) => y !== asOf && yrs.some((d) => d <= y && y - d <= W));
  return { cov, suggest: own2.length ? near(own2) : null, why: own2.length ? 'own' : cov[1] < 2005 - W ? 'old' : 'thin' };
}

/** "Kenya has data for 2005 only. [Show data as of 2016]": the pointer shown in each empty chart (jump=false: the sentence only). */
function whereNote(c, jump = true) {
  const w = c.where;
  if (!w) return '';
  const name = nameOf(state.iso);
  if (!w.cov) return h('span', {}, `${name} has no data for this indicator in any year.`);
  const [a, b, n] = w.cov;
  const span = a === b ? `${a} only` : `${n} years between ${a} and ${b}`;
  const out = h('span', {}, `${name} has data for ${span}.`);
  if (!jump) {
    // The as-of year is not the problem (e.g. one survey wave): say so rather than offer a jump.
  } else if (w.suggest) {
    out.append(' ', h('button', { type: 'button', class: 'btn small', onclick: () => setAsOf(w.suggest) }, `Show data as of ${w.suggest}`));
    if (w.why === 'own') out.append(' ', h('span', { class: 'muted' }, 'Too few other economies have data then to draw the income line.'));
  } else if (w.why === 'old') {
    out.append(` That is before the earliest "data as of" year this page offers (2005).`);
  } else {
    out.append(' Too few other economies have data in those years to draw the income line.');
  }
  return out;
}

// ---------- direction ----------
/** True when a positive gap (higher than expected, above the median, rising) points toward the constraint binding. */
const upIsBinding = (ind) => ind.direction === 1;

/**
 * Two corner labels saying which side of the chart points toward binding ("▲ Above the line: toward binding").
 * Empty for context indicators (direction 0). corner is 'right' or 'left'.
 */
function sideLabels(P, ind, { above, below, corner }) {
  if (!ind.direction) return [];
  const up = upIsBinding(ind);
  const { binding: bind, muted } = palette(), halo = css('--bg', '#fff');
  const common = { text: (d) => d, textAnchor: corner === 'right' ? 'end' : 'start', fontSize: 12, fontWeight: 600, stroke: halo, strokeWidth: 4, paintOrder: 'stroke' };
  const dx = corner === 'right' ? -8 : 8;
  return [
    P.text([`▲ ${above}: ${up ? 'toward binding' : 'away from binding'}`], { ...common, frameAnchor: `top-${corner}`, dx, dy: 8, fill: up ? bind : muted }),
    P.text([`▼ ${below}: ${up ? 'away from binding' : 'toward binding'}`], { ...common, frameAnchor: `bottom-${corner}`, dx, dy: -8, fill: up ? muted : bind }),
  ];
}

/** "points toward the constraint binding" / "leans away from …" / neutral, for a distance t (sd) from the line. */
function leanPhrase(ind, t) {
  const th = thresholds(), way = (t > 0) === upIsBinding(ind) ? 'toward' : 'away from';
  if (Math.abs(t) >= th.strong) return `points ${way} the constraint binding`;
  if (Math.abs(t) >= th.weak) return `leans ${way} the constraint binding`;
  return 'is close enough to the line to read as neutral';
}

// ---------- draw ----------
function yDomain(c) {
  const vals = c.rows.map((r) => r.raw).filter((v) => c.transform !== 'log' || v > 0).sort((a, b) => a - b);
  const q = (p) => vals[Math.min(vals.length - 1, Math.max(0, Math.round(p * (vals.length - 1))))];
  let lo = q(0.025), hi = q(0.975);
  const must = [c.target, ...c.rows.filter((r) => c.peers.includes(r.iso3))].filter(Boolean).map((r) => r.raw);
  for (const v of must) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (const p of c.line) { if (p.y != null) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); } }
  if (c.transform === 'log') return [lo / 1.15, hi * 1.15];
  const pad = (hi - lo) * 0.06 || 1;
  return [c.transform === 'log1p' || c.transform === 'logit' ? Math.max(0, lo - pad) : lo - pad, hi + pad];
}

/** The verdict layer's structural controls, in words (income itself left out). */
function structureWords(controls) {
  return (controls || []).filter((x) => x !== 'log_gdppc_ppp').map((x) => ({ log_population: 'population', resource_rents: 'resource rents', landlocked: 'landlocked', log_remoteness: 'remoteness' }[x] || x));
}

function draw(c) {
  const host = $('chart');
  host.replaceChildren();
  if (!c.fit.ok) { host.append(h('p', { class: 'ev-empty' }, `No income-trend line can be drawn for ${c.asOf}: ${c.fit.reason}. `, whereNote(c))); return; }
  const P = window.Plot;
  if (!P) { host.append(h('p', { class: 'ev-empty' }, 'The charting library did not load (check the network).')); return; }
  const { text, focus, focusInk, peer, peerFill, fit, band, other, binding } = palette();
  const width = Math.max(320, host.clientWidth || 900);
  const height = Math.round(Math.min(620, Math.max(360, width * 0.58)));
  const [ylo, yhi] = yDomain(c);
  const peerSet = new Set(c.peers);
  const stale = (r) => c.asOf - r.year > c.limit;
  const others = c.rows.filter((r) => r.iso3 !== state.iso && !peerSet.has(r.iso3));
  const peerRows = c.rows.filter((r) => peerSet.has(r.iso3) && r.iso3 !== state.iso);
  const target = c.target;
  const yType = c.transform === 'log' ? 'log' : c.transform === 'log1p' ? 'symlog' : 'linear';
  const unit = unitOf(c.ind);
  // The binding side of the line gets a faint tint in the binding colour (above for direction +1, below for -1).
  const bindTint = c.ind.direction ? [P.areaY(c.line, { x: 'income', y1: 'y', y2: () => (upIsBinding(c.ind) ? yhi : ylo), fill: binding, fillOpacity: 0.07, clip: true })] : [];
  const marks = [
    ...bindTint,
    P.areaY(c.line, { x: 'income', y1: 'lo', y2: 'hi', fill: band, fillOpacity: 0.8, clip: true }),
    P.line(c.line, { x: 'income', y: 'y', stroke: fit, strokeWidth: 2, clip: true }),
    P.dot(others, { x: 'income', y: 'raw', r: 2.6, fill: (d) => (stale(d) ? 'none' : other), stroke: other, strokeWidth: 0.8, fillOpacity: 0.55, strokeOpacity: 0.8, clip: true }),
    P.dot(peerRows, { x: 'income', y: 'raw', r: 4.5, fill: (d) => (stale(d) ? 'none' : peerFill), stroke: peer, strokeWidth: 1.4, clip: true }),
    ...byOffset(peerRows, c.dy, c.flip).map((g) => P.text(g.rows, { x: 'income', y: 'raw', text: (d) => d.iso3, dx: g.left ? -7 : 7, dy: g.off, textAnchor: g.left ? 'end' : 'start', fontSize: 11, fontWeight: 600, fill: peer, clip: true })),
  ];
  marks.push(...sideLabels(P, c.ind, { above: 'Above the line', below: 'Below the line', corner: 'right' }));
  if (target) {
    const fitted = backTransform(c.fit.predict(target.x), c.transform);
    marks.push(
      P.link([target], { x1: 'income', x2: 'income', y1: 'raw', y2: () => fitted, stroke: focus, strokeDasharray: '3,3', strokeWidth: 1.2 }),
      P.dot([target], { x: 'income', y: 'raw', r: 7, fill: stale(target) ? 'none' : focus, stroke: focus, strokeWidth: 2 }),
      P.text([target], { x: 'income', y: 'raw', text: () => `${nameOf(state.iso)} ${fmtSigned(c.fit.t[state.iso], 1)} sd`, dx: c.flip && c.flip.has('__target') ? -10 : 10, dy: -10, textAnchor: c.flip && c.flip.has('__target') ? 'end' : 'start', fontSize: 13, fontWeight: 600, fill: focusInk }),
    );
  }
  marks.push(P.tip(c.rows, P.pointer({
    x: 'income', y: 'raw',
    title: (d) => `${nameOf(d.iso3)}\n${fmt(d.raw, Math.abs(d.raw) < 10 ? 2 : 1)} ${unit} (${d.year})\nGDP per capita $${Math.round(d.income).toLocaleString('en-US')}\n${fmtSigned(c.fit.t[d.iso3], 2)} sd from the line`,
  })));
  const spec = {
    width, height, marginLeft: 58, marginRight: 24, marginTop: 18, marginBottom: 44,
    style: { background: 'transparent', color: text, fontSize: '12px', fontFamily: 'Inter, system-ui, sans-serif' },
    x: { type: 'log', label: width < 560 ? 'GDP per capita, PPP (log scale) →' : 'GDP per capita, PPP (constant 2021 international $, log scale) →', ticks: [1000, 2000, 5000, 10000, 20000, 50000, 100000].filter((t) => t >= c.rows[0].income / 1.2 && t <= c.rows[c.rows.length - 1].income * 1.2), tickFormat: (d) => `$${d >= 1000 ? `${d / 1000}k` : d}`, grid: true },
    y: { type: yType, domain: [ylo, yhi], label: (() => { const s = `↑ ${shortName(c.ind)}${unit ? ` (${unit})` : ''}${c.fit.method === 'structure' ? ', net of structure' : ''}${yType === 'linear' ? '' : ', log scale'}`; const max = Math.max(30, Math.floor(width / 7.5)); return s.length > max ? `${s.slice(0, max - 1)}…` : s; })(), grid: true, nice: yType === 'linear' },
    marks,
  };
  let chart = P.plot(spec);
  if (!c.dy) {
    // Second pass: nudge comparator labels that would overlap.
    const xs = chart.scale('x');
    c.flip = new Set(peerRows.filter((r) => xs.apply(r.income) > width - 24 - 50).map((r) => r.iso3));
    if (target && xs.apply(target.income) > width - 24 - 150) c.flip.add('__target');
    c.dy = layoutLabels(peerRows, target, xs, chart.scale('y'), c.flip);
    return draw(c);
  }
  chart.setAttribute('aria-hidden', 'true');
  host.append(chart);
  const off = c.rows.filter((r) => r.raw < ylo || r.raw > yhi).length;
  c.offChart = off;
}

/** Group rows by their label offset, so each offset is one text layer (Plot's dy is a constant). */
function byOffset(rows, dy, flip) {
  const g = new Map();
  for (const r of rows) {
    const o = (dy && dy[r.iso3]) || 0, left = !!(flip && flip.has(r.iso3));
    const k = `${o}|${left}`;
    if (!g.has(k)) g.set(k, { off: o, left, rows: [] });
    g.get(k).rows.push(r);
  }
  return [...g.values()];
}

/** Greedy vertical nudges (pixels) so labels at nearby positions do not overlap. */
function layoutLabels(rows, target, xs, ys, flip = new Set()) {
  const pos = rows.map((r) => ({ iso3: r.iso3, x: xs.apply(r.income) + (flip.has(r.iso3) ? -30 : 0), y: ys.apply(r.raw), w: 30 }));
  if (target) pos.push({ iso3: '__target', x: xs.apply(target.income) + (flip.has('__target') ? -120 : 4), y: ys.apply(target.raw) - 10, w: 120, fixed: true });
  pos.sort((a, b) => (a.fixed ? -1 : b.fixed ? 1 : a.y - b.y));
  const placed = [], dy = {};
  for (const p of pos) {
    let off = 0;
    for (let k = 0; k < 12; k++) {
      const clash = placed.find((q) => Math.abs(q.x - p.x) < Math.max(q.w, p.w) && Math.abs(q.y - (p.y + off)) < 12);
      if (!clash) break;
      off = (k % 2 === 0 ? 1 : -1) * 12 * Math.ceil((k + 1) / 2);
    }
    placed.push({ ...p, y: p.y + off });
    if (!p.fixed) dy[p.iso3] = off;
  }
  return dy;
}

// ---------- text ----------
function unitOf(ind) {
  const u = unitHint(ind) || '';
  if (u) return u;
  if (/^Percent(age)? of firms/i.test(ind.name || '')) return '% of firms';
  if (/^Proportion of/i.test(ind.name || '') || /\(%\)/.test(ind.name || '')) return '%';
  return '';
}
function fmtVal(ind, v) {
  const u = unitOf(ind);
  const n = fmt(v, Math.abs(v) < 10 ? 2 : 1).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return u.startsWith('%') ? `${n}${u}` : u ? `${n} ${u}` : n;
}
/** A value with a compact unit ("18%" rather than "18% of firms ...") for repeated mentions and chart labels. */
const trimNum = (v) => fmt(v, Math.abs(v) < 10 ? 2 : 1).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
function fmtShort(ind, v) {
  return unitOf(ind).startsWith('%') ? `${trimNum(v)}%` : fmtVal(ind, v);
}
/** A difference between two values: percentages differ by percentage points, not by percent. */
function fmtDiff(ind, v) {
  return unitOf(ind).startsWith('%') ? `${trimNum(v)} percentage points` : fmtVal(ind, v);
}
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

function renderText(c) {
  const ind = c.ind;
  const country = nameOf(state.iso);
  $('page-title').textContent = `${country}: the evidence, node by node`;
  document.querySelectorAll('a[data-keep-iso]').forEach((a) => { a.href = withData(`/growth-test-site/desk/country.html?iso=${encodeURIComponent(state.iso)}`); });
  $('ev-title').textContent = `${shortName(ind)}: is it high or low for an economy at ${country}'s income level?`;
  const cls = ind.class || 'X', wt = (state.registry.params.class_weights || {})[cls];
  $('ev-sub').replaceChildren(`${ind.name}. Class ${cls}: ${CLASS_LONG[cls] || 'other'}${wt ? `, weight ${wt.toFixed(1)} in the verdict` : ''} (`, h('a', { href: '#class-key' }, 'what the classes mean'), `). Nodes ${(ind.nodes || []).join(', ') || 'context'}. Each point is an economy; the line is what income predicts.`);
  syncBack(c);
  $('tb-summary').textContent = `${country} · ${shortName(ind)} · ${state.set === 'custom' ? `${c.added.length} chosen comparators` : `${SET_LABEL[state.set]} comparators${c.added.length ? ` + ${c.added.length} added` : ''}`}${c.asOf !== snapYear() ? ` · as of ${c.asOf}` : ''}`;
  document.title = `${country} · Charts · ${shortName(ind)} · The Growth Test`;
  const unit = unitHint(ind);
  const parts = [];
  if (!c.target) {
    if (!c.where || c.where.cov) parts.push(`${country} has no value for this indicator within the ${c.W} years to ${c.asOf}.`);
  } else if (c.fit.ok) {
    const t = c.fit.t[state.iso];
    const dir = Math.abs(t) < 0.05 ? 'at' : t > 0 ? 'above' : 'below';
    parts.push(`<strong>${country}: ${fmtVal(ind, c.values[state.iso] ?? c.target.raw)} (${refSpan(c.target)}${c.target.n > 1 && Number.isFinite(c.target.latest) && Math.abs(c.target.latest - c.target.raw) > 1e-9 ? `; ${fmtVal(ind, c.target.latest)} in ${c.target.year} alone` : ''}).</strong>`);
    const structure = c.fit.method === 'structure';
    const what = structure ? 'its income and structure predict' : 'its income predicts';
    parts.push(dir === 'at' ? `That is at what ${what}` : `That is <strong>${fmt(Math.abs(t), 1)} standard deviations ${dir}</strong> what ${what}`);
    parts[parts.length - 1] += structure
      ? ` (the rating’s own fit, ${c.fit.n} economies), the ${ordinal(Math.round(c.pct))} percentile. The chart shows each economy’s value net of its structure (${structureWords(c.fit.controls).join(', ')}), against income.`
      : ` (${c.fit.method === 'lowess' ? 'LOWESS' : 'linear'} fit on income alone, ${c.fit.n} economies), the ${ordinal(Math.round(c.pct))} percentile.`;
    if (c.fit.fallback) parts[parts.length - 1] += ` The income-and-structure line is not drawn: ${c.fit.fallback}.`;
    if (ind.direction) parts.push(`${structure ? 'As the rating reads it,' : 'On income alone'} that ${leanPhrase(ind, t)}.`);
    if (c.engineT != null && !structure) {
      const rest = structureWords(c.engineFit.controls);
      parts.push(`Adjusted for income and structure${rest.length ? ` (${rest.join(', ')})` : ''}, as the verdict layer does: ${fmtSigned(Math.abs(c.engineT) < 0.05 ? 0 : c.engineT, 1)} sd${ind.direction ? `, which <strong>${leanPhrase(ind, c.engineT)}</strong>` : ''}.`);
    }
    if (c.rank && c.rank.peersWithData) parts.push(`${ordinal(Math.round(c.rank.rank))} highest of ${c.rank.of} among its ${setName(c)} comparators with data.`);
  }
  $('readout').innerHTML = parts.join(' ');
  if (!c.target && c.fit.ok) $('readout').append(' ', whereNote(c));
  const rec = state.scorecard && Array.isArray(state.scorecard.indicators) ? state.scorecard.indicators.find((x) => x.id === ind.id) : null;
  const classNote = rec && rec.class_note ? ` In the verdict layer this indicator is ${rec.class_note}.` : '';
  const th = thresholds();
  $('direction').textContent = (ind.direction
    ? `Reading the chart: for this indicator ${upIsBinding(ind) ? 'higher' : 'lower'} values point toward the constraint binding, so ${upIsBinding(ind) ? 'above' : 'below'} the line is the binding side and ${upIsBinding(ind) ? 'below' : 'above'} it is not. The verdict layer reads ${th.weak} to ${th.strong} sd from the line as a lean and ${th.strong} sd or more as strong.`
    : 'This indicator is context: neither side of the line signals binding.') + classNote;
  const src = sourceLabel(ind);
  const missing = c.rank && c.rank.peersMissing.length ? ` Comparators without data: ${c.rank.peersMissing.map(nameOf).join(', ')}.` : '';
  const off = c.offChart ? ` ${c.offChart} economies fall outside the plotted range and are not drawn.` : '';
  const asofNote = c.asOf !== snapYear() ? ` Viewing data as of ${c.asOf}: comparators are today's set, and the verdict layer's adjusted figure applies only to the latest data, so it is not shown.` : '';
  $('foot').innerHTML = `Source: ${sourceLink(ind) ? `<a href="${sourceLink(ind)}" target="_blank" rel="noopener">${src}</a>` : src}. Values are the average of the latest three years within ${c.W} years of ${c.asOf}; hollow points are older than ${c.limit} years. Fit: ${c.fit.ok ? (c.fit.method === 'structure' ? `the verdict layer’s Huber regression on log GDP per capita and ${structureWords(c.fit.controls).join(', ')}; points are values net of the structural terms (component plus residual), so each one’s distance from the line is its residual in the rating` : c.fit.method === 'lowess' ? `LOWESS, span ${c.fit.span}, 2 robustness passes` : 'Huber robust regression on log GDP per capita') : 'none'}, outliers winsorized at the 1st and 99th percentiles for the fit; shaded band is ±1 robust standard deviation. Comparators (${state.set === 'custom' ? 'chosen by you' : `${SET_LABEL[state.set]} set${c.added.length ? ` plus ${c.added.length} you added` : ''}`}, labelled by code): ${c.peers.map((p) => `${nameOf(p)} (${p})`).join(', ') || 'none'}.${missing}${off}${asofNote} ${vintage()}`;
  const chips = $('extra-labels');
  chips.replaceChildren(...(c.added.length ? [h('span', { class: 'small muted' }, 'Added:')] : []), ...c.added.map((iso3) => h('span', { class: 'ev-chip' }, nameOf(iso3), h('button', { type: 'button', 'aria-label': `Remove ${nameOf(iso3)}`, onclick: () => { state.added = state.added.filter((x) => x !== iso3); render(); } }, '×'))));
  $('chart').setAttribute('aria-label', `${shortName(ind)} against GDP per capita for ${c.rows.length} economies`);
}

function renderVerdict(c) {
  const sc = state.scorecard;
  const box = $('verdict');
  box.replaceChildren();
  if (!sc || !Array.isArray(sc.nodes)) return;
  const items = (c.ind.nodes || []).map((id) => sc.nodes.find((n) => n.id === id)).filter(Boolean);
  if (!items.length) return;
  box.append(h('strong', {}, 'What the verdict layer concluded: '));
  items.forEach((n, i) => {
    box.append(h('span', { class: `chip ${tierClass(n.tier)}` }, `${nodeCode(n.id)} ${state.registry.nodeById[n.id] ? state.registry.nodeById[n.id].short : ''}: ${tierLabel(n.tier)}`));
    if (i < items.length - 1) box.append(' · ');
  });
  box.append(h('a', { href: withData(`/growth-test-site/desk/country.html?iso=${state.iso}`) }, 'Open the Bottom line'));
}

function renderTable(c) {
  const rows = c.rows.filter((r) => r.iso3 === state.iso || c.peers.includes(r.iso3))
    .sort((a, b) => (c.fit.t[b.iso3] ?? 0) - (c.fit.t[a.iso3] ?? 0));
  const t = h('table', {},
    h('thead', {}, h('tr', {}, h('th', {}, 'Economy'), h('th', { class: 'num' }, 'Value'), h('th', { class: 'num' }, 'Year'), h('th', { class: 'num' }, 'GDP per capita'), h('th', { class: 'num' }, 'Distance from line (sd)'))),
    h('tbody', {}, ...rows.map((r) => h('tr', { class: r.iso3 === state.iso ? 'target' : '' },
      h('td', {}, nameOf(r.iso3), r.iso3 === state.iso ? '' : c.added.includes(r.iso3) ? ' (comparator, added)' : ' (comparator)'),
      h('td', { class: 'num' }, fmt(r.raw, Math.abs(r.raw) < 10 ? 2 : 1)), h('td', { class: 'num' }, String(r.year)),
      h('td', { class: 'num' }, `$${Math.round(r.income).toLocaleString('en-US')}`), h('td', { class: 'num' }, c.fit.ok ? fmtSigned(c.fit.t[r.iso3], 2) : '—')))));
  $('table').replaceChildren(t);
}

// On screens at least 1,400 px wide the indicator view opens as a panel beside the node view (PRD 8.1).
const WIDE = window.matchMedia ? window.matchMedia('(min-width: 1400px)') : { matches: false };
function showPanel() {
  const ind = state.panel === 'indicator', split = ind && WIDE.matches;
  $('view-node').hidden = ind && !split;
  $('view-ind').hidden = !ind;
  $('main').classList.toggle('ev-split', split);
  const tb = document.querySelector('.ev-toolbar');
  if (split && tb) document.documentElement.style.setProperty('--ev-toolbar-h', `${tb.offsetHeight}px`);
  const n = state.registry && state.registry.nodeById[state.node];
  const label = n ? `${nodeCode(n.id)} ${n.short || n.label}` : ({ growth: 'Growth record', composition: 'What it produces', firms: 'What firms say' })[state.node] || 'the node';
  $('back-node').textContent = split ? 'Close this panel ×' : `← Back to ${label}`;
}

async function render() {
  writeUrl();
  showPanel();
  try {
    const c = await compute();
    if (c.error) { showError(c.error); return; }
    state.current = c;
    await renderNodeView(c);
    if (player && player.on) { await buildPlayer(c); showPlayer(c.asOf, 0); player.setYear(c.asOf); markBehind(c.asOf); } else { pl.key = null; draw(c); drawBars(c); if (player) markBehind(null); }
    renderText(c);
    renderBarsText(c);
    drawLines(c);
    renderLinesText(c);
    renderVerdict(c);
    renderTable(c);
  } catch (e) { showError(`Could not draw the chart: ${e.message}`); console.error(e); }
}

// ---------- node view (rail, C9, C4, C7) ----------
const hrefFor = (view) => withData(`/growth-test-site/desk/evidence.html?iso=${state.iso}&node=${encodeURIComponent(view)}${currentHash()}`);

function nodeControls() {
  const box = $('node-controls');
  box.replaceChildren();
  const sel = (label, id, opts, value, onChange) => {
    const s = h('select', { id }, ...opts.map(([v, t]) => h('option', { value: v }, t)));
    s.value = value;
    s.addEventListener('change', () => onChange(s.value));
    box.append(h('label', { class: 'field' }, h('span', {}, label), s));
  };
  if (state.node === 'growth') sel('Since', 'c4-since', [['1960', '1960'], ['1980', '1980'], ['1990', '1990'], ['2000', '2000']], String(state.c4since), (v) => { state.c4since = Number(v); render(); });
  if (state.node === 'firms') sel('Survey question', 'c7-measure', [['TOP', 'Biggest obstacle'], ['MAJOR', 'Major or very severe constraint']], state.c7measure, (v) => { state.c7measure = v; render(); });
  box.hidden = !box.children.length;
}

async function renderNodeView(c) {
  const R = state.registry, view = state.node;
  renderRail($('rail'), { registry: R, scorecard: state.scorecard, current: view, hrefFor, onPick: pickView });
  renderNodeHead({ titleEl: $('h-node'), qEl: $('node-q'), verdictEl: $('node-verdict') }, { view, registry: R, scorecard: state.scorecard, iso: state.iso, countryName: nameOf(state.iso), set: state.set === 'custom' ? 'structural' : state.set });
  nodeControls();
  const host = $('chartN');
  const base = { P: window.Plot, pal: palette(), registry: R, iso: state.iso, peers: c.peers, asOf: c.asOf, width: host.clientWidth || 900, countryName: nameOf(state.iso) };
  let out;
  if (view === 'growth') {
    const [gdp, growth] = await Promise.all([panel('NY.GDP.PCAP.KD'), panel('NY.GDP.PCAP.KD.ZG')]);
    out = drawGrowth(host, { ...base, gdp, growth, since: state.c4since, scorecard: state.scorecard });
    $('footN').textContent = `GDP per capita in constant US dollars, indexed to 100 in ${out.base || state.c4since}, log scale; annual growth below. Dashed lines and the shaded band: the median and middle half of the ${setName(c)} comparators (where at least three have data). Peak, break and growth rates are the verdict layer's, from the ${snapYear()} snapshot. Source: World Bank WDI.`;
  } else if (view === 'composition') {
    const comp = await getJSON(`${DATA}/composition/${state.iso}.json`, { optional: true });
    const peerComps = (await Promise.all(c.peers.filter((p) => p !== state.iso).map((p) => getJSON(`${DATA}/composition/${p}.json`, { optional: true })))).filter(Boolean);
    out = drawComposition(host, { ...base, comp, peerComps });
    $('footN').textContent = `Top: goods exports by product group, as shares of all goods exports (services are not included); filled bars are the latest year, dashed outlines ten years earlier, navy ticks the median of the ${setName(c)} comparators with at least three reporting. Groups are HS 1992 chapters gathered into sectors. Below: value added (% of GDP) and employment (% of jobs) by sector; manufacturing is part of industry. Sources: Growth Lab, Harvard University, International Trade Data (HS92), mirror-cleaned exports; World Bank WDI (modelled ILO estimates for employment). Context only: no verdict uses it.`;
  } else if (view === 'firms') {
    const ids = R.indicators.indicators.filter((i) => /^ES\.OBST_/.test(i.id) && i.id.endsWith(`_${state.c7measure}`)).map((i) => i.id);
    const panels = (await Promise.all(ids.map(async (id) => ({ id, panel: await panel(id) })))).filter((x) => x.panel);
    out = drawObstacles(host, { ...base, panels, window: state.fits.window_years || 12, measure: state.c7measure, onPick: pickIndicator });
    $('footN').textContent = `Filled bars: the latest Enterprise Survey wave${out.wave ? ` (${out.wave})` : ''}; dashed outlines: the wave before it${out.prevWave ? ` (${out.prevWave} for most obstacles)` : ''}; navy ticks: the median of the ${setName(c)} comparators' latest waves within ${state.fits.window_years || 12} years (shown where at least three have one). Click an obstacle to chart it below. Source: World Bank Enterprise Surveys via Data360.`;
  } else {
    out = drawStrip(host, { ...base, scorecard: state.scorecard, view, set: state.set, onPick: pickIndicator });
    $('footN').textContent = `Each dot is one indicator: the verdict layer's distance from what income and structure predict, in standard deviations, turned so the binding side is always to the right. Filled dots are class A (circle) or B (square) evidence; hollow are class C (circle) or D (diamond). Dotted lines at 0.75 and 1.5 sd mark a lean and a strong reading. Ranks are among the economy and its ${state.set === 'custom' ? 'structural' : SET_LABEL[state.set]} comparators, 1st being most binding. These are the ${snapYear()} snapshot's numbers${c.asOf !== snapYear() ? `, not data as of ${c.asOf}` : ''}. Click a row to chart it below.`;
  }
  state.nodeOut = out;
  $('readoutN').innerHTML = out.text || '';
  document.querySelector('.ev-actions[data-chart="node"]').hidden = !out.csv;
  await renderTests(c);
}

/** One option per indicator: "Short name · class A". */
function fillSelect(sel, ids, value) {
  sel.replaceChildren(...ids.map((id) => { const i = state.registry.indicatorById[id]; return h('option', { value: id }, `${shortName(i)} · class ${i.class}`); }));
  sel.value = value;
}

// ---------- test tabs (PRD 8.1) ----------
const TABS = [['c5', 'price', '1 · Price'], ['c6', 'changes', '2 · Changes'], ['c8', 'circumvention', '3 · Circumvention'], ['c12', 'camels', '4 · Camels and hippos']];
/** The verdict layer's record for the current node (top-level or sub-node). */
function nodeRecord(view) {
  for (const n of (state.scorecard && state.scorecard.nodes) || []) {
    if (n.id === view) return n;
    for (const sn of n.sub_nodes || []) if (sn && sn.id === view) return sn;
  }
  return null;
}
/** Direction chip for a test: the verdict layer's score for it, or for test 4 (shown, not scored) its theta pattern. */
function testChip(key, test) {
  if (key === 'c12') {
    const d = state.c12dir;
    return d === 'toward' ? ['toward', '▲ toward binding', 'Camels pattern; shown, does not vote'] : d === 'away' ? ['away', '▼ away', 'Hippos pattern; shown, does not vote'] : d === 'mixed' ? ['mixed', '○ mixed', 'The vectors disagree; shown, does not vote'] : ['none', '○ no clear pattern', 'Shown, does not vote'];
  }
  const rec = nodeRecord(state.node), t = rec && rec.tests && rec.tests[test];
  if (!t || t.T == null) return ['none', '○ not scored', 'The verdict layer has no score for this test'];
  const tip = `Verdict layer score ${fmtSigned(t.T, 1)} on a scale from −2 to +2`;
  if (t.T >= 0.5) return ['toward', '▲ toward binding', tip];
  if (t.T <= -0.5) return ['away', '▼ away', tip];
  return ['mixed', '○ near zero', tip];
}
/** One test on screen at a time. renderTests has drawn every available test (visible, so at its real width); this hides all but the chosen one. */
function renderTabs() {
  const bar = $('test-tabs');
  const avail = TABS.filter(([k]) => !$(`sec-${k}`).hidden);
  // Remember which tests this node has, so the chart pack includes them even while their tab is closed.
  for (const [k] of TABS) $(`sec-${k}`).dataset.avail = avail.some(([x]) => x === k) ? '1' : '';
  bar.replaceChildren();
  bar.hidden = !avail.length;
  if (!avail.length) return;
  if (!avail.some(([k]) => k === state.test)) state.test = avail[0][0];
  const select = (k, focus) => {
    state.test = k;
    writeUrl();
    for (const [key] of avail) {
      const on = key === k, b = $(`tab-${key}`);
      $(`sec-${key}`).hidden = !on;
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; b.classList.toggle('on', on);
    }
    if (focus) $(`tab-${k}`).focus();
  };
  for (const [k, test, name] of avail) {
    const [dir, chip, tip] = testChip(k, test);
    const b = h('button', { type: 'button', role: 'tab', id: `tab-${k}`, class: 'ev-tab', 'aria-controls': `sec-${k}`, title: tip },
      h('span', { class: 'ev-tab-name' }, name), h('span', { class: `ev-chip-dir ${dir}` }, chip));
    b.addEventListener('click', () => select(k, false));
    b.addEventListener('keydown', (e) => {
      const i = avail.findIndex(([x]) => x === k);
      const j = e.key === 'ArrowRight' ? (i + 1) % avail.length : e.key === 'ArrowLeft' ? (i - 1 + avail.length) % avail.length : e.key === 'Home' ? 0 : e.key === 'End' ? avail.length - 1 : -1;
      if (j >= 0) { e.preventDefault(); select(avail[j][0], true); }
    });
    bar.append(b);
  }
  select(state.test, false);
}

/** The engine's fit for one indicator: the summary from fits.json plus its per-economy residuals (fits/<id>.json). */
const fitCache = new Map();
function fitFor(id) {
  const summary = state.fits.fits[id];
  if (!summary || !summary.ok) return Promise.resolve(summary || null);
  if (!fitCache.has(id)) fitCache.set(id, getJSON(`${DATA}/fits/${encodeURIComponent(id)}.json`, { optional: true }).then((d) => ({ ...summary, ...(d || {}) })));
  return fitCache.get(id);
}

/** Latest-year camels-and-hippos residuals for one economy plus the shared product list; null when not built. */
const camelCache = {};
async function camelData(iso, vecNames) {
  if (!camelCache[iso]) camelCache[iso] = getJSON(`${DATA}/camels/${iso}.json`, { optional: true });
  for (const v of vecNames) if (!camelCache[`p:${v}`]) camelCache[`p:${v}`] = getJSON(`${DATA}/camels/products/${v}.json`, { optional: true });
  const [mine, ...prods] = await Promise.all([camelCache[iso], ...vecNames.map((v) => camelCache[`p:${v}`])]);
  const products = Object.fromEntries(vecNames.map((v, k) => [v, prods[k]]).filter(([, p]) => p));
  return mine && Object.keys(products).length ? { products, mine } : null;
}

/** The presence version of test 4 (ingest/hippo_gap.py): the hippo gap, entry rates and the surprises; null when not built. */
function hippoData(iso) {
  if (!camelCache[`h:${iso}`]) camelCache[`h:${iso}`] = getJSON(`${DATA}/hippo/${iso}.json`, { optional: true });
  return camelCache[`h:${iso}`];
}

const ordinalOf = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

/** One sentence per vector on what the hippo gap shows, in the readout's plain register. Never calls the node. */
function hippoText(hp, vecNames, countryName, famOf) {
  if (!hp) return '';
  const out = [];
  for (const v of vecNames) {
    const hv = hp.vectors[v];
    if (!hv) continue;
    const factor = CAMEL_FACTOR[v] || 'the factor';
    const g = hv.gap || {}, top = g.top || {}, bot = g.bottom || {};
    const pctT = top.share == null ? null : Math.round(top.share * 100), pctB = bot.share == null ? null : Math.round(bot.share * 100);
    const sig = Math.abs(hv.gamma) >= 2 * hv.se;
    const read = !sig ? 'no clear gap: γ is within two standard errors of zero'
      : hv.gamma > 0 ? `the hippos are missing: ${countryName} is absent from the products that need ${factor} more often than its income predicts`
      : `no missing hippos: ${countryName} is present in the products that need ${factor} at least as often as its income predicts`;
    const counts = top.usual ? ` Of the ${top.usual} products that need the most ${factor} and that economies at ${countryName}'s income usually export, it does not export ${top.absent} (${pctT}%)${bot.usual ? `, against ${pctB}% of the ${bot.usual} that need the least` : ''}.` : '';
    // the percentile counts from the lowest gamma; the rank counts from the highest (most hippos missing = 1)
    const rank = hv.n - Math.round((hv.pctile / 100) * (hv.n - 1));
    const f = famOf(hv.id);
    const inRating = hv.passes && f && isNum(f.signal)
      ? ` In the rating it enters ${f.node} as <strong>${fmtSigned(f.signal, 1)}</strong>: its γ is at the ${ordinalOf(Math.round(hv.pctile))} percentile of ${hv.n} economies.`
      : ' It is shown here but not counted in the rating: this version did not pass both of its gates (the rubric changelog says which).';
    const e = hv.entry, et = e && e.top, eb = e && e.bottom;
    const entry = et && et.at_risk && eb && eb.at_risk
      ? ` Did hippos ever try? Over the windows ending ${e.windows[0]} to ${e.windows[e.windows.length - 1]}, ${countryName} took up ${et.entries} of the ${et.at_risk} products it lacked that need the most ${factor} (${Math.round(et.rate * 100)}%) and ${eb.entries} of the ${eb.at_risk} that need the least (${Math.round(eb.rate * 100)}%).`
      : '';
    out.push(`<strong>The hippo gap, ${hv.label.replace(/ \(.*$/, '')}</strong>: γ = ${fmtSigned(hv.gamma, 3)} (se ${fmt(hv.se, 3)}), ${read}.${counts} It ranks ${ordinalOf(rank)} of ${hv.n} economies counting from the most hippos missing.${inRating}${entry}`);
  }
  return out.length ? `<br>${out.join('<br>')}` : '';
}

/** Under a node: C5 price against quantity, C6 co-movement and C8 bypass, each only where the node has the data for it. */
async function renderTests(c) {
  if (!c) return;
  const R = state.registry, view = state.node;
  const isNode = !VIEWS.includes(view) && !!R.nodeById[view];
  const scope = isNode ? nodeScope(R, view) : [];
  const base = { P: window.Plot, pal: palette(), registry: R, iso: state.iso, peers: c.peers, asOf: c.asOf, countryName: nameOf(state.iso), nameOf };
  const peersNote = `Comparators (${setName(c)}) are labelled by code.`;
  state.outs = {};
  // C5
  const pq = isNode ? pqChoices(R, state.fits.fits, view, scope) : null;
  $('sec-c5').hidden = !pq;
  if (pq) {
    // Default to the node's usual pair, or the first choice this economy has a recent value for.
    const fresh = (id) => { const cv = covOf(id); return !state.coverage || (cv && c.asOf - cv[1] <= windowOf(R.indicatorById[id]) && cv[0] <= c.asOf); };
    const pick = (list, def) => (fresh(def) ? def : list.find(fresh) || def);
    const price = pq.price.includes(state.c5price) ? state.c5price : pick(pq.price, pq.defPrice), qty = pq.qty.includes(state.c5qty) ? state.c5qty : pick(pq.qty, pq.defQty);
    fillSelect($('c5-price'), pq.price, price); fillSelect($('c5-qty'), pq.qty, qty);
    const pInd = R.indicatorById[price], qInd = R.indicatorById[qty];
    const [pPanel, qPanel, inc] = await Promise.all([panel(price), panel(qty), panel(INCOME_ID)]);
    const out = drawPriceQty($('chart5'), { ...base, width: $('chart5').clientWidth || 900, pInd, qInd, pPanel, qPanel, inc, fitOpts: fitOpts(), wP: windowOf(pInd), wQ: windowOf(qInd), axes: state.c5axes });
    state.outs.c5 = out;
    $('readout5').innerHTML = out.text;
    $('foot5').textContent = `Left: every economy with both values (${out.n}), ${state.c5axes === 'raw' ? 'as values' : 'as distances from what income alone predicts (the Huber fit on log GDP per capita that chart 1 draws), clipped at ±3.5 sd; the lines cross at the predicted values'}. Right: ${nameOf(state.iso)}'s own values, one point a year over the last 30 years (each the mean of up to three years), the arrow at the latest. ${peersNote} Reference values average the latest three years within each indicator's window to ${c.asOf}. Quadrant readings follow Mindbook figure 17 (on narrow screens P is the price and Q the quantity). Source: ${[...new Set([sourceLabel(pInd), sourceLabel(qInd)])].join("; ")}.`;
  }
  // C6
  const specs = isNode && state.scorecard ? stripRows(state.scorecard, scope).comove : [];
  $('sec-c6').hidden = !specs.length;
  if (specs.length) {
    const items = await Promise.all(specs.map(async (spec) => ({ spec, xPanel: await panel(spec.x), yPanel: await panel(spec.y) })));
    const out = drawComove($('chart6'), { ...base, width: $('chart6').clientWidth || 900, items });
    state.outs.c6 = out;
    $('readout6').innerHTML = out.text;
    const w = specs[0].window;
    $('foot6').textContent = `Each column is one year: the change in the price the year before (top) and the change in investment that year (bottom), the pairing the verdict layer tests, over its window ${w[0]}–${w[1]}. Amber: they moved as the hypothesis predicts if the constraint binds; grey: they did not; outlined: one of them did not change, so the year is not counted. The counts are recomputed here from the same data; the p-value is a one-sided binomial test against chance (half the years), and the score is the verdict layer's, from the ${snapYear()} snapshot. Source: ${[...new Set(specs.flatMap((sp) => [sp.x, sp.y]).map((id) => R.indicatorById[id]).filter(Boolean).map(sourceLabel))].join('; ')}. ${vintage()}`;
  }
  // C8
  const bypass = isNode ? R.indicators.indicators.filter((i) => i.test === 'circumvention' && i.direction && (i.nodes || []).some((n) => scope.includes(n))) : [];
  const items = (await Promise.all(bypass.map(async (ind) => ({ ind, panel: await panel(ind.id) })))).filter((x) => x.panel);
  $('sec-c8').hidden = !items.length;
  if (items.length) {
    const out = drawBypass($('chart8'), { ...base, width: $('chart8').clientWidth || 900, items, windowOf, onPick: pickIndicator });
    state.outs.c8 = out;
    $('readout8').innerHTML = out.text;
    $('foot8').textContent = `One panel per test 3 (circumvention) indicator of this node: ${nameOf(state.iso)} in amber and its ${setName(c)} comparators, each at its latest reference value within the indicator's window to ${c.asOf}; the dashed line is the comparator median. The axis note says which way is more working-around. Click a panel to chart that indicator below. Source: ${[...new Set(items.map((x) => sourceLabel(x.ind)))].join('; ')}. ${vintage()}`;
  }
  // C12
  const vecNames = isNode ? CAMEL_VECTORS[view] || CAMEL_VECTORS[view.split('.')[0]] || [] : [];
  const camel = vecNames.length ? await camelData(state.iso, vecNames) : null;
  // Each vector's family in the verdict layer: its signal (workbook 4.7 percentile bands) and whether it counts.
  const camelFam = (id) => { const rec = ((state.scorecard && state.scorecard.indicators) || []).find((r) => r.id === id); if (!rec) return null; for (const n of state.scorecard.nodes || []) for (const f of n.families || []) if (f.id === rec.family) return { ...f, node: n.id }; return null; };
  const camelPanels = camel ? vecNames.filter((v) => camel.mine.vectors[v] && camel.products[v]).map((v) => { const fam = camelFam(camel.products[v].id); return { name: v, ...camel.products[v], ...camel.mine.vectors[v], year: camel.mine.year, fam, votes: !!(fam && fam.votes) }; }) : [];
  $('sec-c12').hidden = !camelPanels.length;
  const sig = camelPanels.filter((pn) => Math.abs(pn.theta) >= 2 * pn.se);
  state.c12dir = !sig.length ? 'none' : sig.every((pn) => pn.theta < 0) ? 'toward' : sig.every((pn) => pn.theta > 0) ? 'away' : 'mixed';
  if (camelPanels.length) {
    const out = drawCamels($('chart12'), { ...base, width: $('chart12').clientWidth || 900, panels: camelPanels });
    state.outs.c12 = out;
    const hp = await hippoData(state.iso);
    $('readout12').innerHTML = out.text + hippoText(hp, vecNames, nameOf(state.iso), camelFam);
    $('foot12').textContent = `Each dot is an HS 4-digit export product, placed by how intensively it uses the factor (US-based intensity, as a percentile of products) and by how much more ${nameOf(state.iso)} exported of it in ${camelPanels[0].year} than economies at its income level do (ln(1 + revealed comparative advantage), after a separate income fit for each product across about 180 economies). Open circles are industry averages (products sharing one intensity value), sized by the number of products. The line is the fitted tilt: the economy's average plus θ times each product's intensity (the Rajan-Zingales differences-in-differences design, Rajan and Zingales 1998; schooling intensity after Ciccone and Papaioannou 2009), so it rises when θ is positive and falls when θ is negative. A negative θ means more camels: the economy does well in products that need little of the factor. ${camelPanels.some((p) => p.votes) ? `Counted in the rating: ${camelPanels.filter((p) => p.votes).map((p) => p.label).join(', ')}, the vector${camelPanels.filter((p) => p.votes).length === 1 ? '' : 's'} that passed the placebo check; ` : ''}${camelPanels.some((p) => !p.votes) ? `shown but not counted: ${camelPanels.filter((p) => !p.votes).map((p) => p.label).join(', ')} (failed the placebo check; see the rubric changelog).` : ''} The hippo gap below the chart is the presence version of the same test: instead of how much the economy exports of each product, whether it exports it at all (RCA below 0.2 counts as absent), because where a constraint is severe the activities that need it never start, and a growth-based test cannot see them; γ is the slope of absence on intensity after a fit per product on income, export size, breadth, remoteness and landlockedness, each product weighted by how likely economies like this one are to export it, so a positive γ means the factor-heavy products are the missing ones. Caveats: intensities are assumed the same everywhere; exports are not output; services are missing; absence has other causes (comparative advantage, size, nobody tried). This is the latest year only and does not follow the as-of year. Sources: Growth Lab HS92 trade; the intensity vectors and the method are documented in the Methodology Note, section on test 4.`;
  }
  for (const k of ['c5', 'c6', 'c8', 'c12']) { const a = document.querySelector(`.ev-actions[data-chart="${k}"]`); if (a) a.hidden = !(state.outs[k] && state.outs[k].csv); }
  renderTabs();
}

// ---------- C2: peer comparison bars ----------
/** Chart roles (TNFA data palette): the economy, its comparators, the fit, everything else, and the binding side. */
function palette() {
  return {
    text: css('--text', '#1c2e4a'), muted: css('--muted', '#4a5d7e'),
    focus: css('--chart-focus', '#b8682a'), focusInk: css('--chart-focus-ink', '#9a5620'),
    peer: css('--chart-peer', '#2e4060'), peerFill: css('--chart-peer-fill', '#e3e8f0'),
    fit: css('--chart-fit', '#4f6d99'), band: css('--chart-band', '#e6ebf2'),
    other: css('--chart-other', '#8f98a6'), binding: css('--chart-binding', '#9c1f45'), surface: css('--surface', '#ffffff'),
  };
}

function drawBars(c) {
  const host = $('chart2');
  host.replaceChildren();
  const P = window.Plot;
  if (!P) return;
  if (!c.refs[state.iso]) { host.append(h('p', { class: 'ev-empty' }, `${nameOf(state.iso)} has no value within the ${c.W} years to ${c.asOf}, so there is nothing to compare. `, whereNote(c))); return; }
  if (state.set === 'custom' && !c.added.length) { host.append(h('p', { class: 'ev-empty' }, 'The custom set is empty: use "Add to comparators" to choose the economies to compare against.')); return; }
  if (c.barRows.length < 2) { host.append(h('p', { class: 'ev-empty' }, `None of ${nameOf(state.iso)}'s ${setName(c)} comparators has data for this indicator.`)); return; }
  const { text, muted, focus, focusInk, peer, peerFill, band, binding } = palette();
  const rows = c.barRows.slice().sort((a, b) => b.value - a.value).map((r) => ({ ...r, label: `${nameOf(r.iso3)} ${r.n > 1 && r.from < r.year ? `${r.from}–${String(r.year).slice(-2)}` : r.year}`, stale: c.asOf - r.year > c.limit }));
  const width = Math.max(320, host.clientWidth || 900);
  const longest = Math.max(...rows.map((r) => r.label.length));
  const marginLeft = Math.min(Math.round(width * 0.42), Math.max(110, Math.round(longest * 6.6)));
  const height = (c.ind.direction && c.summary ? 46 : 30) + 26 * rows.length + 44;
  const s = c.summary;
  const vals = rows.map((r) => r.value);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const pad = (hi - lo) * 0.16 || 1;
  const unit = unitOf(c.ind);
  const dirNote = c.ind.direction === 1 ? ' · higher points toward binding →' : c.ind.direction === -1 ? ' · ← lower points toward binding' : '';
  const own = rows.filter((r) => r.iso3 === state.iso), peers = rows.filter((r) => r.iso3 !== state.iso);
  const marks = [];
  const x0 = lo < 0 ? lo - pad : 0, x1 = hi + pad;
  // The binding side of the comparator median, tinted and labelled as on charts 1, 8, 9 and 12 (PRD 8.1).
  const dir = c.ind.direction || 0;
  if (s && dir) {
    marks.push(P.rect([0], { x1: dir > 0 ? s.median : x0, x2: dir > 0 ? x1 : s.median, fill: binding, fillOpacity: 0.06 }));
    const toward = dir > 0 ? 'right' : 'left', away = dir > 0 ? 'left' : 'right';
    marks.push(
      P.text([dir > 0 ? '▲ toward binding →' : '← toward binding ▲'], { frameAnchor: `top-${toward}`, dy: -30, dx: toward === 'right' ? -2 : 2, textAnchor: toward === 'right' ? 'end' : 'start', fontSize: 11, fontWeight: 600, fill: binding }),
      P.text([dir > 0 ? '← away from binding' : 'away from binding →'], { frameAnchor: `top-${away}`, dy: -30, dx: away === 'right' ? -2 : 2, textAnchor: away === 'right' ? 'end' : 'start', fontSize: 11, fill: muted }),
    );
  }
  if (s) {
    marks.push(P.rectX([s], { x1: 'q1', x2: 'q3', fill: band, fillOpacity: 0.8 }));
    marks.push(P.ruleX([s.median], { stroke: muted, strokeDasharray: '4,3', strokeWidth: 1.3 }));
    marks.push(P.text([s], { x: 'median', frameAnchor: 'top', text: () => `comparator median ${fmtShort(c.ind, s.median)}`, dy: -14, fontSize: 11, fill: muted }));
  }
  marks.push(
    P.ruleX([0], { stroke: text, strokeOpacity: 0.5 }),
    P.barX(peers.filter((r) => !r.stale), { y: 'label', x: 'value', fill: peerFill, stroke: peer, strokeWidth: 0.8, insetTop: 4, insetBottom: 4 }),
    P.barX(peers.filter((r) => r.stale), { y: 'label', x: 'value', fill: 'none', stroke: peer, strokeWidth: 1.2, strokeDasharray: '3,2', insetTop: 4, insetBottom: 4 }),
    P.barX(own, { y: 'label', x: 'value', fill: (d) => (d.stale ? 'none' : focus), stroke: focus, strokeWidth: 1.5, insetTop: 2, insetBottom: 2 }),
    // Value labels just past each bar end (Plot's dx and textAnchor are constants, so one layer per side).
    ...[[peers, 11, 400, text], [own, 11.5, 600, focusInk]].flatMap(([rs, fontSize, fontWeight, fill]) => [
      P.text(rs.filter((d) => d.value >= 0), { y: 'label', x: 'value', text: (d) => fmtShort(c.ind, d.value), textAnchor: 'start', dx: 5, fontSize, fontWeight, fill }),
      P.text(rs.filter((d) => d.value < 0), { y: 'label', x: 'value', text: (d) => fmtShort(c.ind, d.value), textAnchor: 'end', dx: -5, fontSize, fontWeight, fill }),
    ]),
    P.tip(rows, P.pointerY({ y: 'label', x: 'value', title: (d) => `${nameOf(d.iso3)}\n${fmtShort(c.ind, d.value)} (${d.year})${d.stale ? `\nolder than ${c.limit} years` : ''}` })),
  );
  const chart = P.plot({
    width, height, marginLeft, marginRight: 70, marginTop: dir && s ? 46 : 30, marginBottom: 44,
    style: { background: 'transparent', color: text, fontSize: '12px', fontFamily: 'Inter, system-ui, sans-serif' },
    x: { domain: [x0, x1], label: `${shortName(c.ind)}${unit ? ` (${unit})` : ''}${dirNote}`, grid: true, labelAnchor: 'left' },
    y: { domain: rows.map((r) => r.label), label: null },
    marks,
  });
  chart.querySelectorAll('g[aria-label="y-axis tick label"] text').forEach((n) => { if (n.textContent.startsWith(`${nameOf(state.iso)} `)) { n.setAttribute('font-weight', '600'); n.setAttribute('fill', focusInk); } });
  chart.setAttribute('aria-hidden', 'true');
  host.append(chart);
}

function renderBarsText(c) {
  const country = nameOf(state.iso);
  $('h-c2').innerHTML = `<span class="ev-num">2</span> Against its comparators <span class="ev-q">How does ${country} compare with its ${setName(c)} comparators?</span>`;
  const parts = [];
  const tv = c.refs[state.iso];
  if (!tv) parts.push(`${country} has no value within the ${c.W} years to ${c.asOf}.`);
  else if (c.rank2 && c.rank2.peersWithData) {
    parts.push(`<strong>${country}: ${fmtVal(c.ind, tv.value)} (${refSpan(tv)}), ${ordinal(Math.round(c.rank2.rank))} highest of ${c.rank2.of}</strong> among itself and its ${setName(c)} comparators with data.`);
    if (c.summary) {
      const g = c.summary.gap;
      if (Math.abs(g) < 1e-9) parts.push(`It is at the comparator median.`);
      else parts.push(`It is ${fmtDiff(c.ind, Math.abs(g))} ${g > 0 ? 'above' : 'below'} the comparator median of ${fmtShort(c.ind, c.summary.median)}${c.summary.gapIQR != null ? `, ${fmt(Math.abs(c.summary.gapIQR), 1)} times the spread of the middle half of comparators` : ''}.${c.ind.direction ? ` <strong>That is the side that points ${(g > 0) === upIsBinding(c.ind) ? 'toward' : 'away from'} binding.</strong>` : ''}`);
    }
  }
  $('readout2').innerHTML = parts.join(' ');
  const withData = new Set(c.barRows.map((r) => r.iso3));
  const missing = c.peers.filter((p) => p !== state.iso && !withData.has(p));
  $('foot2').innerHTML = `Each bar is the average of the latest three years within ${c.W} years of ${c.asOf}; the label gives the years averaged (one year where only one has data). Dashed line: comparator median; shaded band: the middle half of comparators (25th to 75th percentile), ${country} excluded. Dashed outlines are older than ${c.limit} years.${missing.length ? ` Comparators without data: ${missing.map(nameOf).join(', ')}.` : ''} Source: ${sourceLabel(c.ind)}. ${vintage()}`;
  $('chart2').setAttribute('aria-label', `Bar chart of ${shortName(c.ind)} for ${country} and its comparators`);
}

// ---------- year player (PRD 7.1): chart 1 as moving bubbles, chart 2 as a bar race ----------
let player = null;
const pl = { key: null, c1: null, c2: null, f1: null };
const playerYears = () => { const out = []; for (let y = 2005; y <= snapYear(); y++) out.push(y); return out; };
const playerKey = (c) => [state.iso, c.ind.id, state.fit, c.peers.join(','), $('chart').clientWidth, $('chart2').clientWidth, document.documentElement.getAttribute('data-theme') || ''].join('|');

/** Frames for every year from 2005, fixed axes, and the two animated charts (rebuilt only when the view changes). */
async function buildPlayer(c) {
  if (pl.key === playerKey(c)) return;
  const [ip, inc, pop] = await Promise.all([panel(c.ind.id), panel(INCOME_ID), panel('SP.POP.TOTL')]);
  const years = playerYears(), opts = fitOpts();
  const fitter = state.fit === 'lowess' ? (r) => lowessFit(r, opts) : (r) => linearFit(r, opts);
  const f1 = playerFrames(ip, inc, pop, { years, windowYears: c.W, transform: c.transform, fitter });
  const doms = playerDomains(f1, [state.iso, ...c.peers], c.transform);
  const pal = { ...palette(), bg: css('--bg', '#ffffff') };
  const unit = unitOf(c.ind);
  // The rating's own fit exists for the snapshot year only, so playing the years uses the income-only line.
  const full = `↑ ${shortName(c.ind)}${unit ? ` (${unit})` : ''}${state.fit === 'structure' ? ' · income-only line while playing' : ''}`, max = Math.max(30, Math.floor(($('chart').clientWidth || 900) / 7.5));
  const yLabel = full.length > max ? `${full.slice(0, max - 1)}…` : full;
  pl.f1 = f1;
  pl.c1 = doms ? bubbleChart({ frames: f1, domains: doms, iso: state.iso, peers: c.peers, name: nameOf, pal, transform: c.transform, yLabel, direction: c.ind.direction || 0, limit: c.limit, width: $('chart').clientWidth || 900, fmtV: (v) => `${fmt(v, Math.abs(v) < 10 ? 2 : 1)}${unit ? ` ${unit}` : ''}` }) : null;
  const f2 = raceFrames(ip, [state.iso, ...c.peers.filter((p) => p !== state.iso)], { years, windowYears: c.W });
  const dirNote = c.ind.direction === 1 ? ' · higher points toward binding →' : c.ind.direction === -1 ? ' · ← lower points toward binding' : '';
  pl.c2 = f2.some((f) => f.rows.length >= 2) ? barRace({ frames: f2, iso: state.iso, name: nameOf, pal, xLabel: `${shortName(c.ind)}${unit ? ` (${unit})` : ''}${dirNote}`, limit: c.limit, width: $('chart2').clientWidth || 900, fmtS: (v) => fmtShort(c.ind, v), summary: (vals) => peerSummary(vals, c.peers, state.iso) }) : null;
  $('chart').replaceChildren(pl.c1 ? pl.c1.node : h('p', { class: 'ev-empty' }, 'No economy has data for this indicator in any year from 2005, so there is nothing to play.'));
  $('chart2').replaceChildren(pl.c2 ? pl.c2.node : h('p', { class: 'ev-empty' }, c.peers.length ? `Fewer than two of ${nameOf(state.iso)} and its comparators have data in any year from 2005, so there is no race to run.` : `${nameOf(state.iso)} has no ${setName(c)} comparators, so there is no race to run. Pick another comparator set or add economies.`));
  pl.key = playerKey(c);
}
function showPlayer(year, ms) { if (pl.c1) pl.c1.show(year, ms); if (pl.c2) pl.c2.show(year, ms); }
/** While a frame other than the settled year shows, the readouts below charts 1 and 2 describe another year: dim them and say so. */
function markBehind(year) {
  const behind = !!(player && player.on && state.current && year !== state.current.asOf);
  for (const id of ['sec-c1', 'sec-c2']) $(id).classList.toggle('pl-behind', behind);
  $('pl-note').textContent = !(player && player.on) ? `Play the years from 2005 to ${snapYear()}: bubbles sized by population, ${nameOf(state.iso)}'s path traced in amber, chart 2 as a bar race.`
    : behind ? `Showing ${year}. The readouts and the rest of the page catch up when you pause. Comparators are today's set.`
    : `Paused at ${year}: every chart on the page shows data as of ${year}. Comparators are today's set.`;
}
function initPlayer() {
  player = createControls($('player'), {
    years: playerYears(),
    firstYear: () => { const f = pl.f1 && pl.f1.find((g) => g.fit.ok && g.rows.some((r) => r.iso3 === state.iso)); return f ? f.year : 2005; },
    onOpen: async (y) => { if (!state.current) return; await buildPlayer(state.current); showPlayer(y || state.current.asOf, 0); markBehind(y || state.current.asOf); },
    onShow: (y, ms) => { showPlayer(y, ms); markBehind(y); },
    onSettle: (y) => setAsOf(y),
    onClose: () => { pl.key = null; markBehind(null); render(); },
    // Chart 2's compact control mirrors this one (PRD 7.1: controls where the motion is).
    onState: ({ on, playing, year }) => {
      const b = $('pl2-play'); if (!b) return;
      b.textContent = playing ? '❚❚ Pause' : on ? '▶ Play' : '▶ Play the years';
      b.setAttribute('aria-pressed', String(playing));
      $('player2').classList.toggle('playing', playing);
      $('pl2-year').textContent = on ? String(year) : '';
    },
  });
  $('pl2-play').addEventListener('click', () => {
    if (player.playing) { player.stop(); return; }
    // Play from where the motion is: bring chart 2 into view first.
    const r = $('chart2').getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) $('sec-c2').scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    player.start(null);
  });
  player.setYear(state.asOf || snapYear());
  markBehind(null);
  $('pl-record').addEventListener('click', () => { recordPlayback().catch((e) => { $('pl-record').disabled = false; $('pl-record').textContent = `Video failed: ${e.message}`; }); });
}

/** Playback export (phase 5): play charts 1 and 2 frame by frame onto a canvas and record it as a WebM video. */
async function svgImage(svg, bg) {
  const clone = svg.cloneNode(true);
  const w = Number(svg.getAttribute('width') || svg.viewBox.baseVal.width), hgt = Number(svg.getAttribute('height') || svg.viewBox.baseVal.height);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', w); clone.setAttribute('height', hgt);
  const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  r.setAttribute('width', w); r.setAttribute('height', hgt); r.setAttribute('fill', bg);
  clone.insertBefore(r, clone.firstChild);
  clone.querySelectorAll('[aria-label="tip"]').forEach((n) => n.remove());
  const img = new Image();
  await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`; });
  return { img, w, h: hgt };
}
async function recordPlayback() {
  const btn = $('pl-record');
  if (!state.current || typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) { btn.textContent = 'Video export is not supported in this browser'; return; }
  const c = state.current;
  if (player && player.playing) player.stop();
  const wasOn = !!(player && player.on);
  await buildPlayer(c);
  if (!pl.c1 && !pl.c2) return;
  const first = pl.f1 ? (pl.f1.find((g) => g.fit.ok && g.rows.some((r) => r.iso3 === state.iso)) || { year: 2005 }).year : 2005;
  const years = playerYears().filter((y) => y >= first);
  const hold = Number(document.querySelector('[data-pl="speed"]').value) || 900;
  const bg = css('--bg', '#ffffff'), ink = css('--text', '#1c2e4a'), muted = css('--muted', '#4a5d7e');
  const svgs = () => ['chart', 'chart2'].map((id) => $(id).querySelector('svg')).filter(Boolean);
  showPlayer(years[0], 0);
  const sizes = svgs().map((s) => ({ w: Number(s.getAttribute('width') || s.viewBox.baseVal.width), h: Number(s.getAttribute('height') || s.viewBox.baseVal.height) }));
  const head = 56, foot = 30, gap = 16;
  const W = Math.max(...sizes.map((s) => s.w)), H = head + sizes.reduce((a, s) => a + s.h, 0) + gap * (sizes.length - 1) + foot;
  const scale = Math.min(2, 1600 / W);
  const cv = document.createElement('canvas'); cv.width = Math.round(W * scale) & ~1; cv.height = Math.round(H * scale) & ~1;
  const g = cv.getContext('2d');
  const stream = cv.captureStream(30);
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6e6 } : {});
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((ok) => { rec.onstop = ok; });
  btn.disabled = true;
  rec.start();
  try {
    for (const y of years) {
      btn.textContent = `Recording ${y}…`;
      showPlayer(y, 0);
      const imgs = await Promise.all(svgs().map((s) => svgImage(s, bg)));
      g.setTransform(scale, 0, 0, scale, 0, 0);
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.fillStyle = ink; g.font = '600 18px Inter, system-ui, sans-serif';
      g.fillText(`${nameOf(state.iso)} · ${shortName(c.ind)}`, 12, 26);
      g.fillStyle = muted; g.font = '13px Inter, system-ui, sans-serif';
      g.fillText(`Data as of ${y} · comparators: ${setName(c)} (today's set) · The Growth Test`, 12, 46);
      let top = head;
      for (const im of imgs) { g.drawImage(im.img, 0, top, im.w, im.h); top += im.h + gap; }
      g.fillText(`Source: ${sourceLabel(c.ind)}; population, World Bank WDI. Hollow points are older than the staleness limit.`, 12, H - 10);
      await new Promise((r) => setTimeout(r, y === years[years.length - 1] ? hold * 2.5 : hold));
    }
  } finally {
    rec.stop();
    await done;
    btn.disabled = false; btn.textContent = 'Save playback as video';
    if (wasOn) showPlayer(c.asOf, 0); else { pl.key = null; render(); }
  }
  const blob = new Blob(chunks, { type: 'video/webm' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.iso}-${state.ind}-player-${years[0]}-${years[years.length - 1]}.webm`.replace(/[^A-Za-z0-9._-]/g, '_');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- C3: over time against comparators ----------
function drawLines(c) {
  const host = $('chart3');
  host.replaceChildren();
  const P = window.Plot;
  if (!P) return;
  const own = c.series.filter((r) => r.iso3 === state.iso);
  if (own.length < 2) { host.append(h('p', { class: 'ev-empty' }, `${nameOf(state.iso)} has fewer than two values between ${c.from} and ${c.asOf}, so no line can be drawn. `, whereNote(c, !c.target))); return; }
  const { text, muted, focus, focusInk, band, other } = palette();
  const width = Math.max(320, host.clientWidth || 900);
  const height = Math.round(Math.min(480, Math.max(300, width * 0.42)));
  const peerSet = new Set(c.peers);
  const sparseOf = (iso3) => coverage(c.series, iso3, c.from, c.asOf) < 0.5;
  const peerSeries = c.series.filter((r) => r.iso3 !== state.iso && peerSet.has(r.iso3));
  const last = (rows) => { const m = new Map(); for (const r of rows) if (!m.has(r.iso3) || m.get(r.iso3).year < r.year) m.set(r.iso3, r); return [...m.values()]; };
  const showLines = state.c3peers === 'lines';
  const level = state.c3view === 'levels';
  const yType = level && c.transform === 'log' && c.series.every((r) => r.value > 0) ? 'log' : 'linear';
  const unit = unitOf(c.ind);
  const addedSet = new Set(c.added);
  const lineSeries = showLines ? peerSeries : peerSeries.filter((r) => addedSet.has(r.iso3));
  const endRows = last(lineSeries);
  const marks = [
    P.areaY(c.band, { x: 'year', y1: 'q1', y2: 'q3', fill: band, fillOpacity: 0.8 }),
    P.line(c.band, { x: 'year', y: 'median', stroke: muted, strokeDasharray: '5,3', strokeWidth: 1.6 }),
  ];
  if (!level) marks.push(P.ruleY([0], { stroke: text, strokeOpacity: 0.5 }));
  if (lineSeries.length) {
    marks.push(
      P.line(lineSeries.filter((r) => !sparseOf(r.iso3)), { x: 'year', y: 'value', z: 'iso3', stroke: other, strokeOpacity: 0.9, strokeWidth: 1 }),
      P.line(lineSeries.filter((r) => sparseOf(r.iso3)), { x: 'year', y: 'value', z: 'iso3', stroke: other, strokeOpacity: 0.9, strokeWidth: 1, strokeDasharray: '2,3' }),
      P.dot(lineSeries.filter((r) => sparseOf(r.iso3)), { x: 'year', y: 'value', r: 2, fill: other, fillOpacity: 0.9 }),
    );
  }
  marks.push(
    ...byOffset(endRows, c.c3dy).map((g) => P.text(g.rows, { x: 'year', y: 'value', text: 'iso3', dx: 6, dy: g.off, textAnchor: 'start', fontSize: 10.5, fill: muted })),
    P.line(own, { x: 'year', y: 'value', stroke: focus, strokeWidth: 3, strokeDasharray: c.sparse ? '6,4' : null }),
    P.dot(own, { x: 'year', y: 'value', r: c.sparse ? 4 : 2.5, fill: focus }),
    P.text(last(own), { x: 'year', y: 'value', text: () => state.iso, dx: 6, dy: -12, textAnchor: 'start', fontSize: 12.5, fontWeight: 600, fill: focusInk }),
    ...sideLabels(P, c.ind, { above: level ? 'Higher' : 'Rose more', below: level ? 'Lower' : 'Rose less', corner: 'left' }),
    P.tip(c.series, P.pointer({ x: 'year', y: 'value', title: (d) => `${nameOf(d.iso3)} ${d.year}\n${level ? fmtShort(c.ind, d.value) : `${d.value >= 0 ? '+' : '−'}${fmtDiff(c.ind, Math.abs(d.value))} since first year shown`}` })),
  );
  const yUnit = !level && unit.startsWith('%') ? 'percentage points' : unit;
  const ylab = `↑ ${level ? shortName(c.ind) : `Change since first year shown`}${yUnit ? ` (${yUnit})` : ''}${yType === 'log' ? ', log scale' : ''}`;
  const max = Math.max(30, Math.floor(width / 7.5));
  const spec = {
    width, height, marginLeft: 58, marginRight: 48, marginTop: 22, marginBottom: 36,
    style: { background: 'transparent', color: text, fontSize: '12px', fontFamily: 'Inter, system-ui, sans-serif' },
    x: { domain: [Math.min(...c.series.map((r) => r.year)), Math.max(...c.series.map((r) => r.year))], tickFormat: 'd', label: null, grid: true, ticks: Math.min(10, Math.max(4, Math.floor(width / 90))) },
    y: { type: yType, label: ylab.length > max ? `${ylab.slice(0, max - 1)}…` : ylab, grid: true, nice: yType === 'linear' },
    marks,
  };
  const chart = P.plot(spec);
  if (!c.c3dy) {
    // Second pass: spread end labels vertically so codes at the right edge do not overlap.
    const ys = chart.scale('y');
    // The economy's own label (12px above its last point) is a fixed obstacle the codes move around.
    const self = last(own)[0];
    const fy = ys.apply(self.value) - 12, gap = 14, selfGap = 16;
    const pts = endRows.map((r) => ({ iso3: r.iso3, y: ys.apply(r.value) })).sort((a, b) => a.y - b.y);
    const dy = {};
    let prev = -Infinity;
    for (const p of pts) {
      let y = Math.max(p.y, prev + gap);
      if (Math.abs(y - fy) < selfGap) y = fy + selfGap;
      dy[p.iso3] = Math.round(y - p.y); prev = y;
    }
    c.c3dy = dy;
    return drawLines(c);
  }
  chart.setAttribute('aria-hidden', 'true');
  host.append(chart);
}

function renderLinesText(c) {
  const country = nameOf(state.iso);
  $('h-c3').innerHTML = `<span class="ev-num">3</span> Over time against its comparators <span class="ev-q">Has ${country} moved apart from them, and when?</span>`;
  const parts = [];
  const level = state.c3view === 'levels';
  const signed = (v) => (Math.abs(v) < 1e-9 ? 'no change' : `${v >= 0 ? '+' : '−'}${fmtDiff(c.ind, Math.abs(v))}`);
  const perYear = (v) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), Math.abs(v) < 1 ? 2 : 1)}`;
  if (c.endT) {
    const [a, b] = c.endT.years;
    parts.push(level
      ? `<strong>${country} went from ${fmtVal(c.ind, c.endT.from)} in ${a} to ${fmtShort(c.ind, c.endT.to)} in ${b}</strong> (${signed(c.endT.change)}).`
      : `<strong>${country} changed by ${signed(c.endT.change)} between ${a} and ${b}.</strong>`);
    // Endpoints can hide the story: name a peak or trough in between that dwarfs the end-to-end change.
    const own = c.series.filter((r) => r.iso3 === state.iso && r.year > a && r.year < b);
    const hiPt = own.reduce((m, r) => (!m || r.value > m.value ? r : m), null), loPt = own.reduce((m, r) => (!m || r.value < m.value ? r : m), null);
    const ends = [c.endT.from, c.endT.to], swing = Math.max(Math.abs(c.endT.change), 1e-9);
    const hiGap = hiPt ? hiPt.value - Math.max(...ends) : 0, loGap = loPt ? Math.min(...ends) - loPt.value : 0;
    const big = (gap) => gap > swing && gap > 0.1 * Math.max(...ends.map(Math.abs), 1e-9);
    if (big(hiGap) && hiGap >= loGap) parts.push(`In between it peaked at ${level ? fmtShort(c.ind, hiPt.value) : signed(hiPt.value)} in ${hiPt.year}.`);
    else if (big(loGap)) parts.push(`In between it fell to ${level ? fmtShort(c.ind, loPt.value) : signed(loPt.value)} in ${loPt.year}.`);
    if (c.endM) parts.push(level
      ? `The comparator median went from ${fmtShort(c.ind, c.endM.from)} in ${c.endM.years[0]} to ${fmtShort(c.ind, c.endM.to)} in ${c.endM.years[1]}.`
      : `The comparators' median change by ${c.endM.years[1]} was ${signed(c.endM.to)}.`);
    // Like with like: when the economy's first and last years differ from the comparators', compare both over the
    // years they share (the first and last year where both have a value).
    if (level && c.endM && (c.endM.years[0] !== a || c.endM.years[1] !== b)) {
      const mine = new Map(c.series.filter((r) => r.iso3 === state.iso).map((r) => [r.year, r.value]));
      const common = (c.band || []).filter((x) => mine.has(x.year));
      if (common.length >= 2) {
        const f = common[0], l = common[common.length - 1];
        parts.push(`Over the years both have data, ${f.year}–${l.year}: ${country} ${signed(mine.get(l.year) - mine.get(f.year))}, the comparator median ${signed(l.median - f.median)}.`);
      }
    }
    if (!c.sparse && c.trendT != null && c.trendM != null) parts.push(`Fitted trend: ${perYear(c.trendT)} a year for ${country}, ${perYear(c.trendM)} for the comparator median${unit3(c)}.`);
    if (c.sparse) parts.push(`${country} has values for fewer than half the years, so the line joins the years with data (often survey waves).`);
  } else {
    parts.push(`${country} has fewer than two values between ${c.from} and ${c.asOf}.`);
  }
  $('readout3').innerHTML = parts.join(' ');
  $('foot3').innerHTML = `Annual values in the ${state.c3years} years to ${c.asOf} (${c.from} onward). Thick line: ${country}. ${state.c3peers === 'lines' ? `Thin grey lines: each ${setName(c)} comparator, labelled by code at its last year; dotted where a comparator has data for fewer than half the years. ` : c.added.length ? 'Thin grey lines: the comparators you added. ' : ''}Dashed line and shaded band: the comparator median and middle half, drawn only for years where at least three comparators have data.${level ? '' : ' Each line is measured from its own first year with data in the range.'} Source: ${sourceLabel(c.ind)}. ${vintage()}`;
  $('chart3').setAttribute('aria-label', `Line chart of ${shortName(c.ind)} over time for ${country} and its comparators`);
}
const unit3 = (c) => { const u = unitOf(c.ind); return u ? ` (${u.startsWith('%') ? 'percentage points' : u})` : ''; };

// ---------- export ----------
const HOSTS = { c1: 'chart', c2: 'chart2', c3: 'chart3', node: 'chartN', c5: 'chart5', c6: 'chart6', c8: 'chart8', c12: 'chart12' };
/** Chart pack (phase 5): every chart now on the page, with its heading, readout and footnote, as one self-contained HTML file to open, print or save as PDF. */
// ---------- my pack (UX #25): charts kept across nodes and indicators ----------
// Each pin is the chart as drawn when it was added, with its section text and the settings that drew it. They live in
// this browser only (localStorage, best effort); a pack too large to store is still kept for this visit.
const PIN_KEY = 'cc-evidence-pack';
function loadPins() { try { return JSON.parse(localStorage.getItem(PIN_KEY) || '[]'); } catch { return []; } }
function savePins() {
  try { localStorage.setItem(PIN_KEY, JSON.stringify(state.pins)); return true; } catch { return false; }
}
function showPins() {
  const n = state.pins.length;
  $('pins').hidden = $('pins-clear').hidden = !n;
  $('pins-n').textContent = String(n);
}
/** The section's kicker, title (without a bare section number) and question. */
function sectionTitles(sec) {
  const h2 = sec.querySelector('h2') ? sec.querySelector('h2').cloneNode(true) : null;
  const q = h2 && h2.querySelector('.ev-q') ? h2.querySelector('.ev-q').textContent : (sec.querySelector('.ev-node-q') || {}).textContent || '';
  if (h2) h2.querySelectorAll('.ev-q').forEach((n) => n.remove());
  if (h2) h2.querySelectorAll('.ev-num').forEach((n) => { if (/^\d+$/.test(n.textContent.trim())) n.remove(); });
  return { kicker: (sec.querySelector('.kicker') || {}).textContent || '', title: h2 ? h2.textContent.trim() : '', q };
}
function pinChart(key, btn) {
  const row = PACK.find((r) => r[0] === key), c = state.current, s = chartSVG(key);
  if (!row || !s || !c) return;
  const t = sectionTitles($(row[1])), ind = state.registry.indicatorById[state.ind];
  const settings = `${nameOf(state.iso)} · ${key === 'node' || ['c5', 'c6', 'c8', 'c12'].includes(key) ? (state.registry.nodeById[state.node] ? `${nodeCode(state.node)} ${state.registry.nodeById[state.node].short}` : state.node) : (ind ? ind.name : state.ind)} · comparators: ${setName(c)}${c.added.length ? ` plus ${c.added.join(' ')}` : ''} · data as of ${c.asOf}${key === 'c1' ? ` · fit: ${state.fit}` : ''}`;
  state.pins.push({ key, ...t, svg: s.text, readout: $(row[2]) ? $(row[2]).innerHTML : '', foot: $(row[3]) ? $(row[3]).textContent : '', settings, url: location.href, vintage: vintage() });
  const stored = savePins();
  showPins();
  $('pins-status').textContent = stored ? `Added: ${t.title || key}.` : `Added for this visit only: the pack is too large for this browser to keep.`;
  if (btn) { btn.textContent = 'Added ✓'; setTimeout(() => { btn.textContent = '+ Pack'; }, 1500); }
}
const PACK_CSS = 'body{font:15px/1.5 Inter,system-ui,sans-serif;color:#1c2e4a;background:#fff;max-width:1000px;margin:24px auto;padding:0 16px}h1{font:600 26px Newsreader,Georgia,serif;margin:0}h2{font:600 19px Newsreader,Georgia,serif;margin:4px 0 10px}.k{font:600 11px/1 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:#9a5620;margin:0}.m{color:#4a5d7e;font-size:13px}section{border-top:1px solid #d5dbe5;padding:22px 0;break-inside:avoid}svg{max-width:100%;height:auto}.q{font-style:italic;color:#4a5d7e;margin:-6px 0 10px}.r{margin:10px 0 4px}.f{color:#4a5d7e;font-size:12.5px;margin:0}@media print{body{margin:0}section{page-break-inside:avoid}}';
function exportPins() {
  if (!state.pins.length) return;
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const parts = state.pins.map((p) => `<section><p class="k">${esc(p.kicker)}</p><h2>${esc(p.title || p.key)}</h2>${p.q ? `<p class="q">${esc(p.q)}</p>` : ''}<p class="m">${esc(p.settings)} · <a href="${esc(p.url)}">open this view</a></p>${p.svg}<p class="r">${p.readout}</p><p class="f">${esc(p.foot)} ${esc(p.vintage)}</p></section>`);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>The Growth Test · my chart pack</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${PACK_CSS}</style></head><body><p class="k">The Growth Test · my chart pack</p><h1>${state.pins.length} chart${state.pins.length === 1 ? '' : 's'}</h1><p class="m">Made ${new Date().toISOString().slice(0, 10)}. Each chart is shown as it was drawn when added, with the economy, comparators and data year that drew it and a link back to that view. No chart states a causal conclusion; each readout describes the data, not a verdict.</p>${parts.join('')}</body></html>`;
  downloadText(`chart-pack-${new Date().toISOString().slice(0, 10)}.html`, html, 'text/html');
}

const PACK = [['node', 'sec-node', 'readoutN', 'footN'], ['c5', 'sec-c5', 'readout5', 'foot5'], ['c6', 'sec-c6', 'readout6', 'foot6'], ['c8', 'sec-c8', 'readout8', 'foot8'], ['c12', 'sec-c12', 'readout12', 'foot12'], ['c1', 'sec-c1', 'readout', 'foot'], ['c2', 'sec-c2', 'readout2', 'foot2'], ['c3', 'sec-c3', 'readout3', 'foot3']];
function exportPack() {
  const c = state.current; if (!c) return;
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const parts = [];
  for (const [key, sec, ro, ft] of PACK) {
    const el = $(sec); if (!el || (el.hidden && el.dataset.avail !== '1')) continue;
    const s = chartSVG(key); if (!s) continue;
    const kicker = el.querySelector('.kicker'), h2 = el.querySelector('h2') ? el.querySelector('h2').cloneNode(true) : null;
    const q = h2 && h2.querySelector('.ev-q') ? h2.querySelector('.ev-q').textContent : (el.querySelector('.ev-node-q') || {}).textContent || '';
    if (h2) h2.querySelectorAll('.ev-q').forEach((n) => n.remove());
    if (h2) h2.querySelectorAll('.ev-num').forEach((n) => { if (/^\d+$/.test(n.textContent.trim())) n.remove(); });
    parts.push(`<section><p class="k">${esc(kicker ? kicker.textContent : '')}</p><h2>${esc(h2 ? h2.textContent.trim() : key)}</h2>${q ? `<p class="q">${esc(q)}</p>` : ''}${s.text}<p class="r">${$(ro) ? $(ro).innerHTML : ''}</p><p class="f">${esc($(ft) ? $(ft).textContent : '')}</p></section>`);
  }
  const title = `${nameOf(state.iso)} · ${$('h-node') && $('h-node').textContent ? $('h-node').textContent : 'Evidence'}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} · chart pack</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:15px/1.5 Inter,system-ui,sans-serif;color:#1c2e4a;background:#fff;max-width:1000px;margin:24px auto;padding:0 16px}h1{font:600 26px Newsreader,Georgia,serif;margin:0}h2{font:600 19px Newsreader,Georgia,serif;margin:4px 0 10px}.k{font:600 11px/1 "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:#9a5620;margin:0}.m{color:#4a5d7e;font-size:13px}section{border-top:1px solid #d5dbe5;padding:22px 0;break-inside:avoid}svg{max-width:100%;height:auto}.q{font-style:italic;color:#4a5d7e;margin:-6px 0 10px}.r{margin:10px 0 4px}.f{color:#4a5d7e;font-size:12.5px;margin:0}@media print{body{margin:0}section{page-break-inside:avoid}}</style></head><body><p class="k">The Growth Test · chart pack</p><h1>${esc(title)}</h1><p class="m">Comparators: ${esc(setName(c))} (${esc(c.peers.join(' '))}). Data as of ${c.asOf}. Fit for chart 1: ${esc(state.fit)}. Made ${new Date().toISOString().slice(0, 10)} from <a href="${esc(location.href)}">this view</a>. No chart states a causal conclusion; each readout is a description of the data, not a verdict.</p>${parts.join('')}</body></html>`;
  downloadText(`${state.iso}-${String(state.node).replace(/[^A-Za-z0-9._-]/g, '_')}-chart-pack-${c.asOf}.html`, html, 'text/html');
}
function chartSVG(key, { framed = false } = {}) {
  const svg = $(HOSTS[key]).querySelector('svg');
  if (!svg) return null;
  const clone = svg.cloneNode(true);
  const w = svg.getAttribute('width') || svg.viewBox.baseVal.width, hgt = svg.getAttribute('height') || svg.viewBox.baseVal.height;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', w); bg.setAttribute('height', hgt); bg.setAttribute('fill', css('--bg', '#ffffff'));
  clone.insertBefore(bg, clone.firstChild);
  clone.querySelectorAll('[aria-label="tip"]').forEach((n) => n.remove());
  const plain = { text: new XMLSerializer().serializeToString(clone), w: Number(w), h: Number(hgt) };
  return framed ? frameSVG(key, clone, plain) : plain;
}
/** A slide-ready export: the chart with its section title, question, reading, footnote and data vintage drawn around it. */
function frameSVG(key, clone, { w, h: ch }) {
  const row = PACK.find((r) => r[0] === key); if (!row) return { text: new XMLSerializer().serializeToString(clone), w, h: ch };
  const sec = $(row[1]), h2 = sec.querySelector('h2') ? sec.querySelector('h2').cloneNode(true) : null;
  const q = h2 && h2.querySelector('.ev-q') ? h2.querySelector('.ev-q').textContent : (sec.querySelector('.ev-node-q') || {}).textContent || '';
  if (h2) h2.querySelectorAll('.ev-q').forEach((n) => n.remove());
  if (h2) h2.querySelectorAll('.ev-num').forEach((n) => { if (/^\d+$/.test(n.textContent.trim())) n.remove(); });
  const kicker = (sec.querySelector('.kicker') || {}).textContent || '';
  const c = state.current;
  const meta = `${nameOf(state.iso)} · data as of ${c ? c.asOf : snapYear()} · comparators: ${c ? setName(c) : state.set}`;
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const wrap = (t, size) => {
    const per = Math.max(30, Math.floor((w - 32) / (size * 0.53))), out = [];
    let line = '';
    for (const word of String(t).replace(/\s+/g, ' ').trim().split(' ')) {
      if ((line + ' ' + word).trim().length > per) { if (line) out.push(line); line = word; } else line = (line + ' ' + word).trim();
    }
    if (line) out.push(line);
    return out;
  };
  const ink = css('--text', '#1c2e4a'), muted = css('--muted', '#4a5d7e'), accent = css('--chart-focus-ink', '#9a5620'), bgc = css('--bg', '#ffffff');
  const parts = [];
  let y = 26;
  // Every attribute value goes through esc(): a raw double quote (as in a font family) would make the file invalid XML.
  const put = (lines, size, fill, weight = 400, gap = 1.35, family = 'Inter, system-ui, sans-serif') => { for (const l of lines) { parts.push(`<text x="16" y="${y}" font-size="${size}" font-weight="${weight}" fill="${esc(fill)}" font-family="${esc(family)}">${esc(l)}</text>`); y += size * gap; } };
  if (kicker) put([kicker.toUpperCase()], 11, accent, 600, 1.6, "'IBM Plex Mono', ui-monospace, monospace");
  put(wrap(h2 ? h2.textContent.trim() : key, 20), 20, ink, 600, 1.25, 'Newsreader, Georgia, serif');
  if (q) put(wrap(q, 13), 13, muted, 400);
  put([meta], 12, muted, 400, 1.6);
  const top = y;
  y = top + ch + 22;
  const ro = $(row[2]) ? $(row[2]).textContent.trim() : '', ft = $(row[3]) ? $(row[3]).textContent.trim() : '';
  if (ro) { put(wrap(ro, 13), 13, ink, 400); y += 4; }
  if (ft) put(wrap(ft, 11), 11, muted, 400);
  put([`The Growth Test · The New Foreign Assistance${ft.includes('Snapshot ') ? '' : ` · ${vintage()}`}`], 11, muted, 400);
  const H = Math.ceil(y + 6);
  clone.setAttribute('x', '0'); clone.setAttribute('y', String(top));
  const inner = new XMLSerializer().serializeToString(clone);
  const text = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}"><rect width="${w}" height="${H}" fill="${esc(bgc)}"/>${parts.join('')}${inner}</svg>`;
  return { text, w, h: H };
}
const fileBase = (key) => ['c5', 'c6', 'c8', 'c12'].includes(key)
  ? `${state.iso}-${key}-${state.node}-${state.set}-${state.asOf || snapYear()}`.replace(/[^A-Za-z0-9._-]/g, '_')
  : key === 'node'
  ? `${state.iso}-${state.node === 'growth' ? 'c4-growth' : state.node === 'composition' ? 'c11-composition' : state.node === 'firms' ? `c7-firms-${state.c7measure.toLowerCase()}` : `c9-${state.node}`}-${state.set}-${state.asOf || snapYear()}`.replace(/[^A-Za-z0-9._-]/g, '_')
  : `${state.iso}-${state.ind}-${key}-${key === 'c1' ? state.fit : state.set}-${state.asOf || snapYear()}`.replace(/[^A-Za-z0-9._-]/g, '_');
function exportSVG(key) { const s = chartSVG(key, { framed: true }); if (s) downloadText(`${fileBase(key)}.svg`, s.text, 'image/svg+xml'); }
function exportPNG(key) {
  const s = chartSVG(key, { framed: true }); if (!s) return;
  const img = new Image();
  const scale = 1600 / s.w;
  img.onerror = () => {
    const row = document.querySelector(`.ev-actions[data-chart="${key}"]`);
    if (row && !row.querySelector('.ev-export-error')) row.append(h('span', { class: 'ev-export-error small', role: 'status' }, 'Export failed: the chart could not be drawn as an image. Try SVG.'));
  };
  img.onload = () => {
    const cv = document.createElement('canvas'); cv.width = 1600; cv.height = Math.round(s.h * scale);
    const g = cv.getContext('2d'); g.scale(scale, scale); g.drawImage(img, 0, 0);
    cv.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${fileBase(key)}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.text)}`;
}
/** A 16:9 slide (1600 × 900, drawn at twice that for sharpness): question as title, one subtitle line, the chart
 *  scaled to fit, one source line. The readout and footnote stay in the CSV and the framed SVG. */
function slideSVG(key) {
  const s = chartSVG(key), row = PACK.find((r) => r[0] === key), c = state.current;
  if (!s || !row || !c) return null;
  const W = 1600, H = 900, esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const t = sectionTitles($(row[1])), ind = state.registry.indicatorById[state.ind];
  const indChart = ['c1', 'c2', 'c3'].includes(key);
  const node = state.registry.nodeById[state.node];
  const title = indChart ? ($('ev-title').textContent || `${shortName(ind)}: ${t.q || t.title}`) : `${node ? `${nodeCode(state.node)} ${node.short}` : t.title}: ${t.q || t.title}`;
  const sub = [nameOf(state.iso), t.title, indChart ? ind.name : null, `comparators: ${setName(c)}`, `data as of ${c.asOf}`].filter(Boolean).join(' · ');
  const source = `${indChart ? `Source: ${sourceLabel(ind)}. ` : ''}The Growth Test, The New Foreign Assistance. ${vintage()}`;
  const ink = css('--text', '#1c2e4a'), muted = css('--muted', '#4a5d7e'), accent = css('--chart-focus-ink', '#9a5620'), bgc = css('--bg', '#ffffff');
  const fit = (str, px, size) => { const max = Math.floor(px / (size * 0.52)); return str.length > max ? `${str.slice(0, max - 1)}…` : str; };
  const ts = Math.max(26, Math.min(38, Math.floor((W - 112) / (title.length * 0.5))));
  const top = 168, bottom = 66, box = { x: 56, y: top, w: W - 112, h: H - top - bottom };
  const k = Math.min(box.w / s.w, box.h / s.h), cw = s.w * k, chh = s.h * k;
  const inner = s.text.replace(/^<svg\b([^>]*)>/, (m, attrs) => `<svg${attrs.replace(/\s(x|y|width|height)="[^"]*"/g, '')} x="${box.x + (box.w - cw) / 2}" y="${box.y}" width="${cw}" height="${chh}"${/viewBox=/.test(attrs) ? '' : ` viewBox="0 0 ${s.w} ${s.h}"`}>`);
  const text = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${esc(bgc)}"/>`
    + `<text x="56" y="58" font-size="15" font-weight="600" letter-spacing="1.5" fill="${esc(accent)}" font-family="${esc("'IBM Plex Mono', ui-monospace, monospace")}">${esc((t.kicker || 'The Growth Test').toUpperCase())}</text>`
    + `<text x="56" y="106" font-size="${ts}" font-weight="600" fill="${esc(ink)}" font-family="${esc('Newsreader, Georgia, serif')}">${esc(fit(title, W - 112, ts))}</text>`
    + `<text x="56" y="142" font-size="19" fill="${esc(muted)}" font-family="${esc('Inter, system-ui, sans-serif')}">${esc(fit(sub, W - 112, 19))}</text>`
    + inner
    + `<text x="56" y="${H - 28}" font-size="16" fill="${esc(muted)}" font-family="${esc('Inter, system-ui, sans-serif')}">${esc(fit(source, W - 112, 16))}</text></svg>`;
  return { text, w: W, h: H };
}
function exportSlide(key) {
  const s = slideSVG(key); if (!s) return;
  const img = new Image(), k = 2;
  img.onerror = () => {
    const row = document.querySelector(`.ev-actions[data-chart="${key}"]`);
    if (row && !row.querySelector('.ev-export-error')) row.append(h('span', { class: 'ev-export-error small', role: 'status' }, 'Export failed: the slide could not be drawn as an image. Try SVG.'));
  };
  img.onload = () => {
    const cv = document.createElement('canvas'); cv.width = s.w * k; cv.height = s.h * k;
    const g = cv.getContext('2d'); g.scale(k, k); g.drawImage(img, 0, 0);
    cv.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${fileBase(key)}-slide.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.text)}`;
}
const csvName = (iso3) => `"${nameOf(iso3).replace(/"/g, '""')}"`;
// The reference value is the mean of up to three years ending at `year`; the CSV also gives the single latest value.
const SPAN_HEAD = 'value,year,value_latest,year_latest,ref_first_year,ref_last_year';
const spanCells = (r) => [r.value, r.year, r.latest ?? '', r.year, r.from ?? r.year, r.year];

function exportCSV(key) {
  const c = state.current; if (!c) return;
  if (state.outs[key]) { if (state.outs[key].csv) downloadText(`${fileBase(key)}.csv`, [...state.outs[key].csv, '', `# ${nameOf(state.iso)} (${state.iso}), ${state.node}. Comparators (${state.set}): ${c.peers.join(' ')}. Data as of ${c.asOf}.`].join('\n'), 'text/csv'); return; }
  if (key === 'node') { if (state.nodeOut && state.nodeOut.csv) downloadText(`${fileBase(key)}.csv`, [...state.nodeOut.csv, '', `# ${nameOf(state.iso)} (${state.iso}), ${state.node}. Comparators (${state.set}): ${c.peers.join(' ')}. Snapshot ${snapYear()}.`].join('\n'), 'text/csv'); return; }
  const role = (iso3) => (iso3 === state.iso ? 'target' : c.added.includes(iso3) ? 'comparator_added' : c.peers.includes(iso3) ? 'comparator' : '');
  let lines;
  if (key === 'c2') {
    lines = [`iso3,economy,${SPAN_HEAD},role`];
    for (const r of c.barRows) lines.push([r.iso3, csvName(r.iso3), ...spanCells(r), role(r.iso3)].join(','));
    if (c.summary) lines.push('', `# Comparator median ${c.summary.median}; 25th percentile ${c.summary.q1}; 75th percentile ${c.summary.q3}; comparators with data ${c.summary.n}.`);
  } else if (key === 'c3') {
    lines = [`iso3,economy,year,${state.c3view === 'levels' ? 'value' : 'change_since_first_year'},role`];
    for (const r of c.series) lines.push([r.iso3, csvName(r.iso3), r.year, r.value, role(r.iso3)].join(','));
    lines.push('', 'year,comparator_median,comparator_p25,comparator_p75,comparators_with_data');
    for (const b of c.band) lines.push([b.year, b.median, b.q1, b.q3, b.n].join(','));
  } else {
    lines = [`iso3,economy,${SPAN_HEAD},gdp_per_capita_ppp,log_gdp_per_capita,fitted_value,distance_sd,role`];
    for (const r of c.rows) {
      const fitted = c.fit.ok ? backTransform(c.fit.predict(r.x), c.transform) : '';
      lines.push([r.iso3, csvName(r.iso3), ...spanCells({ ...r, value: c.values[r.iso3] ?? r.raw }), r.income.toFixed(2), r.x.toFixed(6), fitted, c.fit.ok ? c.fit.t[r.iso3] : '', role(r.iso3)].join(','));
    }
  }
  lines.push('', `# ${c.ind.id}: ${c.ind.name}. Source: ${sourceLabel(c.ind)}. ${key === 'c1' ? (c.fit.method === 'structure' ? 'Fit: the verdict layer’s, on income and structure; fitted_value is on the net-of-structure scale the chart draws. ' : `Fit: ${c.fit.method || 'none'} on income only. `) : ''}Data as of ${c.asOf}, window ${c.W} years. ${key === 'c3' ? '' : 'value is the mean of the years ref_first_year to ref_last_year (up to three); value_latest is year_latest alone. '}Comparators (${state.set}${c.added.length ? ` plus added ${c.added.join(' ')}` : ''}): ${c.peers.join(' ')}.`);
  downloadText(`${fileBase(key)}.csv`, lines.join('\n'), 'text/csv');
}

// ---------- start ----------
async function main() {
  readHashState();
  try {
    const [registry, countries, fits, index] = await Promise.all([loadRegistry(), getJSON(`${DATA}/countries.json`), getJSON(`${DATA}/fits.json`), getJSON(`${DATA}/index.json`)]);
    Object.assign(state, { registry, countries, fits, index });
    state.byIso = Object.fromEntries(countries.map((c) => [c.iso3, c]));
    if (!state.byIso[state.iso]) state.iso = 'KEN';
    await loadCountry();
    if (!state.node || !(VIEWS.includes(state.node) || registry.nodeById[state.node])) {
      const ind = state.ind && registry.indicatorById[state.ind];
      state.node = ind && (ind.nodes || []).length ? ind.nodes[0] : 'growth';
    }
    buildControls();
    await render();
    window.addEventListener('desk-setting', () => render());
  } catch (e) { showError(`Could not load the evidence data: ${e.message}. Rerun the engine CLI to write desk/data/panel and desk/data/fits.json.`); console.error(e); }
}
main();

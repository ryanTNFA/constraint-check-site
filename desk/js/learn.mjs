// Lesson one, "How a country gets read" (visual-upgrade PRD V6; teaching plan, section 4): the method walked once on
// Kenya, built from the Desk's own pieces: the bribery scatter from the panel and fit files, the growth record and top
// split from the scorecard, the four tests on the first decision, the full tree (tree.mjs), and the three lists
// (bottomLine). Steps fade in as they scroll into view; with reduced motion everything is simply there.
import './nav.mjs';
import { getJSON, loadRegistry, initTheme, h, dataBase, withData, fmtSigned, CANNOT_TELL_PLAIN, cannotTellCode } from './common.mjs';
import { renderTree } from './tree.mjs';
import { plainTier } from './card.mjs';
import { LESSONS } from './lessons.mjs';

initTheme();
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const ISO = 'KEN';

function scrollIn() {
  const steps = document.querySelectorAll('.step');
  if (reduced() || !('IntersectionObserver' in window)) { steps.forEach((s) => s.classList.add('in')); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.2 });
  steps.forEach((s) => io.observe(s));
}

/** Step 2: every economy's latest bribery share against log income, the fitted line, Kenya marked. */
function scatter(panel, fit, countries) {
  const W = 640, H = 360, L = 48, R = 16, T = 16, B = 40;
  const pts = [];
  for (const c of countries) {
    const row = panel.v[c.iso3]; if (!row || !c.features || c.features.log_gdppc_ppp == null) continue;
    let y = null; for (let i = row.length - 1; i >= 0; i--) if (row[i] != null) { y = row[i]; break; }
    if (y == null) continue;
    pts.push({ iso: c.iso3, name: c.name, x: c.features.log_gdppc_ppp, y, fitted: fit.fitted ? fit.fitted[c.iso3] : null });
  }
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const X = (v) => L + ((v - x0) / (x1 - x0)) * (W - L - R), Y = (v) => T + (1 - v / y1) * (H - T - B);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'learn-svg', role: 'img', 'aria-label': 'Share of firms asked for a bribe against income per person, every economy with data; the fitted line, and Kenya far above it.' });
  for (const g of [0, 25, 50, 75]) if (g <= y1) { svg.append(el('line', { x1: L, x2: W - R, y1: Y(g), y2: Y(g), class: 'lv-grid' }), el('text', { x: L - 6, y: Y(g) + 4, class: 'lv-tick', 'text-anchor': 'end' }, `${g}%`)); }
  for (const v of [1000, 3000, 10000, 30000, 100000]) { const lx = Math.log(v); if (lx >= x0 && lx <= x1) svg.append(el('text', { x: X(lx), y: H - B + 16, class: 'lv-tick', 'text-anchor': 'middle' }, v >= 1000 ? `$${v / 1000}k` : String(v))); }
  svg.append(el('text', { x: W - R, y: H - 4, class: 'lv-tick', 'text-anchor': 'end' }, 'GDP per person (PPP, log scale)'));
  const withFit = pts.filter((p) => p.fitted != null).sort((a, b) => a.x - b.x);
  if (withFit.length > 2) svg.append(el('path', { d: withFit.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(Math.max(0, p.fitted)).toFixed(1)}`).join(''), class: 'learn-fit' }));
  for (const p of pts) if (p.iso !== ISO) { const c = el('circle', { cx: X(p.x), cy: Y(p.y), r: 3, class: 'learn-dot' }); c.append(el('title', {}, `${p.name}: ${p.y.toFixed(1)}%`)); svg.append(c); }
  const k = pts.find((p) => p.iso === ISO);
  if (k) {
    if (k.fitted != null) svg.append(el('line', { x1: X(k.x), x2: X(k.x), y1: Y(k.y), y2: Y(Math.max(0, k.fitted)), class: 'learn-gap' }));
    svg.append(el('circle', { cx: X(k.x), cy: Y(k.y), r: 6, class: 'learn-dot focus' }));
    svg.append(el('text', { x: X(k.x) + 10, y: Y(k.y) + 4, class: 'lv-label world' }, `Kenya: ${k.y.toFixed(0)}% of firms asked for a bribe`));
    if (k.fitted != null) svg.append(el('text', { x: X(k.x) + 10, y: Y(Math.max(0, k.fitted)) + 14, class: 'lv-label' }, `expected at its income: about ${Math.max(0, k.fitted).toFixed(0)}%`));
  }
  return { svg, k, n: pts.length };
}

function bars(rows, { unit = '', max = null, signed = false } = {}) {
  // horizontal bars with labels; rows: [{label, value, note, cls}]
  const W = 640, rowH = 34, L = 230, R = 70, H = rows.length * rowH + 8;
  const lim = max || Math.max(...rows.map((r) => Math.abs(r.value)));
  const mid = signed ? L + (W - L - R) / 2 : L;
  const X = (v) => (signed ? mid + (v / lim) * ((W - L - R) / 2) : L + (v / lim) * (W - L - R));
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'learn-svg', role: 'img' });
  if (signed) svg.append(el('line', { x1: mid, x2: mid, y1: 0, y2: H, class: 'lv-axis' }));
  rows.forEach((r, i) => {
    const y = 4 + i * rowH;
    svg.append(el('text', { x: L - 10, y: y + 20, class: 'learn-rowlab', 'text-anchor': 'end' }, r.label));
    const x = Math.min(X(0), X(r.value)), w = Math.abs(X(r.value) - X(0));
    svg.append(el('rect', { x, y: y + 6, width: Math.max(w, 1), height: 20, class: `learn-bar ${r.cls || ''}` }));
    svg.append(el('text', { x: r.value >= 0 ? X(r.value) + 6 : X(r.value) - 6, y: y + 20, class: 'learn-val', 'text-anchor': r.value >= 0 ? 'start' : 'end' }, `${signed ? fmtSigned(r.value) : r.value}${unit}${r.note ? ` ${r.note}` : ''}`));
  });
  return svg;
}

async function main() {
  scrollIn();
  const [sc, registry, countries, panel, fit] = await Promise.all([
    getJSON(`${dataBase()}/${ISO}.json`), loadRegistry(), getJSON(`${dataBase()}/countries.json`),
    getJSON(`${dataBase()}/panel/IC.FRM.BRIB.ZS.json`, { optional: true }), getJSON(`${dataBase()}/fits/IC.FRM.BRIB.ZS.json`, { optional: true }),
  ]);
  const byId = Object.fromEntries(sc.nodes.map((n) => [n.id, n]));
  const short = (id) => (registry.nodeById[id] ? registry.nodeById[id].short.replace(/\?$/, '') : id);
  $('snapshot').textContent = sc.meta.snapshot_id || '—';
  // 1 the question
  $('q-growth').textContent = 'why is private investment low for its income level?';

  // 2 surprise
  if (panel && fit) {
    const { svg, k, n } = scatter(panel, fit, countries);
    $('fig-surprise').prepend(svg);
    const t = fit.t && fit.t[ISO];
    $('surprise-text').textContent = k ? `Kenya's point: about ${k.y.toFixed(0)}% of firms report being asked for a bribe (Enterprise Surveys), against roughly ${Math.max(0, k.fitted).toFixed(0)}% expected at its income${t != null ? `, a gap of ${t.toFixed(1)} standard deviations` : ''}. That gap, not the level, is the evidence. A country at the same level but at a tenth of the income would be where income predicts, and the tool would read nothing from it.` : 'Kenya has no recent bribery survey in the snapshot.';
    $('fig-surprise-cap').textContent = `${n} economies with a survey; the line is the income-conditional fit the tool uses. Hover a dot for its country.`;
  } else $('step-surprise').querySelector('.step-fig').textContent = 'The panel data for this chart is not in the snapshot.';

  // 3 growth
  const g = sc.growth_problem && sc.growth_problem.G1;
  const inv = sc.top_split && sc.top_split.stats;
  if (g) {
    const yrs = g.years_10y || g.window_10y || [];
    $('growth-text').textContent = `Kenya grew about ${g.avg_10y.toFixed(1)}% a year per person over ${yrs[0]} to ${yrs[1]}, against ${g.structural_median_10y.toFixed(1)}% for similar economies. Investment is about ${fmtSigned(inv ? inv.investment_t : 0)} standard deviations from what its income predicts: low, which is the symptom the tree explains.`;
    $('fig-growth').append(bars([
      { label: 'Kenya, growth per person, 10 years', value: Number(g.avg_10y.toFixed(1)), cls: 'focus' },
      { label: 'Similar economies, median', value: Number(g.structural_median_10y.toFixed(1)) },
    ], { unit: '% a year', max: Math.max(4, g.avg_10y, g.structural_median_10y) }));
  }

  // 4 the split
  if (sc.top_split) {
    const s = sc.top_split.stats, c = sc.top_split.classification;
    $('split-text').textContent = `For Kenya: the real lending rate is ${fmtSigned(s.real_rate_t)} standard deviations from expected (${c.rate}), credit grew about ${s.credit_growth.toFixed(1)}% a year (${c.credit}), and investment sits ${fmtSigned(s.investment_t)} (${c.investment}). Dear finance, little credit, low investment: the tool reads this, provisionally, as "${sc.top_split.label}", and starts down the finance branch.`;
    $('fig-split').append(bars([
      { label: 'Real lending rate (gap, SD)', value: Number(s.real_rate_t.toFixed(2)), cls: 'focus' },
      { label: 'Investment share (gap, SD)', value: Number(s.investment_t.toFixed(2)) },
      { label: 'Credit depth (gap, SD)', value: Number(s.credit_depth_t.toFixed(2)) },
    ], { signed: true, max: 2 }));
  }

  // 5 four tests on N0
  const n0 = byId.N0;
  if (n0 && n0.tests) {
    const rows = [['price', 'Price of finance'], ['changes', 'Moves with investment'], ['circumvention', 'Workarounds'], ['camels', 'Camels and hippos']].map(([k, label]) => {
      const tv = n0.tests[k]; const n = tv && tv.families ? tv.families.length : 0;
      return { label, value: tv && tv.T != null ? Number(tv.T.toFixed(2)) : 0, note: tv && tv.T != null ? `(${n} measure${n === 1 ? '' : 's'})` : '(no evidence)', cls: tv && tv.T != null ? (tv.T > 0 ? 'toward' : tv.T < 0 ? 'away' : '') : 'none' };
    });
    $('fig-tests').append(bars(rows, { signed: true, max: 2 }));
    $('tests-text').textContent = `On the first decision, the price test leans toward a problem (${fmtSigned(n0.tests.price.T)}: firms report credit constraints and discouraged borrowers, and the real rate is high), but the workarounds test leans away (${fmtSigned(n0.tests.circumvention.T)}: firms finance themselves internally and banks are liquid), and investment moved with the rate no more often than chance. A net near zero with the tests disagreeing is "can't tell", and the tool says so: ${plainTier(n0.tier).toLowerCase()}.`;
  }

  // 6 the tree
  renderTree($('tree-wrap'), { registry, nodes: sc.nodes, overrides: {}, onOpen: (id) => { location.href = withData(`/constraint-check-site/desk/areas.html?iso=${ISO}&node=${encodeURIComponent(id)}`); }, tooltipEl: $('tooltip'), plainCtx: null });
  const areas = ['N0', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N10', 'N11', 'N12', 'N13'];
  const kinds = {};
  for (const id of areas) { const n = byId[id]; if (!n) continue; const k = n.tier === 'candidate' || n.tier === 'likely_binding' ? 'flagged' : n.tier === 'probably_not' || n.tier === 'ruled_out' ? 'cleared' : (cannotTellCode(n) ? CANNOT_TELL_PLAIN[cannotTellCode(n)].label.toLowerCase() : n.tier === 'elimination' ? 'judged by elimination' : n.tier === 'desk_undiagnosable' ? 'needs a sector study' : 'unclear'); (kinds[k] ||= []).push(short(id)); }
  $('tree-text').textContent = Object.entries(kinds).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)}: ${v.join(', ')}.`).join(' ') + ' Hover an area for its reading; click one to open its evidence.';

  // 8 the three lists
  // the same three groups the Bottom line draws (the engine's statements), named plainly
  const st = sc.statements || {};
  const list = (title, ids, empty) => h('div', { class: 'learn-list' }, h('h3', {}, title), ids.length ? h('ul', {}, ids.map((id) => h('li', {}, h('strong', {}, short(id)), byId[id] ? `: ${plainTier(byId[id].tier).toLowerCase()}` : ''))) : h('p', { class: 'muted' }, empty));
  $('fig-lists').append(
    list('Stop arguing about', st.stop_arguing || [], 'Nothing yet. Common: about half the economies have no rule-out.'),
    list('Look closer', st.look_hard || [], 'Nothing.'),
    list('Can’t settle', st.cannot_tell || [], 'Nothing.'));

  // the index of lessons
  $('lesson-list').replaceChildren(...LESSONS.map((l) => h('li', {}, h('a', { href: withData(l.page) + `#lesson=${l.n}${l.predict ? '&predict=1' : ''}` }, `${l.n}. ${l.title}`), ' ', h('span', { class: 'small muted' }, l.task.split('. ')[0] + '.'))));
}
main().catch((e) => { console.error(e); const p = h('p', { class: 'note alert' }, `This lesson could not load its data: ${e.message}`); $('main').prepend(p); });

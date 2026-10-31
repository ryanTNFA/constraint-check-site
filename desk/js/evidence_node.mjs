// Evidence page, node views (evidence-viz-prd phase 2): the left rail in Mindbook order, the C9 evidence
// strip for a node, the C4 growth record, the C7 firm obstacles and (phase 4) the C11 composition. evidence.mjs owns the state and the
// indicator charts (C1 to C3); it passes what these views need in `ctx`.
import { nodeCode, h, fmt, fmtSigned, shortName, sourceLabel, tierLabel, tierClass, withData } from './common.mjs';
import { stripRows, familyRows, obstacleRows, indexSeries, exportShares, TEST_ORDER } from './evidence_math.mjs';
import { plainTier, tierBySetLine, reasonTag } from './card.mjs';
import { median, isNum } from '../../engine/src/stats.mjs';

const TEST_LABEL = { price: 'Test 1 · Price', changes: 'Test 2 · Changes', circumvention: 'Test 3 · Circumvention', camels: 'Test 4 · Camels and hippos' };
const TEST_Q = { price: 'Is the price high, or are firms rationed?', changes: 'Do movements in it move investment?', circumvention: 'Are firms paying to get around it?', camels: 'Do the activities that thrive need little of it?' };
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`; };
const trunc = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const SANS = 'Inter, system-ui, sans-serif', MONO = '"IBM Plex Mono", ui-monospace, monospace';
/** Values older than this many years are drawn as stale (the limit evidence.mjs uses for C1 and C2). */
const staleLimit = (registry) => (registry.params.recency && registry.params.recency.staleness_limit_years) || 8;
let measurer;
/**
 * Width in px of chart text as the page draws it: a hidden SVG text under <body>, so it inherits the page's tabular figures (a canvas
 * measure runs about 10% short on numbers). A character estimate where there is no DOM.
 */
function textW(s, px = 12, weight = 400, family = SANS) {
  try {
    if (!measurer || !measurer.isConnected) {
      const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('aria-hidden', 'true'); svg.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden';
      measurer = svg.appendChild(document.createElementNS(NS, 'text'));
      document.body.append(svg);
    }
    measurer.setAttribute('font-size', px); measurer.setAttribute('font-weight', weight); measurer.setAttribute('font-family', family);
    measurer.textContent = String(s);
    return measurer.getComputedTextLength();
  } catch { return String(s).length * px * 0.62; }
}

/**
 * A legend in a chart's top margin: entries [text, text options] left to right from x (px from the SVG's left edge), wrapping onto
 * another line before maxX. Returns the number of lines, and the marks once the chart's margins are known.
 */
function topLegend(P, items, { x = 0, maxX, y = 12, lh = 15, gap = 14, fontSize = 11 }) {
  let cx = x, line = 0;
  const placed = items.map(([text, o]) => {
    const w = textW(text, fontSize, o.fontWeight || 400);
    if (cx > x && cx + w > maxX) { cx = x; line++; }
    const p = { text, o, x: cx, y: y + line * lh };
    cx += w + gap;
    return p;
  });
  return { lines: line + 1, marks: (ml, mt) => placed.map((p) => P.text([p.text], { frameAnchor: 'top-left', dx: p.x - ml, dy: p.y - mt, textAnchor: 'start', fontSize, ...p.o })) };
}

/** Drops the row picks a previous chart left on this host (its click listener and keyboard list), noting which row's button had focus. */
function clearRowPicks(host) {
  const keysEl = host._rowKeys;
  host._rowFocus = keysEl && keysEl.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  if (host._rowClick) host.removeEventListener('click', host._rowClick, true);
  if (keysEl) keysEl.remove();
  host._rowClick = host._rowKeys = null;
}

/**
 * Clicking a row of a chart with a categorical y (band or point scale) picks the nearest row. Listens on the host in the capture phase, because
 * Plot's pointer (tip) interaction handles clicks on the SVG itself; the previous listener is replaced. Call it once the chart is in the page.
 * The keyboard path to the same picks is a toolbar after the host (the chart is aria-hidden and the host is role="img"), one button per row:
 * one tab stop, the arrow keys move, and while a button has focus it shows just under its row, which a band marks (.ev-rowkeys in
 * evidence.css). nameOf(key) is a button's text.
 */
function bindRowClick(host, chart, height, keys, onPick, { nameOf = (k) => k, label = 'Chart one of these below' } = {}) {
  const ys = chart.scale('y');
  const mid = (key) => ys.apply(key) + (ys.bandwidth || 0) / 2, step = ys.step || ys.bandwidth || 20;
  chart.style.cursor = 'pointer';
  if (host._rowClick) host.removeEventListener('click', host._rowClick, true);
  if (host._rowKeys) host._rowKeys.remove();
  host._rowClick = (e) => {
    const box = chart.getBoundingClientRect();
    if (e.clientY < box.top || e.clientY > box.bottom) return;
    const y = (e.clientY - box.top) * (height / box.height);
    const k = keys.reduce((best, key) => (Math.abs(mid(key) - y) < Math.abs(mid(best) - y) ? key : best), keys[0]);
    if (k && Math.abs(mid(k) - y) <= step / 2) onPick(k);
  };
  host.addEventListener('click', host._rowClick, true);
  if (!keys.length) return;
  const btns = keys.map((k) => h('button', { type: 'button', tabindex: '-1', 'data-key': k, onclick: () => onPick(k) }, nameOf(k)));
  const rove = (b) => { for (const x of btns) x.tabIndex = x === b ? 0 : -1; };
  const bar = h('div', { class: 'ev-rowkeys', role: 'toolbar', 'aria-label': label }, h('span', { 'aria-hidden': 'true' }, `${label}: arrow keys move, Enter picks`), ...btns);
  const band = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  for (const [a, v] of Object.entries({ x: 0, width: chart.getAttribute('width'), height: step, fill: 'currentColor', 'fill-opacity': 0.1, visibility: 'hidden' })) band.setAttribute(a, v);
  chart.prepend(band);
  let quiet = false;
  bar.addEventListener('focusin', (e) => {
    const k = e.target.dataset && e.target.dataset.key;
    if (!k) return;
    band.setAttribute('y', mid(k) - step / 2); band.setAttribute('visibility', 'visible');
    const box = chart.getBoundingClientRect(), fig = bar.offsetParent;
    if (fig) bar.style.top = `${box.top - fig.getBoundingClientRect().top + (mid(k) + step / 2) * (box.height / height)}px`;
    // Bring both the marked row and the button below it into view (scroll-padding keeps them clear of the pinned control bar).
    if (!quiet) { band.scrollIntoView({ block: 'nearest' }); e.target.scrollIntoView({ block: 'nearest' }); }
  });
  bar.addEventListener('focusout', (e) => { if (!bar.contains(e.relatedTarget)) band.setAttribute('visibility', 'hidden'); });
  bar.addEventListener('keydown', (e) => {
    const i = btns.indexOf(document.activeElement);
    const j = i < 0 ? undefined : { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: btns.length - 1 }[e.key];
    if (j === undefined) return;
    e.preventDefault();
    const b = btns[Math.max(0, Math.min(btns.length - 1, j))];
    rove(b); b.focus({ preventScroll: true });
  });
  // After a pick redraws the chart, focus returns to the same row's button rather than falling to the page (the page scrolls to the pick).
  const again = host._rowFocus ? btns.find((b) => b.dataset.key === host._rowFocus) : null;
  rove(again || btns[0]);
  host.after(bar);
  host._rowKeys = bar;
  host._rowFocus = null;
  if (again) { quiet = true; again.focus({ preventScroll: true }); quiet = false; }
}

// ---------- rail ----------
/** The rail entries that are views rather than nodes. */
export const VIEWS = ['growth', 'composition', 'firms'];

/** Rail entries in Mindbook order: the growth record, what the economy produces, what firms say, the first split, then the tree's branches. */
export function railModel(registry) {
  const nodes = registry.nodes.nodes;
  const kids = (p) => nodes.filter((n) => n.parent === p);
  const groups = [{ label: null, items: [{ id: 'growth', short: 'Growth record' }, { id: 'composition', short: 'What it produces' }, { id: 'firms', short: 'What firms say' }, ...kids('ROOT').filter((n) => n.diagnosable).map((n) => ({ id: n.id, short: n.short }))] }];
  const branch = (id) => {
    const items = [];
    for (const n of kids(id)) {
      items.push({ id: n.id, short: n.short, context: !n.diagnosable });
      if (n.rollup_of) {
        for (const s of n.rollup_of) { const sn = registry.nodeById[s]; if (sn) items.push({ id: sn.id, short: sn.short, sub: true }); }
        // sub-areas outside the roll-up are context (N11.policy, rubric 0.1.7)
        for (const c of kids(n.id)) if (!n.rollup_of.includes(c.id)) items.push({ id: c.id, short: c.short, sub: true, context: !c.diagnosable });
      }
    }
    return items;
  };
  for (const id of ['FIN', 'SOC', 'GOV', 'MKT']) if (registry.nodeById[id]) groups.push({ label: registry.nodeById[id].short, items: branch(id) });
  return groups;
}

export function renderRail(host, { registry, scorecard, current, hrefFor, onPick }) {
  const tierOf = (id) => { const n = scorecard && (scorecard.nodes || []).find((x) => x.id === id); return n ? n.tier : null; };
  host.replaceChildren(h('p', { class: 'ev-rail-title' }, 'Evidence by node'));
  for (const g of railModel(registry)) {
    const ul = h('ul', {});
    for (const it of g.items) {
      const tier = VIEWS.includes(it.id) ? null : it.context ? 'context_only' : tierOf(it.id);
      const a = h('a', {
        href: hrefFor(it.id), class: `ev-rail-item${it.sub ? ' sub' : ''}${it.id === current ? ' current' : ''}`,
        'aria-current': it.id === current ? 'page' : null,
        onclick: (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); onPick(it.id); },
      },
      tier ? h('span', { class: `tier-dot ${tierClass(tier)}`, title: tierLabel(tier), 'aria-hidden': 'true' }) : h('span', { class: 'tier-dot none', 'aria-hidden': 'true' }),
      h('span', { class: 'ev-rail-name' }, it.short),
      tier ? h('span', { class: 'visually-hidden' }, ` (${tierLabel(tier)})`) : null);
      ul.append(h('li', {}, a));
    }
    host.append(g.label ? h('div', { class: 'ev-rail-group' }, h('p', { class: 'ev-rail-label' }, g.label), ul) : h('div', { class: 'ev-rail-group' }, ul));
  }
}

// ---------- node header ----------
/** Lower-case a name's first letter for use mid-sentence, leaving acronyms ("NPL ratio", "GDP") alone. */
const lowerFirst = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

// What would let the price test run where it cannot today.
const PRICE_NEXT = {
  N4: 'A recent Mincerian return to schooling, estimated from household-survey microdata, would let it run.',
};

/** When a node has no class A/B price evidence in the window, say so, naming the latest out-of-window price value. */
export function noPriceNote(scorecard, nodeId, countryName) {
  const sn = scorecard && (scorecard.nodes || []).flatMap((x) => [x, ...(x.sub_nodes || [])]).find((x) => x && x.id === nodeId);
  const pt = sn && sn.tests && sn.tests.price;
  if (!pt || !pt.not_observed) return null;
  const stale = (scorecard.indicators || [])
    .filter((r) => r.test === 'price' && (r.class === 'A' || r.class === 'B') && (r.nodes || []).includes(nodeId) && isNum(r.stale_value))
    .sort((a, b) => b.stale_year - a.stale_year)[0];
  const latest = stale ? ` The latest is from ${stale.stale_year}, outside the window, so it is not scored (${stale.name}: ${fmt(stale.stale_value, 1)}).` : ' No class A/B price measure has any value for it.';
  return `No price evidence for ${countryName} in the window: test 1 cannot run and the rating rests on the other tests.${latest}${PRICE_NEXT[nodeId] ? ` ${PRICE_NEXT[nodeId]}` : ''}`;
}

export function renderNodeHead({ titleEl, qEl, verdictEl }, { view, registry, scorecard, iso, countryName, set = 'structural' }) {
  verdictEl.replaceChildren();
  if (view === 'growth') {
    titleEl.replaceChildren('Growth record');
    qEl.textContent = 'What is the growth problem?';
    const g = scorecard && scorecard.growth_problem;
    if (g && g.classification) verdictEl.append('The tool reads the growth problem as ', h('strong', {}, String(g.classification).replace(/_/g, ' ')), g.classification_rule ? ` (${g.classification_rule}).` : '.');
    return;
  }
  if (view === 'composition') {
    titleEl.replaceChildren('What it produces');
    qEl.textContent = `What does ${countryName} produce and export?`;
    verdictEl.append(h('span', {}, 'Context for every node: no verdict rests on it. A narrow export basket says where to look (self-discovery, a resource sector, the factors one sector needs), not what binds.'));
    return;
  }
  if (view === 'firms') {
    titleEl.replaceChildren('What firms say');
    qEl.textContent = `What do firms in ${countryName} name as their obstacles, and how does that compare with peers?`;
    verdictEl.append(h('span', {}, 'These are perceptions, from firms that survived to be surveyed. A constraint that kept firms from starting, or drove them out, does not show up here. Survey years differ by economy; each bar carries its year.'));
    return;
  }
  const n = registry.nodeById[view];
  titleEl.replaceChildren(h('span', { class: 'ev-num' }, nodeCode(view)), ' ', n ? n.short : view);
  qEl.textContent = n && n.question ? n.question : '';
  // Sub-nodes (N11.corruption and the like) live inside their roll-up's record.
  const all = ((scorecard && scorecard.nodes) || []).flatMap((x) => [x, ...((x.sub_nodes || []).filter((y) => y && y.id))]);
  const sn = all.find((x) => x.id === view);
  if (n && !n.diagnosable && !sn) { verdictEl.append(h('span', {}, 'Context, not a constraint the desk tests.')); return; }
  if (!sn) return;
  // The rating under the comparison countries chosen above, in the Snapshot's plain words.
  const tier = (sn.tier_by_set && sn.tier_by_set[set]) || sn.tier;
  const T = (registry.params && registry.params.tiers) || {};
  const up = (T.candidate && T.candidate.N_min) ?? 0.5, down = (T.probably_not && T.probably_not.N_max) ?? -0.5;
  const N = sn.N;
  const lean = !String(tier).startsWith('cannot_tell') || !isNum(N) ? null
    : N >= 0.1 ? `leans toward a problem (score ${fmtSigned(N, 2)}; “worth a closer look” starts at ${fmtSigned(up, 2)})`
    : N <= -0.1 ? `leans away from a problem (score ${fmtSigned(N, 2)}; “probably not” starts at ${fmtSigned(down, 2)})`
    : 'leans neither way';
  const bySet = tierBySetLine(sn, set);
  verdictEl.append(...[
    h('span', {}, 'The tool’s rating: '), h('span', { class: `tier-badge ${tierClass(tier)}` }, h('span', {}, plainTier(tier))),
    ' ', reasonTag(tier === sn.tier ? sn : { ...sn, tier, cannot_tell_reason: null, cannot_tell_detail: null }),
    lean ? h('span', { class: 'small muted' }, ` ${lean}.`) : null,
    ' ', h('a', { href: withData(`/C:/Program Files/Git/constraint-check-site/desk/country.html?iso=${iso}&node=${encodeURIComponent(view)}`) }, 'Open the rating card for the reasoning'),
    bySet ? h('span', { class: 'small muted ev-byset' }, ` ${bySet}`) : null,
  ].filter(Boolean));
  const np = sn.tier === 'elimination' ? null : noPriceNote(scorecard, view, countryName);
  if (np) verdictEl.append(h('span', { class: 'small ev-noprice' }, np));
}

// ---------- C9 evidence strip ----------
/** Nodes whose evidence a rail entry shows: a roll-up shows its sub-nodes' evidence too. */
export function nodeScope(registry, id) {
  const n = registry.nodeById[id];
  return n && n.rollup_of ? [id, ...n.rollup_of] : [id];
}

export function drawStrip(host, ctx) {
  const { P, registry, scorecard, view, set, pal, onPick, width: w0, asOf } = ctx;
  host.replaceChildren();
  clearRowPicks(host);
  if (!scorecard) { host.append(h('p', { class: 'ev-empty' }, 'No verdict-layer data for this economy.')); return { csv: null, text: '' }; }
  const scope = nodeScope(registry, view);
  const m = stripRows(scorecard, scope, set === 'custom' ? 'structural' : set);
  // One row per evidence family, as the verdict counts them (UX #20); the members stay in the tooltip and the CSV.
  const fams = familyRows(m.rows, scorecard, scope);
  const ind = (id) => registry.indicatorById[id];
  const width = Math.max(320, w0);
  const narrow = width < 640;
  // The strip shows the snapshot's numbers, so a value's age runs to the snapshot year (as the engine's recency weights do), not the as-of year.
  const limit = staleLimit(registry), snap = (scorecard.meta && scorecard.meta.snapshot_year) || asOf;
  const stale = (r) => snap - r.year > limit;
  const subOf = (r) => (scope.length > 1 && r.node !== view ? (registry.nodeById[r.node] ? registry.nodeById[r.node].short : r.node) : null);
  const nameOfRow = (r) => { const id = r.members ? r.members[0].id : r.id; return `${shortName(ind(id) || { name: id })}${r.members && r.members.length > 1 ? ` (${r.members.length} series)` : ''}`; };
  const fullName = (r) => `${nameOfRow(r)}${subOf(r) ? ` (${subOf(r)})` : ''}`;
  // A roll-up's sub-node fits inside the label's length; phones drop it (the tip and the keyboard list keep it).
  const labelOf = (r) => { const nm = nameOfRow(r), sub = narrow ? null : subOf(r), max = narrow ? 22 : 46; return sub ? `${trunc(nm, Math.max(12, max - sub.length - 3))} (${sub})` : trunc(nm, max); };
  const keys = [], heads = [];
  for (const t of TEST_ORDER) {
    const rs = fams.filter((r) => r.test === t);
    if (!rs.length) continue;
    // On tests 1 and 4 only class A and B evidence counts toward the rating; quantities and perceptions inform.
    // Two blocks keep a reader from taking an informing quantity for a price.
    const split = (t === 'price' || t === 'camels') && rs.some((r) => !r.votes) && rs.some((r) => r.votes);
    if (split) {
      heads.push({ key: `__${t}`, text: `${TEST_LABEL[t].toUpperCase()} · COUNTS` });
      keys.push(`__${t}`, ...rs.filter((r) => r.votes).map((r) => r.id));
      heads.push({ key: `__${t}_inform`, text: `${TEST_LABEL[t].toUpperCase()} · INFORMS ONLY` });
      keys.push(`__${t}_inform`, ...rs.filter((r) => !r.votes).map((r) => r.id));
    } else {
      heads.push({ key: `__${t}`, text: TEST_LABEL[t].toUpperCase() });
      keys.push(`__${t}`, ...rs.map((r) => r.id));
    }
  }
  if (!fams.length) {
    host.append(h('p', { class: 'ev-empty' }, `No indicator for this node has a value for ${ctx.countryName} in the window.`));
  } else {
    const lim = 3.2, cl = (x) => Math.max(-lim, Math.min(lim, x));
    const rows = fams.map((r) => ({ ...r, xc: cl(r.x), label: labelOf(r), stale: r.members.every(stale) }));
    // Margins fit the measured labels. Wide screens right-align the test headings to the axis; phones start them at the left edge.
    const headW = Math.max(0, ...heads.map((d) => textW(d.text, 10.5, 600, MONO)));
    const ml = Math.ceil(Math.max(Math.max(0, ...rows.map((r) => textW(r.label, 12))) + 14, narrow ? 0 : headW + 16));
    // The richest right-hand label that leaves a phone 120 px of strip: then the rank goes, then the data year.
    const sd = (r) => fmtSigned(r.x, 1);
    // The family's signal (−2 to +2, what enters the verdict) after the arrow, and whether it counts.
    const sig = (r) => (r.signal == null ? '' : ` → ${fmtSigned(r.signal, 1)}`);
    const variants = [
      (r) => `${sd(r)}${r.rank ? ` · ${ordinal(r.rank)} of ${r.of}` : ''}${sig(r)} (${r.votes ? 'counts' : 'informs'}) · ${r.year}`,
      (r) => `${sd(r)}${r.rank ? ` · ${r.rank}/${r.of}` : ''}${sig(r)} · ${r.year}`,
      (r) => `${sd(r)}${sig(r)}`,
      (r) => `${sd(r)} · ${r.year}`,
      sd,
    ].map((f) => ({ f, mr: Math.ceil(Math.max(...rows.map((r) => textW(f(r), 11.5))) + 14) }));
    // Every screen keeps a usable strip: 260 px from 640 px up, 120 px on phones.
    const { f: right, mr } = variants.find((v) => width - ml - v.mr >= (narrow ? 120 : 260)) || variants[variants.length - 1];
    const shortHead = narrow || width - ml - mr < 250; // the two direction labels need about 230 px side by side
    // The axis title centred under the strip where it fits, else ending at the strip's right edge; the short form where neither fits.
    const cx = (ml + width - mr) / 2, xFit = (s) => { const w = textW(s, 12) + 4; return w / 2 <= Math.min(cx, width - cx) ? 'center' : w <= width - mr ? 'right' : null; };
    const xLong = 'Standard deviations from what income and structure predict, binding side to the right →', xShort = 'sd from prediction, binding side right →';
    const xLabel = !narrow && xFit(xLong) ? xLong : xShort;
    const height = keys.length * 26 + 62;
    const sym = { A: 'circle', B: 'square', C: 'circle', D: 'diamond' };
    const filled = (r) => r.cls === 'A' || r.cls === 'B';
    // Class sets the fill (A and B filled, C and D hollow); a stale value keeps it, faded, inside a dashed outline.
    const dot = { x: 'xc', y: 'id', r: 5.5, symbol: (d) => sym[d.cls] || 'circle', fill: (d) => (filled(d) ? pal.text : pal.surface), stroke: pal.text, strokeWidth: 1.5 };
    const marks = [
      P.rect([0], { x1: 0, x2: lim, fill: pal.binding, fillOpacity: 0.06 }),
      P.ruleX([-1.5, -0.75, 0.75, 1.5], { stroke: pal.muted, strokeOpacity: 0.35, strokeDasharray: '2,3' }),
      P.ruleX([0], { stroke: pal.text, strokeOpacity: 0.6 }),
      P.ruleY(rows, { y: 'id', x1: 0, x2: 'xc', stroke: pal.muted, strokeOpacity: 0.45 }),
      P.dot(rows.filter((r) => !r.stale), dot),
      P.dot(rows.filter((r) => r.stale), { ...dot, fillOpacity: 0.3, strokeDasharray: '2.5,2' }),
      P.text(rows.filter((r) => Math.abs(r.x) > lim), { x: 'xc', y: 'id', text: (d) => (d.x > 0 ? '▶' : '◀'), fontSize: 9, fill: pal.text, dy: -10 }),
      P.text(heads, { x: -lim, y: 'key', text: 'text', textAnchor: narrow ? 'start' : 'end', dx: narrow ? 2 - ml : -12, fontSize: 10.5, fontWeight: 600, fill: pal.muted, fontFamily: MONO }),
      P.text(rows, { x: lim, y: 'id', text: right, textAnchor: 'start', dx: 10, fontSize: 11.5, fill: (d) => (d.stale ? pal.muted : pal.text) }),
      P.text([shortHead ? 'binding ▶' : '▲ toward binding'], { frameAnchor: 'top-right', dy: -14, dx: -4, textAnchor: 'end', fontSize: 11, fontWeight: 600, fill: pal.binding }),
      P.text([shortHead ? '◀ not' : '◀ away from binding'], { frameAnchor: 'top-left', dy: -14, dx: 4, textAnchor: 'start', fontSize: 11, fill: pal.muted }),
      P.tip(rows, P.pointerY({ x: 'xc', y: 'id', title: (d) => `${fullName(d)}\nClass ${d.cls}, ${TEST_LABEL[d.test]}\n${d.members.map((r) => `${d.members.length > 1 ? `${shortName(ind(r.id) || { name: r.id })}: ` : ''}${fmtSigned(r.x, 2)} sd on the binding side${ind(r.id) && ind(r.id).direction === -1 ? ' (lower is binding, so the sign flips)' : ''}, ${r.year}, ${sourceLabel(ind(r.id) || {})}`).join('\n')}${d.rank ? `\n${ordinal(d.rank)} most binding of ${d.of} with its comparators` : ''}${d.signal != null ? `\nSignal ${fmtSigned(d.signal, 1)} · ${d.votes ? 'counts in the rating' : 'informs, does not count'}` : ''}${d.stale ? `\nMore than ${limit} years before the ${snap} snapshot` : ''}\nClick to chart it below` })),
    ];
    const chart = P.plot({
      width, height, marginLeft: ml, marginRight: mr, marginTop: 30, marginBottom: 46,
      style: { background: 'transparent', color: pal.text, fontSize: '12px', fontFamily: SANS },
      x: { domain: [-lim, lim], ticks: [-3, -1.5, 0, 1.5, 3], tickFormat: (d) => (d === 0 ? '0' : fmtSigned(d, 1)), label: xLabel, labelAnchor: xFit(xLabel) || 'right', labelOffset: 40 },
      y: { domain: keys, tickFormat: (k) => (k.startsWith('__') ? '' : (rows.find((r) => r.id === k) || {}).label || k), tickSize: 0, label: null, padding: 0 },
      marks,
    });
    chart.setAttribute('aria-hidden', 'true');
    host.append(chart);
    // Click a row (or use its button in the keyboard toolbar) to chart that indicator below (C1 to C3).
    const byId = new Map(rows.map((r) => [r.id, r]));
    bindRowClick(host, chart, height, keys.filter((k) => !k.startsWith('__')), (k) => onPick(byId.get(k).members[0].id), {
      label: 'Chart an indicator below',
      nameOf: (k) => { const r = byId.get(k); return `${fullName(r)}: ${sd(r)} sd, ${r.year}${r.stale ? ` (more than ${limit} years old)` : ''}`; },
    });
  }
  // Below the strip: the stale key, then what has no dot (co-movement, missing data, tests not computed).
  const notes = h('div', { class: 'ev-strip-notes' });
  const old = m.rows.filter(stale);
  if (old.length) notes.append(h('p', {}, h('strong', {}, 'Dashed outlines: '), `${old.length === 1 ? 'one value dates' : `${old.length} values date`} from ${snap - limit - 1} or earlier, more than ${limit} years before the ${snap} snapshot.`));
  for (const c of m.comove) {
    const xi = ind(c.x), yi = ind(c.y);
    const what = `${yi ? shortName(yi).toLowerCase() : c.y} against ${xi ? shortName(xi).toLowerCase() : c.x}`;
    notes.append(h('p', {}, h('strong', {}, 'Test 2 · Changes: '), c.pairs > 0 && isNum(c.p_value)
      ? `${yi ? shortName(yi).toLowerCase() : c.y} moved ${c.expected_sign < 0 ? 'against' : 'with'} ${xi ? shortName(xi).toLowerCase() : c.x} in ${c.agree} of ${c.pairs} years (p = ${fmt(c.p_value, 2)}), ${c.direction}.`
      : `${what}: too few years with both series to test.`));
  }
  if (fams.length && !fams.some((r) => r.test === 'camels')) notes.append(h('p', {}, h('strong', {}, 'Test 4 · Camels and hippos: '), ['N0', 'N3', 'N4', 'N6'].includes(String(view || '').split('.')[0]) ? 'shown in the "4 · Camels and hippos" tab below, but not yet counted in the verdict: it has not yet passed its placebo check.' : 'not computed for this node: no industry intensity vector is connected for it yet (the prototype has finance, schooling and transport time).'));
  if (m.missing.length) {
    notes.append(h('p', {}, h('strong', {}, `No value in the window (${m.missing.length}): `),
      m.missing.map((x) => `${shortName(ind(x.id) || { name: x.id })}${x.lastYear ? ` (latest ${x.lastYear})` : ''}`).join('; '), '.'));
  }
  host.append(notes);

  // The readout counts families, as the verdict does, and names the strongest signals that count.
  const voting = fams.filter((r) => r.votes && r.signal != null);
  const nm = (r) => `${lowerFirst(shortName(ind(r.members[0].id) || { name: r.members[0].id }))} (${fmtSigned(r.signal, 1)})`;
  const top = (rs, s) => rs.filter((r) => s * r.signal > 0).sort((a, b) => s * (b.signal - a.signal) || s * (b.x - a.x)).slice(0, 4).map(nm).join(', ');
  const sn = (scorecard.nodes || []).find((x) => x.id === view);
  const T = (registry.params && registry.params.tiers) || {}, up = (T.candidate && T.candidate.N_min) ?? 0.5;
  const tw = top(voting, 1), aw = top(voting, -1);
  const text = fams.length
    ? `Of <strong>${fams.length}</strong> evidence families with data, <strong>${voting.length}</strong> count toward the rating; the rest inform it.${tw ? ` Strongest counting signals toward binding: ${tw}.` : ''}${aw ? ` Away: ${aw}.` : ''}${sn && isNum(sn.N) ? ` Node score <strong>${fmtSigned(sn.N, 2)}</strong>; “worth a closer look” needs ${fmtSigned(up, 2)}.` : ''}`
    : '';
  const famOf = new Map(fams.flatMap((f) => f.members.map((r) => [`${r.id}|${r.node}`, f])));
  const csv = ['indicator,name,node,test,class,family,family_signal,family_counts,distance_sd_binding_side,distance_sd_raw,rank_most_binding,of,year'];
  for (const r of m.rows) { const f = famOf.get(`${r.id}|${r.node}`) || {}; csv.push([r.id, `"${shortName(ind(r.id) || { name: r.id }).replace(/"/g, '""')}"`, r.node, r.test, r.cls, f.family ?? '', f.signal ?? '', f.votes ?? '', r.x, r.t, r.rank ?? '', r.of ?? '', r.year].join(',')); }
  for (const x of m.missing) csv.push([x.id, `"${shortName(ind(x.id) || { name: x.id }).replace(/"/g, '""')}"`, x.node, x.test, x.cls, '', '', 'no value in window', '', '', '', '', x.lastYear ?? ''].join(','));
  return { csv, text, rowsCount: fams.length, staleCount: old.length, limit };
}

// ---------- C4 growth record ----------
export function drawGrowth(host, ctx) {
  const { P, pal, gdp, growth, iso, peers, asOf, since, scorecard, width: w0, countryName } = ctx;
  host.replaceChildren();
  clearRowPicks(host);
  const width = Math.max(320, w0);
  const own = indexSeries(gdp, iso, since, asOf);
  if (own.length < 2) { host.append(h('p', { class: 'ev-empty' }, `${countryName} has no GDP per capita series since ${since}.`)); return { csv: null, text: '' }; }
  const base = own[0].year;
  const peerSeries = peers.filter((p) => p !== iso).map((p) => indexSeries(gdp, p, base, asOf).filter((r) => r.base === base).map((r) => ({ ...r, iso3: p }))).filter((s) => s.length).flat();
  const years = [...new Set(own.map((r) => r.year))];
  const band = years.map((y) => { const v = peerSeries.filter((r) => r.year === y).map((r) => r.value).sort((a, b) => a - b); if (v.length < 3) return null; const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))]; return { year: y, median: median(v), q1: q(0.25), q3: q(0.75), n: v.length }; }).filter(Boolean);
  const g = scorecard && scorecard.growth_problem;
  const peak = g && g.G3 && g.G3.peak_year >= base ? own.find((r) => r.year === g.G3.peak_year) : null;
  const brk = g && g.G4 && g.G4.reported && g.G4.break_year >= base ? g.G4 : null;
  const grow = (growth && growth.v[iso] ? growth.years.map((y, i) => ({ year: y, value: growth.v[iso][i] })) : []).filter((r) => r.year >= base && r.year <= asOf && isNum(r.value));
  // The axis ends at the last year with data, which gets its own tick, rather than running empty to the as-of year.
  const last = Math.max(own[own.length - 1].year, grow.length ? grow[grow.length - 1].year : base);
  const xDomain = [base, last];
  const plotW = width - 126, step = [1, 2, 5, 10, 20, 25, 50].find((s) => (last - base) / s <= Math.max(3, Math.floor(plotW / 50))) || 50;
  const ticks = [];
  for (let y = Math.ceil(base / step) * step; y < last; y += step) if (last - y >= step * 0.6) ticks.push(y);
  ticks.push(last);
  const style = { background: 'transparent', color: pal.text, fontSize: '12px', fontFamily: SANS };
  const ownUp = !band.length || own[own.length - 1].value >= band[band.length - 1].median;
  const h1 = Math.round(Math.min(360, Math.max(240, width * 0.32)));
  const top = P.plot({
    width, height: h1, marginLeft: 56, marginRight: 70, marginTop: 24, marginBottom: 24, style,
    x: { domain: xDomain, ticks, tickFormat: 'd', label: null, grid: true, axis: null },
    // Headroom keeps a label at the top of the series (the peak's, or an end label leaning up) clear of the axis title (on a phone the title spans the chart).
    y: { type: 'log', label: `↑ GDP per capita, constant US$ (${base} = 100, log scale)`, grid: true, insetTop: peak && peak.year !== own[own.length - 1].year ? 14 : 6 },
    marks: [
      P.areaY(band, { x: 'year', y1: 'q1', y2: 'q3', fill: pal.band, fillOpacity: 0.8 }),
      P.line(band, { x: 'year', y: 'median', stroke: pal.muted, strokeDasharray: '5,3', strokeWidth: 1.5 }),
      P.line(own, { x: 'year', y: 'value', stroke: pal.focus, strokeWidth: 3 }),
      // The two end labels lean apart (the upper one up), so they do not print over each other when the lines end close together.
      P.text(own.slice(-1), { x: 'year', y: 'value', text: () => iso, dx: 6, dy: ownUp ? -6 : 6, textAnchor: 'start', fontWeight: 600, fill: pal.focusInk }),
      P.text(band.slice(-1), { x: 'year', y: 'median', text: () => 'median', dx: 6, dy: ownUp ? 6 : -6, textAnchor: 'start', fontSize: 10.5, fill: pal.muted }),
      // At the latest year the peak needs no label (the reading says so), and it would sit on the economy's own label.
      ...(peak ? [P.dot([peak], { x: 'year', y: 'value', r: 5, fill: pal.surface, stroke: pal.focus, strokeWidth: 2 })] : []),
      ...(peak && peak.year !== own[own.length - 1].year ? [P.text([peak], { x: 'year', y: 'value', text: () => `peak ${peak.year}`, dy: -12, fontSize: 11, fill: pal.focusInk })] : []),
      ...(brk ? [P.ruleX([brk.break_year], { stroke: pal.text, strokeOpacity: 0.5, strokeDasharray: '4,3' })] : []),
      P.tip(own, P.pointerX({ x: 'year', y: 'value', title: (d) => `${countryName} ${d.year}\n${fmt(d.value, 0)} (${base} = 100)` })),
    ],
  });
  const peerGrow = years.map((y) => { const i = growth ? growth.years.indexOf(y) : -1; const v = peers.filter((p) => p !== iso).map((p) => (i >= 0 && growth.v[p] ? growth.v[p][i] : null)).filter(isNum); return v.length >= 3 ? { year: y, median: median(v) } : null; }).filter(Boolean);
  const h2 = Math.round(h1 * 0.62);
  const regimes = brk ? [{ x1: base, x2: brk.break_year, v: brk.mean_before }, { x1: brk.break_year, x2: last, v: brk.mean_after }] : [];
  // The engine's regime means are ink, not the comparators' navy, and solid, since the footer keys dashed lines to the comparator median.
  // Their label runs right of the break, else left of it (clear of the tick labels); where neither side has room (a mid-window break on
  // a phone) it drops "a year", and as a last resort it ends at the chart's right edge.
  const bx = brk ? 56 + ((brk.break_year - base) / Math.max(1, last - base)) * plotW : 0;
  const brkForms = brk ? [' a year', ''].map((s) => `break ${brk.break_year}: ${fmt(brk.mean_before, 1)}% → ${fmt(brk.mean_after, 1)}%${s}`) : [];
  const brkFit = (s) => { const w = textW(s, 11); return bx + 6 + w <= width - 4 ? 'right' : bx - 6 - w >= 50 ? 'left' : null; };
  const brkText = brkForms.find(brkFit) || brkForms[1] || '', brkSide = brk ? brkFit(brkText) || 'edge' : null;
  const bottom = P.plot({
    width, height: h2, marginLeft: 56, marginRight: 70, marginTop: 12, marginBottom: 30, style,
    x: { domain: xDomain, ticks, tickFormat: 'd', label: null, grid: true },
    // Headroom keeps the top tick label and the break label clear of the axis title (without it a tick at the top prints over the title).
    y: { label: '↑ Annual growth of GDP per capita (%)', grid: true, nice: true, insetTop: brk ? 16 : 12 },
    marks: [
      P.ruleY([0], { stroke: pal.text, strokeOpacity: 0.6 }),
      P.rectY(grow, { x1: (d) => d.year - 0.4, x2: (d) => d.year + 0.4, y: 'value', fill: pal.focus, fillOpacity: 0.85 }),
      P.line(peerGrow, { x: 'year', y: 'median', stroke: pal.muted, strokeDasharray: '5,3', strokeWidth: 1.3 }),
      ...regimes.map((r) => P.link([r], { x1: 'x1', x2: 'x2', y1: 'v', y2: 'v', stroke: pal.text, strokeWidth: 1.8 })),
      ...(brk ? [P.ruleX([brk.break_year], { stroke: pal.text, strokeOpacity: 0.5, strokeDasharray: '4,3' }), P.text([brk], brkSide === 'edge' ? { frameAnchor: 'top-right', text: () => brkText, dy: 4, dx: 66, textAnchor: 'end', fontSize: 11, fill: pal.text } : { x: 'break_year', frameAnchor: 'top', text: () => brkText, dy: 4, dx: brkSide === 'left' ? -6 : 6, textAnchor: brkSide === 'left' ? 'end' : 'start', fontSize: 11, fill: pal.text })] : []),
      P.tip(grow, P.pointerX({ x: 'year', y: 'value', title: (d) => `${countryName} ${d.year}\n${fmtSigned(d.value, 1)}%` })),
    ],
  });
  // One SVG for export: the two panels stacked.
  const NS = 'http://www.w3.org/2000/svg';
  const wrap = document.createElementNS(NS, 'svg');
  wrap.setAttribute('width', width); wrap.setAttribute('height', h1 + h2); wrap.setAttribute('viewBox', `0 0 ${width} ${h1 + h2}`);
  wrap.setAttribute('class', 'ev-stack'); wrap.style.fontFamily = 'Inter, system-ui, sans-serif';
  // Nested SVGs keep their own size (the page CSS gives chart SVGs height: auto).
  for (const [el, y, hh] of [[top, 0, h1], [bottom, h1, h2]]) { el.setAttribute('y', y); el.style.height = `${hh}px`; el.style.maxWidth = 'none'; }
  wrap.append(top, bottom);
  host.append(wrap);

  const G1 = g && g.G1, G3 = g && g.G3;
  const parts = [];
  if (G1 && isNum(G1.avg_10y)) parts.push(`GDP per capita grew <strong>${fmt(G1.avg_10y, 1)}% a year over ${G1.window_10y.join('–')}</strong>, against a median of ${fmt(G1.structural_median_10y, 1)}% for its structural comparators (${ordinal(G1.rank_in_structural)} of ${G1.structural_n}); over 20 years, ${fmt(G1.avg_20y, 1)}% against ${fmt(G1.structural_median_20y, 1)}%.`);
  if (G3) parts.push(G3.years_since_peak === 0 ? `It is at its peak (${G3.peak_year}).` : `It is ${fmt(G3.shortfall_pct, 0)}% below its ${G3.peak_year} peak.`);
  if (brk) parts.push(`The engine finds one break, in ${brk.break_year}: growth ${brk.change_pp < 0 ? 'slowed' : 'rose'} from ${fmt(brk.mean_before, 1)}% to ${fmt(brk.mean_after, 1)}% a year.`);
  else if (g && g.G4 && g.G4.reported && g.G4.break_year < base) parts.push(`The engine's break year, ${g.G4.break_year}, is before ${base}; show from 1960 to see it.`);
  const csv = ['iso3,year,gdp_per_capita_index,growth_pct,comparator_median_index,comparator_median_growth'];
  for (const y of years) { const a = own.find((r) => r.year === y), b = grow.find((r) => r.year === y), c = band.find((r) => r.year === y), d = peerGrow.find((r) => r.year === y); csv.push([iso, y, a ? a.value : '', b ? b.value : '', c ? c.median : '', d ? d.median : ''].join(',')); }
  return { csv, text: parts.join(' '), base };
}

// ---------- C7 firm obstacles ----------
/** "Percent of firms choosing tax rates as their biggest obstacle" → "Tax rates". */
export function obstacleName(name) {
  const m = String(name).match(/(?:choosing|identifying)\s+(?:an?\s+|the\s+)?(.*?)\s+as\s+(?:their|a)\s/i);
  const s = m ? m[1] : name;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function drawObstacles(host, ctx) {
  const { P, pal, panels, iso, peers, asOf, window: W, measure, registry, width: w0, countryName, onPick } = ctx;
  host.replaceChildren();
  clearRowPicks(host);
  const width = Math.max(320, w0);
  const rows = obstacleRows(panels, iso, peers, asOf, W).map((r) => ({ ...r, name: obstacleName(registry.indicatorById[r.id].name), node: (registry.indicatorById[r.id].nodes || [])[0] }));
  if (!rows.length) { host.append(h('p', { class: 'ev-empty' }, `${countryName} has no Enterprise Survey wave within ${W} years of ${asOf}.`)); return { csv: null, text: '' }; }
  const wave = rows[0].latest.year;
  const prevWave = rows.find((r) => r.prev) ? rows.find((r) => r.prev).prev.year : null;
  const narrow = width < 640;
  // A wave older than the staleness limit is drawn hollow, as C1 and C2 draw stale values.
  const limit = staleLimit(registry), stale = (d) => asOf - d.latest.year > limit, oldWave = asOf - wave > limit;
  const ml = narrow ? 130 : 230, mr = 44;
  // The key starts over the bars (at the left edge on a phone) and wraps onto a second line where it runs out of room.
  const lg = topLegend(P, [
    [oldWave ? `□ ${wave}, over ${limit} years before ${asOf}` : `■ ${wave}`, { fill: pal.focusInk, fontWeight: 600 }],
    ...(prevWave ? [['□ previous wave', { fill: pal.muted }]] : []),
    ['| comparator median', { fill: pal.peer, fontWeight: 600 }],
  ], { x: narrow ? 0 : ml, maxX: width - 4 });
  // The axis title gets a row of its own below the tick labels (as in C11), or on a phone it runs into them.
  const mt = 30 + (lg.lines - 1) * 15, mb = 42;
  const rowH = 30, height = rows.length * rowH - 10 + mt + mb;
  const xMax = Math.max(10, ...rows.map((r) => Math.max(r.latest.value, r.prev ? r.prev.value : 0, r.peerMedian || 0))) * 1.12;
  // The axis title ends at the right edge of the bars; phones get the short form.
  const xLong = `Share of firms (%) · ${measure === 'TOP' ? 'naming it their biggest obstacle' : 'calling it a major or very severe constraint'} →`;
  const xLabel = textW(xLong, 12) <= width - mr - 4 ? xLong : measure === 'TOP' ? '% of firms naming it their biggest obstacle →' : '% of firms: a major or very severe constraint →';
  const chart = P.plot({
    width, height, marginLeft: ml, marginRight: mr, marginTop: mt, marginBottom: mb,
    style: { background: 'transparent', color: pal.text, fontSize: '12px', fontFamily: SANS },
    x: { domain: [0, xMax], label: xLabel, grid: true, labelOffset: 36 },
    y: { domain: rows.map((r) => r.id), tickFormat: (k) => trunc((rows.find((r) => r.id === k) || {}).name || k, narrow ? 18 : 34), tickSize: 0, label: null, padding: 0 },
    marks: [
      P.barX(rows, { y: 'id', x: (d) => d.latest.value, fill: (d) => (stale(d) ? 'none' : pal.focus), stroke: (d) => (stale(d) ? pal.focus : 'none'), strokeWidth: 1.5, insetTop: 4, insetBottom: 13 }),
      P.barX(rows.filter((r) => r.prev), { y: 'id', x: (d) => d.prev.value, fill: pal.surface, stroke: pal.muted, strokeWidth: 1, strokeDasharray: '3,2', insetTop: 18, insetBottom: 3 }),
      P.tickX(rows.filter((r) => isNum(r.peerMedian)), { y: 'id', x: 'peerMedian', stroke: pal.peer, strokeWidth: 3, insetTop: 1, insetBottom: 1 }),
      // A row whose latest wave is not the one in the key carries its own year.
      P.text(rows, { y: 'id', x: (d) => d.latest.value, text: (d) => `${fmt(d.latest.value, d.latest.value < 10 ? 1 : 0)}%${d.latest.year !== wave ? ` (${d.latest.year})` : ''}`, dx: 5, dy: -5, textAnchor: 'start', fontSize: 11, fontWeight: 600, fill: pal.focusInk }),
      ...lg.marks(ml, mt),
      P.tip(rows, P.pointerY({ y: 'id', x: (d) => d.latest.value, title: (d) => `${d.name} (${d.node})\n${countryName} ${d.latest.year}${stale(d) ? `, more than ${limit} years before ${asOf}` : ''}: ${fmt(d.latest.value, 1)}%${d.prev ? `\n${d.prev.year}: ${fmt(d.prev.value, 1)}%` : ''}${isNum(d.peerMedian) ? `\nComparator median: ${fmt(d.peerMedian, 1)}% (${d.peersWithData} with a wave)` : `\nToo few comparators with a wave (${d.peersWithData})`}\nClick to chart it below` })),
    ],
  });
  chart.setAttribute('aria-hidden', 'true');
  host.append(chart);
  bindRowClick(host, chart, height, rows.map((r) => r.id), onPick, {
    label: 'Chart an obstacle below',
    nameOf: (k) => { const r = rows.find((x) => x.id === k); return `${r.name}: ${fmt(r.latest.value, 1)}% in ${r.latest.year}${isNum(r.peerMedian) ? `, comparator median ${fmt(r.peerMedian, 1)}%` : ''}`; },
  });
  const top3 = rows.slice(0, 3).map((r) => `${r.name.toLowerCase()} (${fmt(r.latest.value, 0)}%)`);
  const above = rows.filter((r) => isNum(r.peerMedian)).map((r) => ({ ...r, gap: r.latest.value - r.peerMedian })).filter((r) => r.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 2);
  const text = `In ${wave}${oldWave ? ` (the latest wave, ${asOf - wave} years before ${asOf})` : ''}, firms in ${countryName} most often ${measure === 'TOP' ? 'named' : 'called'} ${list(top3)} ${measure === 'TOP' ? 'as their biggest obstacle' : 'a major or very severe constraint'}.${above.length ? ` Furthest above its comparators: ${above.map((r) => `${r.name.toLowerCase()} (${fmt(r.gap, 0)} points above a median of ${fmt(r.peerMedian, 0)}%)`).join(' and ')}.` : ''}`;
  const csv = ['indicator,obstacle,node,latest_year,latest_pct,previous_year,previous_pct,comparator_median_pct,comparators_with_wave'];
  for (const r of rows) csv.push([r.id, `"${r.name}"`, r.node, r.latest.year, r.latest.value, r.prev ? r.prev.year : '', r.prev ? r.prev.value : '', r.peerMedian ?? '', r.peersWithData].join(','));
  // oldWave: the key's wave is past the staleness limit, so its bars are hollow (a footer that says "filled bars" should say so).
  return { csv, text, wave, prevWave, ids: rows.map((r) => r.id), oldWave, limit };
}

// ---------- C11 composition ----------
const SECTOR_LABEL = { agri: 'Agriculture', industry: 'Industry', manufacturing: 'of which manufacturing', services: 'Services' };
/** "Flowers; cut flowers and flower buds of a kind..." → "Flowers". */
const productName = (p) => (p.name ? p.name.split(/[;,(]/)[0].trim() : `HS ${p.code}`);

/** Export shares by product group against the comparators, then sector shares of value added and jobs over time. */
export function drawComposition(host, ctx) {
  const { P, pal, asOf, width: w0, countryName, comp, peerComps } = ctx;
  host.replaceChildren();
  clearRowPicks(host);
  const width = Math.max(320, w0);
  const narrow = width < 640;
  const style = (size = '12px') => ({ background: 'transparent', color: pal.text, fontSize: size, fontFamily: SANS });
  const ex = comp && exportShares(comp.exports, asOf);
  const panels = [], csv = [], text = [];
  let y0 = 0;
  if (ex) {
    // Comparator median share of each group, in each comparator's latest year up to the as-of year.
    const pe = peerComps.map((c) => exportShares(c.exports, asOf)).filter(Boolean);
    const med = (id) => { const v = pe.map((e) => e.rows.find((r) => r.id === id).share); return v.length >= 3 ? median(v) : null; };
    const rows = ex.rows.map((r) => ({ ...r, peerMedian: med(r.id) }));
    const ml = narrow ? 150 : 210;
    // The key starts over the bars (at the left edge on a phone) and wraps onto a second line where it runs out of room.
    const lg = topLegend(P, [
      [`■ ${ex.year}`, { fill: pal.focusInk, fontWeight: 600 }],
      ...(ex.prevYear ? [[`□ ${ex.prevYear}`, { fill: pal.muted }]] : []),
      ['| comparator median', { fill: pal.peer, fontWeight: 600 }],
    ], { x: narrow ? 0 : ml, maxX: width - 4, y: 10 });
    const mt = 34 + (lg.lines - 1) * 15;
    const hh = rows.length * 28 + 42 + mt;
    const xMax = Math.max(10, ...rows.map((r) => Math.max(r.share, r.prev || 0, r.peerMedian || 0))) * 1.1;
    const bars = P.plot({
      width, height: hh, marginLeft: ml, marginRight: 40, marginTop: mt, marginBottom: 42, style: style(),
      x: { domain: [0, xMax], label: 'Share of goods exports (%) →', grid: true, labelOffset: 36 },
      y: { domain: rows.map((r) => r.id), tickFormat: (k) => trunc(rows.find((r) => r.id === k).name, narrow ? 20 : 32), tickSize: 0, label: null, padding: 0 },
      marks: [
        P.barX(rows, { y: 'id', x: 'share', fill: pal.focus, insetTop: 4, insetBottom: 12 }),
        P.barX(rows.filter((r) => isNum(r.prev)), { y: 'id', x: 'prev', fill: pal.surface, stroke: pal.muted, strokeWidth: 1, strokeDasharray: '3,2', insetTop: 17, insetBottom: 3 }),
        P.tickX(rows.filter((r) => isNum(r.peerMedian)), { y: 'id', x: 'peerMedian', stroke: pal.peer, strokeWidth: 3, insetTop: 1, insetBottom: 1 }),
        P.text(rows, { y: 'id', x: 'share', text: (d) => `${fmt(d.share, d.share < 10 ? 1 : 0)}%`, dx: 5, dy: -5, textAnchor: 'start', fontSize: 11, fontWeight: 600, fill: pal.focusInk }),
        ...lg.marks(ml, mt),
        P.tip(rows, P.pointerY({ y: 'id', x: 'share', title: (d) => `${d.name}\n${countryName} ${ex.year}: ${fmt(d.share, 1)}%${isNum(d.prev) ? `\n${ex.prevYear}: ${fmt(d.prev, 1)}%` : ''}${isNum(d.peerMedian) ? `\nComparator median: ${fmt(d.peerMedian, 1)}%` : ''}` })),
      ],
    });
    panels.push([bars, 0, 0, hh]);
    y0 = hh + 18;
    const top = rows[0], diff = isNum(top.prev) ? top.share - top.prev : null;
    text.push(`In ${ex.year}, <strong>${top.name.toLowerCase()} made up ${fmt(top.share, 0)}% of ${countryName}'s goods exports</strong>${isNum(top.peerMedian) ? ` (comparator median ${fmt(top.peerMedian, 0)}%)` : ''}${diff !== null && Math.abs(diff) >= 1 ? `, ${diff > 0 ? 'up' : 'down'} from ${fmt(top.prev, 0)}% in ${ex.prevYear}` : ''}. Goods exports totalled $${fmt(ex.total / 1e9, 1)} billion.`);
    csv.push('product_group,share_pct,year,share_pct_earlier,earlier_year,comparator_median_pct');
    for (const r of rows) csv.push([`"${r.name}"`, r.share, ex.year, r.prev ?? '', ex.prevYear ?? '', r.peerMedian ?? ''].join(','));
  }
  if (comp && comp.top && comp.top.products.length) {
    const t = comp.top;
    text.push(`The largest products: ${t.products.slice(0, 3).map((p) => `${productName(p).toLowerCase()} (${fmt(p.share, 0)}%)`).join(', ')}.`);
    csv.push('', 'hs4,product,share_pct,usd,year');
    for (const p of t.products) csv.push([p.code, `"${productName(p)}"`, p.share, p.usd, t.year].join(','));
  }
  // Sector shares over time: value added and employment, one small panel per sector.
  const S = (comp && comp.sectors) || {};
  const from = Math.max(1991, asOf - 34);
  const pts = (key, who = S) => (who[key] || []).filter(([y]) => y >= from && y <= asOf).map(([year, value]) => ({ year, value }));
  const sectors = ['agri', 'industry', 'manufacturing', 'services'].filter((k) => pts(`va.${k}`).length || pts(`emp.${k}`).length);
  if (sectors.length) {
    const cols = narrow ? 2 : 4, cw = Math.floor((width - (cols - 1) * 14) / cols), ch = 190;
    const peerMed = (key) => {
      const by = new Map();
      for (const c of peerComps) for (const p of pts(key, c.sectors || {})) { if (!by.has(p.year)) by.set(p.year, []); by.get(p.year).push(p.value); }
      return [...by].filter(([, v]) => v.length >= 3).map(([year, v]) => ({ year, value: median(v) })).sort((a, b) => a.year - b.year);
    };
    const yMax = Math.max(20, ...sectors.flatMap((k) => [...pts(`va.${k}`), ...pts(`emp.${k}`)].map((p) => p.value))) * 1.08;
    // All three entries on every screen (phones wrap the comparator line onto a second row), so the dashed navy line is always keyed.
    const lg = topLegend(P, [
      ['— value added (% of GDP)', { fill: pal.focusInk, fontWeight: 600 }],
      ['··· employment (% of jobs)', { fill: pal.focusInk }],
      ['- - comparator median, value added', { fill: pal.peer }],
    ], { x: 2, maxX: width - 4, y: 11, gap: 24 });
    const lgH = 22 + (lg.lines - 1) * 15;
    const legend = P.plot({ width, height: lgH, margin: 0, style: style('11px'), x: { axis: null, domain: [0, 1] }, y: { axis: null, domain: [0, 1] }, marks: lg.marks(0, 0) });
    panels.push([legend, 0, y0, lgH]);
    y0 += lgH - 22;
    sectors.forEach((k, i) => {
      const va = pts(`va.${k}`), em = pts(`emp.${k}`), pm = peerMed(`va.${k}`);
      const pl = P.plot({
        width: cw, height: ch, marginLeft: 34, marginRight: 10, marginTop: 26, marginBottom: 26, style: style('11px'),
        x: { domain: [from, asOf], tickFormat: 'd', ticks: 3, label: null }, y: { domain: [0, yMax], ticks: 4, grid: true, label: null },
        marks: [
          P.line(pm, { x: 'year', y: 'value', stroke: pal.peer, strokeWidth: 1.2, strokeDasharray: '4,3' }),
          P.line(em, { x: 'year', y: 'value', stroke: pal.focusInk, strokeWidth: 1.8, strokeDasharray: '1.5,2.5' }),
          P.line(va, { x: 'year', y: 'value', stroke: pal.focus, strokeWidth: 2.4 }),
          P.text([SECTOR_LABEL[k]], { frameAnchor: 'top-left', dy: -20, dx: -30, fontSize: 12, fontWeight: 600, fill: pal.text }),
          P.tip(va, P.pointerX({ x: 'year', y: 'value', title: (d) => { const e = em.find((x) => x.year === d.year); return `${SECTOR_LABEL[k]} ${d.year}\nValue added: ${fmt(d.value, 1)}% of GDP${e ? `\nEmployment: ${fmt(e.value, 1)}% of jobs` : ''}`; } })),
        ],
      });
      panels.push([pl, (i % cols) * (cw + 14), y0 + 24 + Math.floor(i / cols) * (ch + 8), ch]);
    });
    y0 += 24 + Math.ceil(sectors.length / cols) * (ch + 8);
    const last = (key) => { const p = pts(key); return p.length ? p[p.length - 1] : null; };
    const va = (k) => last(`va.${k}`), em = (k) => last(`emp.${k}`);
    const have = [['agri', 'agriculture'], ['industry', 'industry'], ['services', 'services']].filter(([k]) => va(k));
    if (have.length) text.push(`Value added in ${va(have[0][0]).year}: ${have.map(([k, n]) => `${n} ${fmt(va(k).value, 0)}%`).join(', ')} of GDP${va('manufacturing') ? ` (manufacturing, part of industry, ${fmt(va('manufacturing').value, 0)}%)` : ''}.`);
    if (em('agri')) text.push(`${fmt(em('agri').value, 0)}% of jobs were in agriculture in ${em('agri').year}.`);
    csv.push('', 'series,year,value_pct');
    for (const k of Object.keys(S)) for (const [y, v] of S[k]) csv.push([k, y, v].join(','));
  }
  if (!panels.length) { host.append(h('p', { class: 'ev-empty' }, `No export or sector data for ${countryName}.`)); return { csv: null, text: '' }; }
  const NS = 'http://www.w3.org/2000/svg';
  const wrap = document.createElementNS(NS, 'svg');
  wrap.setAttribute('width', width); wrap.setAttribute('height', y0); wrap.setAttribute('viewBox', `0 0 ${width} ${y0}`);
  wrap.setAttribute('class', 'ev-stack'); wrap.style.fontFamily = 'Inter, system-ui, sans-serif';
  for (const [el, x, y, hh] of panels) { el.setAttribute('x', x); el.setAttribute('y', y); el.style.height = `${hh}px`; el.style.maxWidth = 'none'; wrap.append(el); }
  host.append(wrap);
  if (comp && comp.top && comp.top.products.length) {
    const t = comp.top;
    host.append(h('details', { class: 'ev-strip-notes ev-top-products' }, h('summary', {}, `The ten largest export products, ${t.year}`),
      h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'HS4'), h('th', {}, 'Product'), h('th', { class: 'num' }, 'Share of goods exports'))),
        h('tbody', {}, ...t.products.map((p) => h('tr', {}, h('td', {}, p.code), h('td', {}, productName(p)), h('td', { class: 'num' }, `${fmt(p.share, 1)}%`)))))));
  }
  return { csv, text: text.join(' ') };
}

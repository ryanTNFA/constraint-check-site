// The self-discovery page's product-space views (docs/self-discovery-plan.md, section 4): the signature cards, the
// product space map, the jumps taken, the discovery gap, where new products could come from, and survival. The data
// come from ingest/productspace.py (desk/geo/productspace.json shared by every economy; desk/data/productspace/<ISO>.json,
// summary.json and meta.json). Every chart is inline SVG in the TNFA system (ink and amber, square corners), has a
// sentence under it in plain words and a table behind "Show the numbers". Nothing is ranked.
import { getJSON, h, dataBase } from './common.mjs';

const DATA = dataBase();
const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const s = (tag, attrs = {}, ...children) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, v);
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};
const INK = 'var(--text)', AMBER = 'var(--brand-amber)', PEER = 'var(--chart-peer)', OTHER = '#d8d3ca', OFF = '#e9e5dd', MUTED = 'var(--muted)';
const pct = (x, d = 0) => `${(100 * x).toFixed(d)}%`;
const yrs = (w) => `${w[0]}–${String(w[1]).slice(2)}`;
const median = (a) => { const v = a.filter((x) => x != null && Number.isFinite(x)).sort((p, q) => p - q); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
const OTHERS = ['N4', 'N5', 'N6', 'N7', 'N8', 'N10', 'N11'];
let cache = null;

// The Growth Lab's product sections, as CSS tokens (desk.css, --sector-*). Products the classification does not list read 'Other'.
const sectorVar = (sec) => `var(--sector-${String(sec && sec.short ? sec.short : 'other').toLowerCase().replace(/[^a-z]/g, '')}, var(--sector-other))`;
const sectorOf = (geo, i) => (geo.sections && geo.section ? geo.sections[geo.section[i]] : null);
const sectorName = (geo, i) => { const sec = sectorOf(geo, i); return sec ? sec.short : 'Other'; };
/** A legend of the sections present in `indices` (all products when omitted), as swatches with the short names. */
function sectorLegend(hostId, geo, indices) {
  const host = $(hostId); if (!host) return;
  host.replaceChildren();
  if (!geo.sections) return;
  const counts = new Map();
  for (const i of indices || geo.products.map((_, k) => k)) counts.set(geo.section[i], (counts.get(geo.section[i]) || 0) + 1);
  const items = geo.sections.map((sec, k) => [sec, counts.get(k) || 0]).filter(([, n]) => n > 0);
  host.append(...items.map(([sec]) => h('span', { style: `--swatch:${sectorVar(sec)}`, title: sec.name }, sec.short)));
}
const sectorCell = (geo, i) => h('span', {}, h('span', { class: 'sd-dot', style: `--swatch:${sectorVar(sectorOf(geo, i))}`, 'aria-hidden': 'true' }), sectorName(geo, i));

/** A tooltip inside a chart box: call show(x, y, html) with coordinates relative to the box. */
function tooltip(box) {
  let tip = box.querySelector('.sd-tip');
  if (!tip) { tip = h('div', { class: 'sd-tip', role: 'status' }); box.append(tip); }
  return {
    show(ev, html) {
      const r = box.getBoundingClientRect();
      tip.innerHTML = html;
      box.classList.add('has-tip');
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      tip.style.left = `${Math.min(x + 12, r.width - 270)}px`;
      tip.style.top = `${Math.max(0, y - 36)}px`;
    },
    hide() { box.classList.remove('has-tip'); },
  };
}

const table = (head, rows) => h('div', { class: 'table-wrap' }, h('table', { class: 'data sd-elim' },
  h('thead', {}, h('tr', {}, head.map((t) => h('th', {}, t)))),
  h('tbody', {}, rows.map((r) => h('tr', {}, r.map((v) => h('td', {}, v)))))));

/** Keep text labels from sitting on each other: sort by y and push each one down to at least `gap` below the last. */
function nudge(labels, gap = 12) {
  const sorted = labels.slice().sort((a, b) => a.y - b.y);
  let last = -Infinity;
  for (const l of sorted) { if (l.y < last + gap) l.y = last + gap; last = l.y; l.el.setAttribute('y', l.y); }
}

export async function renderSpace(state) {
  const { sc, nearby, registry } = state;
  const iso = sc.country.iso3, c = sc.country.name;
  if (!cache) {
    cache = await Promise.all([
      getJSON('/constraint-check-site/desk/geo/productspace.json', { optional: true }),
      getJSON(`${DATA}/productspace/${iso}.json`, { optional: true }),
      getJSON(`${DATA}/productspace/summary.json`, { optional: true }),
      getJSON(`${DATA}/productspace/meta.json`, { optional: true }),
      getJSON(`${DATA}/index.json`, { optional: true }),
    ]);
  }
  const [geo, ps, summary, meta, index] = cache;
  const hosts = ['sd-cards', 'sd-map', 'sd-jumps', 'sd-gap', 'sd-frontier', 'sd-survival'];
  if (!geo || !ps || !summary || !meta) {
    for (const id of hosts) $(id).replaceChildren(h('p', { class: 'note', style: 'margin:12px' }, `No trade data for ${c}, so this view is empty.`));
    for (const id of ['sd-signature', 'sd-map-text', 'sd-jumps-text', 'sd-gap-text', 'sd-frontier-text', 'sd-survival-text']) $(id).textContent = '';
    return;
  }
  const names = Object.fromEntries(((index && index.countries) || []).map((x) => [x.iso3, x.name]));
  const nameOf = (i) => names[i] || i;
  const peers = ((sc.comparators && sc.comparators.structural && sc.comparators.structural.members) || []).filter((p) => summary[p]);
  const ctx = { iso, c, geo, ps, summary, meta, nearby, peers, nameOf, sc, registry };
  const cards = renderCards(ctx);
  renderMap(ctx);
  renderJumps(ctx);
  renderGap(ctx);
  renderFrontier(ctx);
  renderSurvival(ctx);
  renderMethod(ctx, cards);
}

// ---------------------------------------------------------------- the signature cards
function readings(ctx) {
  const { ps, summary, peers } = ctx;
  const peerMed = (k) => median(peers.map((p) => summary[p][k]));
  const allMed = (k) => median(Object.values(summary).map((v) => v[k]));
  const g = ps.gap, j = ps.jumps, sv = ps.survival, mg = ps.margin;
  // H1: fewer new products than the position predicts (the discovery gap, window B)
  const h1 = !g ? 'none' : g.z <= -1 ? 'toward' : g.z >= 1 ? 'away' : 'neither';
  // H2: the entries were long jumps (fewer than half from the nearest quarter of the options)
  const h2 = !j || j.n_entries < 3 || j.share_from_top_quartile == null ? 'none' : j.share_from_top_quartile < 0.5 ? 'toward' : 'away';
  // H3: entries do not last (survival below the comparison countries, or below all economies when they have none)
  const svRef = peerMed('survival') != null ? peerMed('survival') : allMed('survival');
  const h3 = !sv || svRef == null ? 'none' : sv.rate < svRef - 0.1 ? 'toward' : sv.rate >= svRef ? 'away' : 'neither';
  // H4: incumbents healthy (excess growth not below the comparison countries)
  const mgRef = peerMed('excess_growth') != null ? peerMed('excess_growth') : allMed('excess_growth');
  const h4 = !mg || mgRef == null ? 'none' : mg.excess >= mgRef ? 'toward' : mg.excess < mgRef - 0.03 ? 'away' : 'neither';
  return { h1, h2, h3, h4, svRef, mgRef, peerSurv: peerMed('survival'), allSurv: allMed('survival'), peerGrow: peerMed('excess_growth'), allGrow: allMed('excess_growth'), peerEntryD: peerMed('entry_density') };
}

function renderCards(ctx) {
  const { ps, c, sc, peers, nameOf } = ctx;
  const r = readings(ctx);
  const g = ps.gap, j = ps.jumps, sv = ps.survival, mg = ps.margin;
  const pctRef = (v) => (v == null ? '' : pct(v));
  const cardDefs = [
    { id: 'H1', title: 'Information spillover', predict: 'The first firm to try pays; copiers gain. Prediction: fewer new products than the country’s position predicts, while existing exports grow normally.',
      here: g ? `${g.actual} new competitive exports in ${yrs(g.window[0])} to ${yrs(g.window[1])} against ${g.expected} expected (gap ${g.z > 0 ? '+' : ''}${g.z}).` : `Too few candidate products in ${c} for a gap.`, way: r.h1 },
    { id: 'H2', title: 'Distance and coordination', predict: 'The jumps are too long for any single firm. Prediction: few products nearby, and the entries that happen are long jumps.',
      here: j && j.n_entries >= 3 ? `${pct(j.share_from_top_quartile)} of ${c}’s ${j.n_entries} new exports came from the nearest quarter of its options: ${j.share_from_top_quartile >= 0.5 ? 'short jumps' : 'long jumps'}.` : `Fewer than three new exports, too few to read.`, way: r.h2 },
    { id: 'H3', title: 'Tries fail for another reason', predict: 'A different constraint binds. Prediction: entries happen but do not survive or grow.',
      here: sv ? `${sv.alive} of the ${sv.entrants} products ${c} started exporting in ${yrs(sv.windows[1])} were still exported competitively in ${yrs(sv.windows[2])} (${pct(sv.rate)}${r.svRef != null ? `, against ${pctRef(r.svRef)} for ${r.peerSurv != null ? 'its comparison countries' : 'economies generally'}` : ''}).` : `Fewer than five entries in ${sv ? yrs(sv.windows[1]) : '2012–14'}, too few for a survival rate.`, way: r.h3 },
    { id: 'H4', title: 'Incumbents are healthy', predict: 'The condition the spillover story needs. Prediction: established exports grow at least as fast as the comparison countries’.',
      here: mg ? `${c}’s established exports grew ${mg.excess >= 0 ? '+' : ''}${(100 * mg.excess).toFixed(1)} points a year beyond the same products’ world growth${r.mgRef != null ? ` (comparison countries: ${r.mgRef >= 0 ? '+' : ''}${(100 * r.mgRef).toFixed(1)})` : ''}.` : `Too few established exports for a growth rate.`, way: r.h4 },
  ];
  const wayLabel = { toward: 'points toward it', away: 'points away', neither: 'points neither way', none: 'cannot tell' };
  $('sd-cards').replaceChildren(...cardDefs.map((d) => h('div', { class: 'sd-card' },
    h('h3', {}, `${d.id}. ${d.title}`), h('p', { class: 'sd-predict' }, d.predict), h('p', { class: 'sd-here' }, d.here),
    h('span', { class: `sd-arrow ${d.way}` }, wayLabel[d.way]))));

  // the signature (plan 3.2): S = gap <= -1, incumbents not unhealthy, survival not below peers. Until rubric 0.2.7 it also needed
  // E (soft): no other low-return area flagged and the first split not reading finance; since 0.2.8 those are said beside it, not
  // required (Hausmann, Rodrik and Velasco put self-discovery beside the other causes, not after them). A reading, not the rating.
  const sHolds = r.h1 === 'toward' && r.h4 !== 'away' && r.h3 !== 'toward';
  const flagged = OTHERS.map((id) => sc.nodes.find((n) => n.id === id)).filter((n) => n && (n.tier === 'candidate' || n.tier === 'likely_binding'));
  const financeFirst = sc.top_split && typeof sc.top_split.row === 'string' && sc.top_split.row.startsWith('finance');
  let text;
  if (!g) text = `${c} has too few candidate products for the discovery gap, so the signature cannot be read.`;
  else if (sHolds && !flagged.length && !financeFirst) text = `The signature holds in ${c}: fewer new products than its position predicts, while its established exports and its past entries hold up, and no other cause of low returns is flagged.`;
  else if (sHolds) text = `The signature holds in ${c}: fewer new products than its position predicts while established exports and past entries hold up. But ${financeFirst ? 'the first statistics point to finance' : `${flagged.map((n) => (ctx.registry && ctx.registry.nodeById && ctx.registry.nodeById[n.id] ? ctx.registry.nodeById[n.id].short : n.id)).join(' and ')} ${flagged.length === 1 ? 'is' : 'are'} flagged`}, as well, so a self-discovery problem here would sit beside ${financeFirst || flagged.length === 1 ? 'it' : 'them'}, not instead.`;
  else if (r.h1 === 'away' && r.h3 !== 'toward') text = `The signature points away in ${c}: more new products than its position predicts, and they last. Whatever holds investment back, it does not look like under-rewarded discovery.`;
  else {
    const why = [];
    if (r.h1 === 'neither') why.push('new products arrive at about the rate its position predicts');
    if (r.h1 === 'away') why.push('more new products arrive than its position predicts');
    if (r.h3 === 'toward') why.push('its past entries lasted less well than its comparison countries’, which points to some other constraint');
    if (r.h4 === 'away') why.push('its established exports grew less than its comparison countries’, so the incumbents are not the healthy base the story needs');
    if (r.h1 === 'none') why.push('the gap cannot be computed');
    text = `The signature does not hold in ${c}: ${why.join('; ')}. The measures above still inform the rating, but they do not point to self-discovery on their own.`;
  }
  $('sd-signature').textContent = text;
  return r;
}

// ---------------------------------------------------------------- the product space map
function renderMap(ctx) {
  const { geo, ps, nearby, c } = ctx;
  const host = $('sd-map'); host.replaceChildren();
  const n = geo.products.length;
  const idx = Object.fromEntries(geo.products.map((p, i) => [p, i]));
  const nearSet = new Set([...(nearby && nearby.pass ? nearby.products : []), ...(nearby && nearby.pass ? nearby.step_up : [])].map((p) => idx[p.hs4]).filter((i) => i != null));
  const entered = new Map(ps.entered.map(([i, d]) => [i, d]));
  const sets = { base: new Set(ps.exported_base), now: new Set(ps.exported_now) };
  let period = 'now';
  const svg = s('svg', { viewBox: '0 0 1000 1000', role: 'img', 'aria-label': `The product space, with the products ${c} exports competitively filled` });
  const edges = s('g', { stroke: 'var(--rule)', 'stroke-width': 0.7, fill: 'none' });
  for (const [i, j] of geo.edges) edges.append(s('line', { x1: geo.x[i], y1: geo.y[i], x2: geo.x[j], y2: geo.y[j] }));
  svg.append(edges);
  const radius = (t) => Math.max(2.4, Math.min(7, 1.8 + Math.sqrt(Math.max(t, 0)) / 70));
  const nodes = s('g');
  const circles = [];
  for (let i = 0; i < n; i++) {
    const el = s('circle', { cx: geo.x[i], cy: geo.y[i], r: radius(geo.trade[i]), 'data-i': i });
    circles.push(el); nodes.append(el);
  }
  svg.append(nodes);
  // the sections, named where their products sit (the median position; pale fills, so the labels read over them)
  const labels = s('g');
  if (geo.sections) {
    const secLabs = [];
    geo.sections.forEach((sec, k) => {
      const xs = [], ys = [];
      for (let i = 0; i < n; i++) if (geo.section[i] === k) { xs.push(geo.x[i]); ys.push(geo.y[i]); }
      if (xs.length < 5) return;
      const el = s('text', { x: median(xs), y: median(ys) + 5, 'text-anchor': 'middle', class: 'sec-lab' }, sec.short);
      secLabs.push({ el, y: median(ys) + 5 }); labels.append(el);
    });
    nudge(secLabs, 18);
  }
  svg.append(labels);
  const colour = (i) => sectorVar(sectorOf(geo, i));
  const paint = () => {
    const on = sets[period];
    for (let i = 0; i < n; i++) {
      const el = circles[i];
      const isOn = on.has(i), isNew = period === 'now' && entered.has(i), isNear = nearSet.has(i) && !isOn;
      el.setAttribute('fill', isNear ? '#fff' : colour(i));
      el.setAttribute('fill-opacity', isOn || isNear ? 1 : 0.22);
      el.setAttribute('stroke', isNew ? AMBER : isNear ? colour(i) : isOn ? '#fff' : 'none');
      el.setAttribute('stroke-width', isNew ? 2.4 : isNear ? 1.8 : 0.6);
      if (isOn || isNew || isNear) nodes.append(el);   // draw on top of the pale ones
    }
    $('sd-map-text').textContent = period === 'now'
      ? `In ${yrs(geo.meta.period)} ${c} exported ${sets.now.size} of ${n} products competitively (${sets.base.size} in ${yrs(ps.gap ? ps.gap.window[0] : [2017, 2019])}), shown in full colour; the ${entered.size} it has added since then are ringed in amber${nearSet.size ? `, and its ${nearSet.size} nearest products are outlined` : ''}. Products that share know-how sit close together, so the coloured area is the country’s reach, not its size.`
      : `In 2017–19 ${c} exported ${sets.base.size} of ${n} products competitively, shown in full colour. Switch to 2022–24 to see what it has added since.`;
  };
  const btn = (key, label) => h('button', { type: 'button', 'aria-pressed': String(period === key), onclick: () => { period = key; for (const b of $('sd-map-toggle').children) b.setAttribute('aria-pressed', String(b.dataset.key === key)); paint(); }, dataset: { key } }, label);
  $('sd-map-toggle').replaceChildren(btn('base', '2017–19'), btn('now', '2022–24'));
  $('sd-map-legend').replaceChildren(h('span', { class: 'l-on' }, 'full colour: exported competitively'), h('span', { class: 'l-new' }, 'new since 2017–19'), h('span', { class: 'l-near' }, 'nearest, not yet made'), h('span', { class: 'l-pale' }, 'pale: other products'));
  sectorLegend('sd-map-sectors', geo);
  const tip = tooltip(host);
  const chapter = (p) => CHAPTERS.find(([lo, hi]) => p.slice(0, 2) >= lo && p.slice(0, 2) <= hi);
  nodes.addEventListener('mousemove', (ev) => {
    const el = ev.target.closest('circle'); if (!el) return tip.hide();
    const i = +el.dataset.i; const p = geo.products[i];
    const status = sets[period].has(i) ? 'exported competitively' : nearSet.has(i) ? 'among the nearest not yet made' : 'not exported competitively';
    const sec = sectorOf(geo, i);
    tip.show(ev, `<b>${geo.names[i]}</b><br>HS ${p} · ${sec ? sec.name : chapter(p) ? chapter(p)[2] : ''}<br>${status}${entered.has(i) ? ` · new since 2017–19 (density at entry ${(entered.get(i) / 100).toFixed(2)})` : ''}<br>complexity ${geo.pci[i] == null ? '—' : (geo.pci[i] > 0 ? '+' : '') + geo.pci[i].toFixed(1)} · world trade US$${fmtBn(geo.trade[i])}`);
  });
  nodes.addEventListener('mouseleave', tip.hide);
  host.append(svg); paint();
  // the numbers: the products added since 2017-19
  const rows = [...entered.entries()].map(([i, d]) => [geo.names[i], geo.products[i], sectorCell(geo, i), (d / 100).toFixed(2), geo.pci[i] == null ? '—' : geo.pci[i].toFixed(1)]).sort((a, b) => a[0].localeCompare(b[0]));
  $('sd-map-table').replaceChildren(h('p', {}, `${c}’s new competitive exports, 2017–19 to 2022–24 (alphabetical; density is how much of the product’s neighbourhood ${c} already exported in 2017–19, from 0 to 1).`),
    rows.length ? table(['Product', 'HS', 'Sector', 'Density at entry', 'Complexity'], rows) : h('p', { class: 'muted' }, 'None.'));
}
const CHAPTERS = [['01', '05', 'animals'], ['06', '15', 'plants and oils'], ['16', '24', 'food, drink, tobacco'], ['25', '27', 'minerals and fuels'], ['28', '38', 'chemicals'], ['39', '40', 'plastics and rubber'], ['41', '43', 'leather'], ['44', '49', 'wood and paper'], ['50', '63', 'textiles and clothing'], ['64', '67', 'footwear and headgear'], ['68', '70', 'stone and glass'], ['71', '71', 'precious metals and stones'], ['72', '83', 'metals'], ['84', '85', 'machinery and electrical'], ['86', '89', 'vehicles and transport'], ['90', '92', 'instruments'], ['93', '93', 'arms'], ['94', '96', 'furniture and misc.'], ['97', '97', 'art']];
const fmtBn = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} bn` : `${m} m`);

// ---------------------------------------------------------------- axes
function axisX(g, scale, ticks, y, fmt, label, W) {
  const ax = s('g', { class: 'axis' });
  ax.append(s('line', { x1: scale(ticks[0]), x2: scale(ticks[ticks.length - 1]), y1: y, y2: y }));
  for (const t of ticks) { ax.append(s('line', { x1: scale(t), x2: scale(t), y1: y, y2: y + 4 })); ax.append(s('text', { x: scale(t), y: y + 16, 'text-anchor': 'middle', class: 'tick-lab' }, fmt(t))); }
  if (label) ax.append(s('text', { x: W / 2, y: y + 32, 'text-anchor': 'middle', class: 'lab' }, label));
  g.append(ax);
}
function axisY(g, scale, ticks, x, fmt, label) {
  const ax = s('g', { class: 'axis' });
  ax.append(s('line', { y1: scale(ticks[0]), y2: scale(ticks[ticks.length - 1]), x1: x, x2: x }));
  for (const t of ticks) { ax.append(s('line', { y1: scale(t), y2: scale(t), x1: x - 4, x2: x })); ax.append(s('text', { x: x - 7, y: scale(t) + 4, 'text-anchor': 'end', class: 'tick-lab' }, fmt(t))); }
  if (label) ax.append(s('text', { x: x - 44, y: scale(ticks[ticks.length - 1]) - 10, 'text-anchor': 'start', class: 'lab' }, label));
  g.append(ax);
}

// ---------------------------------------------------------------- jumps taken: a strip chart of density at entry
function renderJumps(ctx) {
  const { ps, geo, c, summary, peers, nameOf } = ctx;
  const host = $('sd-jumps'); host.replaceChildren();
  const j = ps.jumps;
  if (!j || !ps.entered.length) {
    host.append(h('p', { class: 'note', style: 'margin:12px' }, `${c} added no new competitive export between 2017–19 and 2022–24, so there are no jumps to show.`));
    $('sd-jumps-text').textContent = ''; $('sd-jumps-table').replaceChildren(); return;
  }
  const W = 760, H = 186, L = 40, R = 20, top = 30, base = 110;
  const xmax = Math.max(0.6, Math.ceil(Math.max(...ps.entered.map((e) => e[1] / 100), j.option_q75 || 0) * 10) / 10);
  const x = (d) => L + (d / xmax) * (W - L - R);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Density at entry of ${c}'s new exports` });
  if (j.option_q25 != null && j.option_q75 != null) {
    svg.append(s('rect', { x: x(j.option_q25), y: top - 4, width: Math.max(1, x(j.option_q75) - x(j.option_q25)), height: base - top + 8, fill: 'var(--chart-band)' }));
    svg.append(s('text', { x: x(j.option_q75) + 4, y: top + 6, class: 'lab' }, 'the middle half of its options'));
  }
  if (j.median_option_density != null) svg.append(s('line', { x1: x(j.median_option_density), x2: x(j.median_option_density), y1: top - 4, y2: base + 4, stroke: 'var(--rule-strong)', 'stroke-dasharray': '3 3' }));
  // peers' median entry density as ticks below the strip
  for (const p of peers) {
    const v = summary[p].entry_density; if (v == null) continue;
    svg.append(s('line', { x1: x(v), x2: x(v), y1: base + 10, y2: base + 20, stroke: PEER, 'stroke-width': 1.5 }, s('title', {}, `${nameOf(p)}: median density at entry ${v.toFixed(2)}`)));
  }
  if (peers.length) svg.append(s('text', { x: L, y: base + 50, class: 'lab' }, 'ticks below the axis: the comparison countries’ median density at entry'));
  // the entries, jittered, each hoverable
  const tip = tooltip(host);
  const sorted = ps.entered.slice().sort((a, b) => a[1] - b[1]);
  const lanes = []; // simple beeswarm: find a lane whose last x is far enough
  const dots = s('g');
  for (const [i, d] of sorted) {
    const px = x(d / 100);
    let lane = lanes.findIndex((lx) => px - lx >= 11);
    if (lane < 0) { lane = lanes.length; lanes.push(px); } else lanes[lane] = px;
    const cy = base - 10 - (lane % 7) * 11;
    const el = s('circle', { cx: px, cy, r: 4.8, fill: sectorVar(sectorOf(geo, i)), stroke: AMBER, 'stroke-width': 1.8, 'data-i': i, 'data-d': d });
    dots.append(el);
  }
  sectorLegend('sd-jumps-sectors', geo, sorted.map(([i]) => i));
  dots.addEventListener('mousemove', (ev) => { const el = ev.target.closest('circle'); if (!el) return tip.hide(); const i = +el.dataset.i; tip.show(ev, `<b>${geo.names[i]}</b><br>HS ${geo.products[i]} · ${sectorName(geo, i)} · density at entry ${(+el.dataset.d / 100).toFixed(2)}`); });
  dots.addEventListener('mouseleave', tip.hide);
  svg.append(dots);
  const ticks = []; for (let t = 0; t <= xmax + 1e-9; t += 0.1) ticks.push(+t.toFixed(1));
  axisX(svg, x, ticks, base + 2, (t) => t.toFixed(1), 'density at entry: share of the product’s neighbourhood already exported (0 = far, 1 = surrounded)', W);
  host.append(svg);
  const med = j.median_entry_density, opt = j.median_option_density;
  const read = j.share_from_top_quartile >= 0.5 ? 'short jumps, into products whose neighbours it already made' : j.share_from_top_quartile >= 0.25 ? 'a mix of short and long jumps' : 'long jumps, far from what it already made';
  $('sd-jumps-text').textContent = `${c}’s ${j.n_entries} new exports sat at a median density of ${med.toFixed(2)} when it entered them, against ${opt.toFixed(2)} for the ${j.n_options} products it could have entered; ${pct(j.share_from_top_quartile)} came from the nearest quarter of its options. That is ${read}.${ctx.peers.length && summary[ctx.peers[0]] ? ` Its comparison countries’ entries sat at a median of ${median(peers.map((p) => summary[p].entry_density)) == null ? '—' : median(peers.map((p) => summary[p].entry_density)).toFixed(2)}.` : ''}`;
  $('sd-jumps-table').replaceChildren(table(['Product', 'HS', 'Sector', 'Density at entry'], sorted.map(([i, d]) => [geo.names[i], geo.products[i], sectorCell(geo, i), (d / 100).toFixed(2)])));
}

// ---------------------------------------------------------------- the discovery gap: actual against expected
function renderGap(ctx) {
  const { ps, c, summary, peers, nameOf, iso } = ctx;
  const host = $('sd-gap'); host.replaceChildren();
  const g = ps.gap;
  if (!g) {
    host.append(h('p', { class: 'note', style: 'margin:12px' }, `${c} has too few candidate products (fewer than 50 at a value the model can read) for a discovery gap.`));
    $('sd-gap-text').textContent = ''; $('sd-gap-table').replaceChildren(); return;
  }
  const W = 760, H = 420, L = 52, R = 24, T = 20, B = 50;
  const pts = Object.entries(summary).filter(([, v]) => v.z != null);
  const maxv = Math.max(g.actual, g.expected_hi || g.expected, ...peers.map((p) => Math.max(summary[p].actual, summary[p].expected)), 10);
  const lim = Math.ceil(Math.sqrt(maxv * 1.15)) ** 2;
  const sq = (v) => Math.sqrt(Math.max(v, 0));
  const x = (v) => L + (sq(v) / sq(lim)) * (W - L - R);
  const y = (v) => H - B - (sq(v) / sq(lim)) * (H - T - B);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${c}'s new exports against the number expected` });
  const ticks = [0, 1, 4, 9, 16, 25, 36, 49, 64, 81, 100, 144, 196, 256, 324, 400].filter((t) => t <= lim);
  if (ticks[ticks.length - 1] !== lim) ticks.push(lim);
  const grid = s('g', { class: 'grid' });
  for (const t of ticks) { grid.append(s('line', { x1: x(t), x2: x(t), y1: y(0), y2: y(lim) })); grid.append(s('line', { y1: y(t), y2: y(t), x1: x(0), x2: x(lim) })); }
  svg.append(grid);
  svg.append(s('line', { x1: x(0), y1: y(0), x2: x(lim), y2: y(lim), stroke: 'var(--rule-strong)', 'stroke-dasharray': '4 3' }));
  svg.append(s('text', { x: x(lim) - 4, y: y(lim) + 14, 'text-anchor': 'end', class: 'quad' }, 'as expected'));
  svg.append(s('text', { x: x(lim * 0.55), y: y(lim * 0.1), 'text-anchor': 'middle', class: 'quad' }, 'fewer than expected'));
  svg.append(s('text', { x: x(lim * 0.1), y: y(lim * 0.75), 'text-anchor': 'start', class: 'quad' }, 'more than expected'));
  const tip = tooltip(host);
  const all = s('g');
  let beyond = 0;
  for (const [k, v] of pts) if (k !== iso && !peers.includes(k)) { if (v.expected > lim || v.actual > lim) { beyond++; continue; } all.append(s('circle', { cx: x(v.expected), cy: y(v.actual), r: 2.5, fill: OTHER, 'data-k': k })); }
  svg.append(all);
  if (beyond) svg.append(s('text', { x: x(lim), y: y(lim) - 6, 'text-anchor': 'end', class: 'lab' }, `${beyond} larger exporters lie beyond this range`));
  const pg = s('g');
  const plabs = [];
  // labels alternate sides, in order of height, so near neighbours do not sit on each other
  peers.slice().sort((a, b) => y(summary[a].actual) - y(summary[b].actual)).forEach((p, k) => {
    const v = summary[p];
    pg.append(s('circle', { cx: x(v.expected), cy: y(v.actual), r: 4.5, fill: PEER, 'data-k': p }));
    const left = k % 2 === 1;
    const el = s('text', { x: x(v.expected) + (left ? -7 : 7), y: y(v.actual) + 4, class: 'name', 'text-anchor': left ? 'end' : 'start' }, nameOf(p));
    plabs.push({ el, y: y(v.actual) + 4, left }); pg.append(el);
  });
  nudge(plabs.filter((l) => !l.left), 13); nudge(plabs.filter((l) => l.left), 13);
  svg.append(pg);
  const me = s('g');
  if (g.expected_lo != null) me.append(s('line', { x1: x(g.expected_lo), x2: x(g.expected_hi), y1: y(g.actual), y2: y(g.actual), stroke: AMBER, 'stroke-width': 2.5 }));
  me.append(s('circle', { cx: x(g.expected), cy: y(g.actual), r: 6.5, fill: AMBER, stroke: INK, 'stroke-width': 1.5, 'data-k': iso }));
  me.append(s('text', { x: x(g.expected) + 9, y: y(g.actual) - 7, class: 'name', style: 'font-weight:600' }, c));
  svg.append(me);
  const over = (ev) => { const el = ev.target.closest('circle'); if (!el) return tip.hide(); const k = el.dataset.k, v = summary[k]; tip.show(ev, `<b>${nameOf(k)}</b><br>${v.actual} new exports against ${v.expected} expected${v.expected_lo != null ? ` (${v.expected_lo}–${v.expected_hi})` : ''}<br>gap ${v.z > 0 ? '+' : ''}${v.z}${v.hub ? ' · a re-export hub: read with care' : ''}`); };
  for (const gg of [all, pg, me]) { gg.addEventListener('mousemove', over); gg.addEventListener('mouseleave', tip.hide); }
  axisX(svg, x, ticks, y(0) + 2, (t) => t, 'new competitive exports the model expected, 2017–19 to 2022–24 (square-root scale)', W);
  axisY(svg, y, ticks, x(0) - 2, (t) => t, 'actual');
  host.append(svg);
  const band = g.expected_lo != null ? ` (between ${g.expected_lo} and ${g.expected_hi} across model draws)` : '';
  const read = g.z <= -1 ? 'clearly fewer than its position predicts' : g.z >= 1 ? 'clearly more than its position predicts' : 'about what its position predicts';
  const prev = ps.gap_prev ? ` In the window before (${yrs(ps.gap_prev.window[0])} to ${yrs(ps.gap_prev.window[1])}) it was ${ps.gap_prev.actual} against ${ps.gap_prev.expected} expected (gap ${ps.gap_prev.z > 0 ? '+' : ''}${ps.gap_prev.z}).` : '';
  const peerLine = peers.length ? ` Among its comparison countries the gap runs from ${Math.min(...peers.map((p) => summary[p].z))} to ${Math.max(...peers.map((p) => summary[p].z))}.` : '';
  $('sd-gap-text').textContent = `${c} added ${g.actual} new competitive exports against ${g.expected} expected${band}: ${read} (gap ${g.z > 0 ? '+' : ''}${g.z}, where ±1 is one standard deviation of the model’s spread).${prev}${peerLine}${ps.trade_hub ? ` ${c} is a re-export hub, so some of its “new exports” may be goods passing through.` : ''}`;
  const rows = [[c, g.actual, g.expected, g.expected_lo != null ? `${g.expected_lo}–${g.expected_hi}` : '—', g.n_at_risk, g.z]].concat(peers.map((p) => { const v = summary[p]; return [nameOf(p), v.actual, v.expected, v.expected_lo != null ? `${v.expected_lo}–${v.expected_hi}` : '—', v.n_at_risk, v.z]; }));
  $('sd-gap-table').replaceChildren(h('p', {}, `${c} and its comparison countries. Candidates are the products not exported competitively in 2017–19 (RCA below 0.5) that the model scores; the band is the 5th to 95th percentile of expected entries over ${ctx.meta.thresholds.bootstraps} refits of the model on resampled economies.`),
    table(['Economy', 'New exports', 'Expected', 'Band', 'Candidates', 'Gap (z)'], rows));
}

// ---------------------------------------------------------------- where new products could come from: distance against complexity
function renderFrontier(ctx) {
  const { ps, geo, c, nearby } = ctx;
  const host = $('sd-frontier'); host.replaceChildren();
  const on = new Set(ps.exported_now);
  const idx = Object.fromEntries(geo.products.map((p, i) => [p, i]));
  const near = new Map([...(nearby && nearby.pass ? nearby.products : []).map((p) => [idx[p.hs4], 'nearest']), ...(nearby && nearby.pass ? nearby.step_up : []).map((p) => [idx[p.hs4], 'step up'])]);
  const cand = [];
  for (let i = 0; i < geo.products.length; i++) if (!on.has(i) && geo.discoverable[i] && geo.pci[i] != null) cand.push(i);
  if (!cand.length) { host.append(h('p', { class: 'note', style: 'margin:12px' }, 'Nothing to show.')); return; }
  const W = 760, H = 460, L = 52, R = 24, T = 24, B = 50;
  const dist = (i) => 1 - ps.density_now[i] / 100;
  const dmin = Math.min(...cand.map(dist)), dmax = 1;
  const pmin = Math.floor(Math.min(...cand.map((i) => geo.pci[i]))), pmax = Math.ceil(Math.max(...cand.map((i) => geo.pci[i])));
  const x = (d) => L + ((d - dmin) / (dmax - dmin)) * (W - L - R);
  const y = (p) => H - B - ((p - pmin) / (pmax - pmin)) * (H - T - B);
  const r = (t) => Math.max(1.8, Math.min(9, 1.2 + Math.sqrt(Math.max(t, 0)) / 60));
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Products ${c} does not yet export: distance against complexity` });
  const dmed = median(cand.map(dist)), pmed = median(cand.map((i) => geo.pci[i]));
  const grid = s('g', { class: 'grid' });
  grid.append(s('line', { x1: x(dmed), x2: x(dmed), y1: y(pmin), y2: y(pmax) })); grid.append(s('line', { y1: y(pmed), y2: y(pmed), x1: x(dmin), x2: x(dmax) }));
  svg.append(grid);
  svg.append(s('text', { x: x(dmin) + 6, y: y(pmax) + 14, class: 'quad' }, 'near and more complex: the shortest jumps with the most to learn'));
  svg.append(s('text', { x: x(dmax) - 6, y: y(pmax) + 14, 'text-anchor': 'end', class: 'quad' }, 'far and complex: long jumps, several firms at once'));
  const tip = tooltip(host);
  const dots = s('g');
  for (const i of cand.slice().sort((a, b) => geo.trade[b] - geo.trade[a])) {
    const kind = near.get(i);
    dots.append(s('circle', { cx: x(dist(i)), cy: y(geo.pci[i]), r: r(geo.trade[i]), fill: sectorVar(sectorOf(geo, i)), stroke: kind ? INK : '#fff', 'stroke-width': kind ? 2 : 0.5, 'fill-opacity': kind ? 1 : 0.6, 'data-i': i }));
  }
  svg.append(dots);
  sectorLegend('sd-frontier-sectors', geo, cand);
  // label the nearest ten (alphabetical labels would clutter; the names are in the table)
  const labels = s('g');
  const labs = [];
  for (const [i, kind] of near) if (kind === 'nearest' && i != null) {
    const el = s('text', { x: x(dist(i)) + 6, y: y(geo.pci[i]) + 4, class: 'name' }, geo.names[i].length > 22 ? `${geo.names[i].slice(0, 20)}…` : geo.names[i]);
    labs.push({ el, y: y(geo.pci[i]) + 4 }); labels.append(el);
  }
  nudge(labs, 14);
  svg.append(labels);
  dots.addEventListener('mousemove', (ev) => { const el = ev.target.closest('circle'); if (!el) return tip.hide(); const i = +el.dataset.i; tip.show(ev, `<b>${geo.names[i]}</b><br>HS ${geo.products[i]} · ${sectorName(geo, i)}<br>distance ${dist(i).toFixed(2)} · complexity ${(geo.pci[i] > 0 ? '+' : '') + geo.pci[i].toFixed(1)}<br>world trade US$${fmtBn(geo.trade[i])}${near.has(i) ? ` · on the ${near.get(i)} list` : ''}`); });
  dots.addEventListener('mouseleave', tip.hide);
  const dt = []; for (let t = Math.ceil(dmin * 10) / 10; t <= 1.0001; t += 0.1) dt.push(+t.toFixed(1));
  axisX(svg, x, dt, y(pmin) + 2, (t) => t.toFixed(1), 'distance: 1 − density (left is near)', W);
  const ptk = []; for (let t = pmin; t <= pmax; t += 1) ptk.push(t);
  axisY(svg, y, ptk, x(dmin) - 2, (t) => (t > 0 ? `+${t}` : t), 'complexity');
  host.append(svg);
  const nearCount = cand.filter((i) => dist(i) < dmed).length;
  const complexNear = cand.filter((i) => dist(i) < dmed && geo.pci[i] > pmed).length;
  $('sd-frontier-text').textContent = `${cand.length} products ${c} does not yet export competitively, ${nearCount} of them nearer than its median option and ${complexNear} both nearer and more complex than the median (the top-left quarter). Bottom left are the easiest next steps with the least to learn; bottom right, far and simple, is rarely worth a jump. ${near.size ? `The ${near.size} products on its nearest lists are outlined and the ten nearest are named.` : 'Its nearest-products lists did not pass their stability check, so none is marked.'} Colours are the Growth Lab’s product sections. Near is a statement about distance, not about returns: the tool does not rank these.`;
  const rows = [...near.entries()].filter(([i]) => i != null).map(([i, kind]) => [geo.names[i], geo.products[i], sectorCell(geo, i), kind, dist(i).toFixed(2), (geo.pci[i] > 0 ? '+' : '') + geo.pci[i].toFixed(1), `US$${fmtBn(geo.trade[i])}`]).sort((a, b) => a[0].localeCompare(b[0]));
  $('sd-frontier-table').replaceChildren(rows.length ? table(['Product', 'HS', 'Sector', 'List', 'Distance', 'Complexity', 'World trade'], rows) : h('p', { class: 'muted' }, 'No nearest list is shown for this country.'));
}

// ---------------------------------------------------------------- survival: a small bar set
function renderSurvival(ctx) {
  const { ps, c, summary, peers, nameOf } = ctx;
  const host = $('sd-survival'); host.replaceChildren();
  const sv = ps.survival;
  const peerVals = peers.map((p) => summary[p].survival).filter((v) => v != null);
  const allMed = median(Object.values(summary).map((v) => v.survival));
  const bars = [];
  if (sv) bars.push({ label: `${c}: products entered in ${yrs(sv.windows[1])}`, v: sv.rate, n: `${sv.alive} of ${sv.entrants}`, fill: AMBER });
  if (sv && sv.incumbent_rate != null) bars.push({ label: `${c}: its established exports of ${yrs(sv.windows[1])}`, v: sv.incumbent_rate, n: `${sv.incumbents_alive} of ${sv.incumbents}`, fill: INK });
  if (peerVals.length) bars.push({ label: `comparison countries’ entries (median of ${peerVals.length})`, v: median(peerVals), n: '', fill: PEER });
  if (allMed != null) bars.push({ label: `all economies’ entries (median)`, v: allMed, n: '', fill: OTHER });
  if (!bars.length) { host.append(h('p', { class: 'note', style: 'margin:12px' }, 'Nothing to show.')); return; }
  const W = 760, rowH = 34, L = 330, R = 60, H = bars.length * rowH + 40;
  const x = (v) => L + v * (W - L - R);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Survival of ${c}'s export entries` });
  bars.forEach((b, i) => {
    const yy = 12 + i * rowH;
    svg.append(s('text', { x: L - 8, y: yy + 16, 'text-anchor': 'end', class: 'name' }, b.label));
    svg.append(s('rect', { x: x(0), y: yy, width: Math.max(1, x(b.v) - x(0)), height: 22, fill: b.fill }));
    svg.append(s('text', { x: x(b.v) + 6, y: yy + 16, class: 'name' }, `${pct(b.v)}${b.n ? ` (${b.n})` : ''}`));
  });
  axisX(svg, x, [0, 0.25, 0.5, 0.75, 1], 12 + bars.length * rowH + 4, (t) => pct(t), null, W);
  host.append(svg);
  if (!sv) {
    $('sd-survival-text').textContent = `${c} had fewer than five new competitive exports in 2012–14, too few for a survival rate; the comparison bars are shown for reference.`;
  } else {
    const ref = peerVals.length ? median(peerVals) : allMed;
    const who = peerVals.length ? 'its comparison countries' : 'economies generally';
    const read = ref == null ? '' : sv.rate < ref - 0.1 ? ` That is below ${who}: ${c}’s tries lasted less well, which points to some other constraint on them rather than to too few tries.` : sv.rate >= ref ? ` That is at or above ${who}: what ${c} started, it mostly kept.` : ` That is about the same as ${who}.`;
    $('sd-survival-text').textContent = `${sv.alive} of the ${sv.entrants} products ${c} started exporting competitively in ${yrs(sv.windows[1])} were still exported competitively in ${yrs(sv.windows[2])} (${pct(sv.rate)}), against ${sv.incumbent_rate != null ? `${pct(sv.incumbent_rate)} of its established exports` : 'no established-export rate'}.${read} New exports last less well than old ones everywhere, so the fair comparison is with other countries’ new exports, not with the incumbents.`;
  }
  const rows = [[c, sv ? `${sv.alive} of ${sv.entrants}` : '—', sv ? pct(sv.rate) : '—', sv && sv.incumbent_rate != null ? pct(sv.incumbent_rate) : '—']].concat(peers.map((p) => { const v = summary[p]; return [nameOf(p), '', v.survival == null ? '—' : pct(v.survival), v.incumbent_survival == null ? '—' : pct(v.incumbent_survival)]; }));
  $('sd-survival-table').replaceChildren(table(['Economy', 'Entries alive', 'Entries’ survival', 'Incumbents’ survival'], rows));
}

// ---------------------------------------------------------------- method
function renderMethod(ctx, r) {
  const { meta, c, ps } = ctx;
  const g = meta.gates || {};
  const fit = meta.fit && meta.fit.B;
  $('sd-space-method').replaceChildren(
    h('h3', { style: 'margin-top:12px' }, 'How these views are made'),
    h('p', {}, meta.method),
    h('p', {}, `Windows: the discovery gap on ${meta.windows.A.map(yrs).join(' to ')} and ${meta.windows.B.map(yrs).join(' to ')}; survival on products entered in ${yrs(meta.survival_windows[1])} (absent in ${yrs(meta.survival_windows[0])}) and still there in ${yrs(meta.survival_windows[2])}; the intensive margin on ${meta.margin_windows.map(yrs).join(' to ')}. An entry must reach US$${(meta.thresholds.entry_value / 1e6).toFixed(0)} million a year. Fit of the entry model: ${fit ? `pseudo-R² ${fit.pseudo_r2.toFixed(2)}, rank accuracy (AUC) ${fit.auc.toFixed(2)}, dispersion ${fit.dispersion.toFixed(1)}` : ''}; the gap is scaled by that dispersion and capped at ±${meta.thresholds.z_cap}.`),
    h('p', {}, `The discovery gap's gates: a scrambled product space must give a gap centred on zero (${g.placebo && g.placebo.passes ? 'passed' : 'failed'}; ${meta.thresholds.placebos} shuffles), and the gap must rank economies alike across the two windows (rank correlation ${g.reliability ? g.reliability.real_rho_A_B.toFixed(2) : '—'} against a bar of ${meta.thresholds.stable_rho}: ${g.reliability && g.reliability.passes ? 'passed' : 'failed'}). It is class ${g.class} in the registry: ${g.class === 'B' ? 'it votes on the self-discovery rating (rubric 0.2.8)' : 'it informs the lean as a quantity'}. One thing to know: with the product space scrambled, the gap still ranks economies almost as the real one does (rank correlation ${g.placebo && g.placebo.real_vs_mean_placebo_rho_B != null ? g.placebo.real_vs_mean_placebo_rho_B.toFixed(2) : '—'}), so most of what the gap measures is how many new products an economy adds relative to its diversification and income, and the product space's fine structure adds little to that.`),
    h('p', {}, `The signature cards read the four measures against ${c}'s structural comparison countries where it has them, else against all economies: H1 toward when the gap is −1 or below; H2 toward when fewer than half the entries came from the nearest quarter of the options; H3 toward when survival is ten points or more below the comparison; H4 toward when incumbent growth is at or above the comparison. The signature holds when H1 points toward it, H4 does not point away and H3 does not point toward it. This is a display reading (plan W10, section 3.2). The rating itself comes from the engine: since rubric 0.2.8 self-discovery is tiered like the other areas, with the discovery gap voting at its class weight and the other measures informing the lean; until 0.2.7 it was judged by elimination.`),
    h('p', {}, `Source: ${meta.source} Built by ingest/productspace.py. The layout is computed by the tool from the same method and data as the Atlas of Economic Complexity, not copied from it; the product sections and their names are the Growth Lab’s public classification (${ctx.geo.meta.sections_source || 'github.com/cid-harvard/classifications'}). The colours are the tool’s own.`));
}

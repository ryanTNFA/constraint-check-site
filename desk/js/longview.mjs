// The Long View (visual-upgrade PRD V5, front-door PRD W8.3): two centuries of GDP per capita by world region beside
// the share of people in extreme poverty. It sits in the "Why this exists" band and makes TNFA's case; it is labelled
// as TNFA's view and rates no country. It mirrors the "Two centuries of economic growth" chart on TNFA's own site:
// the same six regions, in the site's colours, on a linear dollar scale, on the site's navy ground. Drawn by hand into
// SVG (no D3 on the home page). "Play" sweeps the years from 1820; with reduced motion, or without JavaScript timers,
// the whole chart shows at once. Data: desk/data/longview.json (ingest/src_longview.py), loaded after the map so it
// never delays it.
import { h, getJSON, dataBase } from './common.mjs';

const NS = 'http://www.w3.org/2000/svg';
const W = 960, H = 400, TOP = 44, BOTTOM = 36, LEFT = 58, GAP = 70, LABEL = 160;
const PANEL = (W - LEFT - GAP - LABEL - 40) / 2; // two panels of equal width; the first keeps room for its labels
const Y0 = 1820, Y1 = 2022, YMAX = 60000;
// The series as the TNFA site draws them (thenewforeignassistance.org, js/index.js): its names, colours and widths.
const SERIES = [
  { key: 'Western offshoots', label: 'Western Offshoots', color: '#e07a4a', width: 2.8 },
  { key: 'Eastern Europe', label: 'Eastern Europe', color: '#7ec86a', width: 2.8 },
  { key: 'East Asia', label: 'East Asia', color: '#c5d63a', width: 2 },
  { key: 'Latin America', label: 'Latin America', color: '#5ecfc9', width: 2 },
  { key: 'South and South-East Asia', label: 'South & Southeast Asia', color: '#9b7fd4', width: 2.8 },
  { key: 'Sub-Saharan Africa', label: 'Sub-Saharan Africa', color: '#7eb8e8', width: 2.8 },
];
const el = (tag, attrs = {}, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const fmtK = (v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`);

export async function mountLongView(host) {
  if (!host) return;
  const data = await getJSON(`${dataBase()}/longview.json`, { optional: true });
  if (!data) { host.hidden = true; return; }
  const x = (year, left) => left + ((year - Y0) / (Y1 - Y0)) * PANEL;
  const yUsd = (v) => TOP + (1 - Math.min(v, YMAX) / YMAX) * (H - TOP - BOTTOM);
  const yPct = (v) => TOP + (1 - v / 100) * (H - TOP - BOTTOM);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'lv-svg', role: 'img', 'aria-label': 'Left: GDP per capita for six world regions, 1820 to 2022, in 2011 dollars. In 1820 every region was poor, under 3,000 dollars a person; since then incomes have risen everywhere, at very different rates, to about 57,000 in the Western offshoots and 3,400 in Sub-Saharan Africa. Right: the share of people in extreme poverty, from about three quarters in 1820 to a tenth in 2018.' });
  // one clip per panel, so both sweep through the years together
  const uid = Math.random().toString(36).slice(2, 8);
  const defs = el('defs');
  const clipRect = {};
  for (const k of ['a', 'b']) { const c = el('clipPath', { id: `lv-${k}-${uid}` }); clipRect[k] = el('rect', { x: 0, y: 0, width: W, height: H }); c.append(clipRect[k]); defs.append(c); }
  svg.append(defs);
  const clipId = `lv-a-${uid}`;

  // panel 1: GDP per capita, linear, as on TNFA's site
  const L1 = LEFT;
  const g1 = el('g', { class: 'lv-panel' });
  g1.append(el('text', { x: L1, y: 20, class: 'lv-title' }, 'GDP per capita (international $, 2011 prices)'));
  for (const v of [0, 20000, 40000, 60000]) {
    g1.append(el('line', { x1: L1, x2: L1 + PANEL, y1: yUsd(v), y2: yUsd(v), class: 'lv-grid' }));
    g1.append(el('text', { x: L1 - 8, y: yUsd(v) + 5, class: 'lv-tick-y', 'text-anchor': 'end' }, fmtK(v)));
  }
  for (const yr of [1820, 1870, 1920, 1970, 2022]) g1.append(el('text', { x: x(yr, L1), y: H - BOTTOM + 16, class: 'lv-tick', 'text-anchor': 'middle' }, String(yr)));
  const lines1 = el('g', { 'clip-path': `url(#${clipId})` });
  const ends = [];
  for (const s of SERIES) {
    const pts = (data.gdp.series[s.key] || []).filter(([yr]) => yr >= Y0 && yr <= Y1);
    if (!pts.length) continue;
    const d = pts.map(([yr, v], i) => `${i ? 'L' : 'M'}${x(yr, L1).toFixed(1)},${yUsd(v).toFixed(1)}`).join('');
    lines1.append(el('path', { d, class: 'lv-line', stroke: s.color, 'stroke-width': s.width }));
    ends.push({ label: s.label, color: s.color, y: yUsd(pts[pts.length - 1][1]) });
  }
  g1.append(lines1);
  // labels at the right edge in the line's colour; bottom-to-top, the lower label keeps its point and the one above moves up
  ends.sort((a, b) => b.y - a.y);
  for (let i = 1; i < ends.length; i++) if (ends[i - 1].y - ends[i].y < 16) ends[i].y = ends[i - 1].y - 16;
  const labels1 = el('g', { 'clip-path': `url(#${clipId})` });
  for (const e of ends) labels1.append(el('text', { x: L1 + PANEL + 8, y: e.y + 4, class: 'lv-label', fill: e.color }, e.label));
  g1.append(labels1);
  svg.append(g1);

  // panel 2: the world share in extreme poverty
  const L2 = LEFT + PANEL + LABEL + GAP;
  const g2 = el('g', { class: 'lv-panel' });
  g2.append(el('text', { x: L2, y: 20, class: 'lv-title' }, 'Share of people in extreme poverty, world'));
  for (const v of [0, 25, 50, 75, 100]) {
    g2.append(el('line', { x1: L2, x2: L2 + PANEL, y1: yPct(v), y2: yPct(v), class: 'lv-grid' }));
    g2.append(el('text', { x: L2 - 8, y: yPct(v) + 5, class: 'lv-tick-y', 'text-anchor': 'end' }, `${v}%`));
  }
  for (const yr of [1820, 1870, 1920, 1970, 2018]) g2.append(el('text', { x: x(yr, L2), y: H - BOTTOM + 16, class: 'lv-tick', 'text-anchor': 'middle' }, String(yr)));
  const pov = data.poverty.world;
  const line2 = pov.map(([yr, v], i) => `${i ? 'L' : 'M'}${x(yr, L2).toFixed(1)},${yPct(v).toFixed(1)}`).join('');
  const area2 = `${line2}L${x(pov[pov.length - 1][0], L2).toFixed(1)},${yPct(0).toFixed(1)}L${x(pov[0][0], L2).toFixed(1)},${yPct(0).toFixed(1)}Z`;
  const shapes2 = el('g', { 'clip-path': `url(#lv-b-${uid})` });
  shapes2.append(el('path', { d: area2, class: 'lv-area' }), el('path', { d: line2, class: 'lv-line world' }));
  const last = pov[pov.length - 1];
  shapes2.append(el('text', { x: x(last[0], L2) + 8, y: yPct(last[1]) + 4, class: 'lv-label world' }, `${last[1]}% in ${last[0]}`));
  const first = pov[0];
  shapes2.append(el('text', { x: x(first[0], L2) + 8, y: yPct(first[1]) - 8, class: 'lv-label world' }, `${first[1]}% in ${first[0]}`));
  g2.append(shapes2);
  svg.append(g2);
  // the year, large and faint, during playback
  const yearText = el('text', { x: L2 + PANEL, y: H - BOTTOM - 10, class: 'lv-year', 'text-anchor': 'end', 'aria-hidden': 'true' }, '');
  svg.append(yearText);

  // playback: a clip that sweeps from 1820 to today; reduced motion shows everything at once
  const btn = h('button', { type: 'button', class: 'btn quiet small lv-play', 'aria-pressed': 'false' }, '▶ Play two centuries');
  const out = h('span', { class: 'small lv-out', 'aria-live': 'polite' });
  let raf = null; // an interval, not requestAnimationFrame: it keeps time in a background tab too
  const sweep = (t) => { // t in [0, 1]: each panel's clip runs from its left edge to the year reached; at 1 it uncovers the labels too
    const yr = Y0 + t * (Y1 - Y0);
    for (const [k, left] of [['a', L1], ['b', L2]]) {
      clipRect[k].setAttribute('x', left - 2);
      clipRect[k].setAttribute('width', t >= 1 ? W : t * PANEL + 2);
    }
    yearText.textContent = t >= 1 ? '' : String(Math.round(yr));
    out.textContent = t >= 1 ? '' : `Showing the years to ${Math.round(yr)}`;
  };
  const stop = () => { if (raf) clearInterval(raf); raf = null; sweep(1); btn.textContent = '▶ Play two centuries'; btn.setAttribute('aria-pressed', 'false'); };
  const play = () => {
    if (reducedMotion()) { sweep(1); return; }
    const t0 = performance.now(); const ms = 7000;
    btn.textContent = '❚❚ Stop'; btn.setAttribute('aria-pressed', 'true');
    raf = setInterval(() => { const t = Math.min(1, (performance.now() - t0) / ms); sweep(t); if (t >= 1) stop(); }, 40);
  };
  btn.addEventListener('click', () => (raf ? stop() : play()));
  sweep(1);

  const fig = h('figure', { class: 'longview' }, svg,
    h('figcaption', { class: 'small' },
      h('span', { class: 'lv-controls' }, btn, ' ', out),
      h('span', {}, '“Western Offshoots” are the United States, Canada, Australia and New Zealand. Extreme poverty here means being unable to afford basic needs (the cost-of-basic-needs line). Sources: Maddison Project Database 2023 (Bolt and van Zanden), regional series via Our World in Data; Moatsos (2021), via Our World in Data. Both CC BY 4.0. ',
        h('strong', {}, 'This chart makes The New Foreign Assistance’s case; it is not a rating of any country.'))));
  host.replaceChildren(fig);
}

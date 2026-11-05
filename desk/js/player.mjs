// Year player (evidence-viz-prd 7.1): the "data as of" year advancing on its own. Chart 1 becomes a Gapminder-style
// bubble chart (log income, bubbles by population, a trail for the economy, the year large behind) and chart 2 a bar
// race. Axes are fixed from all frames; marks glide between years; stale points stay hollow; economies appear and
// disappear with their data rather than being interpolated. Frames come from playerFrames / raceFrames.
// Motion: reduced motion, the duration scale and the easing family come from motion.mjs (C6), the same tokens the CSS uses.
import { reducedMotion, dur, easeFn } from './motion.mjs';
const d3 = () => window.d3;
const NS = 'http://www.w3.org/2000/svg';

const tr = (sel, ms) => (ms > 0 ? sel.transition().duration(ms).ease(easeFn) : sel);

/**
 * The control bar: play/pause, a year scrubber (arrow keys step a year), speed, and a button back to the static
 * chart. firstYear() picks where a fresh playback starts. Callbacks: onShow(year, ms) for every frame, onSettle(year) when playback stops on a year, onOpen() before
 * the first frame, onClose() when the player is closed, onState({on, playing, year}) whenever the controls change
 * (so a second, compact control elsewhere on the page can mirror this one).
 */
export function createControls(el, { years, firstYear, onOpen, onShow, onSettle, onClose, onState }) {
  const play = el.querySelector('[data-pl="play"]'), range = el.querySelector('[data-pl="year"]'), out = el.querySelector('[data-pl="out"]');
  const speed = el.querySelector('[data-pl="speed"]'), close = el.querySelector('[data-pl="close"]');
  range.min = String(years[0]); range.max = String(years[years.length - 1]); range.step = '1';
  let on = false, timer = null, year = years[years.length - 1], settleT = null;
  const interval = () => Number(speed.value) || 900;
  const label = () => {
    play.textContent = timer ? '❚❚ Pause' : on ? '▶ Play' : '▶ Play the years';
    play.setAttribute('aria-pressed', String(!!timer));
    close.hidden = !on;
    el.classList.toggle('playing', !!timer);
    el.classList.toggle('on', on);
    if (onState) onState({ on, playing: !!timer, year });
  };
  const setYear = (y) => { year = y; range.value = String(y); out.textContent = String(y); if (onState) onState({ on, playing: !!timer, year }); };
  async function open(y) { if (!on) { on = true; label(); await onOpen(y); } }
  function stop() { if (timer) { clearInterval(timer); timer = null; label(); onSettle(year); } }
  async function start(from) {
    const resume = on;
    await open(from);
    if (!resume || year >= years[years.length - 1] || from != null) setYear(from != null ? from : firstYear ? firstYear() : years[0]);
    onShow(year, 0);
    timer = setInterval(() => {
      if (year >= years[years.length - 1]) { stop(); return; }
      setYear(year + 1);
      onShow(year, reducedMotion() ? 0 : Math.round(interval() * 0.85));
      if (year >= years[years.length - 1]) stop();
    }, interval());
    label();
  }
  play.addEventListener('click', () => (timer ? stop() : start(null)));
  speed.addEventListener('change', () => { if (timer) { clearInterval(timer); timer = null; start(year); } });
  range.addEventListener('input', async () => {
    if (timer) { clearInterval(timer); timer = null; label(); }
    await open(Number(range.value));
    setYear(Number(range.value));
    onShow(year, dur(2));
    clearTimeout(settleT);
    settleT = setTimeout(() => onSettle(year), 450);
  });
  close.addEventListener('click', () => { if (timer) { clearInterval(timer); timer = null; } on = false; label(); onClose(); });
  label();
  return {
    get on() { return on; },
    get playing() { return !!timer; },
    get year() { return year; },
    setYear,
    /** Start from a given year (null: from the first year, or where it is if paused mid-way). */
    start,
    stop,
  };
}

/** Y ticks: d3's own for linear scales; for log and symlog, 1-2-5 steps at least 22px apart (d3 crowds them near the top). */
function yTicks(y, transform) {
  if (transform !== 'log' && transform !== 'log1p') return { ticks: y.ticks(6), format: y.tickFormat(6) };
  const [a, b] = y.domain(), cands = [0];
  for (let e = -3; e <= 7; e++) for (const k of [1, 2, 5]) cands.push(k * 10 ** e);
  const kept = [];
  for (const v of cands.filter((v) => v >= a && v <= b && (transform !== 'log' || v > 0))) if (!kept.length || Math.abs(y(v) - y(kept[kept.length - 1])) >= 22) kept.push(v);
  return { ticks: kept, format: (v) => v.toLocaleString('en-US', { maximumFractionDigits: 3 }) };
}

function svgEl(width, height) {
  const svg = d3().create('svg').attr('xmlns', NS).attr('width', width).attr('height', height).attr('viewBox', [0, 0, width, height])
    .attr('font-family', 'Inter, system-ui, sans-serif').attr('font-size', 12).style('background', 'transparent');
  return svg;
}

function bigYear(g, pal, x, y, size) {
  return g.append('text').attr('x', x).attr('y', y).attr('text-anchor', 'end')
    .attr('font-size', size).attr('font-weight', 600).attr('fill', pal.text).attr('fill-opacity', 0.09).attr('font-family', 'Newsreader, Georgia, serif');
}

/**
 * Chart 1 as a bubble chart over fixed axes. opts: {frames, domains, iso, peers, name(iso3), pal, transform,
 * yLabel, direction (+1, -1, 0), limit (stale after this many years), width, fmtV(v), sideLabels: bool}.
 * Returns {node, show(year, ms)}.
 */
export function bubbleChart(opts) {
  const { frames, domains, iso, peers, name, pal, transform, yLabel, direction, limit, fmtV } = opts;
  const D = d3();
  const width = Math.max(320, opts.width || 900);
  const height = Math.round(Math.min(620, Math.max(360, width * 0.58)));
  const m = { l: 58, r: 24, t: 18, b: 44 };
  const x = D.scaleLog().domain([domains.x[0] / 1.15, domains.x[1] * 1.15]).range([m.l, width - m.r]);
  const y = (transform === 'log' ? D.scaleLog() : transform === 'log1p' ? D.scaleSymlog() : D.scaleLinear()).domain(domains.y).range([height - m.b, m.t]);
  if (transform !== 'log' && transform !== 'log1p') y.nice();
  const maxR = Math.max(14, Math.min(34, width / 28));
  const r = D.scaleSqrt().domain([0, domains.popMax || 1]).range([0, maxR]);
  const rad = (d, min) => (d.pop > 0 ? Math.max(min, r(d.pop)) : min);
  const peerSet = new Set(peers);
  const byYear = new Map(frames.map((f) => [f.year, f]));
  const svg = svgEl(width, height);
  const clipId = `pl-clip-${Math.random().toString(36).slice(2, 8)}`;
  svg.append('defs').append('clipPath').attr('id', clipId).append('rect').attr('x', m.l).attr('y', m.t).attr('width', width - m.l - m.r).attr('height', height - m.t - m.b);
  // grid and axes
  const ticks = [];
  for (const t of [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000].filter((v) => v >= x.domain()[0] && v <= x.domain()[1])) if (!ticks.length || x(t) - x(ticks[ticks.length - 1]) >= 40) ticks.push(t);
  const gx = svg.append('g').attr('stroke', pal.text).attr('stroke-opacity', 0.1);
  gx.selectAll('line').data(ticks).join('line').attr('x1', (d) => x(d)).attr('x2', (d) => x(d)).attr('y1', m.t).attr('y2', height - m.b);
  const { ticks: yt, format: yf } = yTicks(y, transform);
  gx.append('g').selectAll('line').data(yt).join('line').attr('x1', m.l).attr('x2', width - m.r).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
  const ax = svg.append('g').attr('fill', pal.text).attr('font-size', 11);
  ax.selectAll('text.xt').data(ticks).join('text').attr('class', 'xt').attr('x', (d) => x(d)).attr('y', height - m.b + 16).attr('text-anchor', 'middle').text((d) => `$${d >= 1000 ? `${d / 1000}k` : d}`);
  ax.selectAll('text.yt').data(yt).join('text').attr('class', 'yt').attr('x', m.l - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text((d) => yf(d));
  ax.append('text').attr('x', width - m.r).attr('y', height - 6).attr('text-anchor', 'end').text(width < 560 ? 'GDP per capita, PPP $ (log scale) →' : 'GDP per capita, PPP (constant 2021 international $, log scale) →');
  ax.append('text').attr('x', 4).attr('y', 11).attr('text-anchor', 'start').text(yLabel);
  const yearText = bigYear(svg, pal, width - m.r - 8, height - m.b - 12, Math.round(Math.min(150, height * 0.3)));
  const plot = svg.append('g').attr('clip-path', `url(#${clipId})`);
  const tint = plot.append('path').attr('fill', pal.binding).attr('fill-opacity', direction ? 0.07 : 0);
  const bandP = plot.append('path').attr('fill', pal.band).attr('fill-opacity', 0.8);
  const lineP = plot.append('path').attr('fill', 'none').attr('stroke', pal.fit).attr('stroke-width', 2);
  const gOthers = plot.append('g'), gPeers = plot.append('g'), gTrail = plot.append('g'), gTarget = plot.append('g'), gLabels = plot.append('g');
  const note = svg.append('text').attr('x', m.l + 8).attr('y', m.t + 16).attr('font-size', 12).attr('fill', pal.muted);
  if (direction) {
    const up = direction === 1;
    const side = (txt, top, bind) => svg.append('text').attr('x', width - m.r - 8).attr('y', top ? m.t + 16 : height - m.b - 8).attr('text-anchor', 'end')
      .attr('font-size', 12).attr('font-weight', 600).attr('fill', bind ? pal.binding : pal.muted).attr('stroke', pal.bg).attr('stroke-width', 4).attr('paint-order', 'stroke').text(txt);
    side(`▲ Above the line: ${up ? 'toward binding' : 'away from binding'}`, true, up);
    side(`▼ Below the line: ${up ? 'away from binding' : 'toward binding'}`, false, !up);
  }
  const area = D.area().x((d) => x(d.income)).defined((d) => d.lo != null && d.hi != null);
  const line = D.line().x((d) => x(d.income)).y((d) => y(d.y)).defined((d) => d.y != null);
  const yClamp = (v) => (transform === 'log' && !(v > 0) ? y.domain()[0] : v);
  const stale = (f, d) => f.year - d.year > limit;
  const title = (f, d) => `${name(d.iso3)}\n${fmtV(d.raw)} (${d.year})\nGDP per capita $${Math.round(d.income).toLocaleString('en-US')}${d.pop ? `\nPopulation ${(d.pop / 1e6).toFixed(d.pop < 1e7 ? 1 : 0)} million` : ''}${f.fit.ok && f.fit.t[d.iso3] != null ? `\n${(f.fit.t[d.iso3] >= 0 ? '+' : '−') + Math.abs(f.fit.t[d.iso3]).toFixed(2)} sd from the line` : ''}`;

  function bubbles(g, rows, f, ms, style) {
    const sel = g.selectAll('circle').data(rows, (d) => d.iso3);
    sel.exit().call((s) => tr(s, ms).attr('opacity', 0).remove());
    const ent = sel.enter().append('circle').attr('cx', (d) => x(d.income)).attr('cy', (d) => y(yClamp(d.raw))).attr('r', (d) => rad(d, style.min)).attr('opacity', 0);
    ent.append('title');
    const all = ent.merge(sel);
    all.select('title').text((d) => title(f, d));
    all.attr('fill', (d) => (stale(f, d) ? 'none' : style.fill)).attr('fill-opacity', style.fillOpacity).attr('stroke', style.stroke).attr('stroke-width', style.sw);
    tr(all, ms).attr('cx', (d) => x(d.income)).attr('cy', (d) => y(yClamp(d.raw))).attr('r', (d) => rad(d, style.min)).attr('opacity', 1);
  }

  function show(year, ms = 0) {
    const f = byYear.get(year);
    if (!f) return;
    yearText.text(String(year));
    const ln = f.fit.ok ? f.line : [];
    const edge = direction === 1 ? y.domain()[1] : y.domain()[0];
    tr(tint, ms).attr('d', ln.length ? area.y0((d) => y(yClamp(d.y))).y1(() => y(edge))(ln) : null);
    tr(bandP, ms).attr('d', ln.length ? area.y0((d) => y(yClamp(d.lo))).y1((d) => y(yClamp(d.hi)))(ln) : null);
    tr(lineP, ms).attr('d', ln.length ? line(ln) : null);
    const others = f.rows.filter((d) => d.iso3 !== iso && !peerSet.has(d.iso3)).sort((a, b) => (b.pop || 0) - (a.pop || 0));
    const pr = f.rows.filter((d) => peerSet.has(d.iso3) && d.iso3 !== iso).sort((a, b) => (b.pop || 0) - (a.pop || 0));
    const tg = f.rows.filter((d) => d.iso3 === iso);
    bubbles(gOthers, others, f, ms, { min: 2.5, fill: pal.other, fillOpacity: 0.35, stroke: pal.other, sw: 0.8 });
    bubbles(gPeers, pr, f, ms, { min: 4, fill: pal.peerFill, fillOpacity: 0.85, stroke: pal.peer, sw: 1.4 });
    // Trail: the economy's own positions in the years played so far (gaps where it has no point).
    const trail = frames.filter((g) => g.year <= year).map((g) => { const d = g.rows.find((q) => q.iso3 === iso); return d ? { year: g.year, income: d.income, y: yClamp(d.raw) } : { year: g.year, income: null, y: null }; });
    const tpath = gTrail.selectAll('path').data([trail]).join('path').attr('fill', 'none').attr('stroke', pal.focus).attr('stroke-width', 1.5).attr('stroke-opacity', 0.55);
    tpath.attr('d', D.line().defined((d) => d.income != null).x((d) => x(d.income)).y((d) => y(d.y)));
    gTrail.selectAll('circle').data(trail.filter((d) => d.income != null && d.year < year), (d) => d.year).join('circle')
      .attr('cx', (d) => x(d.income)).attr('cy', (d) => y(d.y)).attr('r', 2.2).attr('fill', pal.focus).attr('fill-opacity', 0.6);
    const ends = trail.filter((d) => d.income != null && d.year < year);
    gTrail.selectAll('text').data(ends.length ? [ends[0]] : [], (d) => d.year).join('text')
      .attr('x', (d) => x(d.income)).attr('y', (d) => y(d.y) + 14).attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', pal.focusInk).text((d) => String(d.year));
    bubbles(gTarget, tg, f, ms, { min: 6, fill: pal.focus, fillOpacity: 0.9, stroke: pal.focus, sw: 2 });
    // Labels: comparator codes and the economy with its distance from the line, gliding with their bubbles.
    const labs = [...pr.map((d) => ({ ...d, txt: d.iso3, main: false })), ...tg.map((d) => ({ ...d, txt: `${name(iso)} ${f.fit.ok && f.fit.t[iso] != null ? `${f.fit.t[iso] >= 0 ? '+' : '−'}${Math.abs(f.fit.t[iso]).toFixed(1)} sd` : ''}`, main: true }))];
    const left = (d) => x(d.income) > width - m.r - (d.main ? 170 : 50);
    const ls = gLabels.selectAll('text').data(labs, (d) => d.iso3);
    ls.exit().call((s) => tr(s, ms).attr('opacity', 0).remove());
    const le = ls.enter().append('text').attr('opacity', 0).attr('x', (d) => x(d.income)).attr('y', (d) => y(yClamp(d.raw)));
    const la = le.merge(ls).text((d) => d.txt).attr('font-size', (d) => (d.main ? 13 : 11)).attr('font-weight', 600)
      .attr('fill', (d) => (d.main ? pal.focusInk : pal.peer)).attr('stroke', pal.bg).attr('stroke-width', 3).attr('paint-order', 'stroke')
      .attr('text-anchor', (d) => (left(d) ? 'end' : 'start'));
    tr(la, ms).attr('opacity', 1)
      .attr('x', (d) => x(d.income) + (left(d) ? -1 : 1) * (rad(d, d.main ? 6 : 4) + 4))
      .attr('y', (d) => y(yClamp(d.raw)) + (d.main ? -rad(d, 6) - 2 : 4));
    note.text(!tg.length ? `${name(iso)}: no value within the window to ${year}` : !f.fit.ok ? `No line for ${year}: ${f.fit.reason}` : '');
  }
  const node = svg.node();
  node.setAttribute('aria-hidden', 'true');
  return { node, show };
}

/**
 * Chart 2 as a bar race over a fixed axis. opts: {frames, iso, peers, name, pal, xLabel, limit, width, fmtS(v), summary(values)}.
 * Returns {node, show(year, ms)}.
 */
export function barRace(opts) {
  const { frames, iso, name, pal, xLabel, limit, fmtS, summary } = opts;
  const D = d3();
  const width = Math.max(320, opts.width || 900);
  const rowH = 26, nMax = Math.max(2, ...frames.map((f) => f.rows.length));
  const labelOf = (d) => `${name(d.iso3)} ${d.year}`;
  const longest = Math.max(...frames.flatMap((f) => f.rows.map((d) => labelOf(d).length)), 8);
  const m = { l: Math.min(Math.round(width * 0.42), Math.max(110, Math.round(longest * 6.6))), r: 70, t: 30, b: 44 };
  const height = m.t + rowH * nMax + m.b;
  const vals = frames.flatMap((f) => f.rows.map((d) => d.value));
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), pad = (hi - lo) * 0.16 || 1;
  const x = D.scaleLinear().domain([lo < 0 ? lo - pad : 0, hi + pad]).range([m.l, width - m.r]).nice();
  const byYear = new Map(frames.map((f) => [f.year, f]));
  const svg = svgEl(width, height);
  const grid = svg.append('g').attr('stroke', pal.text).attr('stroke-opacity', 0.1);
  grid.selectAll('line').data(x.ticks(6)).join('line').attr('x1', (d) => x(d)).attr('x2', (d) => x(d)).attr('y1', m.t).attr('y2', height - m.b);
  const ax = svg.append('g').attr('fill', pal.text).attr('font-size', 11);
  ax.selectAll('text').data(x.ticks(6)).join('text').attr('x', (d) => x(d)).attr('y', height - m.b + 16).attr('text-anchor', 'middle').text(x.tickFormat(6));
  const maxChars = Math.floor((width - 8) / 6.2), narrow = width < 560;
  ax.append('text').attr('x', narrow ? 4 : m.l).attr('y', height - 6).attr('text-anchor', 'start').text(xLabel.length > maxChars ? `${xLabel.slice(0, maxChars - 1)}…` : xLabel);
  const band = svg.append('rect').attr('y', m.t).attr('height', height - m.t - m.b).attr('fill', pal.band).attr('fill-opacity', 0.8);
  svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', m.t).attr('y2', height - m.b).attr('stroke', pal.text).attr('stroke-opacity', 0.5);
  const med = svg.append('line').attr('y1', m.t).attr('y2', height - m.b).attr('stroke', pal.muted).attr('stroke-dasharray', '4,3').attr('stroke-width', 1.3);
  const medT = svg.append('text').attr('y', m.t - 12).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', pal.muted);
  const yearText = bigYear(svg, pal, width - m.r, height - m.b - 10, Math.round(Math.min(110, Math.max(48, height * 0.35))));
  const gRows = svg.append('g');

  function show(year, ms = 0) {
    const f = byYear.get(year);
    if (!f) return;
    yearText.text(String(year));
    const rows = f.rows.slice().sort((a, b) => b.value - a.value).map((d, i) => ({ ...d, i, stale: year - d.year > limit, own: d.iso3 === iso }));
    const s = summary(Object.fromEntries(f.rows.map((d) => [d.iso3, d.value])));
    tr(band, ms).attr('x', s ? x(s.q1) : x(0)).attr('width', s ? Math.max(0, x(s.q3) - x(s.q1)) : 0).attr('opacity', s ? 1 : 0);
    tr(med, ms).attr('x1', s ? x(s.median) : x(0)).attr('x2', s ? x(s.median) : x(0)).attr('opacity', s ? 1 : 0);
    medT.text(s ? `comparator median ${fmtS(s.median)}` : '');
    tr(medT, ms).attr('x', s ? x(s.median) : x(0));
    const yPos = (d) => m.t + d.i * rowH;
    const sel = gRows.selectAll('g.row').data(rows, (d) => d.iso3);
    sel.exit().call((g) => tr(g, ms).attr('opacity', 0).remove());
    const ent = sel.enter().append('g').attr('class', 'row').attr('opacity', 0).attr('transform', (d) => `translate(0,${yPos(d)})`);
    ent.append('rect'); ent.append('text').attr('class', 'lab'); ent.append('text').attr('class', 'val'); ent.append('title');
    const all = ent.merge(sel);
    tr(all, ms).attr('opacity', 1).attr('transform', (d) => `translate(0,${yPos(d)})`);
    all.select('title').text((d) => `${name(d.iso3)}\n${fmtS(d.value)} (${d.year})${d.stale ? `\nolder than ${limit} years` : ''}`);
    all.select('rect').attr('y', (d) => (d.own ? 2 : 4)).attr('height', (d) => rowH - (d.own ? 4 : 8))
      .attr('fill', (d) => (d.stale ? 'none' : d.own ? pal.focus : pal.peerFill)).attr('stroke', (d) => (d.own ? pal.focus : pal.peer))
      .attr('stroke-width', (d) => (d.own ? 1.5 : d.stale ? 1.2 : 0.8)).attr('stroke-dasharray', (d) => (d.stale && !d.own ? '3,2' : null));
    tr(all.select('rect'), ms).attr('x', (d) => x(Math.min(0, d.value))).attr('width', (d) => Math.abs(x(d.value) - x(0)));
    all.select('text.lab').attr('x', m.l - 6).attr('y', rowH / 2 + 4).attr('text-anchor', 'end').attr('font-size', 12)
      .attr('font-weight', (d) => (d.own ? 600 : 400)).attr('fill', (d) => (d.own ? pal.focusInk : pal.text)).text(labelOf);
    all.select('text.val').attr('y', rowH / 2 + 4).attr('font-size', (d) => (d.own ? 11.5 : 11)).attr('font-weight', (d) => (d.own ? 600 : 400))
      .attr('fill', (d) => (d.own ? pal.focusInk : pal.text)).attr('text-anchor', (d) => (d.value < 0 ? 'end' : 'start')).text((d) => fmtS(d.value));
    tr(all.select('text.val'), ms).attr('x', (d) => x(d.value) + (d.value < 0 ? -5 : 5));
  }
  const node = svg.node();
  node.setAttribute('aria-hidden', 'true');
  return { node, show };
}

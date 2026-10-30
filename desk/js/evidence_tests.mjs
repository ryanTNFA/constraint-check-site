// Evidence page, a node's tests (evidence-viz-prd phase 4): C5 price against quantity (test 1), C6 co-movement
// (test 2) and C8 bypass behaviour (test 3), drawn under the C9 strip where they apply. evidence.mjs owns the
// state and passes what these need in `ctx`, as it does for evidence_node.mjs.
import { h, fmt, fmtSigned, shortName, unitHint } from './common.mjs';
import { scatterRows, linearFit, priceQtyRows, pricePath, quadrant, comovePairs, peerBars } from './evidence_math.mjs';
import { isNum } from '../../engine/src/stats.mjs';

const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`; };
const trunc = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const style = (pal) => ({ background: 'transparent', color: pal.text, fontSize: '12px', fontFamily: 'Inter, system-ui, sans-serif' });
const unitOf = (ind) => unitHint(ind) || (/^Percent(age)? of firms/i.test(ind.name || '') ? '% of firms' : /\(%\)/.test(ind.name || '') ? '%' : '');
const num = (v) => fmt(v, Math.abs(v) < 10 ? 2 : 1).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
const short = (ind, v) => (unitOf(ind).startsWith('%') ? `${num(v)}%` : num(v));
const val = (ind, v) => { const u = unitOf(ind); return u.startsWith('%') ? `${num(v)}%` : u ? `${num(v)} ${u}` : num(v); };
const axisLabel = (ind, max) => { const u = unitOf(ind); return trunc(`${shortName(ind)}${u ? ` (${u})` : ''}`, max); };
/** Values older than this many years before the as-of year are drawn hollow or dashed (the registry's rule, as charts 1 and 2 use it). */
const staleLimit = (registry) => registry?.params?.recency?.staleness_limit_years || 8;
/** The unit of a year-on-year change: the indicator's own, except that a change in a percentage is in percentage points. */
const changeUnit = (ind, abbr) => { const u = ind ? unitOf(ind) : ''; return u.includes('%') ? `${abbr ? 'pp' : 'percentage points'}${u.startsWith('% of ') ? u.slice(1) : ''}` : u; };

const svgEl = (tag, attrs) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };

/** Stack Plot panels into one SVG (for export), each at [x, y]; nested SVGs keep their own size. */
function stack(panels, width, height) {
  const NS = 'http://www.w3.org/2000/svg';
  const wrap = document.createElementNS(NS, 'svg');
  wrap.setAttribute('width', width); wrap.setAttribute('height', height); wrap.setAttribute('viewBox', `0 0 ${width} ${height}`);
  wrap.setAttribute('class', 'ev-stack'); wrap.style.fontFamily = 'Inter, system-ui, sans-serif';
  for (const [el, x, y, hh] of panels) { el.setAttribute('x', x); el.setAttribute('y', y); el.style.height = `${hh}px`; el.style.maxWidth = 'none'; wrap.append(el); }
  return wrap;
}

// ---------- C5 price against quantity ----------
/** Default price and quantity per node (Mindbook figure 17); the first of each list with a fit is used. */
const FINANCE = { price: ['FR.INR.RINR', 'DERIV.REAL_LENDING_CPI'], qty: ['FS.AST.PRVT.GD.ZS', 'NE.GDI.FTOT.ZS'] };
export const PQ_DEFAULTS = {
  N0: FINANCE, N3: FINANCE,
  N1: { price: ['IMF.GBOND_SPREAD_US'], qty: ['BX.KLT.DINV.WD.GD.ZS'] },
  N2: { price: ['DERIV.REAL_DEPOSIT'], qty: ['NY.GNS.ICTR.ZS', 'IMF.NGSD_NGDP'] },
  N4: { price: ['RTS.MP_OVERALL'], qty: ['BL.YRS_2564'] },
  N5: { price: ['DB.ELEC_COST', 'IC.ELC.DURS'], qty: ['EG.USE.ELEC.KH.PC'] },
  N6: { price: ['ESCAP.TC_TOT_MED'], qty: ['NE.EXP.GNFS.ZS'] },
};

/**
 * The price and quantity choices for a node: prices are its class A indicators, quantities its class C ones,
 * plus the defaults; only indicators with an income fit. Null when the node has no default pair.
 */
export function pqChoices(registry, fits, view, scope) {
  const d = PQ_DEFAULTS[view];
  if (!d) return null;
  const ok = (id) => registry.indicatorById[id] && fits[id] && fits[id].ok;
  const inScope = (cls) => registry.indicators.indicators.filter((i) => cls.includes(i.class) && i.direction && (i.nodes || []).some((n) => scope.includes(n)) && ok(i.id)).map((i) => i.id);
  const uniq = (xs) => [...new Set(xs.filter(ok))];
  const price = uniq([...d.price, ...inScope(['A'])]), qty = uniq([...d.qty, ...inScope(['C', 'B'])]);
  return price.length && qty.length ? { price, qty, defPrice: d.price.find(ok) || price[0], defQty: d.qty.find(ok) || qty[0] } : null;
}

const QUAD = {
  'high|low': 'High price, low quantity: the pattern of scarce supply',
  'low|low': 'Low price, low quantity: the pattern of low demand',
  'high|high': 'High price, high quantity: strong demand',
  'low|high': 'Low price, high quantity: ample supply',
};
/** The same quadrants on narrow screens (P is the price, Q the quantity). */
const QS = { 'high|low': 'High P · low Q', 'high|high': 'High P · high Q', 'low|low': 'Low P · low Q', 'low|high': 'Low P · high Q' };

export function drawPriceQty(host, ctx) {
  const { P, pal, iso, peers, asOf, width: w0, countryName, pInd, qInd, pPanel, qPanel, inc, fitOpts, wP, wQ, axes, nameOf, registry } = ctx;
  host.replaceChildren();
  const width = Math.max(320, w0);
  const wide = width >= 760;
  const pw = wide ? Math.floor((width - 24) / 2) : width;
  const ph = Math.round(Math.min(380, Math.max(300, pw * 0.75)));
  const peerSet = new Set(peers);
  // A point is as old as the older of its two values.
  const limit = staleLimit(registry), old = (d) => asOf - Math.min(d.pYear, d.qYear) > limit;
  const transformOf = (ind) => ind.transform || 'none';
  // Distances from what income alone predicts (as chart 1 draws them), for the quadrant.
  const resid = (ind, panel, W) => { const f = linearFit(scatterRows(panel, inc, { asOfYear: asOf, windowYears: W, transform: transformOf(ind) }), fitOpts); return f.ok ? f.t : {}; };
  const tP = resid(pInd, pPanel, wP), tQ = resid(qInd, qPanel, wQ);
  const raw = priceQtyRows(pPanel, qPanel, asOf, wP, wQ);
  const pts = axes === 'raw'
    ? raw.map((r) => ({ ...r, x: r.q, y: r.p }))
    : raw.filter((r) => isNum(tP[r.iso3]) && isNum(tQ[r.iso3])).map((r) => ({ ...r, x: tQ[r.iso3], y: tP[r.iso3] }));
  const me = pts.find((r) => r.iso3 === iso);
  const quad = quadrant(tP[iso], tQ[iso], 0.75);
  const lim = 3.5, cl = (v) => Math.max(-lim, Math.min(lim, v));
  const plotPts = axes === 'raw' ? pts : pts.map((r) => ({ ...r, x: cl(r.x), y: cl(r.y) }));
  const others = plotPts.filter((r) => r.iso3 !== iso && !peerSet.has(r.iso3)), peerPts = plotPts.filter((r) => peerSet.has(r.iso3) && r.iso3 !== iso), mine = plotPts.filter((r) => r.iso3 === iso);
  const logOf = (ind) => (transformOf(ind) === 'log' ? 'log' : 'linear');
  const meOld = !!me && old(me);
  const meYears = !me ? '' : me.pYear === me.qYear ? `${me.pYear}` : pw < 520 ? `P ${me.pYear} · Q ${me.qYear}` : `price ${me.pYear} · quantity ${me.qYear}`;
  // Where Plot puts a value along an axis, from 0 to 1 (raw values span the data; distances span ±lim).
  const along = (k, ind) => {
    if (axes !== 'raw') return (v) => (v + lim) / (2 * lim);
    const t = logOf(ind) === 'log' ? Math.log : Number, vs = plotPts.map((r) => t(r[k])).filter(Number.isFinite), lo = Math.min(...vs), hi = Math.max(...vs);
    return (v) => (hi > lo ? (t(v) - lo) / (hi - lo) : 0.5);
  };
  const ax = along('x', qInd), ay = along('y', pInd), m0 = mine[0], fx = m0 ? ax(m0.x) : 0.5, fy = m0 ? ay(m0.y) : 0.5;
  const meAnchor = fx < 0.25 ? 'start' : fx > 0.75 ? 'end' : 'middle';
  // The economy's name goes above its point and its data years (both when they differ) below it, the pair reading away
  // from the nearer side edge. Where that would cover a comparator's dot or label or a quadrant label, or leave the
  // plot, both go above the point (the top margin then clears the y-axis label) or both below: whichever covers least.
  const lay = [[-13, 15, 20], [-26, -13, Math.max(20, Math.ceil(50 - (1 - fy) * (ph - 64))) || 20], [15, 28, 20]].map(([dn, dy, top]) => {
    if (!m0) return { dn, dy, top, cost: 0 };
    const X = (v) => 52 + ax(v) * (pw - 74), Y = (v) => top + (1 - ay(v)) * (ph - top - 44), x = X(m0.x), y = Y(m0.y);
    const box = (w, c, hh) => { const x0 = meAnchor === 'start' ? x - 6 : meAnchor === 'end' ? x + 6 - w : x - w / 2; return [x0, x0 + w, y + c - hh / 2, y + c + hh / 2]; };
    const obst = peerPts.flatMap((r) => { const px = X(r.x), py = Y(r.y); return [[px - 5, px + 5, py - 5, py + 5], [px + 7, px + 7 + 7.2 * r.iso3.length, py - 6.5, py + 6.5]]; })
      .concat(axes === 'raw' ? [] : [['high|low', 0, 0], ['high|high', 1, 0], ['low|low', 0, 1], ['low|high', 1, 1]].map(([k, right, bottom]) => { const w = 5.2 * (pw < 520 ? QS[k] : QUAD[k]).length, x0 = right ? pw - 28 - w : 58, y0 = bottom ? ph - 60 : top + 4; return [x0, x0 + w, y0, y0 + 13]; }));
    const cost = [box(7.2 * countryName.length, dn, 15), box(5.6 * meYears.length, dy, 13)].reduce((s, [a, b, c, d]) => s + (a < 0 || b > pw || c < 15 || d > ph - 44 ? 9 : 0) + obst.filter(([e, f, g, k]) => a + 1 < f && e + 1 < b && c + 1 < k && g + 1 < d).length, 0);
    return { dn, dy, top, cost };
  }).reduce((a, b) => (b.cost < a.cost ? b : a));
  const meText = (text, dy, fontSize, fontWeight) => P.text(mine, { x: 'x', y: 'y', text: () => text, textAnchor: meAnchor, dx: meAnchor === 'start' ? -6 : meAnchor === 'end' ? 6 : 0, dy, fontSize, fontWeight, fill: pal.focusInk, stroke: pal.surface, strokeWidth: 3, paintOrder: 'stroke' });
  const marks = [];
  if (axes !== 'raw') {
    // Tint the scarce-supply quadrant (high price, low quantity), the one its crimson label names (PRD 8.1).
    marks.push(P.rect([0], { x1: -lim, x2: 0, y1: 0, y2: lim, fill: pal.binding, fillOpacity: 0.06 }));
    marks.push(P.ruleX([0], { stroke: pal.text, strokeOpacity: 0.5 }), P.ruleY([0], { stroke: pal.text, strokeOpacity: 0.5 }));
    const corner = (anchor, key, dy) => P.text([pw < 520 ? QS[key] : QUAD[key]], { frameAnchor: anchor, dx: anchor.endsWith('left') ? 6 : -6, dy, fontSize: 10.5, fill: key === 'high|low' ? pal.binding : pal.muted, fontWeight: key === 'high|low' ? 600 : 400, lineWidth: Math.max(10, Math.floor(pw / 15)) });
    marks.push(corner('top-left', 'high|low', 6), corner('top-right', 'high|high', 6), corner('bottom-left', 'low|low', -6), corner('bottom-right', 'low|high', -6));
  }
  marks.push(
    P.dot(others, { x: 'x', y: 'y', r: 2.4, fill: (d) => (old(d) ? 'none' : pal.other), fillOpacity: 0.55, stroke: pal.other, strokeWidth: 0.8 }),
    P.dot(peerPts, { x: 'x', y: 'y', r: 4.2, fill: (d) => (old(d) ? 'none' : pal.peerFill), stroke: pal.peer, strokeWidth: 1.3 }),
    P.text(peerPts, { x: 'x', y: 'y', text: 'iso3', dx: 7, textAnchor: 'start', fontSize: 10.5, fontWeight: 600, fill: pal.peer }),
    P.dot(mine, { x: 'x', y: 'y', r: 7, fill: meOld ? 'none' : pal.focus, stroke: meOld ? pal.focus : pal.surface, strokeWidth: meOld ? 2 : 1.5 }),
    meText(countryName, lay.dn, 12.5, 600), meText(meYears, lay.dy, 10.5, 500),
    P.tip(plotPts, P.pointer({ x: 'x', y: 'y', title: (d) => `${nameOf(d.iso3)}\n${shortName(pInd)}: ${val(pInd, d.p)} (${d.pYear})${isNum(tP[d.iso3]) ? `, ${fmtSigned(tP[d.iso3], 1)} sd` : ''}\n${shortName(qInd)}: ${val(qInd, d.q)} (${d.qYear})${isNum(tQ[d.iso3]) ? `, ${fmtSigned(tQ[d.iso3], 1)} sd` : ''}${old(d) ? `\nolder than ${limit} years` : ''}` })),
  );
  const maxCh = Math.floor(pw / 7.2);
  const left = P.plot({
    width: pw, height: ph, marginLeft: 52, marginRight: 22, marginTop: lay.top, marginBottom: 44, style: style(pal),
    x: axes === 'raw' ? { type: logOf(qInd), label: `${axisLabel(qInd, maxCh - 2)} →`, grid: true } : { domain: [-lim, lim], label: trunc(`${shortName(qInd)}: sd from income trend →`, maxCh), grid: true, tickFormat: (d) => (d === 0 ? '0' : fmtSigned(d, 0)) },
    y: axes === 'raw' ? { type: logOf(pInd), label: `↑ ${axisLabel(pInd, maxCh - 2)}`, grid: true } : { domain: [-lim, lim], label: trunc(`↑ ${shortName(pInd)}: sd from income trend`, maxCh), grid: true, tickFormat: (d) => (d === 0 ? '0' : fmtSigned(d, 0)) },
    marks,
  });
  // Right: the economy's own path, one point a year, labelled at the ends.
  const path = pricePath(pPanel, qPanel, iso, asOf - 29, asOf, 3);
  let right = null;
  if (path.length >= 2) {
    const ends = [path[0], path[path.length - 1]];
    right = P.plot({
      width: pw, height: ph, marginLeft: 52, marginRight: 30, marginTop: lay.top, marginBottom: 44, style: style(pal),
      x: { type: logOf(qInd), label: `${axisLabel(qInd, maxCh - 2)} →`, grid: true, nice: true },
      y: { type: logOf(pInd), label: `↑ ${axisLabel(pInd, maxCh - 2)}`, grid: true, nice: true },
      marks: [
        P.line(path, { x: 'q', y: 'p', stroke: pal.focus, strokeWidth: 1.6, strokeOpacity: 0.8, curve: 'linear', markerEnd: 'arrow' }),
        P.dot(path, { x: 'q', y: 'p', r: 2.6, fill: pal.focus, fillOpacity: 0.7 }),
        P.dot(ends, { x: 'q', y: 'p', r: 5, fill: (d) => (d === ends[0] ? pal.surface : pal.focus), stroke: pal.focus, strokeWidth: 2 }),
        P.text(path.filter((d, i) => i > 0 && i < path.length - 1 && d.year % 5 === 0), { x: 'q', y: 'p', text: (d) => String(d.year), dy: -8, fontSize: 10, fill: pal.muted, stroke: pal.surface, strokeWidth: 3, paintOrder: 'stroke' }),
        P.text(ends, { x: 'q', y: 'p', text: (d) => String(d.year), dy: -11, fontSize: 11.5, fontWeight: 600, fill: pal.focusInk, stroke: pal.surface, strokeWidth: 3, paintOrder: 'stroke' }),
        P.text([`${countryName}, ${path[0].year}–${path[path.length - 1].year}, three-year means`], { frameAnchor: 'top-left', dx: 6, dy: 4, fontSize: 11, fill: pal.muted }),
        P.tip(path, P.pointer({ x: 'q', y: 'p', title: (d) => `${countryName} ${d.year}\n${shortName(pInd)}: ${val(pInd, d.p)}\n${shortName(qInd)}: ${val(qInd, d.q)}` })),
      ],
    });
  }
  const parts = right ? (wide ? [[left, 0, 0, ph], [right, pw + 24, 0, ph]] : [[left, 0, 0, ph], [right, 0, ph + 16, ph]]) : [[left, 0, 0, ph]];
  const H = right && !wide ? 2 * ph + 16 : ph;
  host.append(stack(parts, wide || !right ? width : pw, H));

  const text = [];
  if (quad) {
    const side = (t) => (Math.abs(t) < 0.05 ? 'at' : `${fmt(Math.abs(t), 1)} sd ${t > 0 ? 'above' : 'below'}`);
    const key = `${quad.price}|${quad.qty}`;
    text.push(`On income alone, ${countryName}'s ${lower(shortName(pInd))}${me ? ` (${me.pYear})` : ''} is <strong>${side(tP[iso])}</strong> what its income predicts and its ${lower(shortName(qInd))}${me ? ` (${me.qYear})` : ''} is <strong>${side(tQ[iso])}</strong>.`);
    text.push(QUAD[key] ? `That puts it in the <strong>${QUAD[key].split(':')[0].toLowerCase()}</strong> quadrant.` : 'Within 0.75 standard deviations of what income predicts on at least one of them, it gets no quadrant reading.');
  } else if (!me) {
    text.push(`${countryName} lacks a value for ${!isNum(tP[iso]) ? lower(shortName(pInd)) : lower(shortName(qInd))} within the window, so it has no point.`);
  }
  if (meOld) { const olds = [['price', me.pYear], ['quantity', me.qYear]].filter(([, y]) => asOf - y > limit).map(([k]) => k); text.push(`Its point is hollow: its ${olds.join(' and ')} ${olds.length > 1 ? 'values are' : 'value is'} more than ${limit} years old.`); }
  if (path.length >= 2) {
    const a = path[0], b = path[path.length - 1];
    text.push(`From ${a.year} to ${b.year} the ${lower(shortName(pInd))} went from ${val(pInd, a.p)} to ${val(pInd, b.p)}, and the ${lower(shortName(qInd))} from ${val(qInd, a.q)} to ${val(qInd, b.q)}.`);
  } else {
    text.push(`${countryName} has fewer than two years with both values, so there is no path to draw.`);
  }
  const csv = ['iso3,price_value,price_year,price_sd_income,quantity_value,quantity_year,quantity_sd_income,role'];
  for (const r of raw) csv.push([r.iso3, r.p, r.pYear, tP[r.iso3] ?? '', r.q, r.qYear, tQ[r.iso3] ?? '', r.iso3 === iso ? 'target' : peerSet.has(r.iso3) ? 'comparator' : ''].join(','));
  csv.push('', 'year,price,quantity');
  for (const r of path) csv.push([r.year, r.p, r.q].join(','));
  csv.push('', `# price ${pInd.id}; quantity ${qInd.id}. Distances: income-only Huber fit, as chart 1.`);
  return { csv, text: text.join(' '), n: pts.length };
}

// ---------- C6 co-movement ----------
/** One two-panel stack per co-movement check: the price change (the year before) above the investment change. */
export function drawComove(host, ctx) {
  const { P, pal, iso, width: w0, countryName, items, registry } = ctx;
  host.replaceChildren();
  const width = Math.max(320, w0);
  const panels = [], csv = ['check,year,x_year,change_x,change_y,agrees'], text = [];
  // The unit is kept whole (abbreviated on a phone) and the name gives way when the label is too long.
  const yLabel = (s, ind) => { const u = changeUnit(ind, width < 560), tail = u ? ` (${u})` : ''; return `${trunc(s, Math.floor(width / 6.2) - tail.length)}${tail}`; };
  const withUnit = (v, ind) => { const u = changeUnit(ind); return `${fmtSigned(v, 2)}${u ? ` ${u}` : ''}`; };
  let y0 = 0;
  for (const { spec: c, xPanel, yPanel } of items) {
    const xi = registry.indicatorById[c.x], yi = registry.indicatorById[c.y];
    const r = comovePairs(xPanel, yPanel, iso, { first: c.window[0], last: c.window[1], lag: c.lag, expectedSign: c.expected_sign });
    const xName = xi ? shortName(xi) : c.x, yName = yi ? shortName(yi) : c.y;
    if (!r.rows.length) { text.push(`${countryName} has no years with both ${lower(xName)} and ${lower(yName)} changes.`); continue; }
    const fill = (d) => (d.agree === true ? pal.focus : d.agree === false ? pal.other : 'none');
    const bars = (field) => P.rectY(r.rows, { x1: (d) => d.year - 0.38, x2: (d) => d.year + 0.38, y: field, fill, fillOpacity: (d) => (d.agree ? 0.95 : 0.6), stroke: (d) => (d.agree === null ? pal.muted : 'none'), strokeDasharray: '2,2' });
    const xd = [c.window[0] - 0.6, c.window[1] + 0.6];
    const hTop = 170, hBot = 170;
    const sign = c.expected_sign < 0 ? 'opposite' : 'same';
    const top = P.plot({
      width, height: hTop, marginLeft: 56, marginRight: 20, marginTop: 50, marginBottom: 8, style: style(pal),
      x: { domain: xd, axis: null }, y: { label: yLabel(`↑ Change in ${lower(xName)}, the year before`, xi), grid: true, nice: true },
      marks: [
        P.ruleY([0], { stroke: pal.text, strokeOpacity: 0.6 }), bars('dx'),
        P.text([`■ moved as predicted (${r.agree})`], { frameAnchor: 'top-left', dy: -26, fontSize: 11, fontWeight: 600, fill: pal.focusInk }),
        P.text([`■ did not (${r.n - r.agree})`], { frameAnchor: 'top-left', dy: -26, dx: 170, fontSize: 11, fill: pal.muted }),
        // On a phone the legend takes the width; the footnote says what is predicted.
        ...(width < 560 ? [] : [P.text([`Predicted: the two move in ${sign} directions`], { frameAnchor: 'top-right', dy: -26, fontSize: 11, fill: pal.muted })]),
        P.tip(r.rows, P.pointerX({ x: 'year', y: 'dx', title: (d) => `${xName}, ${d.xYear} to ${d.xYear + 1}: ${withUnit(d.dx, xi)}` })),
      ],
    });
    const bottom = P.plot({
      width, height: hBot, marginLeft: 56, marginRight: 20, marginTop: 10, marginBottom: 30, style: style(pal),
      x: { domain: xd, tickFormat: 'd', label: null }, y: { label: yLabel(`↑ Change in ${lower(yName)}`, yi), grid: true, nice: true },
      marks: [
        P.ruleY([0], { stroke: pal.text, strokeOpacity: 0.6 }), bars('dy'),
        P.tip(r.rows, P.pointerX({ x: 'year', y: 'dy', title: (d) => `${yName}, ${d.year - 1} to ${d.year}: ${withUnit(d.dy, yi)}\n${d.agree === null ? 'A zero change: not counted' : d.agree ? 'Moved as predicted' : 'Did not move as predicted'}` })),
      ],
    });
    panels.push([top, 0, y0, hTop], [bottom, 0, y0 + hTop, hBot]);
    y0 += hTop + hBot + 18;
    const verb = c.expected_sign < 0 ? 'against' : 'with';
    if (c.pairs > 0 && isNum(c.p_value) && c.agree != null) {
      const how = !c.signal ? 'no more often than chance would give (one-sided binomial test)'
        : c.signal > 0 ? 'more often than chance, as the hypothesis predicts' : 'the opposite way more often than chance would give, against the hypothesis';
      text.push(`<strong>${yName} moved ${verb} ${lower(xName)} in ${c.agree} of ${c.pairs} years</strong> (p = ${fmt(c.p_value, 2)}): ${how}. The verdict layer scores it ${c.signal > 0 ? `+${c.signal}` : c.signal || 0} on a scale from −2 to +2.`);
    } else {
      text.push(`${yName} against ${lower(xName)}: ${r.n} years with both changes, fewer than the ${c.insufficient ? 'minimum the verdict layer needs' : 'verdict layer uses'}, so it is not scored.`);
    }
    for (const p of r.rows) csv.push([c.id, p.year, p.xYear, p.dx, p.dy, p.agree === null ? 'zero change' : p.agree].join(','));
  }
  if (panels.length) host.append(stack(panels, width, y0 - 18));
  else host.append(h('p', { class: 'ev-empty' }, text.join(' ') || 'No co-movement data.'));
  return { csv, text: panels.length ? text.join(' ') : '' };
}

// ---------- C8 bypass behaviour ----------
/** A small peer comparison for each circumvention indicator of the node, two to a row on wide screens. */
export function drawBypass(host, ctx) {
  const { P, pal, iso, peers, asOf, width: w0, countryName, items, windowOf, nameOf, onPick, registry } = ctx;
  host.replaceChildren();
  const width = Math.max(320, w0);
  const cols = width >= 760 ? 2 : 1;
  const cw = Math.floor((width - (cols - 1) * 24) / cols);
  // The left margin fits the widest tick, "WSM 2023" (66 px in 12 px Inter), with its 6 px padding.
  const limit = staleLimit(registry), ml = 76;
  const built = [], csv = ['indicator,iso3,value,year,role'], lines = [];
  for (const { ind, panel } of items) {
    const W = windowOf(ind);
    const pb = peerBars(panel, iso, peers, asOf, W);
    if (!pb.rows.find((r) => r.iso3 === iso)) { lines.push({ ind, missing: true }); continue; }
    // As chart 2 draws them: comparators older than the staleness limit are dashed outlines, the economy a hollow bar.
    const rows = pb.rows.slice().sort((a, b) => b.value - a.value).map((r) => ({ ...r, stale: asOf - r.year > limit }));
    const yearOf = Object.fromEntries(rows.map((r) => [r.iso3, r.year]));
    const height = 46 + 17 * rows.length + 34;
    const hi = Math.max(0, ...rows.map((r) => r.value)), lo = Math.min(0, ...rows.map((r) => r.value));
    const bypassUp = ind.direction === 1;
    const mine = rows.filter((r) => r.iso3 === iso), theirs = rows.filter((r) => r.iso3 !== iso);
    const sub = [`Class ${ind.class}`, pb.summary && `median ${num(pb.summary.median)}`, rows.some((r) => r.stale) && `hollow: before ${asOf - limit}`, 'click to chart'].filter(Boolean).join(' · ');
    const chart = P.plot({
      width: cw, height, marginLeft: ml, marginRight: 48, marginTop: 46, marginBottom: 34, style: style(pal),
      x: { domain: [lo, hi * 1.08 || 1], label: trunc(`${bypassUp ? '' : '← '}${unitOf(ind) || 'value'}${bypassUp ? ' →' : ''} · ${bypassUp ? 'higher' : 'lower'} = more bypass`, Math.floor(cw / 6.8)), labelAnchor: bypassUp ? 'right' : 'left', grid: true, ticks: 4 },
      y: { domain: rows.map((r) => r.iso3), label: null, tickSize: 0, tickPadding: 6, tickFormat: (k) => `${k} ${yearOf[k]}` },
      marks: [
        ...(pb.summary ? [P.ruleX([pb.summary.median], { stroke: pal.muted, strokeDasharray: '4,3' })] : []),
        P.barX(theirs.filter((r) => !r.stale), { y: 'iso3', x: 'value', fill: pal.peerFill, stroke: pal.peer, strokeWidth: 0.8, insetTop: 2, insetBottom: 2 }),
        P.barX(theirs.filter((r) => r.stale), { y: 'iso3', x: 'value', fill: 'none', stroke: pal.peer, strokeWidth: 1.2, strokeDasharray: '3,2', insetTop: 2, insetBottom: 2 }),
        P.barX(mine, { y: 'iso3', x: 'value', fill: (d) => (d.stale ? 'none' : pal.focus), stroke: pal.focus, strokeWidth: 1.5, insetTop: 1, insetBottom: 1 }),
        P.text(rows, { y: 'iso3', x: 'value', text: (d) => num(d.value), dx: 4, textAnchor: 'start', fontSize: 10, fill: (d) => (d.iso3 === iso ? pal.focusInk : pal.muted), fontWeight: (d) => (d.iso3 === iso ? 600 : 400) }),
        P.text([trunc(shortName(ind), Math.floor(cw / 7))], { frameAnchor: 'top-left', dx: 4 - ml, dy: -38, fontSize: 12, fontWeight: 600, fill: pal.text }),
        P.text([trunc(sub, Math.floor(cw / 5.2))], { frameAnchor: 'top-left', dx: 4 - ml, dy: -22, fontSize: 10.5, fill: pal.muted }),
        P.tip(rows, P.pointerY({ y: 'iso3', x: 'value', title: (d) => `${nameOf(d.iso3)}\n${val(ind, d.value)} (${d.year})${d.stale ? `\nolder than ${limit} years` : ''}` })),
      ],
    });
    chart.querySelectorAll('g[aria-label="y-axis tick label"] text').forEach((n) => { if (n.textContent.startsWith(`${iso} `)) { n.setAttribute('font-weight', '700'); n.setAttribute('fill', pal.focusInk); } });
    // Each panel is a button for the mouse and the keyboard. A nested svg takes clicks only where something is painted,
    // so an unpainted rect under the marks gives it the whole panel; and Chrome does not paint the page's
    // :focus-visible outline on a nested svg, so the panel draws that ring itself, in the outline's colour.
    chart.prepend(svgEl('rect', { width: cw, height, fill: 'none', 'pointer-events': 'all' }));
    chart.style.cursor = 'pointer'; chart.style.outlineStyle = 'none';
    for (const [k, v] of Object.entries({ tabindex: '0', role: 'button', 'aria-label': `Chart ${shortName(ind)} below` })) chart.setAttribute(k, v);
    chart.addEventListener('click', () => onPick(ind.id), true);
    const ring = svgEl('rect', { x: 1, y: 1, width: cw - 2, height: height - 2, fill: 'none', 'stroke-width': 2 });
    chart.addEventListener('focus', () => { if (chart.matches(':focus-visible')) { ring.setAttribute('stroke', getComputedStyle(chart).outlineColor); chart.append(ring); } });
    chart.addEventListener('blur', () => ring.remove());
    chart.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); onPick(ind.id); } });
    built.push({ chart, height });
    for (const r of pb.rows) csv.push([ind.id, r.iso3, r.value, r.year, r.iso3 === iso ? 'target' : 'comparator'].join(','));
    const me = pb.rows.find((r) => r.iso3 === iso);
    const sideOf = pb.summary ? ((me.value - pb.summary.median) * ind.direction > 0 ? 'more' : (me.value - pb.summary.median) * ind.direction < 0 ? 'less' : 'as much') : null;
    lines.push({ ind, me, rank: pb.rank, summary: pb.summary, side: sideOf });
  }
  if (!built.length) { host.append(h('p', { class: 'ev-empty' }, `${countryName} has no value within the window for any bypass measure of this node.`)); return { csv: null, text: '' }; }
  const parts = [];
  let y = 0;
  for (let i = 0; i < built.length; i += cols) {
    const row = built.slice(i, i + cols), rh = Math.max(...row.map((b) => b.height));
    row.forEach((b, j) => parts.push([b.chart, j * (cw + 24), y, b.height]));
    y += rh + 12;
  }
  host.append(stack(parts, width, y - 12));
  const withPeers = lines.filter((l) => !l.missing && l.side);
  // "Binding side", not "working around": several test 3 measures (crowding out, firms needing no loan, bank
  // liquidity) are not workarounds, so the readout names the side of the median each sits on, both ways.
  const more = withPeers.filter((l) => l.side === 'more'), less = withPeers.filter((l) => l.side === 'less');
  const list = (ls) => ls.map((l) => `${lower(shortName(l.ind))} (${short(l.ind, l.me.value)} in ${l.me.year} against ${short(l.ind, l.summary.median)})`).join('; ');
  const text = withPeers.length
    ? `On <strong>${more.length} of ${withPeers.length}</strong> test 3 measures with comparator data, ${countryName} is on the binding side of its comparator median${more.length ? `: ${list(more)}` : ''}.${less.length ? ` On the other side: ${list(less)}.` : ''}${lines.some((l) => l.missing) ? ` No recent value: ${lines.filter((l) => l.missing).map((l) => lower(shortName(l.ind))).join(', ')}.` : ''}`
    : '';
  return { csv, text };
}

// ---------- C12 camels and hippos (test 4) ----------
/** Which intensity vectors speak to which node (ingest/camels.py writes them). */
export const CAMEL_VECTORS = { N0: ['finance_dependence'], N3: ['finance_dependence'], N4: ['schooling'], N6: ['time_sensitivity'] };
/** 1-based rank from the most camels (lowest theta), from the stored percentile. */
const camelRank = (pn) => Math.round((pn.pctile / 100) * (pn.n - 1)) + 1;
const CAMEL_FACTOR = { finance_dependence: 'external finance', schooling: 'skilled workers', time_sensitivity: 'fast, reliable transport' };

/**
 * One panel per intensity vector: every HS 4-digit product the economy could export, placed by how
 * intensively it uses the factor (percentile, x) and by how much more the economy exports of it than its
 * income predicts (ln(1 + RCA) residual, y). The slope is theta. A falling line is the camels pattern.
 */
export function drawCamels(host, ctx) {
  const { P, pal, width: w0, countryName, panels } = ctx;
  host.replaceChildren();
  const width = Math.max(320, w0);
  const cols = width >= 760 && panels.length > 1 ? 2 : 1;
  const cw = Math.floor((width - (cols - 1) * 24) / cols);
  const built = [], csv = ['vector,hs4,product,intensity_percentile,export_residual_ln1p_rca'], lines = [];
  for (const pn of panels) {
    const rows = pn.codes.map((c, i) => ({ code: c, name: pn.names[i] || c, x: pn.pct[i], y: pn.resid[i] })).filter((r) => isNum(r.y));
    if (!rows.length) continue;
    const ys = rows.map((r) => r.y).sort((a, b) => a - b);
    const lim = Math.max(0.5, Math.abs(ys[Math.floor(ys.length * 0.01)]), Math.abs(ys[Math.ceil(ys.length * 0.99) - 1]));
    // The line is the fitted tilt itself, m + theta * z, so it always slopes the way theta does (a separate fit in
    // percentile space could slope the other way).
    const line = pn.z ? pn.codes.map((c, i) => ({ x: pn.pct[i], y: (pn.m || 0) + pn.theta * pn.z[i] })).sort((a, b2) => a.x - b2.x) : [];
    // Label the most over- and under-exported products inside the axis (clipped ones would stack on the edge),
    // skipping any that would sit on top of a label already placed.
    // Industry averages: products that share an intensity value come from one source industry.
    const byInd = new Map();
    for (const r of rows) { const k = r.x; if (!byInd.has(k)) byInd.set(k, []); byInd.get(k).push(r.y); }
    const inds = [...byInd].filter(([, ys]) => ys.length >= 3).map(([x, ys]) => ({ x, y: ys.reduce((a, b2) => a + b2, 0) / ys.length, n: ys.length }));
    const ranked = rows.filter((r) => Math.abs(r.y) < lim * 0.92).sort((a, b2) => b2.y - a.y);
    const lab = [];
    // Horizontal extent of a label in x units: it reads rightward from the dot, or leftward right of 70.
    const perUnit = (cw - 64) / 100;
    const span = (r) => { const w = (Math.min(24, r.name.replace(/;.*$/, '').length) * 5.6 + 8) / perUnit; return r.x > 70 ? [r.x - w, r.x] : [r.x, r.x + w]; };
    const clear = (r) => lab.every((l) => { const [a0, a1] = span(l), [b0, b1] = span(r); return a1 < b0 || b1 < a0 || Math.abs(l.y - r.y) > lim * 0.14; });
    for (const r of ranked) { if (lab.length >= 3) break; if (clear(r)) lab.push(r); }
    for (const r of ranked.slice().reverse()) { if (lab.length >= 6) break; if (clear(r)) lab.push(r); }
    const height = Math.round(Math.min(420, Math.max(260, cw * 0.62)));
    const clip = (v) => Math.max(-lim, Math.min(lim, v));
    const chart = P.plot({
      width: cw, height, marginLeft: 48, marginRight: 16, marginTop: 58, marginBottom: 40, style: style(pal),
      x: { domain: [0, 100], label: trunc(`Needs more ${CAMEL_FACTOR[pn.name] || 'of the factor'} (percentile of products) →`, Math.floor(cw / 6.6)), labelAnchor: 'right', ticks: 5 },
      y: { domain: [-lim, lim], label: null, grid: true, ticks: 5 },
      marks: [
        P.ruleY([0], { stroke: pal.muted, strokeOpacity: 0.6 }),
        P.dot(rows, { x: 'x', y: (d) => clip(d.y), r: 2.2, fill: pal.other, fillOpacity: 0.35, symbol: (d) => (Math.abs(d.y) > lim ? 'triangle' : 'circle') }),
        P.dot(inds, { x: 'x', y: (d) => clip(d.y), r: (d) => 2.5 + Math.sqrt(d.n), stroke: pal.text, strokeOpacity: 0.55, strokeWidth: 1, fill: 'none' }),
        P.line(line, { x: 'x', y: 'y', stroke: pal.fit, strokeWidth: 2.5 }),
        P.dot(lab, { x: 'x', y: (d) => clip(d.y), r: 3, fill: pal.text }),
        // textAnchor and dx are constants in Plot, so labels right of 70 get their own mark and read leftward.
        ...[[lab.filter((d) => d.x <= 70), 'start', 6], [lab.filter((d) => d.x > 70), 'end', -6]].map(([ls, anchor, dx]) => P.text(ls, { x: 'x', y: (d) => clip(d.y), text: (d) => trunc(d.name.replace(/;.*$/, ''), 24), dx, textAnchor: anchor, fontSize: 10, fill: pal.text, stroke: pal.surface, strokeWidth: 3, paintOrder: 'stroke' })),
        P.text([trunc(`${pn.label}`, Math.floor(cw / 7))], { frameAnchor: 'top-left', dx: -44, dy: -48, fontSize: 12, fontWeight: 600, fill: pal.text }),
        P.text([`θ = ${fmtSigned(pn.theta, 3)} (se ${fmt(pn.se, 3)}) · rank ${camelRank(pn)} of ${pn.n}, 1 = most camels · ${pn.year}${isNum(pn.coverage) ? ` · covers ${Math.round(pn.coverage * 100)}% of exports` : ''}`], { frameAnchor: 'top-left', dx: -44, dy: -31, fontSize: 10.5, fill: pal.muted }),
        P.text(['↑ exports more than income predicts'], { frameAnchor: 'top-left', dx: -44, dy: -9, fontSize: 10.5, fill: pal.muted }),
        P.tip(rows, P.pointer({ x: 'x', y: (d) => clip(d.y), title: (d) => `${d.name} (HS ${d.code})\nIntensity: ${Math.round(d.x)}th percentile of products\nExports ${d.y >= 0 ? 'above' : 'below'} what income predicts by ${fmt(Math.abs(d.y), 2)} in ln(1 + RCA)` })),
      ],
    });
    built.push({ chart, height });
    for (const r of rows) csv.push([pn.name, r.code, `"${r.name.replace(/"/g, '""')}"`, r.x, r.y].join(','));
    lines.push(pn);
  }
  if (!built.length) { host.append(h('p', { class: 'ev-empty' }, `${countryName} has too few exports in the latest year to estimate the test.`)); return { csv: null, text: '' }; }
  const parts = [];
  let y = 0;
  for (let i = 0; i < built.length; i += cols) {
    const row = built.slice(i, i + cols), rh = Math.max(...row.map((bb) => bb.height));
    row.forEach((bb, j) => parts.push([bb.chart, j * (cw + 24), y, bb.height]));
    y += rh + 12;
  }
  host.append(stack(parts, width, y - 12));
  // Describe the pattern; never call the node (the Evidence layer shows, the verdict layer decides).
  const say = (pn) => {
    const sig = Math.abs(pn.theta) >= 2 * pn.se;
    const factor = CAMEL_FACTOR[pn.name];
    const pattern = !sig
      ? `no clear pattern: θ is within two standard errors of zero, so ${countryName}'s exports lean neither toward nor away from products that need ${factor} once income is allowed for`
      : pn.theta < 0
      ? `the camels pattern: ${countryName} exports less of the products that need ${factor} than its income predicts, and more of those that need little`
      : `the hippos pattern: ${countryName} exports more of the products that need ${factor} than its income predicts`;
    // What the test cannot see: exports with no intensity value (unprocessed farm goods, minerals for the ISIC-based vectors).
    const miss = (pn.unscored || []).filter((u) => u[1] >= 0.02).map((u) => `${u[2] ? lower(String(u[2]).replace(/;.*$/, '')) : `unspecified goods (HS ${u[0]})`} (${Math.round(u[1] * 100)}%)`);
    const cover = isNum(pn.coverage) ? ` The products it scores make up ${Math.round(pn.coverage * 100)}% of ${countryName}'s ${pn.year} goods exports${miss.length ? `; not scored: ${miss.join(', ')}` : ''}.` : '';
    const f = pn.fam;
    const inRating = pn.votes && f && isNum(f.signal)
      ? ` In the rating it enters ${f.node} as <strong>${fmtSigned(f.signal, 1)}</strong>: its θ is at the ${ordinal(Math.round(pn.pctile))} percentile of ${pn.n} economies${f.signal === 0 ? (Math.abs(pn.theta) < 2 * pn.se ? ', and within two standard errors of zero, so it scores 0' : ', between the bands that score') : ''} (the workbook's percentile bands: 10th or below +2, 25th +1, 75th −1, 90th or above −2, oriented so camels point toward binding).`
      : ' It is shown here but not counted in the rating: this vector did not pass its placebo check (see the rubric changelog).';
    return `<strong>${pn.label.charAt(0).toUpperCase() + pn.label.slice(1)}</strong>: θ = ${fmtSigned(pn.theta, 3)} (se ${fmt(pn.se, 3)}, clustered by ${pn.se_cluster || 'source industry'}), ${pattern}. It ranks ${ordinal(camelRank(pn))} of ${pn.n} economies counting from the most camels.${cover}${inRating}`;
  };
  return { csv, text: lines.map(say).join('<br>') };
}

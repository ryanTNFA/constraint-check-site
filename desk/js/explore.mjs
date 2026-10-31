// "Explore one area across countries" (front-door PRD W3, section 3.4): pick an area; a world map colours each
// economy by its rating for that area under the default comparison set, and a list groups the economies by rating,
// alphabetically within each group. Never a ranking: no list sorts by score, and nothing is summed across areas.
// No map library: an Equal Earth projection (Šavrič, Patterson and Jenny 2018) drawn straight into SVG.
import { h, tierPaint, withData, getJSON } from './common.mjs';
import { PLAIN_TIER } from './card.mjs';

const SVG = 'http://www.w3.org/2000/svg';
const W = 960, H = 470;
// the rated areas only: context (N9, N11.policy), elimination (N12) and sector-study (N13) areas carry no rating
const AREAS = ['N0', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N10', 'N11', 'N11.property', 'N11.corruption', 'N11.taxes', 'N11.regulation', 'N11.crime'];
const GROUPS = [
  { key: 'look', label: 'Worth a closer look', tiers: ['likely_binding', 'candidate'] },
  { key: 'not', label: 'Probably not the main constraint', tiers: ['probably_not', 'ruled_out'] },
  { key: 'conflicting', label: 'Can’t tell: evidence points both ways', tiers: ['cannot_tell_conflicting'] },
  { key: 'weak', label: 'Can’t tell: evidence too weak', tiers: ['cannot_tell_weak'] },
  { key: 'gap', label: 'Can’t tell: data gap', tiers: ['cannot_tell_data_gap'] },
];

function equalEarth(lon, lat) {
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
  const l = (lon * Math.PI) / 180, p = (lat * Math.PI) / 180;
  const t = Math.asin(M * Math.sin(p)), t2 = t * t, t6 = t2 * t2 * t2;
  const x = (l * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  // the projection spans about ±2.71 by ±1.32; fit it to the view box
  return [W / 2 + x * (W / 5.5), H / 2 - y * (W / 5.5)];
}
function pathOf(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let d = '';
  for (const poly of polys) for (const ring of poly) d += ring.map(([lo, la], i) => { const [x, y] = equalEarth(lo, la); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join('') + 'Z';
  return d;
}
const el = (tag, attrs = {}) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v); return e; };
function patterns(svg) {
  const defs = el('defs');
  for (const [id, cross] of [['ex-hatch', false], ['ex-crosshatch', true]]) {
    const p = el('pattern', { id, patternUnits: 'userSpaceOnUse', width: 5, height: 5, patternTransform: 'rotate(45)' });
    p.append(el('rect', { width: 5, height: 5, style: 'fill:var(--tier-cannot)' }), el('line', { x1: 0, y1: 0, x2: 0, y2: 5, style: 'stroke:var(--tier-cannot-hatch);stroke-width:1' }));
    if (cross) p.append(el('line', { x1: 0, y1: 0, x2: 5, y2: 0, style: 'stroke:var(--tier-cannot-hatch);stroke-width:1' }));
    defs.append(p);
  }
  svg.append(defs);
}
const fillOf = (tier) => tierPaint(tier).fill.replace('url(#hatch)', 'url(#ex-hatch)').replace('url(#crosshatch)', 'url(#ex-crosshatch)');

export async function mountExplorer(host, { index, registry }) {
  const geo = await getJSON('/constraint-check-site/desk/geo/world-110m.json', { optional: true });
  const byIso = Object.fromEntries(index.countries.map((c) => [c.iso3, c]));
  const label = (id) => (registry.nodeById[id] ? (id.startsWith('N11.') ? `${registry.nodeById[id].short} (micro risk)` : registry.nodeById[id].short) : id);
  const opt = (v, t) => h('option', { value: v }, t);
  const areaSel = h('select', { id: 'ex-area' }, AREAS.filter((id) => registry.nodeById[id]).map((id) => opt(id, label(id))));
  areaSel.value = 'N5';
  const regions = [...new Set(index.countries.map((c) => c.region))].sort();
  const incomes = ['Low income', 'Lower middle income', 'Upper middle income', 'High income'].filter((g) => index.countries.some((c) => c.income_group === g));
  const regSel = h('select', { id: 'ex-region' }, opt('', 'All regions'), regions.map((r) => opt(r, r)));
  const incSel = h('select', { id: 'ex-income' }, opt('', 'All income groups'), incomes.map((r) => opt(r, r)));
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ex-map', role: 'img' });
  patterns(svg);
  const shapes = {};
  const dots = [];
  if (geo) for (const f of geo.features) {
    if (f.geometry.type === 'Point') { dots.push(f); continue; }
    if (!byIso[f.id]) { svg.append(el('path', { d: pathOf(f.geometry), class: 'ex-none' })); continue; }
    const a = el('a', { href: withData(`/constraint-check-site/desk/country.html?iso=${f.id}`) });
    const p = el('path', { d: pathOf(f.geometry), class: 'ex-shape' });
    const t = el('title'); a.append(p, t); svg.append(a);
    shapes[f.id] = { p, t, a };
  }
  // economies too small for the 1:110m map: a dot at the capital (points in the same file)
  for (const f of dots) {
    if (shapes[f.id] || !byIso[f.id]) continue;
    const c = byIso[f.id];
    const [x, y] = equalEarth(f.geometry.coordinates[0], f.geometry.coordinates[1]);
    const a = el('a', { href: withData(`/constraint-check-site/desk/country.html?iso=${c.iso3}`) });
    const p = el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 3.2, class: 'ex-shape ex-dot' });
    const t = el('title'); a.append(p, t); svg.append(a);
    shapes[c.iso3] = { p, t, a };
  }
  const listHost = h('div', { class: 'ex-list', 'aria-live': 'polite' });
  const keyHost = h('div', { class: 'legend ex-legend' });
  const draw = () => {
    const area = areaSel.value, reg = regSel.value, inc = incSel.value;
    svg.setAttribute('aria-label', `World map of the ${label(area).toLowerCase()} rating for each economy. The same information is in the grouped list.`);
    const inScope = (c) => (!reg || c.region === reg) && (!inc || c.income_group === inc);
    for (const [iso, s] of Object.entries(shapes)) {
      const c = byIso[iso]; const tier = c.tiers ? c.tiers[area] : null;
      s.p.style.fill = fillOf(tier);
      s.p.classList.toggle('ex-out', !inScope(c));
      s.p.classList.toggle('ex-gap', tier === 'cannot_tell_data_gap');
      s.t.textContent = `${c.name}: ${(PLAIN_TIER[tier] || 'not rated').toLowerCase()}. Open its bottom line.`;
    }
    listHost.replaceChildren();
    for (const g of GROUPS) {
      const members = index.countries.filter((c) => inScope(c) && c.tiers && g.tiers.includes(c.tiers[area])).sort((a, b) => a.name.localeCompare(b.name));
      const det = h('details', { class: `ex-group ex-${g.key}`, open: g.key === 'look' || g.key === 'not' ? true : null },
        h('summary', {}, h('span', { class: `swatch ${g.key === 'look' ? 't-candidate' : g.key === 'not' ? 't-probably_not' : `t-cannot_tell_${g.key === 'gap' ? 'data_gap' : g.key}`}`, 'aria-hidden': 'true' }), `${g.label} (${members.length})`),
        members.length ? h('p', { class: 'ex-names' }, ...members.flatMap((c, i) => [i ? ', ' : '', h('a', { href: withData(`/constraint-check-site/desk/country.html?iso=${c.iso3}`) }, c.name)])) : h('p', { class: 'ex-names muted' }, 'None.'));
      listHost.append(det);
    }
  };
  keyHost.append(...GROUPS.map((g) => h('span', {}, h('span', { class: `swatch ${g.key === 'look' ? 't-candidate' : g.key === 'not' ? 't-probably_not' : `t-cannot_tell_${g.key === 'gap' ? 'data_gap' : g.key}`}`, 'aria-hidden': 'true' }), g.label)),
    h('span', {}, h('span', { class: 'swatch ex-swatch-none', 'aria-hidden': 'true' }), 'Not covered'));
  for (const s of [areaSel, regSel, incSel]) s.addEventListener('change', draw);
  host.replaceChildren(
    h('div', { class: 'controls ex-controls' },
      h('div', { class: 'field' }, h('label', { for: 'ex-area' }, 'Area'), areaSel),
      h('div', { class: 'field' }, h('label', { for: 'ex-region' }, 'Region'), regSel),
      h('div', { class: 'field' }, h('label', { for: 'ex-income' }, 'Income group'), incSel)),
    h('p', { class: 'ex-caveat' }, 'Ratings are about what holds back private investment in each country, compared with similar economies. They are not a ranking of countries.'),
    h('div', { class: 'ex-body' }, h('figure', { class: 'ex-fig' }, svg, keyHost, h('figcaption', { class: 'small muted' }, `Ratings under each country’s default comparison set (similar economies), rubric ${index.rubric_version}. Click a country to open its bottom line. Boundaries: Natural Earth, public domain; small economies are shown as dots.`)), listHost));
  draw();
}

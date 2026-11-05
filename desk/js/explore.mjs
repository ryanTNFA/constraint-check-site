// "Explore one area across countries" (front-door PRD W3, section 3.4): pick an area; a world map colours each
// economy by its rating for that area under the default comparison set, and a list groups the economies by rating,
// alphabetically within each group. Never a ranking: no list sorts by score, and nothing is summed across areas.
// No map library: an Equal Earth projection (Šavrič, Patterson and Jenny 2018) drawn straight into SVG.
import { h, tierPaint, withData, getJSON, dataBase, highlightStrips } from './common.mjs';
import { PLAIN_TIER } from './card.mjs';

const SVG = 'http://www.w3.org/2000/svg';
const W = 960, H = 470;
// the rated areas only: context (N9, N11.policy) and sector-study (N13) areas carry no rating
const AREAS = ['N0', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N10', 'N11', 'N11.property', 'N11.corruption', 'N11.taxes', 'N11.regulation', 'N11.crime', 'N12'];
const GROUPS = [
  { key: 'look', label: 'Worth a closer look', tiers: ['likely_binding', 'candidate'] },
  { key: 'not', label: 'Probably not the main constraint', tiers: ['probably_not', 'ruled_out'] },
  { key: 'conflicting', label: 'Unclear: conflicting evidence', tiers: ['cannot_tell_conflicting'] },
  { key: 'weak', label: 'Unclear: evidence too weak', tiers: ['cannot_tell_weak'] },
  { key: 'gap', label: 'Unclear: data gap', tiers: ['cannot_tell_data_gap'] },
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
// On the map every "can't tell" is one quiet tint (visual-upgrade PRD V1, decision V-D1); a data gap gets an outline
// (class ex-gap). The three kinds keep their hatches in the list and its swatches, where a reader is close enough to see them.
const fillOf = (tier) => (tier && tier.startsWith('cannot_tell') ? 'var(--tier-cannot-tint)' : tierPaint(tier).fill);

export async function mountExplorer(host, { index, registry }) {
  const geo = await getJSON('/constraint-check-site/desk/geo/world-110m.json', { optional: true });
  // W4: the robustness marks that are not "holds" (engine 0.1.6); absent file or entry means holds
  const rob = await getJSON(`${dataBase()}/robustness.json`, { optional: true });
  const markOf = (iso, area) => (rob && rob.marks && rob.marks[iso] && rob.marks[iso][area]) || 'h';
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
  const which = h('p', { class: 'ex-which' });
  const draw = () => {
    const area = areaSel.value, reg = regSel.value, inc = incSel.value;
    highlightStrips(area); // V3: the same area lights up on every card's signature
    svg.setAttribute('aria-label', `World map of the ${label(area).toLowerCase()} rating for each economy. The same information is in the grouped list.`);
    const inScope = (c) => (!reg || c.region === reg) && (!inc || c.income_group === inc);
    for (const [iso, s] of Object.entries(shapes)) {
      const c = byIso[iso]; const tier = c.tiers ? c.tiers[area] : null;
      s.p.style.fill = fillOf(tier);
      s.p.classList.toggle('ex-out', !inScope(c));
      s.p.classList.toggle('ex-gap', tier === 'cannot_tell_data_gap');
      s.t.textContent = `${c.name}: ${(PLAIN_TIER[tier] || 'not rated').toLowerCase()}. Open its bottom line.`;
    }
    // the reader test of 2 November: say which area the colours are about, or the lists read as verdicts on whole countries
    which.textContent = `Showing one area, ${label(area).toLowerCase()}: each colour is that area’s rating for the country, not a verdict on the country.`;
    listHost.replaceChildren();
    for (const g of GROUPS) {
      const members = index.countries.filter((c) => inScope(c) && c.tiers && g.tiers.includes(c.tiers[area])).sort((a, b) => a.name.localeCompare(b.name));
      const det = h('details', { class: `ex-group ex-${g.key}`, open: g.key === 'look' || g.key === 'not' ? true : null },
        h('summary', {}, h('span', { class: `swatch ${g.key === 'look' ? 't-candidate' : g.key === 'not' ? 't-probably_not' : `t-cannot_tell_${g.key === 'gap' ? 'data_gap' : g.key}`}`, 'aria-hidden': 'true' }), `${label(area)}: ${g.label.toLowerCase()} (${members.length})`),
        ...namesByMark(members, area, g.key === 'look' || g.key === 'not'));
      listHost.append(det);
    }
  };
  // verdict groups split by how firm the rating is; the "can't tell" groups list names only
  function namesByMark(members, area, split) {
    const link = (c) => h('a', { href: withData(`/constraint-check-site/desk/country.html?iso=${c.iso3}`) }, c.name);
    // names are separated by a middle dot, since several carry commas of their own ("Korea, Rep.")
    const para = (list, label) => h('p', { class: 'ex-names' }, label ? h('span', { class: 'ex-mark' }, label) : null, ...list.flatMap((c, i) => [i ? ' · ' : '', link(c)]));
    if (!members.length) return [h('p', { class: 'ex-names muted' }, 'None.')];
    if (!split) return [para(members)];
    const parts = [['h', 'Holds under every reading: '], ['s', 'Depends on the reading: '], ['c', 'Depends on the comparison countries: ']];
    return parts.map(([k, label]) => [members.filter((c) => markOf(c.iso3, area) === k), label]).filter(([l]) => l.length).map(([l, label]) => para(l, label));
  }
  // the map's key: the two verdicts, one tint for "can't tell" (outlined for a data gap), and the uncovered dash
  keyHost.append(
    h('span', {}, h('span', { class: 'swatch t-candidate', 'aria-hidden': 'true' }), 'Worth a closer look'),
    h('span', {}, h('span', { class: 'swatch t-probably_not', 'aria-hidden': 'true' }), 'Probably not the main constraint'),
    h('span', {}, h('span', { class: 'swatch ex-swatch-tint', 'aria-hidden': 'true' }), 'Unclear (the list says why)'),
    h('span', {}, h('span', { class: 'swatch ex-swatch-gap', 'aria-hidden': 'true' }), 'Unclear: data gap'),
    h('span', {}, h('span', { class: 'swatch ex-swatch-none', 'aria-hidden': 'true' }), 'Not covered'));
  for (const s of [areaSel, regSel, incSel]) s.addEventListener('change', draw);
  host.replaceChildren(
    h('div', { class: 'controls ex-controls' },
      h('div', { class: 'field' }, h('label', { for: 'ex-area' }, 'Area'), areaSel),
      h('div', { class: 'field' }, h('label', { for: 'ex-region' }, 'Region'), regSel),
      h('div', { class: 'field' }, h('label', { for: 'ex-income' }, 'Income group'), incSel)),
    h('p', { class: 'ex-caveat' }, 'Ratings are about what holds back private investment in each country, compared with similar economies. They are not a ranking of countries.'),
    h('div', { class: 'ex-body' }, h('figure', { class: 'ex-fig' }, which, svg, keyHost, h('figcaption', { class: 'small muted' }, `Ratings under each country’s default comparison set (similar economies), rubric ${index.rubric_version}. Click a country to open its bottom line. Boundaries: Natural Earth, public domain; small economies are shown as dots.`)), listHost));
  draw();
}

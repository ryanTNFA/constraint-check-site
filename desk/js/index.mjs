// Country picker.
import './nav.mjs';
import { getJSON, initTheme, h, TIER_ORDER, TIER_ORD, tierClass, isCannotTell, dataBase, withData, strip } from './common.mjs';
import { PLAIN_TIER, fcsStatus } from './card.mjs';
import { mountExplorer } from './explore.mjs';

initTheme();

const grid = document.getElementById('grid');
const status = document.getElementById('status');
const q = document.getElementById('q');
const sortSel = document.getElementById('sort');
const countEl = document.getElementById('count');

let index = null, registry = null, fcs = null;

function legend() {
  const el = document.getElementById('legend');
  for (const t of TIER_ORDER) {
    if (t === 'desk_undiagnosable') continue;
    el.append(h('span', {}, h('span', { class: `swatch ${tierClass(t)}`, 'aria-hidden': 'true' }), PLAIN_TIER[t]));
  }
  el.append(h('span', {}, h('span', { class: 'swatch t-context', 'aria-hidden': 'true' }), 'Context, needs sector study, or judged by elimination'));
  el.append(h('span', { class: 'strip-key' }, 'On each card: one square per area, in the order of the decision tree on each country’s Areas page (the first decision, then finance, then low returns), coloured by its rating. Hover a square for its name. More amber does not mean a worse country, and there is no total.'));
}

const shortOf = (id) => (registry.nodeById[id] ? registry.nodeById[id].short.replace(/\?$/, '') : id);
/** Top-level areas by plain group; a micro-risk roll-up is named by the sub-area behind it. */
function groups(c) {
  const tiers = c.tiers || {};
  const top = Object.entries(tiers).filter(([id, t]) => !id.startsWith('N11.') && t !== 'context_only');
  const pick = (pred) => top.filter(([, t]) => pred(t)).map(([id]) => id);
  const nameRollup = (id) => {
    if (id !== 'N11') return shortOf(id);
    const subs = Object.entries(tiers).filter(([sid]) => sid.startsWith('N11.')).sort((a, b) => (TIER_ORD[b[1]] ?? 0) - (TIER_ORD[a[1]] ?? 0));
    return subs.length && subs[0][1] === tiers.N11 ? `${shortOf(subs[0][0])} (micro risk)` : shortOf(id);
  };
  return {
    ruled: pick((t) => t === 'ruled_out').map(shortOf),
    probNot: pick((t) => t === 'probably_not').map(shortOf),
    look: pick((t) => t === 'candidate' || t === 'likely_binding').map(nameRollup),
    unclear: pick((t) => isCannotTell(t) || t === 'desk_undiagnosable' || t === 'elimination').length,
    total: top.length,
  };
}

function card(c) {
  const g = groups(c);
  const list = (xs) => (xs.length ? xs.join(', ') : 'none');
  const fs = fcsStatus(fcs, c.iso3);
  return h('a', { class: 'econ-card', href: withData(`/constraint-check-site/desk/country.html?iso=${encodeURIComponent(c.iso3)}`) },
    h('h3', {}, c.name, h('span', { class: 'iso' }, c.iso3)),
    h('div', { class: 'where' }, `${c.region} · ${c.income_group}`),
    // V3: the signature replaces the count lines on screen; the lines stay for screen readers
    strip(c.tiers, { label: shortOf, plain: (t) => PLAIN_TIER[t] || 'not rated' }),
    h('ul', { class: 'summary-lines visually-hidden' },
      h('li', {}, h('span', { class: 'lab' }, 'Ruled out: '), list(g.ruled), h('span', { class: 'lab' }, ' · Probably not the main constraint: '), list(g.probNot)),
      h('li', {}, h('span', { class: 'lab' }, 'Worth a closer look: '), h('strong', {}, list(g.look))),
      h('li', {}, h('span', { class: 'lab' }, 'Unclear: '), `${g.unclear} of ${g.total} areas`),
      h('li', {}, h('span', { class: 'lab' }, 'Growth pattern: '), (c.classification || '—').replace(/_/g, ' '))),
    fs ? h('span', { class: 'fcs-tag', title: 'On the World Bank FY25 list of fragile and conflict-affected situations: the method fits poorly; read every rating as weak.' }, fs === 'conflict' ? 'Conflict-affected: weak fit for this method' : 'Fragile situation: weak fit for this method') : null,
  );
}

function render() {
  const term = q.value.trim().toLowerCase();
  let list = index.countries.filter((c) => !term || [c.name, c.iso3, c.region, c.income_group].some((s) => String(s).toLowerCase().includes(term)));
  const by = sortSel.value;
  // name or region only: the home page never ranks countries (front-door PRD, non-goals)
  list = list.slice().sort((a, b) => (by === 'region' ? a.region.localeCompare(b.region) : 0) || a.name.localeCompare(b.name));
  grid.replaceChildren(...list.map(card));
  countEl.textContent = `${list.length} of ${index.countries.length} economies`;
  status.hidden = list.length > 0;
  status.textContent = list.length ? '' : 'No economy matches that search.';
}

async function main() {
  try {
    // the home page needs only the tree's area names, not the indicator registry
    let nodes;
    [index, nodes, fcs] = await Promise.all([getJSON(`${dataBase()}/index.json`), getJSON('/constraint-check-site/registry/nodes.json'), getJSON('/constraint-check-site/registry/static_fcs.json', { optional: true })]);
    registry = { nodes, nodeById: Object.fromEntries(nodes.nodes.map((n) => [n.id, n])) };
  } catch (e) {
    status.hidden = false; status.textContent = `Could not load the desk index: ${e.message}. Run desk/dev/mock.mjs or the engine CLI to produce ${dataBase()}/index.json.`;
    return;
  }
  document.getElementById('rubric').textContent = index.rubric_version || '—';
  document.getElementById('snapshot').textContent = index.snapshot_id || '—';
  const mock = index.mock || /mock/.test(String(index.engine_version || ''));
  document.getElementById('mock-note').textContent = mock ? 'The numbers on this site are MOCK data generated by desk/dev/mock.mjs, not engine output.' : (dataBase() !== '/constraint-check-site/desk/data' ? `Data from ${dataBase()}.` : '');
  legend();
  q.addEventListener('input', render);
  sortSel.addEventListener('change', render);
  render();
  mountExplorer(document.getElementById('explore'), { index, registry }).catch((e) => { console.error(e); document.getElementById('explore').textContent = `The map could not load: ${e.message}`; })
    // V5: the Long View loads after the map, so it never delays it
    .finally(() => import('./longview.mjs').then((m) => m.mountLongView(document.getElementById('longview'))).catch((e) => console.error(e)));
}
main();

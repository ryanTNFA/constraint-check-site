// @ts-check
// The Countries page (Growth Test PRD, D5): the analyst's home. The search at the top opens a
// country's bottom line; "pick up where you left off" shows the three lists for the last country viewed (browser storage,
// written by the flagged country page); the map (explore.mjs, the home page's own) with the distribution of ratings for
// the chosen area beside its picker; and the economies, alphabetical or by region, never by score.
import { lastIso } from './shell.mjs';
import { getJSON, initTheme, h, dataBase, withData, loadRegistry, englishList, FORK } from './common.mjs';
import { strip } from './components/strip.mjs';
import { plainTierOf, fcsStatus, bottomLine } from './card.mjs';
import { mountExplorer } from './explore.mjs';
import { itemName } from './country_text.mjs';

initTheme();
const DATA = dataBase();
const $ = (id) => document.getElementById(id);
/** @type {any} */
let index = null;
/** @type {any} */
let registry = null;
let fcs = null;
const shortOf = (id) => (id === FORK ? 'First decision: finance or returns' : registry && registry.nodeById[id] ? registry.nodeById[id].short.replace(/\?$/, '') : id);
const bottomHref = (iso) => withData(`/growth-test-site/desk/country.html?iso=${encodeURIComponent(iso)}`);

// ---------- the search: the list fills the datalist once the index is here; Enter opens the bottom line ----------
function wireSearch() {
  const form = /** @type {HTMLFormElement} */ ($('ask'));
  const input = /** @type {HTMLInputElement} */ ($('ask-q'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim().toLowerCase(); if (!v) return;
    const cs = index ? index.countries : [];
    const hit = cs.find((c) => c.name.toLowerCase() === v || c.iso3.toLowerCase() === v) || cs.find((c) => c.name.toLowerCase().startsWith(v));
    const iso = hit ? hit.iso3 : (/^[a-z]{3}$/.test(v) ? v.toUpperCase() : null);
    if (!iso) { input.setCustomValidity('No economy by that name or code.'); input.reportValidity(); return; }
    location.href = bottomHref(iso);
  });
  input.addEventListener('input', () => input.setCustomValidity(''));
}

// ---------- pick up where you left off: the three lists for the last country viewed, from the same bottomLine() as the pages ----------
async function renderResume() {
  const iso = lastIso(); if (!iso) return;
  const c = index.countries.find((x) => x.iso3 === iso); if (!c) return;
  const sc = await getJSON(`${DATA}/${iso}.json`, { optional: true }); if (!sc) return;
  const view = { nodes: sc.nodes, statements: sc.statements, indicators: sc.indicators, setKey: 'structural' };
  const ctx = { view, registry, indicators: sc.indicators, byId: Object.fromEntries(sc.indicators.map((r) => [r.id, r])), setKey: 'structural', fallbackSet: 'structural',
    country: c.name, nodes: sc.nodes, snapshotYear: sc.meta.snapshot_year };
  const bl = bottomLine(ctx);
  const names = (xs) => (xs.length ? englishList(xs.map((x) => x.short)) : 'none yet');
  const line = (label, text) => h('p', { class: 'c-resume-line' }, h('strong', {}, `${label} `), text);
  $('resume-h').replaceChildren(h('a', { href: bottomHref(iso) }, c.name));
  $('resume-body').replaceChildren(
    strip(sc.nodes ? Object.fromEntries(sc.nodes.map((n) => [n.id, n.tier])) : c.tiers, { size: 'md', label: shortOf, plain: (t, id) => (t ? plainTierOf(id || '', t) : 'not rated') }),
    h('div', { class: 'c-resume-lists' },
      line('First decision:', bl.fork ? bl.fork.words.toLowerCase() : 'not scored'),
      line('Stop arguing about:', names([...bl.ruled, ...bl.probNot])),
      line('Look closer:', bl.look.length ? englishList(bl.look.map(itemName)) : 'no area stands out yet'),
      line('Can’t settle yet:', `${bl.nUnclear} of ${bl.nAreas} areas`)),
    h('p', { class: 'small' }, h('a', { href: bottomHref(iso) }, 'Back to its bottom line →')));
  $('resume').hidden = false;
}

// ---------- the distribution of ratings for the chosen area (the map's legend counts), so nobody is surprised by "unclear" ----------
const GROUPS = [
  { key: 'look', label: 'worth a closer look', fork: 'lean to finance', tiers: ['likely_binding', 'candidate'], cls: 't-candidate' },
  { key: 'not', label: 'probably not or ruled out', fork: 'lean to low returns', tiers: ['probably_not', 'ruled_out'], cls: 't-probably_not' },
  { key: 'unclear', label: 'unclear', fork: 'cannot tell which side', tiers: ['cannot_tell_conflicting', 'cannot_tell_weak', 'cannot_tell_data_gap'], cls: 'c-dist-unclear' },
];
function renderDist(area) {
  // the first decision is a direction, not a rating: its groups are the two sides and 'cannot tell'
  const counts = GROUPS.map((g) => ({ ...g, label: area === FORK ? g.fork : g.label, n: index.countries.filter((c) => c.tiers && g.tiers.includes(c.tiers[area])).length }));
  const rated = counts.reduce((a, g) => a + g.n, 0);
  const none = index.countries.length - rated;
  const bar = h('div', { class: 'c-dist-bar', role: 'img', 'aria-label': `${shortOf(area)}: ${counts.map((g) => `${g.n} ${g.label}`).join(', ')}; ${none} not rated.` });
  for (const g of counts) if (g.n) bar.append(h('span', { class: `c-dist-seg ${g.cls}`, style: `flex-grow:${g.n}` }));
  if (none) bar.append(h('span', { class: 'c-dist-seg c-dist-none', style: `flex-grow:${none}` }));
  $('dist').replaceChildren(
    h('p', { class: 'c-dist-words' }, h('strong', {}, `${shortOf(area)}, across ${index.countries.length} economies: `),
      counts.map((g) => `${g.n} ${g.label}`).join(' · '), none ? ` · ${none} not rated` : ''),
    bar);
}

// ---------- the economies: one line each, the signature strip and the name, alphabetical or by region ----------
function econLine(c) {
  const fs = fcsStatus(fcs, c.iso3);
  return h('a', { class: 'c-econ-line', href: bottomHref(c.iso3), title: `${c.region} · ${c.income_group}` },
    strip(c.tiers, { label: shortOf, plain: (t, id) => (t ? plainTierOf(id || '', t) : 'not rated') }),
    h('span', { class: 'c-econ-name' }, c.name),
    fs ? h('span', { class: 'c-fcs', title: 'On the World Bank list of fragile and conflict-affected situations: the method fits poorly; read every rating as weak.' },
      fs === 'conflict' ? 'conflict-affected' : 'fragile') : null);
}
function renderGrid() {
  const q = /** @type {HTMLInputElement} */ ($('q')); const sortSel = /** @type {HTMLSelectElement} */ ($('sort'));
  const term = q.value.trim().toLowerCase();
  let list = index.countries.filter((c) => !term || [c.name, c.iso3, c.region, c.income_group].some((s) => String(s).toLowerCase().includes(term)));
  const by = sortSel.value;
  list = list.slice().sort((a, b) => (by === 'region' ? a.region.localeCompare(b.region) : 0) || a.name.localeCompare(b.name));
  const grid = $('grid'); grid.replaceChildren();
  if (by === 'region') {
    let region = '';
    for (const c of list) { if (c.region !== region) { region = c.region; grid.append(h('h3', { class: 'c-region' }, region)); } grid.append(econLine(c)); }
  } else grid.append(...list.map(econLine));
  $('count').textContent = `${list.length} of ${index.countries.length} economies`;
  const status = $('status'); status.hidden = list.length > 0; status.textContent = list.length ? '' : 'No economy matches that filter.';
}

async function main() {
  wireSearch();
  try {
    const [ix, reg, f] = await Promise.all([getJSON(`${DATA}/index.json`), loadRegistry(), getJSON('/growth-test-site/registry/static_fcs.json', { optional: true })]);
    index = ix; registry = reg; fcs = f;
  } catch (e) { $('status').hidden = false; $('status').textContent = `Could not load the index: ${e.message}`; return; }
  $('versions').textContent = `Public data snapshot ${index.snapshot_id || '—'} · rubric ${index.rubric_version || '—'} · engine ${index.engine_version || '—'}.`;
  const dl = $('gt-countries');
  dl.replaceChildren(...index.countries.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => h('option', { value: c.name }, c.iso3)));
  $('q').addEventListener('input', renderGrid); $('sort').addEventListener('change', renderGrid);
  renderGrid();
  renderResume().catch((e) => console.error(e));
  const host = $('explore');
  await mountExplorer(host, { index, registry }).catch((e) => { console.error(e); host.textContent = `The map could not load: ${e.message}`; });
  const areaSel = /** @type {HTMLSelectElement | null} */ (document.getElementById('ex-area'));
  if (areaSel) { renderDist(areaSel.value); areaSel.addEventListener('change', () => renderDist(areaSel.value)); }
}
main();

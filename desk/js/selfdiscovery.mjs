// Self-discovery page (front-door PRD W9): the idea in plain words, the country's N12 measures and lean, the
// elimination test spelled out, and the nearby products (ingest/nearby_products.py) when they pass the stability check.
import { tabHref, refreshNav } from './nav.mjs';
import { getJSON, loadRegistry, initTheme, h, qs, dataBase, withData, currentSetting, SETTING_LABEL } from './common.mjs';
import { plainTier, factText, eliminationSentence } from './card.mjs';

initTheme();
const iso = (qs('iso') || '').toUpperCase();
const DATA = dataBase();
const $ = (id) => document.getElementById(id);
// the other low-return areas that must be set aside first (front-door PRD W7, the elimination rule)
const OTHERS = ['N4', 'N5', 'N6', 'N7', 'N8', 'N10', 'N11'];
let state = null;

function showError(msg) { const e = $('page-error'); e.hidden = false; e.textContent = msg; }

async function main() {
  if (!iso) { showError('No economy selected. Open this page from a country’s Areas tab.'); return; }
  const back = $('back-areas');
  back.href = tabHref('/constraint-check-site/desk/areas.html', iso, '&node=N12');
  back.addEventListener('click', () => { back.href = tabHref('/constraint-check-site/desk/areas.html', iso, '&node=N12'); });
  try {
    const [registry, sc, nearby, meta] = await Promise.all([loadRegistry(), getJSON(`${DATA}/${iso}.json`), getJSON(`${DATA}/nearby/${iso}.json`, { optional: true }), getJSON(`${DATA}/nearby/meta.json`, { optional: true })]);
    state = { registry, sc, nearby, meta };
  } catch (e) { showError(`Could not load the data for ${iso}: ${e.message}`); return; }
  render();
  window.addEventListener('desk-setting', render);
  refreshNav();
}

function render() {
  const { registry, sc, nearby, meta } = state;
  const c = sc.country.name;
  document.title = `${c} · Self-discovery · Constraint Check`;
  $('sd-title').textContent = `Self-discovery in ${c}`;
  $('sd-question').textContent = `Are firms in ${c} held back from trying new products?`;
  const m = sc.meta;
  $('versions').textContent = `Public data snapshot ${m.snapshot_id} · rubric ${m.rubric_version} · engine ${m.engine_version}.`;
  const n12 = sc.nodes.find((n) => n.id === 'N12');

  // the measures, in plain words, with the lean
  $('sd-lean').textContent = n12 ? eliminationSentence(n12) : '';
  const ctx = { setKey: 'structural', fallbackSet: 'structural', country: c, registry, snapshotYear: m.snapshot_year };
  const rows = sc.indicators.filter((r) => (r.nodes || []).includes('N12'));
  const sig = Object.fromEntries((n12 ? n12.families : []).flatMap((f) => (f.indicators || []).map((id) => [id, f.signal])));
  const way = (s) => (s == null ? '' : s > 0 ? 'points toward a problem' : s < 0 ? 'points away from a problem' : 'points neither way');
  $('evidence-sub').textContent = `${rows.filter((r) => r.value_ref != null).length} measures with a recent value for ${c}. Each is a quantity, not a price, so none votes on its own.`;
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  $('sd-measures').replaceChildren(...rows.map((r) => h('li', {}, r.value_ref != null ? `${cap(factText(r, ctx))}.` : `${r.name}: no recent value.`, sig[r.id] != null ? h('span', { class: 'sd-way' }, ` It ${way(sig[r.id])}.`) : null)));

  // the elimination test
  const setting = currentSetting();
  const tierOf = (n) => (setting !== 'standard' && n.tier_by_setting && n.tier_by_setting[setting]) || n.tier;
  const short = (id) => (registry.nodeById[id] ? registry.nodeById[id].short : id);
  const cleared = (t) => t === 'probably_not' || t === 'ruled_out';
  const others = OTHERS.map((id) => sc.nodes.find((n) => n.id === id)).filter(Boolean);
  const head = h('thead', {}, h('tr', {}, h('th', {}, 'Other cause of low returns'), h('th', {}, `Rating (${SETTING_LABEL[setting]} reading)`), h('th', {}, 'Set aside?')));
  const body = h('tbody', {}, others.map((n) => h('tr', {},
    h('td', {}, h('a', { href: tabHref('/constraint-check-site/desk/areas.html', iso, `&node=${encodeURIComponent(n.id)}`) }, short(n.id)), n.sub_nodes && n.rollup_from ? h('span', { class: 'small muted' }, ` (rated through ${short(n.rollup_from).toLowerCase()})`) : null),
    h('td', {}, plainTier(tierOf(n))),
    h('td', {}, cleared(tierOf(n)) ? 'Yes' : 'Not yet'))));
  $('sd-elim').replaceChildren(head, body);
  const done = others.filter((n) => cleared(tierOf(n))).length;
  const ts = sc.top_split || {};
  const lowReturns = ts.row === 'low_demand';
  $('sd-elim-verdict').textContent = `${done} of ${others.length} set aside. ${done === others.length
    ? `With the others set aside${lowReturns ? ' and the first statistics pointing to low returns' : ''}, self-discovery deserves a closer look in ${c}.`
    : `Self-discovery can’t be called for ${c} yet: ${others.length - done} other ${others.length - done === 1 ? 'cause is' : 'causes are'} still open.`} The tool will use this test in its ratings only if a check against published expert diagnoses supports it.`;

  // nearby products
  const host = $('sd-nearby'); host.replaceChildren();
  if (!nearby) host.append(h('p', { class: 'note' }, `No trade data for ${c}, so no list.`));
  else if (!nearby.pass) host.append(h('p', { class: 'note' }, `The list for ${c} is not shown: it did not pass the stability check (its nearest products in 2017–19 and 2022–24 overlap by ${nearby.overlap} of 20, against ${nearby.placebo_p95} for a shuffled product space).`));
  else {
    // HS headings are long legal texts: keep the part before the first semicolon, and at most about 70 characters
    const shortHs = (s) => { const t = String(s).split(';')[0].trim(); return t.length > 72 ? `${t.slice(0, 70).replace(/[ ,]+\S*$/, '')}…` : t; };
    // alphabetical, never ranked: a numbered list reads as a list of targets (reader test, 1 November)
    const list = (items) => h('ul', { class: 'sd-nearby' }, items.slice().sort((a, b) => shortHs(a.name).localeCompare(shortHs(b.name))).map((p) => h('li', { title: p.name }, h('span', { class: 'sd-prod' }, shortHs(p.name)), h('span', { class: 'sd-hs small muted' }, ` HS ${p.hs4}`))));
    host.append(h('div', { class: 'sd-two' },
      h('div', {}, h('h3', {}, 'The nearest products'), h('p', { class: 'small muted' }, `The ten products with most of their neighbours already exported by ${c}. Most are as simple as, or simpler than, what ${c} exports today.`), list(nearby.products)),
      h('div', {}, h('h3', {}, 'The nearest that are a step up'), h('p', { class: 'small muted' }, `The ten nearest products that are more complex than ${c}’s typical export: harder to make, and the kind of products richer countries tend to export.`), (nearby.step_up || []).length ? list(nearby.step_up) : h('p', { class: 'small' }, 'None found.'))));
    host.append(h('p', { class: 'small muted' }, `Is the list reliable? ${nearby.overlap} of the 20 products nearest to ${c} today were already among the nearest five years earlier. If the links between products were scrambled at random, only about ${Math.round(nearby.placebo_p95)} would be. Countries whose lists fail this check show none. ${c} exports ${nearby.exports_competitively} products competitively today.`));
  }
  $('sd-nearby-method').replaceChildren(
    h('p', {}, meta ? meta.method : ''),
    h('p', {}, meta ? meta.left_out : ''),
    h('p', {}, meta ? meta.complexity : ''),
    h('p', {}, meta ? `${meta.kill_check} ${meta.countries_passing} of ${meta.countries} economies pass; the others show no list.` : ''),
    h('p', {}, meta ? `Source: ${meta.source}. Built by ingest/nearby_products.py.` : ''));
}

main().catch((e) => { console.error(e); showError(`Unexpected error: ${e.message}`); });

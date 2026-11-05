// Self-discovery page (front-door PRD W9): the idea in plain words, the country's N12 rating and measures, the
// other low-return areas as context (the elimination gate until rubric 0.2.7), and the nearby products (ingest/nearby_products.py) when they pass the stability check.
import { tabHref, refreshNav } from './shell.mjs';
import { getJSON, loadRegistry, initTheme, h, qs, dataBase, withData, currentSetting, SETTING_LABEL } from './common.mjs';
import { plainTier, factText, plainSummary } from './card.mjs';
import { renderSpace } from './selfdiscovery_space.mjs';

initTheme();
const iso = (qs('iso') || '').toUpperCase();
const DATA = dataBase();
const $ = (id) => document.getElementById(id);
// the other low-return areas, shown as context (front-door PRD W7's elimination rule, a gate until rubric 0.2.7)
const OTHERS = ['N4', 'N5', 'N6', 'N7', 'N8', 'N10', 'N11'];
let state = null;

function showError(msg) { const e = $('page-error'); e.hidden = false; e.textContent = msg; }

async function main() {
  if (!iso) { showError('No economy selected. Open this page from a country’s Areas tab.'); return; }
  const back = $('back-areas');
  back.href = tabHref('/constraint-check-site/desk/areas.html', iso, '&node=N12');
  back.addEventListener('click', () => { back.href = tabHref('/constraint-check-site/desk/areas.html', iso, '&node=N12'); });
  try {
    const [registry, sc, nearby, meta, hippo] = await Promise.all([loadRegistry(), getJSON(`${DATA}/${iso}.json`), getJSON(`${DATA}/nearby/${iso}.json`, { optional: true }), getJSON(`${DATA}/nearby/meta.json`, { optional: true }), getJSON(`${DATA}/hippo/${iso}.json`, { optional: true })]);
    state = { registry, sc, nearby, meta, hippo };
  } catch (e) { showError(`Could not load the data for ${iso}: ${e.message}`); return; }
  render();
  window.addEventListener('desk-setting', render);
  refreshNav();
}

function render() {
  const { registry, sc, nearby, meta, hippo } = state;
  const c = sc.country.name;
  document.title = `${c} · Self-discovery · Constraint Check`;
  $('sd-title').textContent = `Self-discovery in ${c}`;
  $('sd-question').textContent = `Are firms in ${c} held back from trying new products?`;
  const m = sc.meta;
  $('versions').textContent = `Public data snapshot ${m.snapshot_id} · rubric ${m.rubric_version} · engine ${m.engine_version}.`;
  const n12 = sc.nodes.find((n) => n.id === 'N12');

  // the rating in plain words, then the measures
  const ctx = { setKey: 'structural', fallbackSet: 'structural', country: c, registry, nodes: sc.nodes, indicators: sc.indicators, snapshotYear: m.snapshot_year };
  $('sd-lean').textContent = n12 ? plainSummary(n12, ctx) : '';
  const rows = sc.indicators.filter((r) => (r.nodes || []).includes('N12'));
  const sig = Object.fromEntries((n12 ? n12.families : []).flatMap((f) => (f.indicators || []).map((id) => [id, f.signal])));
  const way = (s) => (s == null ? '' : s > 0 ? 'points toward a problem' : s < 0 ? 'points away from a problem' : 'points neither way');
  $('evidence-sub').textContent = `${rows.filter((r) => r.value_ref != null).length} measures with a recent value for ${c}. Each is a quantity, not a price; the discovery gap votes with the weight of its class (rubric 0.2.8), the rest inform the lean.`;
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  $('sd-measures').replaceChildren(...rows.map((r) => h('li', {}, r.value_ref != null ? `${cap(factText(r, ctx))}.` : `${r.name}: no recent value.`, sig[r.id] != null ? h('span', { class: 'sd-way' }, ` It ${way(sig[r.id])}.`) : null)));

  // the other causes of low returns: context, not a gate
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
  const open = others.length - done;
  $('sd-elim-verdict').textContent = `${done} of ${others.length} set aside. ${done === others.length
    ? `With the others set aside${lowReturns ? ' and the first statistics pointing to low returns' : ''}, a self-discovery reading in ${c} stands alone.`
    : `${open} other ${open === 1 ? 'cause is' : 'causes are'} still open, so a self-discovery problem in ${c} would sit beside ${open === 1 ? 'it' : 'them'}, not instead.`} The rating above comes from self-discovery's own evidence; this table is context for it.`;

  // nearby products
  const host = $('sd-nearby'); host.replaceChildren();
  if (!nearby) host.append(h('p', { class: 'note' }, `No trade data for ${c}, so no list.`));
  else if (!nearby.pass) host.append(h('p', { class: 'note' }, `The list for ${c} is not shown: it did not pass the stability check (its nearest products in 2017–19 and 2022–24 overlap by ${nearby.overlap} of 20, against ${nearby.placebo_p95} for a shuffled product space).`));
  else {
    // HS headings are long legal texts: keep the part before the first semicolon, and at most about 70 characters
    const shortHs = (s) => { const t = String(s).split(';')[0].trim(); return t.length > 72 ? `${t.slice(0, 70).replace(/[ ,]+\S*$/, '')}…` : t; };
    // alphabetical, never ranked: a numbered list reads as a list of targets (reader test, 1 November)
    const list = (items) => h('ul', { class: 'sd-nearby' }, items.slice().sort((a, b) => shortHs(a.name).localeCompare(shortHs(b.name))).map((p) => h('li', { title: p.name }, h('span', {}, shortHs(p.name)), h('span', { class: 'sd-hs small muted' }, ` HS ${p.hs4}`))));
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
  renderOtherWay(c, hippo);
  renderSpace(state).catch((e) => { console.error(e); showError(`The product-space views could not be drawn: ${e.message}`); });
}

// What each intensity vector measures, in the words the camels chart uses (ingest/camels.py VECTORS).
const FACTOR = { finance_dependence: 'outside finance', schooling: 'skilled workers', time_sensitivity: 'fast, reliable transport', contract_intensity: 'enforceable contracts', intangibility: 'lending without collateral', electricity: 'electricity' };
const VEC_ORDER = ['finance_dependence', 'intangibility', 'schooling', 'electricity', 'time_sensitivity', 'contract_intensity'];
const shortHs = (s) => { const t = String(s || '').split(';')[0].trim(); return t.length > 60 ? `${t.slice(0, 58).replace(/[ ,]+\S*$/, '')}…` : t; };
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

/** The other direction: the products that thrive, the products that are missing, what each group needs, and whether hippos ever tried. */
function renderOtherWay(c, hippo) {
  const host = $('sd-otherway'); host.replaceChildren();
  const method = $('sd-otherway-method'); method.replaceChildren();
  const s = hippo && hippo.surprises;
  if (!s || (!s.well.length && !s.badly.length)) {
    host.append(h('p', { class: 'note' }, `${c} exports too few products, or too little, for this reading (the test needs a basket of at least 50 products at US$1 million or more).`));
    return;
  }
  const year = hippo.year;
  const vecs = VEC_ORDER.filter((v) => hippo.surprise_vectors && hippo.surprise_vectors[v]);
  const item = (p, kind) => h('li', { title: p.name || `HS ${p.hs4}` },
    h('span', {}, p.name ? shortHs(p.name) : `HS ${p.hs4} (heading no longer in use)`),
    h('span', { class: 'sd-hs small muted' }, kind === 'well'
      ? ` HS ${p.hs4} · exports ${p.rca >= 10 ? Math.round(p.rca) : p.rca.toFixed(1)}× the world’s share, income predicts ${p.expected_rca.toFixed(1)}×`
      : ` HS ${p.hs4} · income predicts ${p.expected_rca.toFixed(1)}× the world’s share, exports ${p.rca < 0.05 ? 'none' : `${p.rca.toFixed(2)}×`}`));
  const list = (items, kind) => h('ul', { class: 'sd-nearby' }, items.map((p) => item(p, kind)));
  host.append(h('div', { class: 'sd-two' },
    h('div', {}, h('h3', {}, 'Doing surprisingly well'), h('p', { class: 'small muted' }, `The ${s.well.length} products ${c} exported in ${year} furthest above what its income predicts, among products it exports at US$1 million or more.`), s.well.length ? list(s.well, 'well') : h('p', { class: 'small' }, 'None.')),
    h('div', {}, h('h3', {}, 'Surprisingly missing'), h('p', { class: 'small muted' }, `Products that economies at ${c}’s income export competitively (a predicted share at least the world’s) and that ${c} does not export at all${s.candidates_badly > s.badly.length ? `: the ${s.badly.length} furthest below prediction of ${s.candidates_badly}` : ''}.`), s.badly.length ? list(s.badly, 'badly') : h('p', { class: 'small' }, `None: ${c} exports every product its income predicts.`))));

  // what the two groups need: mean intensity percentile, vector by vector
  const mp = s.mean_pct || {};
  const rows = vecs.filter((v) => mp[v]);
  if (rows.length) {
    const head = h('thead', {}, h('tr', {}, h('th', {}, 'What products need'), h('th', {}, 'The thriving ones'), h('th', {}, 'The missing ones'), h('th', {}, 'Reading')));
    const reading = (v) => { const d = mp[v].badly - mp[v].well; return Math.abs(d) < 15 ? 'about the same' : d > 0 ? `the missing ones need more ${FACTOR[v]}` : `the thriving ones need more ${FACTOR[v]}`; };
    const body = h('tbody', {}, rows.map((v) => h('tr', {}, h('td', {}, FACTOR[v][0].toUpperCase() + FACTOR[v].slice(1)), h('td', {}, `${ordinal(Math.round(mp[v].well))} percentile (${mp[v].n_well} scored)`), h('td', {}, `${ordinal(Math.round(mp[v].badly))} percentile (${mp[v].n_badly} scored)`), h('td', {}, reading(v)))));
    // The two sentences that matter: the factor the missing products need most more of (the hippo-shaped hole), and the
    // factor the thriving products need most more of (where a constraint is not the story).
    const gaps = rows.map((v) => [v, mp[v].badly - mp[v].well]);
    const hole = gaps.filter((g) => g[1] >= 15).sort((a, b) => b[1] - a[1])[0];
    const thrive = gaps.filter((g) => g[1] <= -15).sort((a, b) => a[1] - b[1])[0];
    const say = (v) => `${ordinal(Math.round(mp[v].badly))} against ${ordinal(Math.round(mp[v].well))} percentile`;
    host.append(h('h3', { style: 'margin-top:16px' }, 'What the two groups need'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data sd-elim' }, head, body)),
      h('p', { class: 'plain' },
        hole ? `The missing products need far more ${FACTOR[hole[0]]} than the ones that thrive (${say(hole[0])}). That is the pattern a binding ${FACTOR[hole[0]]} constraint would leave. It is also the pattern of comparative advantage, so it is a question for the price and workaround tests, not an answer. ` : '',
        thrive ? `The thriving products need far more ${FACTOR[thrive[0]]} than the missing ones (${ordinal(Math.round(mp[thrive[0]].well))} against ${ordinal(Math.round(mp[thrive[0]].badly))} percentile), which is not what a binding ${FACTOR[thrive[0]]} constraint would leave.` : '',
        !hole && !thrive ? 'Neither group needs clearly more of any factor than the other, as far as the vectors can tell from a handful of products.' : ''));
  }

  // did hippos ever try: entry rates by intensity quartile
  const ev = vecs.map((v) => [v, hippo.vectors[v] && hippo.vectors[v].entry]).filter(([, e]) => e && e.top && e.top.at_risk && e.bottom && e.bottom.at_risk);
  if (ev.length) {
    const w = ev[0][1].windows;
    const head = h('thead', {}, h('tr', {}, h('th', {}, 'Factor'), h('th', {}, 'Products that need the most of it: taken up'), h('th', {}, 'Products that need the least: taken up')));
    const pc = (e) => `${e.entries} of ${e.at_risk} (${(100 * e.rate).toFixed(1)}%)`;
    const body = h('tbody', {}, ev.map(([v, e]) => h('tr', {}, h('td', {}, FACTOR[v][0].toUpperCase() + FACTOR[v].slice(1)), h('td', {}, pc(e.top)), h('td', {}, pc(e.bottom)))));
    host.append(h('h3', { style: 'margin-top:16px' }, 'Did hippos ever try?'),
      h('p', { class: 'small muted' }, `New exports over five-year windows ending ${w[0]} to ${w[w.length - 1]}: of the products ${c} did not export at the start of a window (a share below half the world’s), how many it exported competitively by the end, among the quarter of products that need the most of each factor and the quarter that need the least. Where a factor binds, the new products should be the ones that need little of it.`),
      h('div', { class: 'table-wrap' }, h('table', { class: 'data sd-elim' }, head, body)));
  }

  method.append(
    h('p', {}, `Exports by HS 4-digit product in ${year} from the Growth Lab’s trade data, as a share of ${c}’s exports relative to the world’s share (revealed comparative advantage). For each product, a line is fitted across about 180 economies on log income per person; a product’s surprise is the distance from that line in ln(1 + RCA). “Thriving” products are the furthest above it; “missing” products are those the line puts at a competitive share for ${c}’s income while ${c}’s own share is below a fifth of the world’s. Mining, fuel and precious-metal products, stamps, art and scrap are left out, as in the nearby-products list.`),
    h('p', {}, 'Each product’s intensities are the percentiles used by the camels chart on the Evidence page: how much of each factor the product’s industry uses in the United States (Rajan and Zingales; Ciccone and Papaioannou; Nunn; Braun; Hummels and Schaur; the BEA input-output table). A product is scored only where its industry is in the source table, so the counts differ by factor.'),
    h('p', {}, 'What this cannot show: a missing product may be missing for comparative advantage, for market size, or because nobody has tried, not because of a constraint; the thriving products of a poor country are often farm goods whose intensities are not scored; eight products a side is a small sample. The same absence reading, run as a regression across every scored product (the hippo gap), is on the Evidence page under test 4; it did not pass its power check and does not vote (docs/hippo-gap-test.md). Built by ingest/hippo_gap.py.'));
}

main().catch((e) => { console.error(e); showError(`Unexpected error: ${e.message}`); });

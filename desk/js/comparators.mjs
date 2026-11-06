// Comparator strip and editor.
import { h, tierClass, fmt } from './common.mjs';
import { plainTierOf } from './card.mjs';

const SET_TITLE = { structural: 'Structural peers', regional: 'Regional peers', aspirational: 'Aspirational peers' };
/** One plain sentence per comparator set; the engine's exact rule stays one click away. */
export const SET_PLAIN = {
  structural: (c) => `the countries most like ${c} in income, population, natural-resource dependence and access to the sea (micro-states and high-income countries excluded, and fragile or conflict-affected countries unless ${c} is one)`,
  regional: (c) => `countries in ${c}'s region and income group, nearest in income`,
  aspirational: (c) => `countries that had ${c}'s income around 2000 and have grown at least 3% a year since`,
};

/**
 * renderComparators(container, ctx)
 * ctx: { scorecard, baseline (nodes from file), view, activeSet, peers (custom list or null), countries, engineStatus: {ok, message}, onSwitch(set), onPeers(list), onReset(), lastRecompute }
 */
const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : x);

export function renderComparators(container, ctx) {
  container.replaceChildren();
  const { scorecard, view, activeSet, peers, countries, engineStatus } = ctx;
  const nameOf = (iso) => { const c = countries.find((x) => x.iso3 === iso); return c ? c.name : iso; };
  const sets = scorecard.comparators || {};
  const grid = h('div', { class: 'sets' });
  for (const [key, set] of Object.entries(sets)) {
    const active = key === activeSet;
    const members = active && Array.isArray(peers) ? peers : (set.members || []);
    const card = h('div', { class: `set-card${active ? ' active' : ''}` });
    card.append(h('h3', {}, h('span', {}, SET_TITLE[key] || key, ' ', h('span', { class: 'muted small' }, `(${members.length})`)), active ? h('span', { class: 'small', style: 'color:var(--accent);font-weight:600' }, 'Active') : h('button', { class: 'btn small', type: 'button', onclick: () => ctx.onSwitch(key) }, 'Use as active')));
    if (SET_PLAIN[key]) card.append(h('p', { class: 'small', style: 'margin:0 0 6px' }, cap(SET_PLAIN[key](scorecard.country.name)), '.'));
    if (set.rule) card.append(h('details', { class: 'rule-detail' }, h('summary', {}, 'Exact rule'), h('p', { class: 'rule-text' }, set.rule)));
    if (set.reason_empty || set.empty_reason) card.append(h('p', { class: 'note' }, set.reason_empty || set.empty_reason));
    const ul = h('ul', { class: 'members' });
    const defaults = new Set(set.members || []);
    for (const iso of members) {
      const li = h('li', { class: defaults.has(iso) ? '' : 'added', title: iso }, nameOf(iso));
      if (active && engineStatus.ok) li.append(h('button', { type: 'button', 'aria-label': `Remove ${nameOf(iso)} from the active set`, onclick: () => ctx.onPeers(members.filter((x) => x !== iso)) }, '×'));
      ul.append(li);
    }
    if (!members.length) ul.append(h('li', { class: 'muted', style: 'border:0;font-family:inherit' }, 'No members'));
    card.append(ul);
    const dist = set.distances || (set.features && set.features.distances);
    if (key === 'structural' && dist) card.append(h('p', { class: 'small muted', style: 'margin:8px 0 0' }, `Distances in z-space: ${Object.entries(dist).map(([i, d]) => `${i} ${fmt(d, 2)}`).join(', ')}${set.excluded ? ` · excluded: ${set.excluded.population || 0} micro-states, ${set.excluded.high_income || 0} high-income` : ''}`));
    if (key === 'regional' && (set.income_groups || (set.features && set.features.income_groups))) card.append(h('p', { class: 'small muted', style: 'margin:8px 0 0' }, `Income groups used: ${(set.income_groups || set.features.income_groups).join(', ')}`));
    const gr = set.growth || (set.features && set.features.growth_since);
    if (key === 'aspirational' && gr && Object.keys(gr).length) card.append(h('p', { class: 'small muted', style: 'margin:8px 0 0' }, `Growth since ${set.base_year || 'base year'} (% a year): ${Object.entries(gr).map(([i, g]) => `${i} ${fmt(g, 1)}`).join(', ')}${set.candidates_in_band != null ? ` · ${set.candidates_in_band} economies were in the income band` : ''}`));
    grid.append(card);
  }
  container.append(grid);

  // editor
  const ed = h('div', { class: 'editor' });
  ed.append(h('h3', {}, `Edit the active set (${SET_TITLE[activeSet] || activeSet})`));
  if (!engineStatus.ok) {
    ed.append(h('p', { class: 'note alert' }, `Comparator editor disabled: ${engineStatus.message} Switching the active set still works and shows the tiers the engine computed for that set; ranking and statements are not recomputed.`));
  } else {
    const input = h('input', { type: 'text', placeholder: 'Add an economy: type a name or ISO3', 'aria-label': 'Add an economy to the active set', autocomplete: 'off', size: '34' });
    const list = h('ul', { class: 'suggest', role: 'listbox' });
    const current = () => (Array.isArray(peers) ? peers : (sets[activeSet] ? sets[activeSet].members : []));
    const refreshList = () => {
      const q = input.value.trim().toLowerCase();
      list.replaceChildren();
      if (!q) { list.classList.remove('show'); return; }
      const cur = new Set(current());
      const hits = countries.filter((c) => c.iso3 !== scorecard.country.iso3 && !cur.has(c.iso3) && (c.name.toLowerCase().includes(q) || c.iso3.toLowerCase().includes(q) || String(c.region).toLowerCase().includes(q))).slice(0, 12);
      for (const c of hits) list.append(h('li', { role: 'option', tabindex: 0, onclick: () => pick(c.iso3), onkeydown: (e) => { if (e.key === 'Enter') pick(c.iso3); } }, h('span', {}, `${c.name} `, h('span', { class: 'mono muted' }, c.iso3)), h('span', { class: 'muted small' }, `${c.region} · ${c.income_group}`)));
      if (!hits.length) list.append(h('li', { class: 'muted' }, 'No match'));
      list.classList.add('show');
    };
    const pick = (iso) => { input.value = ''; list.classList.remove('show'); ctx.onPeers([...current(), iso]); };
    input.addEventListener('input', refreshList);
    input.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { const f = list.querySelector('li[tabindex]'); if (f) f.focus(); } if (e.key === 'Escape') list.classList.remove('show'); });
    ed.append(h('div', { class: 'row' }, input, h('button', { class: 'btn quiet small', type: 'button', onclick: () => ctx.onReset() }, 'Reset to default sets'), h('span', { class: 'small muted' }, ctx.lastRecompute || '')), list);
    ed.append(h('p', { class: 'small muted', style: 'margin:8px 0 0' }, 'Removing a member: use the × on the active set. Peer-gap signals need at least ', String(ctx.minPeers), ' peers with data; ICR values are fixed and do not depend on the set.'));
  }
  container.append(ed);

  // what changed
  const diffs = [];
  for (const n of view.nodes) {
    const b = ctx.baseline.find((x) => x.id === n.id);
    if (b && b.tier !== n.tier) diffs.push({ id: n.id, from: b.tier, to: n.tier });
  }
  const dwrap = h('div', { style: 'margin-top:14px' }, h('h3', { class: 'small', style: 'margin-bottom:4px' }, 'What changed against the default structural set'));
  if (!diffs.length) dwrap.append(h('p', { class: 'small muted' }, activeSet === 'structural' && !peers ? 'Nothing: this is the default set.' : 'No rating changed. The ratings do not depend on this choice of comparison countries.'));
  else {
    const ul = h('ul', { class: 'diff-list' });
    for (const d of diffs) ul.append(h('li', {}, h('strong', {}, `${d.id} ${ctx.nodeShort(d.id)}`), h('span', { class: `tier-badge ${tierClass(d.from)}` }, h('span', {}, plainTierOf(d.id, d.from))), h('span', { class: 'arrow' }, '→'), h('span', { class: `tier-badge ${tierClass(d.to)}` }, h('span', {}, plainTierOf(d.id, d.to)))));
    dwrap.append(ul);
  }
  container.append(dwrap);
}

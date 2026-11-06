// @ts-check
// The Bottom line (Growth Test PRD D1, D2, D3, D8, D9; shipped 6 November 2026 after the Kenya prototype). The question and its
// one-sentence answer come first, in larger type, above any control; the three lists are visible in the first screen;
// method text and long definitions sit behind <gt-term> hovers and <gt-fold> disclosures; the "unclear" reasons, the
// comparison countries and the dissent never fold. The Areas level (areas.mjs) shares the data and the helpers (card.mjs,
// components/); the three lists come from the same bottomLine() call on both, and the memo is built the same way.
import { tabHref, refreshNav } from './shell.mjs';
import { getJSON, loadRegistry, initTheme, h, parseHash, writeState, qs, dataBase, withData, englishList, downloadText, SETTING_LABEL, fmt, shortName,
  tierClass, nodeCode } from './common.mjs';
import { compactTree } from './tree.mjs';
import { plainTier, bottomLine, fcsNote, refSpan, plainSummary, whatWouldMove, fieldQuestions, whyNotLines, evidenceNode } from './card.mjs';
import { robustChip, reasonTag } from './components/marks.mjs';
import { STRIP_AREAS } from './components/strip.mjs';
import { buildMemo } from './memo.mjs';
import { memoHTML } from './components/markdown.mjs';
import { buildBriefing } from './briefing.mjs';
import { answerSentence, itemName } from './country_text.mjs';

initTheme();
const iso = (qs('iso') || document.body.dataset.iso || '').toUpperCase();
const DATA = dataBase();
const $ = (id) => document.getElementById(id);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** @type {any} */
const state = { iso, registry: null, scorecard: null, countries: [], matrix: null, narrative: null, fcs: null, index: null, engine: null,
  activeSet: 'structural', peers: null, overrides: {}, view: null, viewBase: null, setting: 'standard' };
const nameOf = (iso3) => { const c = (state.countries || []).find((x) => x.iso3 === iso3); return c ? c.name : iso3; };
const short = (id) => (state.registry && state.registry.nodeById[id] ? state.registry.nodeById[id].short : id);
const nodeOf = (id) => state.view.nodes.find((n) => n.id === id);
const snapshotYear = () => state.scorecard.meta.snapshot_year || Number(String(state.scorecard.meta.snapshot_id).slice(0, 4));
const activeMembers = () => (Array.isArray(state.peers) ? state.peers : (state.scorecard.comparators[state.activeSet] || { members: [] }).members);
const SET_KIND = { structural: 'similar economies', regional: 'regional neighbours', aspirational: 'faster growers that were once as rich' };

function showError(msg) { const e = $('page-error'); e.hidden = false; e.textContent = msg; }
function baseView() {
  const sc = state.scorecard;
  return { nodes: sc.nodes.map((n) => ({ ...n })), ranking: sc.ranking, statements: sc.statements, sensitivity: sc.sensitivity, indicators: sc.indicators,
    setKey: sc.meta.active_comparator_set || 'structural', note: '' };
}
/** Context for the plain-language helpers in card.mjs (the same shape country.mjs builds). */
function plainCtx() {
  const ind = state.view.indicators || state.scorecard.indicators;
  return { indicators: ind, byId: Object.fromEntries(ind.map((r) => [r.id, r])), setKey: state.view.setKey || state.activeSet, fallbackSet: state.activeSet,
    country: state.scorecard.country.name, registry: state.registry, nodes: state.view.nodes, view: state.view, snapshotYear: snapshotYear() };
}

// ---------- the view in force: comparison set, edited peers (in-browser recompute), evidence setting ----------
function applySetting(view) {
  if (!view || state.setting === 'standard' || view.fallback) return view;
  const label = SETTING_LABEL[state.setting];
  const nodes = view.nodes.map((n) => {
    const t = n.tier_by_setting && n.tier_by_setting[state.setting];
    if (!t || t === n.tier) return n;
    return { ...n, tier: t, cannot_tell_reason: null, cannot_tell_detail: null, tier_reason: `${plainTier(t)} under the ${label} reading (Standard: ` +
      `${plainTier(n.tier).toLowerCase()}). The rule text that follows is the Standard computation. ${n.tier_reason}` };
  });
  return { ...view, nodes, setting: state.setting };
}
function fallbackView(base) {
  const nodes = base.nodes.map((n) => (n.tier_by_set && n.tier_by_set[state.activeSet]
    ? { ...n, ...(n.tier_by_set[state.activeSet] === n.tier ? {} : { cannot_tell_reason: null, cannot_tell_detail: null }), tier: n.tier_by_set[state.activeSet] }
    : n));
  return { nodes, ranking: base.ranking, statements: base.statements, indicators: base.indicators, setKey: state.activeSet, fallback: true,
    note: 'Ranking and statements are shown for the default set; the engine module is not available for a browser recompute.' };
}
async function applyComparators() {
  const sc = state.scorecard; const base = baseView();
  const isDefault = state.activeSet === (sc.meta.active_comparator_set || 'structural') && !Array.isArray(state.peers);
  if (isDefault) state.viewBase = base;
  else if (state.engine) {
    try {
      if (!state.matrix) state.matrix = await getJSON(`${DATA}/matrix.json`);
      const peers = Array.isArray(state.peers) ? state.peers : activeMembers();
      const res = state.engine.recomputeWithPeers(sc, state.matrix, peers, { indicators: state.registry.indicators, nodes: state.registry.nodes },
        state.registry.params, { replaces: state.activeSet });
      const nodes = Array.isArray(res.nodes) ? res.nodes.map((n) => ({ ...(base.nodes.find((b) => b.id === n.id) || {}), ...n })) : base.nodes;
      state.viewBase = { nodes, ranking: res.ranking || base.ranking, statements: res.statements || base.statements, sensitivity: res.sensitivity ||
        base.sensitivity, indicators: Array.isArray(res.indicators) ? res.indicators : base.indicators, setKey: res.active_comparator_set || 'custom', note: '' };
    } catch (e) { console.error(e); state.viewBase = fallbackView(base); }
  } else state.viewBase = fallbackView(base);
  state.view = applySetting(state.viewBase);
  writeState(state);
}

// ---------- main ----------
async function main() {
  if (!iso) { showError('No economy selected. Open this page as country.html?iso=XXX or pick an economy on the Countries page.'); return; }
  try {
    const [registry, scorecard, countries, fcs, index] = await Promise.all([loadRegistry(), getJSON(`${DATA}/${iso}.json`),
      getJSON(`${DATA}/countries.json`, { optional: true }), getJSON('/growth-test-site/registry/static_fcs.json', { optional: true }), getJSON(`${DATA}/index.json`,
        { optional: true })]);
    state.registry = registry; state.scorecard = scorecard; state.countries = countries || []; state.fcs = fcs; state.index = index;
  } catch (e) { showError(`Could not load the snapshot for ${iso}: ${e.message}.`); return; }
  state.narrative = await getJSON(`/growth-test-site/synth/narratives/${iso}.json`, { optional: true });
  // the engine, for an edited comparison list (C8: a root path in quotes, which build_site.py can rewrite; tsc cannot resolve it)
  const enginePath = '/growth-test-site/engine/src/scorecard.mjs';
  try { const mod = await import(enginePath); if (typeof mod.recomputeWithPeers === 'function') state.engine = mod; } catch { state.engine = null; }
  const hs = parseHash();
  state.activeSet = hs.set && state.scorecard.comparators[hs.set] ? hs.set : (state.scorecard.meta.active_comparator_set || 'structural');
  state.peers = hs.peers; state.overrides = hs.overrides || {}; state.setting = hs.setting;
  document.title = `${state.scorecard.country.name} · Bottom line · The Growth Test`;
  renderHead();
  await applyComparators();
  renderAll();
  renderTools();
  refreshNav();
  window.addEventListener('hashchange', () => { const p = parseHash(); state.overrides = p.overrides || {}; renderAll(); });
  window.addEventListener('desk-setting', (e) => { state.setting = /** @type {CustomEvent} */ (e).detail.setting; state.view = applySetting(state.viewBase); writeState(state); renderAll(); });
}
function renderAll() { renderAnswer(); renderPeers(); renderSettingNote(); renderCompactTree(); renderLists(); renderOverrides(); renderCards(); renderAssistance(); }

// ---------- the head: the economy, the question, the one sentence (D1), the comparison countries (D3) ----------
function renderHead() {
  const sc = state.scorecard; const c = sc.country; const m = sc.meta;
  $('country-name').textContent = c.name; $('country-name').removeAttribute('data-country-title');
  $('k-meta').replaceChildren(h('strong', { id: 'country-name' }, c.name), ` · ${c.region} · ${c.income_group}${c.landlocked ? ' · landlocked' : ''} · public data as of `,
    h('gt-term', { def: 'The snapshot date of the public data behind every rating on this page. Data arrive with a lag, so the newest year of a measure can be ' +
      'earlier than this.' }, m.snapshot_id || '—'));
  $('k-question').textContent = `What holds back private investment in ${c.name}?`;
  const note = fcsNote(state.fcs, c.iso3, c.name);
  const el = $('fcs-note'); if (note) { el.hidden = false; el.textContent = note; } else el.hidden = true;
  $('versions').textContent = `Public data snapshot ${m.snapshot_id || '—'} · rubric ${m.rubric_version || '—'} · engine ${m.engine_version || '—'}.`;
}
function renderAnswer() {
  const bl = bottomLine(plainCtx());
  $('k-answer').textContent = answerSentence(bl, state.scorecard.country.name);
}
function renderPeers() {
  const members = activeMembers();
  const kind = Array.isArray(state.peers) ? 'countries you chose' : (SET_KIND[state.activeSet] || 'countries');
  const change = h('a', { href: tabHref('/growth-test-site/desk/areas.html', iso, '&section=comparators') }, 'change');
  $('k-peers').replaceChildren('Judged against ', h('gt-term', { def: 'Each measure is read against what the economy’s income predicts and against these ' +
    'comparison countries; the default set is the economies most similar in income, size, resources and geography. The result is not a ranking of ' +
    'countries, and it is not about household needs.' }, `${members.length} ${kind}`),
    `: ${englishList(members.map(nameOf))} (`, change, ').');
}
function renderSettingNote() {
  const el = $('setting-note');
  if (state.setting === 'standard') { el.hidden = true; return; }
  el.hidden = false;
  el.replaceChildren(h('strong', {}, `${SETTING_LABEL[state.setting]} reading, not the one to cite.`), state.viewBase && state.viewBase.fallback
    ? ' This reading needs the in-browser engine for these comparison countries, so the page shows Standard.'
    : ' The figures are the same under every reading; only the ratings change. Standard is the only reading to cite.');
}
/** The compact tree (V4): a rating surface, untouched by motion; the key folds (D2), the squares do not. */
function renderCompactTree() {
  $('ctree-host').replaceChildren(
    compactTree({ registry: state.registry, nodes: state.view.nodes, overrides: state.overrides, href: (id) => tabHref('/growth-test-site/desk/areas.html', iso, `&node=${encodeURIComponent(id)}`) }),
    fold('Key', h('p', { class: 'ctree-key' }, 'One square per area in the order of the decision tree, coloured by its rating; an arrow on a ' +
      'grey square is its lean, toward (↑) or away from (↓) a problem. Hover for the name; click for the evidence. No total.')));
}

// ---------- the three lists (the same bottomLine() as country.mjs; reasons, comparison countries and dissent stay visible, D3) ----------
function areaLink(id, label, cls = '') {
  const a = h('a', { href: tabHref('/growth-test-site/desk/areas.html', iso, `&node=${encodeURIComponent(id)}`), class: cls || null }, label);
  a.addEventListener('click', () => { a.href = tabHref('/growth-test-site/desk/areas.html', iso, `&node=${encodeURIComponent(id)}`); });
  return a;
}
function joinEls(parts) {
  const out = [];
  parts.forEach((p, i) => { if (i) out.push(i === parts.length - 1 ? (parts.length > 2 ? ', and ' : ' and ') : ', '); out.push(...[p].flat()); });
  return out;
}
/** A <gt-fold> disclosure: the summary stays, the body folds (D2); animated by motion.mjs, instant under reduced motion. */
function fold(label, ...body) {
  return h('gt-fold', {}, h('details', { class: 'k-fold' }, h('summary', { class: 'gt-fold-sum' }, label), h('div', { class: 'gt-fold-body' }, ...body)));
}
function renderLists() {
  const bl = bottomLine(plainCtx());
  const c = state.scorecard.country.name;
  const body = $('statements-body'); body.replaceChildren();
  const ovMark = (id) => (state.overrides[id] ? h('span', { class: 'bl-ov' }, `your override: ${plainTier(state.overrides[id].tier).toLowerCase()}`) : null);
  const line = (x, text, grade) => h('li', {},
    h('span', { class: 'bl-area' }, areaLink(x.id, cap(itemName(x)))), grade ? h('span', { class: 'bl-grade' }, grade) : null, robustChip(x.node),
    h('span', {}, text), ovMark(x.id));
  const names = (items) => joinEls(items.map((x) => [areaLink(x.id, x.short), ovMark(x.id)].filter(Boolean)));
  const list = (cls, title, sub) => h('section', { class: `bl-list k-list ${cls}` }, h('h2', {}, title), sub ? h('p', { class: 'bl-sub' }, sub) : null);

  const s1 = list('bl-stop', 'Stop arguing about', null);
  const stops = [...bl.ruled.map((x) => ({ x, grade: 'Ruled out' })), ...bl.probNot.map((x) => ({ x, grade: 'Probably not' }))];
  if (stops.length) {
    s1.append(h('ul', {}, stops.map(({ x, grade }) => line(x, `${x.away ? `${cap(x.away.text)}.` : 'Most measures point away from a problem.'}` +
      `${x.counter ? ` But ${x.counter.text}.` : ''}`, grade))));
    if (bl.probNot.length) s1.append(h('p', { class: 'bl-note' }, '“Probably not” is weaker than “ruled out”: do not drop a program on it alone.'));
  } else {
    s1.append(h('p', { class: 'bl-none' }, h('strong', {}, `Nothing yet for ${c}.`), ` ${shareText()}`));
    const away = bl.awayLeans.slice(0, 3);
    if (away.length) s1.append(h('p', { class: 'bl-note' }, 'Leaning away, below the bar (not a verdict): ', ...joinEls(away.map((x) => [areaLink(x.id, x.short)])), '.'));
  }

  const s2 = list('bl-look', 'Look closer', 'Not established: confirm in-country first.');
  const firm = (x) => (x.node.robustness && x.node.robustness.mark === 'holds' ? 0 : 1);
  const look = bl.look.slice().sort((a, b) => firm(a) - firm(b) || (b.node.N ?? 0) - (a.node.N ?? 0));
  if (look.length) {
    s2.append(h('ul', {}, look.map((x) => line(x, x.facts.length ? `${cap(x.facts[0].text)}.` : 'See the evidence card.', x.node.tier === 'likely_binding' ? 'Likely' : null))));
  } else {
    s2.append(h('p', { class: 'bl-none' }, h('strong', {}, `No area stands out for ${c} yet.`)));
    const toward = bl.towardLeans.slice(0, 3);
    if (toward.length) s2.append(h('p', { class: 'bl-note' }, 'Leaning toward a problem, below the bar (not a verdict): ', ...joinEls(toward.map((x) => [areaLink(x.id, x.short)])), '.'));
  }

  const s3 = list('bl-unclear', 'Can’t settle yet, and what would', null);
  if (!bl.nUnclear) s3.append(h('p', { class: 'bl-none' }, 'Nothing: every area has a rating.'));
  else {
    const g = bl.groups;
    const grp = (items, label, next) => (items.length ? h('li', {}, h('span', { class: 'bl-reason' }, `${label} (${items.length})`), h('span', {}, ...names(items), '. '),
      h('span', { class: 'bl-next' }, next)) : null);
    const elim = g.elimination.map((x) => (x.node.elimination && x.node.elimination.direction !== 'none' ? ` Today it leans ${x.node.elimination.direction === 'toward' ?
      'toward' : 'away from'} a problem.` : '')).join('');
    s3.append(h('ul', {},
      grp(g.oneKind, 'Only one kind of evidence', `Next: a second kind of evidence (a price, a response to change, or firms working around it) would settle it.` +
        `${bl.closest ? ` Of these, ${bl.closest.short} comes nearest to a rating (it leans ${bl.closest.node.N > 0 ? 'toward' : 'away from'} a problem).` : ''}`),
      grp(g.mixed, 'Evidence points both ways', 'Next: check whether it binds for some sectors or regions only.'),
      grp(g.dataGap, `Too little recent data for ${c}`, 'Next: a newer survey or data year would settle it.'),
      grp(g.toolGap, 'Not connected to the tool yet', `Next: a new measure in the tool; no data for ${c} changes it today.`),
      grp(g.sector, 'Needs a sector study', 'Next: sector work.'),
      g.elimination.length ? h('li', {}, h('span', { class: 'bl-reason' }, `Judged by elimination (${g.elimination.length})`), h('span', {}, ...names(g.elimination), '. '),
        h('span', { class: 'bl-next' }, `Self-discovery asks whether firms are held back from trying new products. Next: rule out the other causes of low returns first.${elim} `),
        h('a', { href: tabHref('/growth-test-site/desk/selfdiscovery.html', iso) }, 'Read more →')) : null));
    if (bl.firmsTop) {
      const r = bl.firmsTop.r; const m = String(r.name || '').match(/choosing (.+?) as their biggest obstacle/i);
      const what = m ? m[1] : shortName(r).toLowerCase();
      s3.append(h('p', { class: 'bl-note' }, `Firms rank ${what} as their biggest obstacle (${fmt(r.value_ref, 0)}% name it first, ${refSpan(r)}). Complaints alone ` +
        `cannot establish a constraint${bl.firmsTop.toolGap ? ', and the tool has no measure of its cost yet' : ''}, so it is not rated.`));
    }
  }
  body.append(s1, s2, s3);
  if (state.view.note) body.append(h('p', { class: 'note' }, state.view.note));
  // explanation folds outside the lists (tenet 6: motion.mjs refuses a fold inside .bl-list, a rating surface)
  $('lists-help').replaceChildren(look.length ? fold('What the tag beside an area means', h('p', { class: 'small muted' }, 'It says whether the area stays on ' +
    'its list under all three readings in the top bar (Cautious, Standard, Exploratory); tap it to see each reading’s rating.')) : '');
}
function shareText() {
  const ix = state.index; if (!ix || !Array.isArray(ix.countries) || !ix.countries.length) return '';
  const none = ix.countries.filter((c) => !Object.entries(c.tiers || {}).some(([id, t]) => !/^N11\./.test(id) && (t === 'ruled_out' || t === 'probably_not'))).length;
  const k = Math.round((none / ix.countries.length) * 10);
  return k >= 3 ? `This is common: about ${k} in 10 countries have nothing on this list. ` : '';
}
function renderOverrides() {
  const box = $('overrides-box'); box.replaceChildren();
  const ovs = Object.entries(state.overrides);
  if (!ovs.length) return;
  const ul = h('ul', { class: 'diff-list' });
  for (const [id, v] of ovs) {
    const n = nodeOf(id);
    ul.append(h('li', {}, h('strong', {}, `${nodeCode(id)} ${short(id)}`), h('span', { class: `tier-badge ${tierClass(n && n.tier)}` }, h('span', {}, `tool: ${plainTier(n && n.tier)}`)),
      h('span', { class: 'arrow' }, '→'), h('span', { class: `tier-badge ${tierClass(v.tier)}` }, h('span', {}, `you: ${plainTier(v.tier)}`)), h('span', { class: 'muted' }, v.note),
      areaLink(id, 'Edit', 'btn quiet small'),
      h('button', { class: 'btn quiet small', type: 'button', onclick: () => { delete state.overrides[id]; writeState(state); renderAll(); refreshNav(); } }, 'Remove')));
  }
  box.append(h('div', { class: 'note alert' }, h('strong', {}, 'Your overrides'), ' (your judgment beside the tool’s; in this page’s URL, so the link reproduces them)', ul));
}

// ---------- the area cards (D8): the plain sentence first; reasons, what would move it and the field questions fold ----------
function renderCards() {
  const ctx = plainCtx();
  const body = $('cards-body'); body.replaceChildren();
  for (const id of STRIP_AREAS) {
    const n = nodeOf(id); if (!n) continue;
    const ev = evidenceNode(n, state.view.nodes);
    const ov = state.overrides[id];
    const why = whyNotLines(n);
    const moves = whatWouldMove(n, ctx);
    const qs = fieldQuestions(n, state.view.nodes);
    const card = h('article', { class: 'gt-card k-card elev-1', 'data-node': id }, // not data-area: the card's folds may move, its badge may not
      h('div', { class: 'k-card-head' },
        h('h3', {}, areaLink(id, short(id).replace(/\?$/, ''))),
        h('span', { class: `tier-badge ${tierClass(n.tier)}` }, h('span', {}, plainTier(n.tier))), reasonTag(ev), robustChip(n),
        ov ? h('span', { class: 'small' }, '→ you: ', h('span', { class: `tier-badge ${tierClass(ov.tier)}` }, h('span', {}, plainTier(ov.tier)))) : null),
      h('p', { class: 'k-card-plain' }, plainSummary(n, ctx, { brief: true })));
    const sub = (title, el) => (el ? [h('h4', { class: 'k-card-h' }, title), el] : []);
    const parts = [...sub('Why not higher, why not lower', why),
      ...sub('What would move the rating', moves.length ? h('ul', { class: 'k-card-list' }, moves.map((x) => h('li', {}, x))) : null),
      ...sub('Two days in-country', qs.length ? h('ul', { class: 'k-card-list' }, qs.map((x) => h('li', {}, x))) : null)];
    if (parts.length) card.append(fold('More', ...parts));
    body.append(card);
  }
}

// ---------- TNFA's view (W8), labelled and apart; its four points fold under the heading (D2) ----------
function renderAssistance() {
  const box = $('assistance-box'); box.replaceChildren();
  const c = state.scorecard.country.name;
  if ((state.scorecard.country.income_group || '') === 'High income') return;
  const bl = bottomLine(plainCtx());
  const list = (items) => englishList(items.map((x) => x.short));
  const stops = [...bl.ruled, ...bl.probNot]; const g = bl.groups;
  const firstGap = g.dataGap.length ? 'measure what is missing for this country first' : g.oneKind.length ? `find a second kind of evidence on ${list(g.oneKind.slice(0, 2))}` : 'start with a field visit';
  box.append(
    h('span', { class: 'kicker' }, 'The New Foreign Assistance’s view · not part of any rating'),
    h('h2', {}, 'What this means for U.S. assistance'),
    fold('Read it',
      h('ul', {},
        h('li', {}, h('strong', {}, 'Choose before spending. '), stops.length ? `Programs aimed at ${list(stops)} need new evidence first: the public data argue against ` +
          `${stops.length === 1 ? 'it' : 'them'} as what holds investment back here.` : `Nothing can be ruled out for ${c} yet, so no area should be assumed not to matter.`),
        h('li', {}, h('strong', {}, 'Look first where the evidence points. '), bl.look.length ? `The public data point first to ${list(bl.look.map((x) => (x.ev !== x.node ?
          { short: x.evShort } : x)))}, which is not established. Check it with ${c}’s government, firms and researchers before anything is designed.`
          : `No area stands out, so the first step is to ${firstGap}.`),
        h('li', {}, h('strong', {}, 'Measure what can’t be settled. '), 'The cheapest next step is often to collect the missing evidence. Each “can’t settle” line above says what that is.'),
        h('li', {}, h('strong', {}, 'Fix what binds, or little changes. '), `Programs that ignore what actually holds growth back in ${c} are unlikely to reduce poverty for long. ` +
          'A reform that leaves the binding constraint in place does little for growth, however sound it is on its own (Hausmann, Rodrik and Velasco, 2005).')),
      h('p', { class: 'small' }, h('a', { href: withData('/growth-test-site/desk/methods.html#mcc') }, 'Why this way of choosing →'), ' ',
        h('a', { href: 'https://thenewforeignassistance.org', target: '_blank', rel: 'noopener' }, 'About The New Foreign Assistance →'))));
}

// ---------- take it further: the memo, the link, and the idea briefing for the reader's own AI (explanation folded, D2) ----------
function memoText() {
  return buildMemo({ scorecard: state.scorecard, view: state.view, registry: state.registry, overrides: state.overrides, activeSet: state.activeSet, peers: state.peers,
    narrative: state.narrative, fcs: state.fcs, countries: state.countries, plain: plainCtx(), setting: state.setting });
}
function renderTools() {
  const body = $('tools-body'); body.replaceChildren();
  const status = h('span', { class: 'small muted', 'aria-live': 'polite' }, '');
  const flash = (msg) => { status.textContent = msg; setTimeout(() => { status.textContent = ''; }, 3000); };
  const title = () => `The Growth Test memo: ${state.scorecard.country.name}`;
  const copyRich = async () => {
    const md = memoText(); const html = memoHTML(md, { title: title() });
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html.body], { type: 'text/html' }), 'text/plain': new Blob([md], { type: 'text/plain' }) })]);
        return 'Copied with formatting: paste into an email or Word.';
      }
      await navigator.clipboard.writeText(md); return 'Copied as plain text.';
    } catch { return 'The browser blocked the clipboard; download the text file instead.'; }
  };
  const print = () => {
    const html = memoHTML(memoText(), { title: title() });
    const w = window.open('', '_blank'); if (!w) return 'The browser blocked the print window; allow pop-ups, or download the file.';
    w.document.open(); w.document.write(html.page); w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch { /* the reader can print */ } }, 250);
    return 'Opened the memo for printing.';
  };
  const icon = (name) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'icon lg'); s.setAttribute('aria-hidden', 'true');
    const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', `/growth-test-site/desk/img/icons.svg#${name}`); s.append(u); return s; };
  const memo = h('div', { class: 'gt-entry elev-1 k-tool' }, icon('book'), h('strong', {}, 'The memo'),
    h('span', { class: 'small muted' }, 'This page as a document.'),
    h('div', { class: 'k-tool-row' },
      h('button', { class: 'btn primary small', type: 'button', onclick: () => copyRich().then(flash), title: 'Copied with formatting, for an email or Word' }, 'Copy for email'),
      h('button', { class: 'btn small', type: 'button', onclick: () => flash(print()) }, 'Print or PDF'),
      h('button', { class: 'btn quiet small', type: 'button', onclick: () => downloadText(`${iso}-memo.md`, memoText()) }, 'Download .md'),
      h('button', { class: 'btn quiet small', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(location.href); flash('Link copied.'); } catch { flash(location.href); } } },
        'Copy link')),
    status);
  const titleIn = h('input', { type: 'text', id: 'idea-title', placeholder: 'For example: Rural mini-grid program', autocomplete: 'off' });
  const ideaIn = h('textarea', { id: 'idea-text', placeholder: 'What it does, for whom and where; roughly how big; how it is meant to raise private investment or growth.' });
  const make = () => buildBriefing({ idea: ideaIn.value, title: titleIn.value, memo: memoText(), view: state.view, scorecard: state.scorecard, registry: state.registry,
    activeSet: state.activeSet, setting: state.setting, pageUrl: location.href.split('#')[0] });
  const ready = () => { if (ideaIn.value.trim()) return true; flash('Describe the idea first.'); ideaIn.focus(); return false; };
  const idea = h('div', { class: 'gt-entry elev-1 k-tool' }, icon('target'), h('strong', {}, 'Test a program idea'),
    h('span', { class: 'small muted' }, 'For the AI assistant you already use.'),
    fold('Describe the idea',
      h('p', { class: 'small muted' }, 'One file holds your idea, the growth-diagnostics method and every piece of evidence on this page; your own AI does the assessment. ' +
        'Nothing is sent anywhere.'),
      h('div', { class: 'briefing-form' }, h('div', { class: 'field' }, h('label', { for: 'idea-title' }, 'Short title (optional)'), titleIn),
        h('div', { class: 'field' }, h('label', { for: 'idea-text' }, 'Your program idea'), ideaIn)),
      h('div', { class: 'briefing-actions' },
        h('button', { class: 'btn primary small', type: 'button', onclick: () => { if (!ready()) return; downloadText(`${iso}-idea-briefing.md`, make()); flash(`Downloaded ${iso}-idea-briefing.md.`); } },
          'Download the briefing file'),
        h('button', { class: 'btn small', type: 'button', onclick: async () => { if (!ready()) return; try { await navigator.clipboard.writeText(make()); flash('Copied: paste it into your AI assistant.'); }
          catch { flash('Copy failed; use Download instead.'); } } }, 'Copy it instead')),
      h('p', { class: 'small muted' }, 'Open your AI assistant, attach or paste the file, and ask it to follow the instructions inside. Read the answer critically: the AI can be wrong, ' +
        'and these ratings are not yet validated.')));
  body.append(memo, idea);
}
main();

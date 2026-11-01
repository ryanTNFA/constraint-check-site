// Node evidence card: a side drawer. Also the plain-language helpers that the statements,
// the tree, Proposal Check and the memo share, so every surface says the same thing.
import { nodeCode, h, fmt, fmtSigned, fmtSignal, fmtValue, tierLabel, tierClass, isCannotTell, unitHint, shortName, sourceLink, sourceLabel, missingTestReason, subreasonLabel, TEST_ORDER, TEST_NUM, USER_TIERS, isStale, withData, TIER_ORD, englishList, isRegistryGap, DATA_GAP_KINDS, cannotTellCode, leanOf, CANNOT_TELL_PLAIN, ROBUST_PLAIN, robustDetail } from './common.mjs';

const FOCUSABLE = 'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

export function createCard({ drawer, scrim, registry, getState, onOverride, onOpenNode }) {
  let lastFocus = null;
  let currentId = null;

  function close() {
    // restore focus before hiding the drawer from assistive technology, so no focused element
    // sits inside an aria-hidden subtree (Chrome warns otherwise)
    const target = lastFocus && lastFocus.focus && !drawer.contains(lastFocus) ? lastFocus : null;
    if (target) target.focus();
    // the previous element may not be focusable (the body, when the card was opened by script):
    // never leave the focus inside the drawer once it is hidden
    if (document.activeElement && drawer.contains(document.activeElement)) document.activeElement.blur();
    drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); scrim.classList.remove('show');
    document.body.style.overflow = '';
    currentId = null;
  }
  function open(nodeId) {
    lastFocus = document.activeElement;
    currentId = nodeId;
    render(nodeId);
    drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); scrim.classList.add('show');
    document.body.style.overflow = 'hidden';
    const closeBtn = drawer.querySelector('.drawer-close'); if (closeBtn) closeBtn.focus();
    drawer.scrollTop = 0;
  }
  function refresh() { if (currentId) render(currentId); }
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open') && !drawer.contains(e.target)) close(); });
  drawer.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {
      const f = Array.from(drawer.querySelectorAll(FOCUSABLE)).filter((el) => !el.disabled && el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  function render(nodeId) {
    const st = getState();
    const { scorecard, view, overrides, activeSet, narrative } = st;
    const reg = registry.nodeById[nodeId];
    const node = view.nodes.find((n) => n.id === nodeId) || scorecard.nodes.find((n) => n.id === nodeId);
    const country = scorecard.country.name;
    const snapshotYear = scorecard.meta.snapshot_year || Number(String(scorecard.meta.snapshot_id).slice(0, 4));
    const staleLimit = registry.params.recency.staleness_limit_years;
    const indicators = view.indicators || scorecard.indicators;
    const setKey = view.setKey || activeSet;   // 'custom' after a browser recompute
    const setName = Array.isArray(st.peers) ? `${activeSet}, edited` : activeSet;
    const indById = Object.fromEntries(indicators.map((r) => [r.id, r]));
    const cmById = Object.fromEntries((scorecard.comovement || []).map((c) => [c.id, c]));
    const ov = overrides[nodeId];
    const pctx = { indicators, byId: indById, setKey, fallbackSet: activeSet, country, registry, nodes: view.nodes, snapshotYear };
    drawer.replaceChildren();

    // header
    drawer.append(h('div', { class: 'drawer-head' },
      h('div', {},
        h('span', { class: 'kicker' }, `${nodeCode(nodeId)} · ${reg && reg.branch ? reg.branch : ''}`),
        h('h2', { id: 'drawer-title' }, reg ? reg.short : nodeId),
        h('div', { class: 'small muted' }, reg ? reg.label : ''),
        reg && reg.question ? h('p', { class: 'q' }, reg.question) : null,
        nodeId === 'N12' ? h('a', { class: 'small sd-link', href: withData(`/constraint-check-site/desk/selfdiscovery.html?iso=${new URLSearchParams(location.search).get('iso') || ''}`) + location.hash }, 'Self-discovery explained, with nearby products →') : null,
        h('a', { class: 'small', href: withData(`/constraint-check-site/desk/evidence.html?iso=${new URLSearchParams(location.search).get('iso') || ''}&node=${encodeURIComponent(nodeId)}&from=snapshot`) }, 'Charts for this area (analyst view) →')),
      h('button', { class: 'btn quiet small drawer-close', type: 'button', 'aria-label': 'Close evidence card', onclick: close }, 'Close')));

    if (!node) { drawer.append(h('p', { class: 'note' }, 'This area is not scored in the snapshot.')); return; }
    // a roll-up (micro risk) carries no evidence of its own: show the sub-area that sets its rating
    const ev = evidenceNode(node, view.nodes);
    const evReg = registry.nodeById[ev.id];

    // the plain reading comes first; the rule string sits in a disclosure for analysts
    const plainSec = h('section', { class: 'plain-read' }, h('h3', {}, 'What the evidence says'));
    plainSec.append(h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' },
      h('span', { class: `tier-badge lg ${tierClass(node.tier)}` }, h('span', {}, plainTier(node.tier))),
      reasonTag(evidenceNode(node, view.nodes)),
      robustChip(node),
      ov ? h('span', { class: 'small' }, '→ your override: ', h('span', { class: `tier-badge ${tierClass(ov.tier)}` }, h('span', {}, plainTier(ov.tier)))) : null,
      node.F ? h('span', { class: 'flag warn small' }, 'sensitive to the choice of comparison countries') : null,
      node.top_split_override ? h('span', { class: 'flag warn small' }, `first-decision cap applied${node.top_split_override_row ? ` (${node.top_split_override_row.replace(/_/g, ' ')})` : ''}`) : null));
    plainSec.append(h('p', { class: 'plain' }, plainSummary(node, pctx)));
    const setLine = tierBySetLine(node, activeSet, Array.isArray(st.peers));
    if (setLine) plainSec.append(h('p', { class: 'small', style: 'margin-top:6px' }, setLine));
    drawer.append(plainSec);

    const rule = h('details', { class: 'rule-detail' }, h('summary', {}, 'Rule detail (for analysts)'));
    rule.append(h('p', { class: 'reason', style: 'margin-top:8px' }, node.tier_reason || '—'));
    if (isCannotTell(node.tier) && node.tier_subreason) rule.append(h('p', { class: 'small muted' }, `Engine tier: ${tierLabel(node.tier)} (${subreasonLabel(node.tier_subreason)}).`));
    else rule.append(h('p', { class: 'small muted' }, `Engine tier: ${tierLabel(node.tier)}.`));
    const scored = node.scored !== false && node.N != null;
    if (scored) {
      const inf = node.E_informing != null ? node.E_informing : (node.informing || []).length;
      const eTxt = node.sub_nodes && ev !== node
        ? `${node.E ?? '—'} across all ${node.sub_nodes.length} sub-areas${inf ? ` (+ ${inf} informing)` : ''}; ${evReg ? evReg.short.toLowerCase() : ev.id} itself: ${ev.E ?? '—'}`
        : `${node.E ?? '—'}${inf ? ` + ${inf} informing (do not vote)` : ''}`;
      rule.append(h('dl', { class: 'kv', style: 'margin-top:10px' },
        h('dt', {}, 'Score N (−2 to +2)'), h('dd', { class: 'num' }, fmtSigned(node.N)),
        h('dt', {}, 'Tests agreeing, C (of 4)'), h('dd', { class: 'num' }, node.C ?? '—'),
        h('dt', {}, 'Voting sources, E'), h('dd', { class: 'num' }, eTxt),
        h('dt', {}, 'Newest high-quality year, R'), h('dd', { class: 'num' }, node.R ?? '—'),
        h('dt', {}, 'High-quality (A/B) measures, of which toward a problem'), h('dd', { class: 'num' }, `${node.AB_count ?? '—'} (${node.AB_pos ?? '—'})`),
        h('dt', {}, 'Sensitivity to choices, F'), h('dd', {}, sensitivityText(node, activeSet))));
      const bl = node.blockers || {};
      const blockList = (title, items) => (items && items.length ? h('li', {}, h('strong', {}, title), ' ', items.join('; ')) : null);
      const ul = h('ul', { class: 'blockers' }, node.tier !== 'likely_binding' ? blockList('Not likely binding because:', bl.likely_binding) : null, node.tier !== 'ruled_out' ? blockList('Not ruled out because:', bl.ruled_out) : null);
      if (ul.children.length) rule.append(ul);
    }
    if (node.tier_by_set && Object.keys(node.tier_by_set).length) {
      const dl = h('div', { style: 'display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:.875rem' });
      for (const [set, t] of Object.entries(node.tier_by_set)) { if (set === 'custom') continue; dl.append(h('span', {}, h('span', { class: 'muted' }, `${set}${set === activeSet && !Array.isArray(st.peers) ? ' (active)' : ''}: `), h('span', { class: `tier-badge ${tierClass(t)}` }, h('span', {}, plainTier(t))))); }
      if (node.tier_by_set.custom) dl.append(h('span', {}, h('span', { class: 'muted' }, 'your edited set (active): '), h('span', { class: `tier-badge ${tierClass(node.tier_by_set.custom)}` }, h('span', {}, plainTier(node.tier_by_set.custom)))));
      rule.append(h('h4', { class: 'small', style: 'margin-top:12px' }, 'Rating under each comparator set'), dl);
    }
    drawer.append(h('section', {}, rule));

    // N11 roll-up: sub-nodes
    if (node.sub_nodes) {
      const sec = h('section', {}, h('h3', {}, 'Sub-areas'), h('p', { class: 'small muted', style: 'margin:0 0 8px' }, 'The roll-up takes the most worrying sub-area; among the unclear ones, conflicting before weak before data gap.'));
      const ul = h('ul', { style: 'list-style:none;padding:0;margin:0;display:grid;gap:6px' });
      for (const sid of node.sub_nodes) {
        const sn = view.nodes.find((n) => n.id === sid); const sr = registry.nodeById[sid];
        const li = h('li', {}, h('button', { class: 'btn quiet small', type: 'button', onclick: () => onOpenNode(sid) }, `${sr ? sr.short : sid}`), ' ', h('span', { class: `tier-badge ${tierClass(sn && sn.tier)}` }, h('span', {}, plainTier(sn && sn.tier))));
        if (sid === node.rollup_from) li.append(h('span', { class: 'small', style: 'margin-left:6px;color:var(--accent)' }, 'sets the rating'));
        ul.append(li);
      }
      sec.append(ul);
      drawer.append(sec);
    }

    // tests
    if (ev.scored !== false && ev.tier !== 'desk_undiagnosable' && ev.tier !== 'context_only' && ev.tests) {
      const sec = h('section', {}, h('h3', {}, ev !== node ? `The four standard tests, for ${evReg ? evReg.short.toLowerCase() : ev.id}` : 'The four standard tests'));
      const grid = h('div', { class: 'tests' });
      for (const t of TEST_ORDER) {
        const tv = ev.tests ? ev.tests[t] : null;
        const cell = h('div', { class: 'test' }, h('span', { class: 'lab' }, `Test ${TEST_NUM[t]} · ${TEST_PLAIN[t]}`));
        if (tv && tv.T != null) {
          cell.append(h('span', { class: 'val num' }, `${fmtSigned(tv.T)} `, h('span', { class: 'small muted' }, leanWord(tv.T))), h('span', { class: 'fams' }, `Measures: ${(tv.families || []).map(prettyFamily).join(', ')}${tv.shrunk ? ' · pulled toward zero: too little high-quality evidence behind it' : ''}`));
        } else if (tv && tv.not_observed) {
          cell.append(h('span', { class: 'val na' }, 'no price measure'), h('span', { class: 'fams' }, `No high-quality (class A/B) price for ${country}; ${(tv.informing || []).length} quantit${(tv.informing || []).length === 1 ? 'y informs' : 'ies inform'} (${(tv.informing || []).map(prettyFamily).join(', ')}) but do not vote.`));
        } else cell.append(h('span', { class: 'val na' }, 'could not be run'), h('span', { class: 'fams' }, missingTestReason(t, ev.id, registry)));
        if (t === 'price' && ev.price_test_note) cell.append(h('span', { class: 'fams', style: 'margin-top:6px' }, ev.price_test_note));
        grid.append(cell);
      }
      sec.append(grid);
      drawer.append(sec);
    }

    // evidence, split relative to the sign of N: "consistent with the verdict" and "dissent"
    const fams = ev.families || [];
    if (fams.length) {
      const dir = ev.N != null && ev.N < 0 ? -1 : 1;
      const sec = h('section', {}, h('h3', {}, ev !== node ? `Evidence for ${evReg ? evReg.short.toLowerCase() : ev.id}, the sub-area that sets this rating` : 'Evidence by measure, with the other side given equal weight'));
      const order = (list) => [...list.filter((f) => f.votes !== false), ...list.filter((f) => f.votes === false)];
      const pos = order(fams.filter((f) => f.signal * dir >= 0.5)), neg = order(fams.filter((f) => f.signal * dir <= -0.5)), neu = order(fams.filter((f) => Math.abs(f.signal) < 0.5));
      const cols = h('div', { class: 'evidence-cols' });
      cols.append(column(dir > 0 ? 'Points toward a problem' : 'Points away from a problem', pos), column(dir > 0 ? 'Points the other way (away from a problem)' : 'Points the other way (toward a problem)', neg));
      sec.append(cols);
      if (neu.length) { const w = h('div', { style: 'margin-top:8px' }, h('h4', { class: 'small' }, 'Near zero')); neu.forEach((f) => w.append(familyBlock(f))); sec.append(w); }
      sec.append(h('p', { class: 'small muted', style: 'margin-top:6px' }, 'How to read the table: “vs. what income predicts” is the gap to countries at the same income, in standard deviations (+1 is roughly the top sixth); the percentile is across all economies. “Toward / away” is the score the measure gives, from −2 (clearly away from a problem) to +2 (clearly toward one). Evidence type: A prices and rationing, B working around the problem, C quantities and opinions, D composite indices.'));
      if (fams.some((f) => f.votes === false)) sec.append(h('p', { class: 'small muted', style: 'margin-top:6px' }, 'Measures marked “informs, does not vote” are quantities or opinions (class C/D): they are shown, and listed on the other side where they disagree, but they do not move the score.'));
      drawer.append(sec);
    } else if (node.tier === 'context_only' && indicators.some((r) => (r.nodes || []).includes(node.id))) {
      // a context area with measures of its own (N11.policy, rubric 0.1.7): described in plain words, not scored
      const ul = h('ul', { class: 'small', style: 'margin:0;padding-left:18px;display:grid;gap:4px' });
      for (const r of indicators.filter((x) => (x.nodes || []).includes(node.id))) {
        const t = r.icr && r.icr.t != null ? `, ${fmtSigned(r.icr.t, 1)} vs. what income predicts` : '';
        ul.append(h('li', {}, r.value_ref != null ? `${shortName(r)}: ${fmtValue(r, r.value_ref)} ${unitHint(r)} (${r.year_ref}${t}).` : `${shortName(r)}: no recent value for ${country}.`));
      }
      drawer.append(h('section', {}, h('h3', {}, 'What the measures show'), ul, h('p', { class: 'small muted', style: 'margin-top:6px' }, 'Shown for context. These measures carry no score and do not enter any rating.')));
    } else if (!node.sub_nodes) {
      drawer.append(h('section', {}, h('h3', {}, 'Evidence'), h('p', { class: 'note' }, node.tier === 'desk_undiagnosable' ? 'Coordination failures cannot be judged from national statistics; this needs sector work.' : node.tier === 'context_only' ? 'Geography, natural capital and market size are context: they enter every comparison as controls and are recorded in the growth problem.' : 'No measure with a usable reading for this area in the current window.')));
    }
    // stale A/B indicators for this node
    const staleRows = indicators.filter((r) => (r.nodes || []).includes(ev.id) && r.stale_year != null);
    if (staleRows.length) {
      const sec = h('section', {}, h('h3', {}, 'Observed only before the window (not scored)'));
      const ul = h('ul', { class: 'small', style: 'margin:0;padding-left:18px' });
      for (const r of staleRows) ul.append(h('li', {}, `${shortName(r)} (${r.class}): ${fmtValue(r, r.stale_value)} ${unitHint(r)} in ${r.stale_year}`));
      sec.append(ul); drawer.append(sec);
    }
    // fallback series not scored for this economy
    const suppressed = indicators.filter((r) => (r.nodes || []).includes(ev.id) && r.suppressed);
    if (suppressed.length) {
      drawer.append(h('section', {}, h('h3', {}, 'Fallback series present but not scored'), h('ul', { class: 'small', style: 'margin:0;padding-left:18px' }, suppressed.map((r) => h('li', {}, `${shortName(r)}: ${fmtValue(r, r.value_ref)} ${unitHint(r)} (${refSpan(r)}); ${r.suppressed_note}`)))));
    }

    function column(title, list) {
      const col = h('div', { class: 'evidence-col' }, h('h4', {}, `${title} (${list.length})`));
      if (!list.length) col.append(h('p', { class: 'small muted' }, 'None.'));
      list.forEach((f) => col.append(familyBlock(f)));
      return col;
    }
    function familyBlock(f) {
      const lb = (ev.load_bearing || []).includes(f.id);
      const informs = f.votes === false;
      const block = h('div', { class: `fam${informs ? ' informs' : ''}` });
      block.append(h('div', { class: 'fam-head' },
        h('span', {}, h('strong', {}, prettyFamily(f.id)), h('span', { class: 'muted' }, ` · Test ${TEST_NUM[f.test] || '?'} ${f.test}`)),
        h('span', {}, h('span', { class: `signal ${f.signal > 0 ? 'pos' : f.signal < 0 ? 'neg' : ''}`, title: 'score from −2 (away from a problem) to +2 (toward one)' }, fmtSignal(f.signal)), informs ? ` class ${f.class} · ${f.year ?? '—'}` : ` class ${f.class} · weight ${fmt(f.weight, 2)} · ${f.year ?? '—'}`,
          informs ? h('span', { class: 'flag', style: 'margin-left:6px', title: f.vote_note || '' }, 'informs, does not vote') : null,
          lb ? h('span', { class: 'lb', style: 'margin-left:6px', title: 'removing this measure changes the rating' }, 'rating depends on it') : null)));
      const tbl = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Indicator'), h('th', { class: 'num' }, 'Value'), h('th', { class: 'num' }, 'Years'), h('th', { class: 'num', title: 'Gap to countries at the same income, in standard deviations; percentile across all economies' }, 'vs. what income predicts (sd, pct)'), h('th', { class: 'num' }, `Rank among comparison countries (${setName})`), h('th', { class: 'num' }, 'Toward (+) / away (−) from a problem'), h('th', {}, 'Evidence type'), h('th', {}, 'Source'))));
      const tb = h('tbody');
      for (const id of f.indicators || []) {
        if (cmById[id]) {
          const c = cmById[id];
          const pTxt = c.p_value != null ? `, one-sided binomial p = ${fmt(c.p_value, 3)}` : '';
          tb.append(h('tr', {}, h('td', { colspan: 8 }, h('strong', {}, id), ` co-movement of Δ${c.y} on Δ${c.x_source || c.x} (lag ${c.lag}, expected sign ${c.expected_sign}): ${c.agree != null ? `${c.agree} of ${c.pairs} pairs` : `${c.pairs} pairs`} move as predicted (sign consistency ${fmt(c.consistency, 2)}${pTxt}; ${(c.years || []).join('–')}), OLS slope ${fmtSigned(c.slope, 2)}, score ${fmtSignal(c.signal)}. Class C, Test 2${c.test_rule ? `; +1 at most in the predicted direction, −1 at p ≤ ${c.test_rule.weak_p}, −2 at p ≤ ${c.test_rule.strong_p} against` : ''}.`)));
          continue;
        }
        const r = indById[id];
        if (!r) { tb.append(h('tr', {}, h('td', { colspan: 8 }, id))); continue; }
        const regInd = registry.indicatorById[id] || {};
        const pg = r.peer_gap && (r.peer_gap[setKey] || r.peer_gap[activeSet]);
        const sig = r.signal_by_set && r.signal_by_set[setKey] != null ? r.signal_by_set[setKey] : r.signal;
        const link = sourceLink(r);
        const stale = isStale(r.year_ref, snapshotYear, staleLimit);
        const rankTxt = (x) => (Number.isInteger(x) ? String(x) : fmt(x, 1));
        const pgText = pg && pg.rank_worst != null ? `${rankTxt(pg.rank_worst)} of ${pg.n}${pg.ties ? ` (${pg.ties} tied)` : ''}` : pg && pg.insufficient ? `n/a: ${pg.peers_with_data ?? '<' + registry.params.peer_gap.min_peers_with_data} peers with data` : 'n/a';
        const multi = r.n_ref != null && r.n_ref >= 2 && r.value != null;
        tb.append(h('tr', {},
          h('td', {}, shortName(r), h('span', { class: 'sub' }, (r.direction ?? 1) >= 0 ? 'higher points toward a problem' : 'lower points toward a problem'), h('span', { class: 'sub mono' }, r.id), r.class_note ? h('span', { class: 'sub' }, r.class_note) : null, regInd.caveat || r.caveat ? h('span', { class: 'sub' }, `Caveat: ${regInd.caveat || r.caveat}`) : null),
          h('td', { class: 'num' }, `${fmtValue(r, r.value_ref)} `, h('span', { class: 'muted small' }, unitHint(r)), multi && r.value !== r.value_ref ? h('span', { class: 'sub' }, `${r.year_ref} alone: ${fmtValue(r, r.value)}`) : null),
          h('td', { class: 'num', title: multi ? `Mean of the ${r.n_ref} observations in ${refSpan(r)}` : '' }, refSpan(r), multi ? h('span', { class: 'sub' }, `${r.n_ref}-year mean`) : null, stale ? h('span', { class: 'flag warn' }, 'stale') : null),
          h('td', { class: 'num' }, r.icr ? `${fmtSigned(r.icr.t)} (${r.icr.percentile == null ? '—' : Math.round(r.icr.percentile)})` : '—'),
          h('td', { class: 'num', title: pg && pg.gap_units != null ? `gap to peer median ${fmtSigned(pg.gap_units, 2)} (${fmtSigned(pg.gap_mad, 2)} MAD); peer-gap score ${fmtSignal(pg.signal)}${pg.tied ? '; tied with the peer median (MAD 0): scored 0' : ''}` : '' }, pgText),
          h('td', { class: 'num', title: `Income comparison ${fmtSignal(r.signal_icr)}; the score is the median with the peer comparison` }, h('span', { class: `signal ${sig > 0 ? 'pos' : sig < 0 ? 'neg' : ''}` }, sig > 0 ? `toward ${fmtSignal(sig)}` : sig < 0 ? `away ${fmtSignal(sig)}` : '0')),
          h('td', { title: CLASS_PLAIN[r.class] || '' }, `${r.class}${r.class_registry && r.class_registry !== r.class ? ` (registry ${r.class_registry})` : ''}: ${CLASS_SHORT[r.class] || ''}${informs ? '' : ` · weight ${fmt(r.weight, 2)}`}`),
          h('td', {}, link ? h('a', { href: link, target: '_blank', rel: 'noopener' }, sourceLabel(r)) : h('span', { class: 'muted' }, r.source === 'derived' ? `derived: ${r.formula || regInd.formula || ''}` : sourceLabel(r)))));
      }
      tbl.append(tb); block.append(h('div', { class: 'fam-scroll' }, tbl));
      return block;
    }

    // load-bearing
    if ((ev.load_bearing || []).length) drawer.append(h('section', {}, h('h3', {}, 'Measures the rating depends on'), h('p', { class: 'small' }, `Removing any one of these voting measures changes the rating: ${ev.load_bearing.map(prettyFamily).join(', ')}.`)));
    if ((ev.informing_dissent || []).length && ev.tier !== 'elimination') drawer.append(h('section', {}, h('h3', {}, 'Supporting measures that disagree'), h('p', { class: 'small' }, `Quantities or opinions that disagree with the rating by a full point or more. They do not vote, but they block the firmest ratings: ${ev.informing_dissent.map(prettyFamily).join(', ')}.`)));

    // hand-off: what would change this, in-country checks, data gaps
    const nsec = h('section', { class: 'narr' }, h('h3', {}, 'What would change this, what to check in-country, data gaps'));
    const nn = narrative && narrative.nodes && narrative.nodes[nodeId];
    if (nn) {
      const meta = narrative.meta || {};
      nsec.append(h('p', { class: 'small muted' }, `Narrative: ${meta.written_by || 'unknown author'} · status ${meta.status || '—'} · numbers validated: ${meta.validated_numbers == null ? '—' : meta.validated_numbers ? 'yes' : 'no'}`));
      if (nn.evidence) nsec.append(h('h4', { class: 'small' }, 'Evidence'), h('p', {}, nn.evidence));
      if (nn.dissent) nsec.append(h('h4', { class: 'small' }, 'Dissent'), h('p', {}, nn.dissent));
      if (nn.what_would_change) nsec.append(h('h4', { class: 'small' }, 'What would change this verdict'), h('p', {}, nn.what_would_change));
      if (Array.isArray(nn.in_country_checks) && nn.in_country_checks.length) nsec.append(h('h4', { class: 'small' }, 'If you have two days in-country'), h('ul', {}, nn.in_country_checks.map((x) => h('li', {}, x))));
      if (Array.isArray(nn.data_gaps) && nn.data_gaps.length) nsec.append(h('h4', { class: 'small' }, 'Data gaps'), h('ul', {}, nn.data_gaps.map((x) => h('li', {}, x))));
      if (nn.model_dissent) nsec.append(h('h4', { class: 'small' }, 'Where the model disagrees'), h('p', {}, nn.model_dissent));
    } else {
      // computed from the rule and the data, until a written narrative exists (never show file paths)
      const moves = whatWouldMove(node, pctx);
      if (moves.length) nsec.append(h('h4', { class: 'small' }, 'What would move the rating'), h('ul', {}, moves.map((x) => h('li', {}, x))));
      const qs = fieldQuestions(node, view.nodes);
      nsec.append(h('h4', { class: 'small' }, 'If you have two days in-country'));
      if (qs.length) nsec.append(h('ul', {}, qs.map((x) => h('li', {}, x))));
      else nsec.append(h('p', { class: 'small muted' }, 'Field questions for this area are not written yet.'));
      const gaps = dataGaps(node, pctx);
      if (gaps.length) nsec.append(h('h4', { class: 'small' }, 'Data gaps'), h('ul', {}, gaps.map((x) => h('li', {}, x))));
      nsec.append(h('p', { class: 'small muted' }, `Generated from the scoring rule and the data. A written narrative for ${country} is not available yet.`));
    }
    const missing = (node.connectors_missing && node.connectors_missing.length ? node.connectors_missing : registry.connectorsNotBuilt.filter((f) => f.nodes.includes(nodeId)).map((f) => f.family));
    if (missing.length) {
      const items = missing.map((fam) => { const f = registry.connectorsNotBuilt.find((x) => x.family === fam); return f ? `${fam} (Class ${f.class}): ${f.source}` : fam; });
      nsec.append(h('h4', { class: 'small' }, 'Measures the tool does not collect yet'), h('ul', { class: 'small' }, items.map((x) => h('li', {}, x))));
    }
    drawer.append(nsec);

    // override
    if (node.tier === 'context_only') { drawer.append(h('section', {}, h('p', { class: 'small muted' }, 'Context areas carry no rating and cannot be overridden.'))); return; }
    const osec = h('section', {}, h('h3', {}, 'Your override'));
    if (ov) osec.append(h('div', { class: 'override-current' }, h('strong', {}, plainTier(ov.tier)), ov.note ? ` — ${ov.note}` : '', h('div', { class: 'small muted' }, 'Shown next to the tool\'s rating in the memo; lives in this page\'s URL.')));
    const sel = h('select', { id: 'ov-tier', 'aria-label': 'Your rating' }, h('option', { value: '' }, 'Choose a rating…'), USER_TIERS.map((t) => h('option', { value: t, selected: ov && ov.tier === t ? true : null }, plainTier(t))));
    const note = h('textarea', { id: 'ov-note', placeholder: 'Required: why you disagree, with the evidence you rely on.', 'aria-label': 'Override note (required)' }, ov ? ov.note : '');
    const err = h('p', { class: 'small', role: 'alert', style: 'color:var(--tier-binding);margin:0', hidden: true });
    const apply = h('button', { class: 'btn primary small', type: 'button', onclick: () => {
      const tier = sel.value, text = note.value.trim();
      if (!tier) { err.hidden = false; err.textContent = 'Choose a rating.'; return; }
      if (!text) { err.hidden = false; err.textContent = 'A note is required for an override.'; return; }
      err.hidden = true; onOverride(nodeId, { tier, note: text }); render(nodeId);
    } }, ov ? 'Update override' : 'Set override');
    const clear = h('button', { class: 'btn quiet small', type: 'button', disabled: !ov, onclick: () => { onOverride(nodeId, null); render(nodeId); } }, 'Clear');
    osec.append(h('div', { class: 'override-form' }, h('label', { for: 'ov-tier' }, 'Your rating (the tool\'s rating stays visible)'), sel, h('label', { for: 'ov-note' }, 'Note (required)'), note, err, h('div', { style: 'display:flex;gap:8px' }, apply, clear)));
    drawer.append(osec);
  }

  return { open, close, refresh, get currentId() { return currentId; } };
}

export function prettyFamily(id) {
  if (!id) return '';
  if (id.startsWith('CM.')) return id;
  return id.replace(/^es_/, 'ES: ').replace(/^wgi_/, 'WGI ').replace(/_/g, ' ');
}

// ===================================================================================
// Plain language. Every sentence below is built from numbers the engine already computed;
// nothing here changes a tier. The tool is licensed to say stop, not go: no sentence may
// say that a constraint binds or that a program should be funded.
// ===================================================================================

/** Plain names for the tiers; the engine's names stay in the rule detail. */
export const PLAIN_TIER = {
  likely_binding: 'Likely a main constraint',
  candidate: 'Worth a closer look',
  cannot_tell_conflicting: 'Unclear: conflicting evidence',
  cannot_tell_weak: 'Unclear: evidence too weak',
  cannot_tell_data_gap: 'Unclear: data gap',
  probably_not: 'Probably not the main constraint',
  ruled_out: 'Ruled out',
  desk_undiagnosable: 'Needs sector study',
  context_only: 'Context, not a constraint',
  elimination: 'Judged by elimination',
};
export const plainTier = (t) => PLAIN_TIER[t] || tierLabel(t);

/** The area as a phrase that fits "whether ___ holds back private investment". */
export const PLAIN_AREA = {
  N0: 'the cost of finance (rather than low returns)',
  N1: 'access to international finance',
  N2: 'low domestic savings',
  N3: 'weak bank lending (financial intermediation)',
  N4: 'low skills and education (human capital)',
  N5: 'unreliable or costly electricity',
  N6: 'poor transport and logistics',
  N7: 'poor ICT, water or irrigation',
  N8: 'insecure land tenure or weak land markets',
  N10: 'macroeconomic risk (inflation, exchange rate, public debt)',
  N11: 'microeconomic risks (corruption, taxes, regulation, crime, property rights)',
  'N11.property': 'weak property rights',
  'N11.corruption': 'corruption',
  'N11.taxes': 'taxes and tax administration',
  'N11.regulation': 'regulation and barriers to entry',
  'N11.crime': 'crime and insecurity',
  'N11.policy': 'policy uncertainty',
  N12: 'too little discovery of new products and markets (self-discovery)',
  N13: 'coordination failures',
};
export function plainArea(registry, id) {
  if (PLAIN_AREA[id]) return PLAIN_AREA[id];
  const r = registry && registry.nodeById[id];
  return r ? r.label.toLowerCase() : id;
}
/** Short lower-case name for lists ("finance or returns", "electricity"). */
// Plain names where the tree's short label means nothing to a non-economist (AI reader test, 31 October)
const PLAIN_SHORT = { N0: 'whether costly finance or low returns is the bigger problem' };
export function plainShort(registry, id) {
  if (PLAIN_SHORT[id]) return PLAIN_SHORT[id];
  const r = registry && registry.nodeById[id];
  return (r ? r.short : id).replace(/\?$/, '').toLowerCase();
}

const TEST_PLAIN = {
  price: 'Is it expensive or rationed?',
  changes: 'When it eases, does investment respond?',
  circumvention: 'Do firms pay to work around it?',
  camels: 'Do industries that need little of it do better?',
};
/** Each test as a noun phrase: "only one kind of evidence speaks (firms paying to get around it)". */
const TEST_NOUN = {
  price: 'a high price or rationing',
  changes: 'how investment responds when it eases',
  circumvention: 'firms paying to get around it',
  camels: 'which industries do better without it',
};
const CLASS_SHORT = { A: 'price or rationing', B: 'strong indirect evidence', C: 'quantity or opinion', D: 'composite index', X: 'context' };
const CLASS_PLAIN = {
  A: 'Class A: prices, shadow prices and hard measures of rationing (weight 1.0)',
  B: 'Class B: behaviour that only makes sense if the constraint binds, such as owning a generator (weight 0.9)',
  C: 'Class C: quantities, access measures and firm or household opinions (weight 0.6)',
  D: 'Class D: composite indices and rankings (weight 0.3, never decisive)',
  X: 'Class X: context, no vote',
};
const leanWord = (x) => (x == null ? '' : x >= 0.5 ? 'toward a problem' : x <= -0.5 ? 'away from a problem' : 'near zero');

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lowerFirst = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
function ordinal(k) { const v = k % 100; const s = ['th', 'st', 'nd', 'rd']; return `${k}${s[(v - 20) % 10] || s[v] || s[0]}`; }

/** Years behind a reference value: "2022–24" when it is a mean over the latest three years, else the year. */
export function refSpan(r) {
  if (!r) return '—';
  if (r.year_ref == null) return r.stale_year != null ? String(r.stale_year) : '—';
  return r.n_ref != null && r.n_ref >= 2 ? `${r.year_ref - 2}–${String(r.year_ref).slice(-2)}` : String(r.year_ref);
}
/** "2022–24 average" or "2025". */
export function refSpanLong(r) {
  if (!r || r.year_ref == null || !(r.n_ref >= 2)) return refSpan(r);
  return r.n_ref === 2 ? `${refSpan(r)} average, 2 years with data` : `${refSpan(r)} average`;
}
/** Value with its unit, written for prose: "33.2% of firms experiencing at least one bribe request". */
export function valueText(r, v = r && r.value_ref) {
  if (!r || v == null) return '—';
  let u = unitHint(r); const num = fmtValue(r, v);
  if (!u && /^(percent|proportion|share) of /i.test(String(r.name || ''))) u = '%';
  if (!u) return num;
  if (u === '%') return `${num}%`;
  if (/^%\s/.test(u)) return `${num}%${u.slice(1)}`;
  return `${num} ${u}`;
}
export function plainSource(r) {
  if (!r) return '';
  if (/^IC\./.test(r.id) || (r.source === 'extra' && r.extra_group === 'es360')) return 'Enterprise Surveys';
  return sourceLabel(r).replace(/\s*\([^)]*\)/g, '');
}
/** "the highest of Kenya and its 10 comparison countries", from the peer rank on the binding side. */
export function rankPhrase(r, setKey, country, fallbackSet) {
  const pg = r && r.peer_gap && (r.peer_gap[setKey] || (fallbackSet && r.peer_gap[fallbackSet]));
  if (!pg || pg.insufficient || pg.rank_worst == null || !(pg.n > 2)) return '';
  const others = pg.peers_with_data != null ? pg.peers_with_data : pg.n - 1;
  const hiWorse = (r.direction ?? 1) >= 0;
  let k = pg.rank_worst; let word = hiWorse ? 'highest' : 'lowest';
  if (k > (pg.n + 1) / 2) { k = pg.n + 1 - k; word = hiWorse ? 'lowest' : 'highest'; }
  const joint = !Number.isInteger(k) || pg.ties > 0;
  const kk = Math.max(1, Math.floor(k));
  // "with data": a comparison country without a value for this measure drops out, so the count can be below the set's size
  return `the ${joint ? 'joint ' : ''}${kk === 1 ? word : `${ordinal(kk)}-${word}`} of ${country} and the ${others} comparison countries with data`;
}
/** The reading itself, as a phrase: "33.2% of firms experiencing at least one bribe request". */
export function readingText(r) {
  const pctInName = /\(%\)/.test(String(r.name || ''));
  const u = unitHint(r) || (pctInName ? '%' : ''); const num = fmtValue(r, r.value_ref);
  let name = shortName(r).replace(/\s*\(%\)/g, '').replace(/,\s*(IMF FSI|IMF|WDI|GFDD)$/i, '');
  if ((name.match(/,/g) || []).length >= 2) name = name.split(',')[0];   // "Return to schooling, Mincerian, Montenegro-Patrinos"
  const nm = name.match(/^number of (.+)$/i);
  if (nm) return `${num} ${nm[1]}`;                                      // "2.72 electrical outages in a typical month" 
  const pm = String(r.name || '').match(/^(?:percent|proportion|share) of (.+?)(?:\s*\(%\))?$/i);
  if (pm) return `${num}% of ${pm[1]}`;                                  // "60.7% of firms owning or sharing a generator"
  if (/^% of value/i.test(u)) return `${lowerFirst(name)} at ${num}${u}`;  // a cost as a share of value: the unit alone does not say what is measured
  if (/^% of /.test(u) && u.split(/\s+/).length >= 5) return `${num}${u}`;  // the unit already says what is measured
  if (u === 'count' || u === 'ratio' || u === 'index') return `${lowerFirst(name)}: ${num}`;
  if (u === '%') return `${lowerFirst(name)} at ${num}%`;
  return `${lowerFirst(name)} at ${valueText(r)}`;
}
/** "above what Kenya's income predicts" from the income-conditional residual, when it is clear. */
function incomePhrase(r, country) {
  const t = r && r.icr ? r.icr.t : null;
  if (t == null || Math.abs(t) < 0.75) return '';
  return `${t > 0 ? 'above' : 'below'} what ${country}'s income predicts`;
}
export function factText(r, ctx) {
  let rank = rankPhrase(r, ctx.setKey, ctx.country, ctx.fallbackSet);
  // a middling peer rank says little; the income comparison is clearer then
  const pos = rank.match(/the (?:joint )?(\d+)(?:st|nd|rd|th)-/);
  if ((!rank || (pos && Number(pos[1]) > 3)) && incomePhrase(r, ctx.country)) rank = incomePhrase(r, ctx.country);
  const limit = ctx.registry && ctx.registry.params ? ctx.registry.params.recency.staleness_limit_years : 8;
  const age = ctx.snapshotYear && r.year_ref != null ? ctx.snapshotYear - r.year_ref : null;
  const stale = age != null && age > limit ? `; ${age} years old` : '';
  return `${readingText(r)} (${plainSource(r)}, ${refSpanLong(r)}${stale})${rank ? `, ${rank}` : ''}`;
}
/** The node whose evidence stands behind a rating: a roll-up shows its representative sub-node. */
export function evidenceNode(node, nodes) {
  if (node && node.sub_nodes && !(node.families || []).length && node.rollup_from) return (nodes || []).find((n) => n.id === node.rollup_from) || node;
  return node;
}
const sigOf = (r, ctx) => { const s = r.signal_by_set && r.signal_by_set[ctx.setKey] != null ? r.signal_by_set[ctx.setKey] : r.signal; return s == null ? 0 : s; };
/** The k strongest readings on one side (+1 toward a problem, −1 away), one per measure, voting measures first. */
export function topFacts(node, ctx, side = 1, k = 2) {
  if (!node) return [];
  const byId = ctx.byId || Object.fromEntries((ctx.indicators || []).map((r) => [r.id, r]));
  const lb = new Set(node.load_bearing || []);
  const usable = (f) => (f.indicators || []).some((id) => byId[id] && byId[id].value_ref != null);
  const fams = (node.families || []).filter((f) => f.signal * side >= 0.5 && usable(f));
  fams.sort((a, b) => (Number(b.votes !== false) - Number(a.votes !== false)) || (Number(lb.has(b.id)) - Number(lb.has(a.id))) || (b.signal * side - a.signal * side));
  return fams.slice(0, k).map((f) => {
    const rows = f.indicators.map((id) => byId[id]).filter((r) => r && r.value_ref != null).sort((a, b) => sigOf(b, ctx) * side - sigOf(a, ctx) * side);
    return { family: f, r: rows[0], text: factText(rows[0], ctx) };
  });
}
/** Span of the years behind a node's measures. */
export function evidenceYears(node) {
  const ys = (node && node.families ? node.families : []).map((f) => f.year).filter((y) => Number.isFinite(y));
  return ys.length ? { min: Math.min(...ys), max: Math.max(...ys) } : null;
}
export const yearsText = (yr) => (!yr ? '' : yr.min === yr.max ? String(yr.max) : `${yr.min}–${yr.max}`);
const testsRun = (n) => TEST_ORDER.filter((k) => n.tests && n.tests[k] && n.tests[k].T != null).length;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function whyNotLikely(n, P) {
  const L = P.likely_binding; const out = [];
  const run = testsRun(n);
  if ((n.C ?? 0) < L.C_min) out.push(run <= (n.C ?? 0) ? `only ${run} of the 4 standard tests could be run (${L.C_min} must agree)` : `only ${n.C ?? 0} of the ${run} tests that could be run agree (${L.C_min} must)`);
  if ((n.E ?? 0) < L.E_min) out.push(`only ${plural(n.E ?? 0, 'independent source votes', 'independent sources vote')} (${L.E_min} needed)`);
  if ((n.F ?? 0) > L.F_max) out.push('the rating changes with the choice of comparison countries');
  if ((n.informing_dissent || []).length) out.push(`a supporting measure points the other way (${n.informing_dissent.map(prettyFamily).join(', ')})`);
  if ((n.AB_pos ?? 0) < L.AB_positive_families_min) out.push(`fewer than ${L.AB_positive_families_min} high-quality measures point toward a problem`);
  return out;
}
function whyNotRuledOut(n, P) {
  const R = P.ruled_out; const out = [];
  const run = testsRun(n);
  if ((n.N ?? 0) > R.N_max) out.push(`the score is ${fmtSigned(n.N)} (${fmtSigned(R.N_max)} or lower needed)`);
  if ((n.C ?? 0) < R.C_min) out.push(run <= (n.C ?? 0) ? `only ${run} of the 4 standard tests could be run (${R.C_min} must agree)` : `only ${n.C ?? 0} of the ${run} tests that could be run agree (${R.C_min} must)`);
  if ((n.E ?? 0) < R.E_min) out.push(`only ${plural(n.E ?? 0, 'independent source votes', 'independent sources vote')} (${R.E_min} needed)`);
  if (!(n.tests && n.tests.circumvention && n.tests.circumvention.T != null)) out.push('there is no measure of firms working around the problem');
  if ((n.AB_pos ?? 0) > 0) out.push(`${plural(n.AB_pos, 'high-quality measure still points', 'high-quality measures still point')} toward a problem`);
  if ((n.informing_dissent || []).length) out.push(`a supporting measure points the other way (${n.informing_dissent.map(prettyFamily).join(', ')})`);
  if ((n.F ?? 0) > R.F_max) out.push('the rating changes with the choice of comparison countries');
  return out;
}

/** W4: one robustness mark per rated area, with the readings on hover (Q7). Null for unrated areas. */
export function robustChip(n) {
  if (!n || !n.robustness) return null;
  const m = n.robustness.mark;
  const detail = robustDetail(n, plainTier);
  const note = h('span', { class: 'robust-detail', hidden: true }, detail);
  const btn = h('button', { type: 'button', class: `robust robust-${m}`, title: detail, 'aria-expanded': 'false' }, ROBUST_PLAIN[m]);
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const open = note.hidden; note.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
  return h('span', { class: 'robust-wrap' }, btn, note);
}

/** Reason and lean beside a grey badge: "one kind of evidence ↗". Null for any other tier. */
export function reasonTag(n) {
  const code = cannotTellCode(n);
  const lean = leanOf(n);
  if (!code && !lean) return null;
  return h('span', { class: 'ct-reason' },
    lean ? h('span', { class: `lean-mark ${lean.band}`, title: lean.words, 'aria-label': lean.words }, lean.mark) : null,
    code ? ` ${CANNOT_TELL_PLAIN[code].label}` : '');
}

/** One plain paragraph that leads every card and tree hover. */
export function plainSummary(node, ctx, { brief = false } = {}) {
  if (!node) return 'Not scored in this snapshot.';
  const P = ctx.registry.params.tiers; const t = node.tier; const c = ctx.country;
  if (t === 'context_only') return node.id === 'N11.policy'
    ? 'Context to describe, not rated: political stability is partly an outcome of the other constraints, so the tool reports the measures below without scoring them.'
    : 'Context, not a constraint: geography, natural resources and market size enter every comparison as controls.';
  if (t === 'desk_undiagnosable') return 'Needs a sector study: this cannot be judged from national statistics.';
  if (t === 'elimination') return eliminationSentence(node);
  const ev = evidenceNode(node, ctx.nodes);
  const evShort = ev !== node ? plainShort(ctx.registry, ev.id) : '';
  const toward = topFacts(ev, ctx, 1, brief ? 1 : 2), away = topFacts(ev, ctx, -1, 1);
  const s = [];
  const via = ev !== node ? ` The rating comes from ${evShort}, one of ${node.sub_nodes.length} sub-areas.` : '';
  if (t === 'likely_binding' || t === 'candidate') {
    s.push(t === 'likely_binding' ? `Likely a main constraint, still to be confirmed in-country.${via}` : `Worth a closer look, not established.${via}`);
    if (toward.length) s.push(`Points toward a problem: ${toward.map((x) => x.text).join('; ')}.`);
    if (!brief) s.push(away.length ? `Points the other way: ${away[0].text}.` : 'No scored measure points the other way.');
    if (t === 'candidate') { const w = whyNotLikely(ev, P); if (w.length) s.push(`Not rated ‘likely’ because ${englishList(w)}.`); }
  } else if (t === 'probably_not' || t === 'ruled_out') {
    s.push(t === 'ruled_out' ? `Ruled out: the public evidence says this is not the main constraint on private investment in ${c}.` : 'Probably not the main constraint (moderate confidence, not ruled out).');
    if (away.length) s.push(`Points away from a problem: ${topFacts(ev, ctx, -1, brief ? 1 : 2).map((x) => x.text).join('; ')}.`);
    const counter = topFacts(ev, ctx, 1, 1)[0];
    s.push(counter ? `Strongest counter-evidence: ${counter.text}.` : 'No scored measure points toward a problem.');
    if (t === 'probably_not' && !brief) { const w = whyNotRuledOut(ev, P); if (w.length) s.push(`Not ruled out because ${englishList(w)}.`); }
  } else {
    // front-door PRD W1: one of four plain reasons, never a bare "unclear"
    const code = cannotTellCode(ev) || cannotTellCode(node);
    const whatThereIs = () => { if (!brief && (toward.length || away.length)) s.push(`What there is: ${[...toward.slice(0, 1).map((x) => `toward a problem, ${x.text}`), ...away.map((x) => `away, ${x.text}`)].join('; ')}.`); };
    if (code === 'not_connected') {
      s.push(`Unclear: the evidence that could settle this isn’t connected to the tool yet. This is a gap in the tool, not in ${c}’s data.`);
      whatThereIs();
    } else if (code === 'no_recent_data') {
      const sub = ev.tier_subreason || node.tier_subreason;
      if (sub === 'stale' && ev.R != null) s.push(`Unclear: ${c} has no recent high-quality data on this; the newest is from ${ev.R}, more than ${P.cannot_tell_data_gap.staleness_limit_years} years ago.`);
      else s.push(`Unclear: ${c} has too few recent measures on this (${plural(ev.E ?? 0, 'independent source', 'independent sources')}; ${P.cannot_tell_data_gap.E_below} needed).`);
      whatThereIs();
    } else if (code === 'one_kind') {
      const lean = leanOf(ev);
      const speaking = speakingTests(ev);
      const what = speaking.length ? ` (${englishList(speaking.map((k) => TEST_NOUN[k]))})` : '';
      s.push(lean ? `Unclear: it ${lean.words}, but only one kind of evidence speaks${what}.` : `Unclear: it leans neither way, and only one kind of evidence speaks${what}.`);
      if (!brief && toward.length) s.push(`Toward a problem: ${toward[0].text}.`);
      if (!brief && away.length) s.push(`Away: ${away[0].text}.`);
    } else {
      s.push('Unclear: the evidence points both ways.');
      if (toward.length) s.push(`Strongest toward a problem: ${toward[0].text}.`);
      if (away.length) s.push(`Strongest away: ${away[0].text}.`);
      if (!brief) s.push(leanSentence(ev, P));
    }
  }
  return s.join(' ');
}
/** Tests with a score on this node, from the engine's cannot_tell detail when present. */
function speakingTests(n) {
  const d = n.cannot_tell_detail;
  if (d && Array.isArray(d.speaking_tests)) return d.speaking_tests.map((x) => x.test);
  return TEST_ORDER.filter((k) => n.tests && n.tests[k] && n.tests[k].T != null && Math.abs(n.tests[k].T) >= 0.5);
}
/** N12 (rubric 0.1.7, decision D1): judged by elimination, with the lean of its evidence. */
export function eliminationSentence(n) {
  const l = n.elimination || {};
  const lean = l.direction === 'toward' ? 'leans toward a self-discovery problem' : l.direction === 'away' ? 'leans away from a self-discovery problem' : 'leans neither way';
  const counts = l.families ? ` (across ${plural(l.families, 'group of measures', 'groups of measures')}: ${l.toward} toward, ${l.away} away, ${l.neutral} neither)` : '';
  return `Not settled by public data alone. The pattern of new products and diversification ${lean}${counts}. It becomes a candidate only if the other low-return areas are ruled out.`;
}
function leanSentence(n, P) {
  if (n.N == null) return 'There is no score.';
  if (n.N >= 0.1) return `It leans toward a problem: score ${fmtSigned(n.N)} on a −2 to +2 scale; ‘worth a closer look’ starts at +${fmt(P.candidate.N_min, 2)} with two tests agreeing.`;
  if (n.N <= -0.1) return `It leans away from a problem: score ${fmtSigned(n.N)} on a −2 to +2 scale; ‘probably not’ starts at ${fmtSigned(P.probably_not.N_max)} with two tests agreeing.`;
  return `It leans neither way (score ${fmtSigned(n.N)} on a −2 to +2 scale).`;
}

/** "What would move the rating", computed from the rule (P is params.tiers). */
export function whatWouldMove(node, ctx) {
  const P = ctx.registry.params.tiers; const t = node.tier; const c = ctx.country;
  const ev = evidenceNode(node, ctx.nodes);
  if (t === 'elimination') return ['It is judged by elimination: it becomes worth a closer look only if the other causes of low returns (infrastructure, skills, micro and macro risks) are ruled out. A rule for that is planned for the next rubric.'];
  if (t === 'context_only' || t === 'desk_undiagnosable' || (ev.N == null && t !== 'cannot_tell_data_gap')) return t === 'desk_undiagnosable' ? ['Only a sector study can rate this area.'] : [];
  const out = [];
  const L = P.likely_binding, C = P.candidate, PN = P.probably_not, R = P.ruled_out;
  const run = testsRun(ev);
  const weights = ev.N_weights || {};
  const W = Object.values(weights).reduce((a, b) => a + b, 0);
  const priceT = ev.tests && ev.tests.price && ev.tests.price.T;
  const priceNeed = (target) => (priceT != null && weights.price && W ? priceT + (target - ev.N) * W / weights.price : null);
  if (t === 'candidate' || t === 'likely_binding') {
    if (t === 'candidate') out.push(`It would move up to ‘likely’ only if at least ${L.C_min} of the 4 tests agreed (today ${ev.C ?? 0}${run < 4 ? `; only ${run} can be run` : ''}) and at least ${L.E_min} independent sources pointed the same way (today ${ev.E ?? 0}).`);
    const f = topFacts(ev, ctx, 1, 1)[0];
    out.push(`It would move down to ‘unclear’ if the score fell below ${fmtSigned((ev.C ?? 0) >= C.C_min ? C.N_min : C.N_alt_min)} (today ${fmtSigned(ev.N)})${f ? `, for example if a newer survey or data year put ${lowerFirst(shortName(f.r))} near the comparison-country median` : ''}.`);
  } else if (t === 'probably_not' || t === 'ruled_out') {
    if (t === 'probably_not') out.push(`It would be ruled out only with a score of ${fmtSigned(R.N_max)} or lower, ${R.C_min} tests agreeing, ${R.E_min} independent sources, a measure of firms working around the problem, data less than ${R.R_max_age} years old and no high-quality measure pointing toward a problem.`);
    out.push(`It would move back to ‘unclear’ if the score rose above ${fmtSigned((ev.C ?? 0) >= PN.C_min ? PN.N_max : PN.N_alt_max)} (today ${fmtSigned(ev.N)}) or a counter-signal strengthened.`);
  } else if (t === 'cannot_tell_data_gap') {
    const sub = ev.tier_subreason || node.tier_subreason;
    const needs = ((ev.connectors_missing || []).length ? ev.connectors_missing : node.connectors_missing || []).map(prettyFamily);
    if (isRegistryGap(sub)) out.push(`Only a new measure in the tool can move this${needs.length ? `: the evidence it needs is ${englishList(needs)}` : `: ${(DATA_GAP_KINDS[sub] || {}).resolves || 'more high-quality evidence in the registry'}`}. No amount of data for ${c} changes it today.`);
    else {
      const absent = [...new Set((ctx.indicators || []).filter((r) => (r.nodes || []).includes(ev.id) && (r.class === 'A' || r.class === 'B') && (r.value_ref == null || r.stale_year != null)).map((r) => shortName(r)))].slice(0, 3);
      if (sub === 'stale') out.push(`A newer observation of the main high-quality measure would let the tool rate this area${absent.length ? `: ${englishList(absent)}` : ''}.`);
      else out.push(`A second recent high-quality measure for ${c} would let the tool rate this area (today ${ev.E ?? 0} of ${P.cannot_tell_data_gap.E_below})${absent.length ? `. Missing or out of date: ${englishList(absent)}` : ''}.`);
    }
  } else if (ev.N != null) {
    if (cannotTellCode(ev) === 'one_kind') {
      const d = ev.cannot_tell_detail;
      const missing = d && Array.isArray(d.missing_tests) ? d.missing_tests : TEST_ORDER.filter((k) => !(ev.tests && ev.tests[k] && ev.tests[k].T != null));
      if (missing.length) out.push(`A second kind of evidence would settle it either way: ${englishList(missing.map((k) => TEST_NOUN[k]))}. The field questions are a start.`);
    }
    if (ev.N >= 0) {
      const need = priceNeed(C.N_min);
      out.push(`To reach ‘worth a closer look’ the score would need +${fmt(C.N_min, 2)} with ${C.C_min} tests agreeing, or +${fmt(C.N_alt_min, 2)} on fewer (today ${fmtSigned(ev.N)}, ${ev.C ?? 0} agreeing).${need != null && need <= 2 ? ` With the other tests unchanged, the price test would need to reach about ${fmtSigned(need, 1)} (today ${fmtSigned(priceT, 2)}).` : ''}`);
      out.push(`‘Probably not’ would need the score at ${fmtSigned(PN.N_max)} or lower with ${PN.C_min} tests agreeing (or ${fmtSigned(PN.N_alt_max)} on fewer).`);
    } else {
      const need = priceNeed(PN.N_max);
      out.push(`To reach ‘probably not’ the score would need ${fmtSigned(PN.N_max)} with ${PN.C_min} tests agreeing, or ${fmtSigned(PN.N_alt_max)} on fewer (today ${fmtSigned(ev.N)}, ${ev.C ?? 0} agreeing).${need != null && need >= -2 ? ` With the other tests unchanged, the price test would need to fall to about ${fmtSigned(need, 1)} (today ${fmtSigned(priceT, 2)}).` : ''}`);
      out.push(`‘Worth a closer look’ would need the score at +${fmt(C.N_min, 2)} or higher with ${C.C_min} tests agreeing.`);
    }
  }
  return out;
}

/** Data gaps: tests that could not be run, measures not collected, observations before the window. */
export function dataGaps(node, ctx) {
  const ev = evidenceNode(node, ctx.nodes); const reg = ctx.registry;
  if (!ev || ev.tier === 'context_only' || ev.tier === 'desk_undiagnosable') return [];
  const out = [];
  for (const t of TEST_ORDER) {
    const tv = ev.tests ? ev.tests[t] : null;
    if (tv && tv.T != null) continue;
    if (tv && tv.not_observed) out.push(`Test ${TEST_NUM[t]} (${TEST_PLAIN[t].toLowerCase()}): no high-quality price for ${ctx.country} in the window.`);
    else out.push(`Test ${TEST_NUM[t]} (${TEST_PLAIN[t].toLowerCase()}): ${missingTestReason(t, ev.id, reg).replace(/^Not computed: /, '')}`);
  }
  const stale = (ctx.indicators || []).filter((r) => (r.nodes || []).includes(ev.id) && r.stale_year != null && (r.class === 'A' || r.class === 'B'));
  for (const r of stale.slice(0, 3)) out.push(`${shortName(r)}: newest value ${fmtValue(r, r.stale_value)} ${unitHint(r)} is from ${r.stale_year}, outside the window.`);
  return out;
}

/** Fixed field questions per area (to move into registry/nodes.json when that file is next edited). */
export const FIELD_QUESTIONS = {
  N0: ['Ask three established firms that did not expand last year whether the reason was the cost or availability of credit, or that the expansion would not pay.', 'Ask the SME and corporate desks of two banks whether loan demand from creditworthy firms is rising or falling, and why.'],
  N1: ['Ask the debt management office what spread the government pays on its foreign borrowing and whether market access changed in the last two years.', 'Ask two foreign investors or their chamber of commerce what country-risk premium they apply, and what drives it.'],
  N2: ['Ask the central bank whether deposit rates are positive after inflation and whether deposits are growing.', 'Ask a pension fund or insurer where long-term domestic savings are invested and whether they can lend long-term to firms.'],
  N3: ['Ask the SME desks of two banks what share of loan applications they decline and why: collateral, credit information or price.', 'Ask the bank supervisor about bad loans, any interest-rate caps, and how much bank lending goes to the government.', 'Ask a manufacturers\' association whether members pay for investment from their own earnings because loans are unavailable or because they are too expensive.'],
  N4: ['Ask two large employers and a recruitment agency which positions take longest to fill and what pay premium skilled hires command.', 'Ask the statistics office whether recent labour-force or household-survey data can measure the return to an extra year of schooling.'],
  N5: ['Ask the utility and the regulator about outage hours, waiting times for a connection and the tariff for industrial users.', 'Ask three manufacturers what they spend running generators and whether outages have changed their investment plans.'],
  N6: ['Ask two freight forwarders or exporters the door-to-port time and cost for a container, and where the delays are: port, border or roads.', 'Ask the port or customs authority for container dwell times and clearance times.'],
  N7: ['Ask firms and the telecoms regulator about the price and reliability of business internet.', 'Ask farmers\' organisations and the water authority whether irrigation or water supply limits expansion.'],
  N8: ['Ask the land registry how long a commercial title transfer takes and what share of plots are registered.', 'Ask two investors whether land-title disputes delayed a project, and for how long.'],
  N10: ['Ask the central bank and two banks about inflation expectations and access to foreign exchange.', 'Ask importers and contractors whether foreign-exchange shortages, late government payments or sudden policy changes delayed orders.'],
  'N11.property': ['Ask two commercial lawyers how long it takes to enforce a contract in the courts, and whether investors fear expropriation.'],
  'N11.corruption': ['Ask the chamber of commerce and two exporters which permits or inspections draw payment requests, and how often.', 'Ask an accounting firm how tax audits and refunds are handled and whether informal payments speed them up.'],
  'N11.taxes': ['Ask an accounting firm what a typical medium-sized firm pays in total taxes and how long VAT refunds take.', 'Ask firms whether tax rates or tax administration is the bigger problem.'],
  'N11.regulation': ['Ask firms how long licences, permits and inspections take, and whether incumbents use regulation to keep competitors out.'],
  'N11.crime': ['Ask firms and the chamber of commerce what they spend on security and whether theft or extortion has changed where they operate.'],
  'N11.policy': ['Ask investors which policy reversals in the last five years hurt their plans, and how they price that risk.'],
  N12: ['Ask the investment promotion agency which new export products started in the last five years and what held back the first movers.', 'Ask two firms that tried a new product or market whether others copied them before they recovered their costs.'],
};
export function fieldQuestions(node, nodes) {
  if (!node) return [];
  const ev = evidenceNode(node, nodes);
  const own = FIELD_QUESTIONS[node.id] || [];
  const sub = ev !== node ? FIELD_QUESTIONS[ev.id] || [] : [];
  return [...sub, ...own].slice(0, 3);
}

/** "Depends on the comparison countries: worth a closer look with regional peers; unclear with structural peers." */
export function tierBySetLine(node, activeSet, edited) {
  const by = node && node.tier_by_set;
  if (!by) return '';
  const sets = Object.entries(by).filter(([k]) => k !== 'custom');
  if (new Set(sets.map(([, t]) => t)).size <= 1) return '';
  return `Depends on the comparison countries: ${sets.map(([k, t]) => `${plainTier(t).toLowerCase()} with ${k} peers${k === activeSet && !edited ? ' (shown)' : ''}`).join('; ')}.`;
}
/** F in words, with the one-step moves the F flag does not count. */
export function sensitivityText(node, activeSet) {
  const by = node.tier_by_set || {};
  const ord = (t) => (TIER_ORD[t] ?? 0);
  const moves = Object.entries(by).filter(([k, t]) => k !== 'custom' && k !== activeSet && t !== node.tier).map(([k, t]) => ({ k, t, steps: Math.abs(ord(t) - ord(node.tier)) }));
  const lofo = node.fragility && node.fragility.leave_one_family_out;
  const moveTxt = moves.map((m) => `${m.k} peers move it ${m.steps <= 1 ? 'one step' : `${m.steps} steps`}, to ${plainTier(m.t).toLowerCase()}`).join('; ');
  if (node.F) return `${node.F}: the rating is sensitive${moves.length ? ` (${moveTxt})` : ''}${lofo ? '; dropping one measure changes it' : ''}.`;
  return `${node.F ?? 0}: no comparator set moves the rating two or more steps${moves.length ? ` (${moveTxt})` : ''}${lofo ? '; dropping one measure changes it' : ''}.`;
}

/** The World Bank list of fragile and conflict-affected situations, as recorded in registry/static_fcs.json. */
export function fcsStatus(fcs, iso3) {
  if (!fcs || !iso3) return null;
  if ((fcs.conflict || []).includes(iso3)) return 'conflict';
  if ((fcs.institutional_and_social_fragility || []).includes(iso3)) return 'fragility';
  return null;
}
export function fcsNote(fcs, iso3, country) {
  const s = fcsStatus(fcs, iso3);
  if (!s) return '';
  const listName = s === 'conflict' ? 'conflict-affected situations' : 'situations of institutional and social fragility';
  const obstacle = s === 'conflict' ? 'In active conflict the main obstacle is often security or the political settlement, which this tool does not measure.' : 'Where the state cannot deliver basic services or enforce rules, the main obstacle is often state capability or the political settlement, which this tool does not measure.';
  return `${country} is on the World Bank's list of ${listName} (FY25). This method assumes private investors respond to returns under a working state. ${obstacle} Read every rating here as weak, and do not use ‘probably not’ to drop a program.`;
}

/**
 * The three statements as data, so the page and the memo say the same thing.
 * ctx: { view, registry, indicators, setKey, fallbackSet, country }
 */
export function bottomLine(ctx) {
  const { view, registry } = ctx;
  const st = view.statements || {};
  const nodeOf = (id) => view.nodes.find((n) => n.id === id);
  const ids = [...new Set([...(st.stop_arguing || []), ...(st.look_hard || []), ...(st.cannot_tell || [])])].filter((id) => nodeOf(id));
  const by = (pred) => ids.filter((id) => pred(nodeOf(id).tier));
  const item = (id) => { const n = nodeOf(id); const ev = evidenceNode(n, view.nodes); return { id, node: n, ev, short: plainShort(registry, id), evShort: plainShort(registry, ev.id), years: yearsText(evidenceYears(ev)) }; };
  const ruled = by((t) => t === 'ruled_out').map(item);
  const probNot = by((t) => t === 'probably_not').map(item);
  for (const x of [...ruled, ...probNot]) { x.away = topFacts(x.ev, ctx, -1, 1)[0] || null; x.counter = topFacts(x.ev, ctx, 1, 1)[0] || null; }
  const look = by((t) => t === 'candidate' || t === 'likely_binding').map(item);
  for (const x of look) x.facts = topFacts(x.ev, ctx, 1, 2);
  const unclearIds = by((t) => isCannotTell(t) || t === 'desk_undiagnosable' || t === 'elimination');
  // the four plain reasons of front-door PRD W1, plus sector study and N12's elimination status
  const groups = { oneKind: [], mixed: [], toolGap: [], dataGap: [], sector: [], elimination: [] };
  const groupOf = { one_kind: 'oneKind', mixed: 'mixed', not_connected: 'toolGap', no_recent_data: 'dataGap' };
  for (const id of unclearIds) {
    const n = nodeOf(id);
    if (n.tier === 'desk_undiagnosable') groups.sector.push(item(id));
    else if (n.tier === 'elimination') groups.elimination.push(item(id));
    else groups[groupOf[cannotTellCode(evidenceNode(n, view.nodes)) || cannotTellCode(n)] || 'mixed'].push(item(id));
  }
  const scoredMixed = [...groups.oneKind, ...groups.mixed].filter((x) => x.node.N != null);
  const closest = scoredMixed.length ? scoredMixed.slice().sort((a, b) => Math.abs(b.node.N) - Math.abs(a.node.N))[0] : null;
  // leans below the bar: unclear areas whose score is at least half-way to the first tier on either side
  const leanPool = unclearIds.map(item).filter((x) => x.node.N != null && x.node.tier !== 'desk_undiagnosable' && x.node.tier !== 'elimination');
  const towardLeans = leanPool.filter((x) => x.node.N >= 0.25).sort((a, b) => b.node.N - a.node.N);
  const awayLeans = leanPool.filter((x) => x.node.N <= -0.25).sort((a, b) => a.node.N - b.node.N);
  for (const x of towardLeans.slice(0, 1)) x.fact = topFacts(x.ev, ctx, 1, 1)[0] || null;
  for (const x of awayLeans.slice(0, 1)) x.fact = topFacts(x.ev, ctx, -1, 1)[0] || null;
  // the obstacle firms rank first, when it sits in an unclear area: complaints inform but cannot establish a constraint
  const tops = (ctx.indicators || []).filter((r) => /^ES\.OBST_.+_TOP$/.test(r.id) && r.value_ref != null).sort((a, b) => b.value_ref - a.value_ref);
  let firmsTop = null;
  if (tops.length) {
    const r = tops[0]; const nid = (r.nodes || [])[0]; const n = nid ? nodeOf(nid) : null;
    if (n && (isCannotTell(n.tier) || n.tier === 'desk_undiagnosable')) firmsTop = { r, id: nid, node: n, toolGap: n.tier === 'cannot_tell_data_gap' && isRegistryGap(n.tier_subreason) };
  }
  return { ruled, probNot, look, groups, closest, towardLeans, awayLeans, firmsTop, nAreas: ids.length, nUnclear: unclearIds.length };
}

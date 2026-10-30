// Proposal Check, no-send mode.
// The paragraph is what a program officer pastes into a justification, so it is written in plain words,
// one template per tier, and never says a constraint binds or that a program should be funded.
// The engine's rule string sits in a collapsed "Rule detail (for analysts)" that Copy leaves out.
import { nodeCode, h, tierClass, englishList } from './common.mjs';
import { mapProposal } from './proposal_taxonomy.js';
import { plainTier, plainArea, plainShort, topFacts, evidenceNode, fcsStatus, PLAIN_AREA } from './card.mjs';

export function renderProposal(container, ctx) {
  // ctx: { getState(), registry, onOpenNode, onParagraphs(list) }
  container.replaceChildren();
  const ta = h('textarea', { id: 'proposal-text', 'aria-label': 'Program idea or deal description', placeholder: 'Example: A $40m facility providing partial credit guarantees to banks for SME lending, paired with a one-stop shop for business registration and licensing.' });
  const out = h('div', { class: 'proposal-out', 'aria-live': 'polite' });
  const run = h('button', { class: 'btn primary', type: 'button' }, 'Check against the evidence');
  const clear = h('button', { class: 'btn quiet', type: 'button', onclick: () => { ta.value = ''; out.replaceChildren(); if (ctx.onParagraphs) ctx.onParagraphs([]); } }, 'Clear');
  container.append(h('div', { class: 'field' }, h('label', { for: 'proposal-text' }, 'Program idea (stays in this page; nothing is sent anywhere)'), ta),
    h('div', { style: 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center' }, run, clear, h('span', { class: 'small muted' }, 'The text never leaves your browser.')), out);
  run.addEventListener('click', () => render(ta.value));

  function render(text) {
    out.replaceChildren();
    const st = ctx.getState();
    const mapped = mapProposal(text);
    if (!text.trim()) { out.append(h('p', { class: 'note' }, 'Paste a program idea first.')); return; }
    const selected = new Set(mapped.map((m) => m.node));
    const box = h('div');
    const head = h('p', { class: 'small muted' }, mapped.length ? 'The idea touches these areas (untick to correct the mapping, or add one):' : 'No phrase in the table matched. Add the area the idea targets:');
    const chips = h('div', { class: 'mapped' });
    const diag = ctx.registry.nodes.nodes.filter((n) => n.diagnosable);
    const addSel = h('select', { 'aria-label': 'Add an area' }, h('option', { value: '' }, 'Add an area…'), diag.map((n) => h('option', { value: n.id }, `${nodeCode(n.id)} ${n.short}`)));
    addSel.addEventListener('change', () => { if (addSel.value) { selected.add(addSel.value); if (!mapped.find((m) => m.node === addSel.value)) mapped.push({ node: addSel.value, phrases: [{ phrase: 'added by you', count: 0 }], hits: 0 }); addSel.value = ''; drawChips(); drawParas(); } });
    const paras = h('div');
    function drawChips() {
      chips.replaceChildren();
      for (const m of mapped) {
        const cb = h('input', { type: 'checkbox', checked: selected.has(m.node) ? true : null, onchange: (e) => { if (e.target.checked) selected.add(m.node); else selected.delete(m.node); drawParas(); } });
        const reg = ctx.registry.nodeById[m.node];
        chips.append(h('label', {}, cb, h('span', {}, `${nodeCode(m.node)} ${reg ? reg.short : ''}`), h('span', { class: 'why' }, m.phrases.map((p) => (p.count ? `“${p.phrase}”×${p.count}` : p.phrase)).join(', '))));
      }
      chips.append(addSel);
    }
    function drawParas() {
      paras.replaceChildren();
      const ids = mapped.map((m) => m.node).filter((id) => selected.has(id));
      if (!ids.length) { paras.append(h('p', { class: 'small muted' }, 'No area selected.')); if (ctx.onParagraphs) ctx.onParagraphs([]); return; }
      const all = [];
      for (const id of ids) {
        const text = paragraphFor(id, st, ctx.registry);
        all.push({ id, text });
        const node = st.view.nodes.find((n) => n.id === id);
        const reg = ctx.registry.nodeById[id];
        const p = h('div', { class: 'para' },
          h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px' }, h('strong', {}, `${reg ? reg.short : id}`), h('span', { class: `tier-badge ${tierClass(node && node.tier)}` }, h('span', {}, plainTier(node && node.tier))), st.overrides[id] ? h('span', { class: 'small' }, `your override: ${plainTier(st.overrides[id].tier)}`) : null, h('button', { class: 'btn quiet small', type: 'button', onclick: () => ctx.onOpenNode(id) }, 'Open the evidence')),
          h('p', { class: 'para-text' }, text),
          h('div', { class: 'actions' }, copyButton(text)),
          node && node.tier_reason ? h('details', { class: 'rule-detail' }, h('summary', {}, 'Rule detail (for analysts; not copied)'), h('p', { class: 'reason small' }, node.tier_reason)) : null);
        paras.append(p);
      }
      if (all.length > 1) paras.append(h('div', { style: 'margin-top:8px' }, copyButton(all.map((x) => x.text).join('\n\n'), 'Copy all statements')));
      if (ctx.onParagraphs) ctx.onParagraphs(all);
    }
    drawChips(); drawParas();
    box.append(head, chips, paras);
    out.append(box);
  }
}

function copyButton(text, label = 'Copy statement') {
  const b = h('button', { class: 'btn small', type: 'button' }, label);
  b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; }
    catch { const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); try { document.execCommand('copy'); b.textContent = 'Copied'; } catch { b.textContent = 'Select and copy manually'; } ta.remove(); }
    setTimeout(() => { b.textContent = label; }, 1800);
  });
  return b;
}

const CLOSING = 'This tool never recommends funding.';

/** The areas the evidence does point to (candidate or likely), named in plain words. */
function pointers(st, registry, exceptId) {
  return st.view.nodes.filter((n) => !/^N11\./.test(n.id) && n.id !== exceptId && (n.tier === 'likely_binding' || n.tier === 'candidate')).map((n) => {
    const ev = evidenceNode(n, st.view.nodes);
    return ev !== n ? `${plainShort(registry, ev.id)} (part of ${plainShort(registry, n.id)})` : plainShort(registry, n.id);
  });
}

/** One citeable paragraph per mapped area, built from this Snapshot's numbers. */
export function paragraphFor(nodeId, st, registry) {
  const node = st.view.nodes.find((n) => n.id === nodeId);
  const country = st.scorecard.country.name;
  const area = plainArea(registry, nodeId);
  const snap = st.scorecard.meta.snapshot_id;
  const source = `Source: Constraint Check prototype (TNFA), public data, snapshot ${snap}; its scoring rules have not yet been tested against expert diagnoses.`;
  if (!node) return `This snapshot does not rate whether ${area} holds back private investment in ${country}. ${source} ${CLOSING}`;
  const ctx = { indicators: st.view.indicators || st.scorecard.indicators, setKey: st.view.setKey || st.activeSet, fallbackSet: st.activeSet, country, registry, nodes: st.view.nodes, snapshotYear: st.scorecard.meta.snapshot_year || Number(String(st.scorecard.meta.snapshot_id).slice(0, 4)) };
  const ev = evidenceNode(node, st.view.nodes);
  const t = node.tier;
  const P = registry.params.tiers;
  const s = [];
  const toward = topFacts(ev, ctx, 1, 2), away = topFacts(ev, ctx, -1, 1);
  const elsewhere = pointers(st, registry, nodeId);
  const pointTo = elsewhere.length ? `The ${elsewhere.length === 1 ? 'one area where the evidence does point' : 'areas where the evidence does point'} in ${country}: ${englishList(elsewhere)}.` : `No area reaches ‘worth a closer look’ in ${country} under the current comparison countries.`;
  const via = ev !== node ? ` (through ${plainShort(registry, ev.id)}, the sub-area that sets the rating for ${plainShort(registry, nodeId)})` : '';
  const run = ['price', 'changes', 'circumvention', 'camels'].filter((k) => ev.tests && ev.tests[k] && ev.tests[k].T != null).length;
  if (t === 'likely_binding' || t === 'candidate') {
    s.push(t === 'likely_binding'
      ? `Public evidence points to ${area} as one of the likely constraints on private investment in ${country}${via}, though it is not established until it is confirmed in-country.`
      : `Some public evidence is consistent with ${area} holding back private investment in ${country}${via}, but it is not established.`);
    if (toward.length) s.push(`${toward.length === 2 ? 'Two separate measures agree' : 'The main measure'}: ${toward.map((x) => x.text).join('; and ')}.`);
    if (away.length) s.push(`Pointing the other way: ${away[0].text}.`);
    s.push(`Only ${run} of the four standard tests could be run${(ev.E ?? 0) < P.likely_binding.E_min ? `, and only ${ev.E ?? 0} independent source${ev.E === 1 ? '' : 's'} count${ev.E === 1 ? 's' : ''} toward the rating (${P.likely_binding.E_min} are needed for a firm call)` : ''}.`);
    s.push('This supports a closer look, not a finding that a program here will work. Confirm in-country before relying on it.');
  } else if (t === 'probably_not' || t === 'ruled_out') {
    s.push(t === 'ruled_out'
      ? `The public evidence indicates that ${area} is not the main constraint on private investment in ${country}${via}. A program aimed here would need a reason other than relieving a constraint on growth.`
      : `The public evidence leans against ${area} being the main constraint on private investment in ${country}${via} (moderate confidence; not ruled out).`);
    if (away.length) s.push(`Main evidence: ${away[0].text}.`);
    const counter = topFacts(ev, ctx, 1, 1)[0];
    s.push(counter ? `Strongest counter-evidence: ${counter.text}.` : 'No scored measure points the other way.');
    s.push('This is about what holds back private investment, not about household needs.');
    s.push(pointTo);
  } else if (t === 'cannot_tell_data_gap') {
    const sub = ev.tier_subreason || node.tier_subreason;
    if (sub === 'no_ab_family' || sub === 'no_ab_price_family' || sub === 'registry_coverage' || sub === 'connector_not_built') s.push(`The tool has no adequate public measure yet of whether ${area} holds back private investment in ${country}. This is a gap in the tool, not evidence either way: it neither supports nor rules out a program in this area.`);
    else if (sub === 'stale') s.push(`The newest high-quality public evidence on whether ${area} holds back private investment in ${country} is too old to use. This neither supports nor rules out a program in this area.`);
    else s.push(`There are too few recent public measures for ${country} to judge whether ${area} holds back private investment. This neither supports nor rules out a program in this area.`);
    s.push(pointTo);
  } else if (t === 'desk_undiagnosable') {
    s.push(`Whether ${area} hold${/s$/.test(area) && !/ss$/.test(area) ? '' : 's'} back private investment in ${country} cannot be judged from public national data; it needs a sector study. This neither supports nor rules out a program in this area.`);
    s.push(pointTo);
  } else {
    // cannot tell: weak or conflicting
    const fams = ev.families || [];
    const nT = fams.filter((f) => f.signal >= 0.5).length, nA = fams.filter((f) => f.signal <= -0.5).length;
    const balance = nT === nA ? `as many measures point away as toward (${nT} and ${nA} of ${fams.length})` : `${nT} of ${fams.length} measures point toward a problem and ${nA} away`;
    s.push(t === 'cannot_tell_conflicting'
      ? `The public evidence on whether ${area} holds back private investment in ${country} conflicts: the standard tests point in opposite directions (${balance}).`
      : `The public evidence is too mixed or too thin to say whether ${area} holds back private investment in ${country}: ${balance}.`);
    if (ev.N != null && Math.abs(ev.N) >= 0.1) {
      const lean = ev.N > 0 ? toward[0] : away[0];
      s.push(`On balance it leans slightly ${ev.N > 0 ? 'toward' : 'away from'} a problem${lean ? `, for example ${lean.text}` : ''}, but not enough for a rating.`);
    }
    s.push('This neither supports nor rules out a program in this area.');
    s.push(pointTo);
  }
  const fcs = fcsStatus(st.fcs, st.scorecard.country.iso3);
  if (fcs) s.push(`${country} is on the World Bank's list of ${fcs === 'conflict' ? 'conflict-affected' : 'fragile'} situations, where this method fits poorly; treat this as weak.`);
  if (st.overrides[nodeId]) s.push(`The person who prepared this rates it differently (“${plainTier(st.overrides[nodeId].tier).toLowerCase()}”): ${st.overrides[nodeId].note}`);
  s.push(source);
  s.push(CLOSING);
  return s.join(' ');
}
export { PLAIN_AREA };

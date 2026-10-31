// The HRV decision tree (horizontal: root at left, leaves at right).
// Layout: one row per leaf, in registry order, so every branch owns its own vertical band and no
// edge passes under another branch's box (finance's areas all sit above the low-returns areas).
// Micro risk's six sub-areas are stacked under its box, which keeps the tree to five columns.
import { nodeCode, tierPaint, tierClass, h, cannotTellCode, leanOf, CANNOT_TELL_PLAIN } from './common.mjs';
import { plainTier, plainSummary, evidenceYears, yearsText } from './card.mjs';

const NODE_W = 138, NODE_H = 30, DX = 48, DY = 156;
const SUB_W = 122, SUB_H = 22, SUB_DX = 27, SUB_INDENT = 16, SUB_TOP = 46;
const STRUCT = new Set(['ROOT', 'FIN', 'RET', 'SOC', 'APP', 'GOV', 'MKT']);

function wrapWords(s, max = 24) {
  const words = String(s).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  return lines;
}

function addPattern(defs, id, stroke, width, size, cross = false) {
  const p = defs.append('pattern').attr('id', id).attr('patternUnits', 'userSpaceOnUse').attr('width', size).attr('height', size).attr('patternTransform', 'rotate(45)');
  p.append('rect').attr('width', size).attr('height', size).style('fill', 'var(--tier-cannot)');
  p.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', size).style('stroke', stroke).style('stroke-width', width);
  if (cross) p.append('line').attr('x1', 0).attr('y1', 0).attr('x2', size).attr('y2', 0).style('stroke', stroke).style('stroke-width', width);
}

/** Caption under a box: "9 sources · 2019–2025". */
function caption(n) {
  if (!n) return 'not scored';
  if (n.tier === 'elimination') return 'judged by elimination';
  // an unclear box says why (front-door PRD W1): no bare grey
  const code = cannotTellCode(n);
  if (code) return CANNOT_TELL_PLAIN[code].label;
  const yr = yearsText(evidenceYears(n));
  if (!n.E) return `no voting sources${yr ? ` · ${yr}` : ''}`;
  return `${n.E} source${n.E === 1 ? '' : 's'}${yr ? ` · ${yr}` : n.R ? ` · data to ${n.R}` : ''}`;
}

/**
 * renderTree(container, opts)
 * opts: { registry, nodes (scorecard nodes array), overrides, onOpen(id), tooltipEl, plainCtx }
 */
export function renderTree(container, { registry, nodes, overrides = {}, onOpen, tooltipEl, plainCtx = null }) {
  container.replaceChildren();
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const regNodes = registry.nodes.nodes;
  const d3 = window.d3;
  if (!d3 || !d3.stratify) { container.append(fallbackList(regNodes, byId, overrides, onOpen)); return; }

  const root = d3.stratify().id((d) => d.id).parentId((d) => d.parent)(regNodes);
  const stacked = (d) => !!(d.parent && /^N11\./.test(d.id));
  // rows: leaves in order; a parent sits at the middle of its first and last child
  let row = 0;
  const place = (d) => {
    d.y = d.depth * DY;
    const kids = (d.children || []).filter((k) => !stacked(k));
    if (!kids.length) {
      d.x = row * DX; row += 1;
      const subs = (d.children || []).filter(stacked);
      subs.forEach((k, i) => { k.x = d.x + SUB_TOP + i * SUB_DX; k.y = d.y + SUB_INDENT; k.isStacked = true; });
      if (subs.length) row += Math.ceil((SUB_TOP + (subs.length - 1) * SUB_DX + SUB_H / 2 + 6) / DX);
      return;
    }
    kids.forEach(place);
    d.x = (kids[0].x + kids[kids.length - 1].x) / 2;
  };
  place(root);
  let x0 = Infinity, x1 = -Infinity, yMax = 0;
  root.each((d) => { x0 = Math.min(x0, d.x); x1 = Math.max(x1, d.x); if (!d.isStacked) yMax = Math.max(yMax, d.y); });
  const margin = { top: 40, right: 24, bottom: 30, left: 18 };
  const width = yMax + NODE_W + margin.left + margin.right;
  const height = (x1 - x0) + NODE_H + margin.top + margin.bottom + 10;

  const svg = d3.create('svg').attr('viewBox', [0, 0, width, height]).attr('role', 'group').attr('aria-label', 'Growth diagnostics tree: the finance branch at the top, low returns below; each area coloured by its rating').attr('focusable', 'false').attr('style', `max-width:${Math.round(width * 1.2)}px`);
  const defs = svg.append('defs');
  addPattern(defs, 'hatch', 'var(--tier-cannot-hatch)', 1.2, 6);
  addPattern(defs, 'crosshatch', 'var(--tier-cannot-hatch)', 1, 6, true);
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top - x0})`);

  const isStruct = (d) => STRUCT.has(d.id);
  const srcX = (d) => (isStruct(d) ? d.y + 5 : d.y + NODE_W);
  const link = d3.linkHorizontal().x((p) => p.y).y((p) => p.x);
  const links = root.links().filter((l) => !l.target.isStacked);
  g.append('g').selectAll('path').data(links).join('path')
    .attr('class', (d) => `link${d.target.data.context_only || d.target.data.desk_undiagnosable ? ' muted' : ''}`)
    .attr('d', (d) => link({ source: { x: d.source.x, y: srcX(d.source) }, target: { x: d.target.x, y: d.target.y } }));
  // stacked sub-areas: a bracket from the parent's box down the left edge
  root.each((d) => {
    const subs = (d.children || []).filter((k) => k.isStacked);
    if (!subs.length) return;
    const bx = d.y + SUB_INDENT / 2;
    // start below the caption under the parent's box
    g.append('path').attr('class', 'link').attr('d', `M${bx},${d.x + NODE_H / 2 + 16} V${subs[subs.length - 1].x}`);
    for (const k of subs) g.append('path').attr('class', 'link').attr('d', `M${bx},${k.x} H${k.y}`);
  });

  // structural nodes: dot + label
  const sNodes = g.append('g').selectAll('g').data(root.descendants().filter(isStruct)).join('g').attr('transform', (d) => `translate(${d.y},${d.x})`);
  sNodes.append('circle').attr('r', 3.5).attr('class', 'struct-dot');
  sNodes.each(function (d) {
    const el = d3.select(this);
    const lines = wrapWords(d.data.short || d.data.label, 22);
    const sub = d.id === 'ROOT' ? wrapWords(d.data.label, 26) : [];
    const total = lines.length + sub.length;
    const yStart = -8 - (total - 1) * 13;
    lines.forEach((ln, i) => el.append('text').attr('class', 'struct-label').attr('x', -2).attr('y', yStart + i * 13).text(ln));
    sub.forEach((ln, i) => el.append('text').attr('class', 'struct-sub').attr('x', -2).attr('y', yStart + (lines.length + i) * 13).text(ln));
  });

  // diagnosable nodes: boxes (stacked sub-areas are smaller and carry no caption; the hover has it)
  const boxes = root.descendants().filter((d) => !isStruct(d));
  const W = (d) => (d.isStacked ? SUB_W : NODE_W), Hh = (d) => (d.isStacked ? SUB_H : NODE_H);
  const nodeG = g.append('g').selectAll('g').data(boxes).join('g')
    .attr('class', (d) => `node${d.data.context_only || d.data.desk_undiagnosable ? ' muted' : ''}${d.isStacked ? ' stacked' : ''}`)
    .attr('transform', (d) => `translate(${d.y},${d.x - Hh(d) / 2})`)
    .attr('tabindex', 0).attr('role', 'button')
    .attr('data-id', (d) => d.id)
    .attr('aria-label', (d) => ariaLabel(d, byId, overrides));

  nodeG.append('rect').attr('class', 'node-box').attr('width', W).attr('height', Hh)
    .style('fill', (d) => (d.data.context_only ? 'var(--tier-context)' : tierPaint(byId[d.id] ? byId[d.id].tier : null).fill))
    .classed('gap', (d) => !d.data.context_only && !!tierPaint(byId[d.id] ? byId[d.id].tier : null).dash);
  nodeG.append('text').attr('class', 'node-label').attr('x', 8).attr('y', (d) => Hh(d) / 2 + 4.5)
    .style('fill', (d) => (d.data.context_only ? 'var(--tier-context-ink)' : tierPaint(byId[d.id] ? byId[d.id].tier : null).ink))
    .style('font-size', (d) => (d.isStacked ? '11px' : d.data.short.length > 18 ? '11px' : null))
    .text((d) => d.data.short);
  nodeG.filter((d) => !d.isStacked).append('text').attr('class', (d) => (d.data.context_only || d.data.desk_undiagnosable ? 'node-ctx' : 'node-sub')).attr('x', 1).attr('y', NODE_H + 12)
    .text((d) => {
      if (d.data.context_only) return 'context, not a constraint';
      if (d.data.desk_undiagnosable) return 'needs sector study';
      return caption(byId[d.id]);
    });
  // the lean of an unclear area: an arrow at the box's right edge, never a fill
  nodeG.filter((d) => !d.data.context_only && leanOf(byId[d.id])).append('text')
    .attr('class', (d) => `lean-mark ${leanOf(byId[d.id]).band}`)
    .attr('x', (d) => W(d) - 14).attr('y', (d) => Hh(d) / 2 + 5).attr('text-anchor', 'middle')
    .style('fill', (d) => tierPaint(byId[d.id].tier).ink)
    .text((d) => leanOf(byId[d.id]).mark)
    .append('title').text((d) => leanOf(byId[d.id]).words);
  // override marks
  nodeG.filter((d) => overrides[d.id]).each(function (d) {
    const el = d3.select(this);
    el.append('rect').attr('class', 'override-mark').attr('x', -3).attr('y', -3).attr('width', W(d) + 6).attr('height', Hh(d) + 6).attr('rx', 0);
    const ov = overrides[d.id];
    el.append('rect').attr('class', 'override-chip').attr('x', W(d) - 16).attr('y', 4).attr('width', 12).attr('height', Hh(d) - 8).attr('rx', 0).style('fill', tierPaint(ov.tier).fill);
    el.append('title').text(`Your override: ${plainTier(ov.tier)}`);
  });

  // interaction: the hover leads with the plain reading; the rule string follows in small print
  const tip = tooltipEl;
  function showTip(d, evt) {
    if (!tip) return;
    const n = byId[d.id];
    const ov = overrides[d.id];
    tip.innerHTML = '';
    tip.append(h('div', { class: 'tt-title' }, `${d.data.short}: ${d.data.context_only ? 'context' : plainTier(n ? n.tier : null)}`));
    if (d.data.context_only) tip.append(h('div', {}, n && plainCtx ? plainSummary(n, plainCtx, { brief: true }) : d.data.question || 'Context, not a removable constraint.'));
    else if (!n) tip.append(h('div', {}, 'Not scored in this snapshot.'));
    else {
      tip.append(h('div', {}, plainCtx ? plainSummary(n, plainCtx, { brief: true }) : n.tier_reason));
      if (!d.data.desk_undiagnosable) tip.append(h('div', { class: 'muted small', style: 'margin-top:4px' }, `${caption(n)}. Click for the evidence and the rule.`));
    }
    if (ov) tip.append(h('div', { class: 'muted', style: 'margin-top:4px' }, `Your override: ${plainTier(ov.tier)}${ov.note ? ` — ${ov.note}` : ''}`));
    tip.classList.add('show');
    positionTip(evt, d);
  }
  function positionTip(evt, d) {
    if (!tip) return;
    let px, py;
    if (evt && evt.pageX != null) { px = evt.pageX + 14; py = evt.pageY + 14; }
    else { const r = (evt && evt.currentTarget ? evt.currentTarget : null) || null; const el = r || container.querySelector(`[data-id="${d.id}"]`); const b = el.getBoundingClientRect(); px = b.left + window.scrollX + b.width / 2; py = b.bottom + window.scrollY + 8; }
    const maxX = document.documentElement.clientWidth - tip.offsetWidth - 12;
    tip.style.left = `${Math.max(8, Math.min(px, maxX))}px`;
    tip.style.top = `${py}px`;
  }
  const hideTip = () => tip && tip.classList.remove('show');
  nodeG.on('mouseenter', (evt, d) => showTip(d, evt)).on('mousemove', (evt, d) => positionTip(evt, d)).on('mouseleave', hideTip)
    .on('focus', (evt, d) => showTip(d, evt)).on('blur', hideTip)
    .on('click', (evt, d) => { hideTip(); if (onOpen) onOpen(d.id); })
    .on('keydown', (evt, d) => {
      if (evt.key === 'Enter' || evt.key === ' ') { evt.preventDefault(); hideTip(); if (onOpen) onOpen(d.id); }
      else if (evt.key === 'ArrowDown' || evt.key === 'ArrowUp') {
        evt.preventDefault();
        const all = Array.from(container.querySelectorAll('g.node'));
        const i = all.indexOf(evt.currentTarget);
        const nxt = all[(i + (evt.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length];
        if (nxt) nxt.focus();
      } else if (evt.key === 'Escape') { hideTip(); evt.currentTarget.blur(); }
    });

  container.append(svg.node());
}

function ariaLabel(d, byId, overrides) {
  if (d.data.context_only) return `${d.data.short}: context, not a removable constraint. Press Enter to see the measures.`;
  const n = byId[d.id];
  const lean = leanOf(n);
  const base = `${d.data.short}: ${plainTier(n ? n.tier : null)}${n && n.E != null ? `, ${caption(n)}` : ''}${lean ? `, ${lean.words}` : ''}`;
  const ov = overrides[d.id];
  return `${base}${ov ? `. Your override: ${plainTier(ov.tier)}` : ''}. Press Enter to open the evidence.`;
}

function fallbackList(regNodes, byId, overrides, onOpen) {
  const wrap = h('div', { class: 'tree-fallback' }, h('p', { class: 'note' }, 'D3 could not be loaded (offline?). Showing the tree as a nested list.'));
  const children = (pid) => regNodes.filter((n) => n.parent === pid);
  const build = (pid) => {
    const ul = h('ul');
    for (const n of children(pid)) {
      const sc = byId[n.id];
      const li = h('li', {});
      if (STRUCT.has(n.id)) li.append(h('span', { class: 'kicker' }, n.short));
      else li.append(h('button', { class: 'btn quiet small', type: 'button', onclick: () => onOpen && onOpen(n.id) }, `${nodeCode(n.id)} ${n.short}`), ' ', h('span', { class: `tier-badge ${tierClass(n.context_only ? 'context' : sc && sc.tier)}` }, n.context_only ? 'context' : plainTier(sc && sc.tier)), overrides[n.id] ? h('span', { class: 'small muted' }, ` override: ${plainTier(overrides[n.id].tier)}`) : null);
      const kids = build(n.id); if (kids.children.length) li.append(kids);
      ul.append(li);
    }
    return ul;
  };
  wrap.append(build(null));
  return wrap;
}

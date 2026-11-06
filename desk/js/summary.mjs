// Diagnostic summary page (evidence-viz-prd C10): the MCC-style heat map. Nodes in Mindbook order as rows;
// benchmarking (the median binding-side distance of the node's indicators, as in C9) and the verdict layer's four
// test scores as columns; then the verdict layer's tier and the analyst's own conclusion. Conclusions are stored in
// the URL with the same `o=` encoding the Bottom line and Areas use for overrides, so the two pages and the memo share them.
import { refreshNav } from './shell.mjs';
import { nodeCode, getJSON, loadRegistry, initTheme, h, fmtSigned, qs, withData, dataBase, downloadText, tierLabel, tierClass, parseHash, writeState, readHash, writeHash, currentHash, missingTestReason, USER_TIERS } from './common.mjs';
import { plainTier, tierBySetLine } from './card.mjs';
import { reasonTag, robustChip } from './components/marks.mjs';
import { currentSetting, SETTING_LABEL } from './common.mjs';
import { heatRow, TEST_ORDER } from './evidence_math.mjs';
import { railModel, nodeScope, VIEWS } from './evidence_node.mjs';

initTheme();
const DATA = dataBase();
const $ = (id) => document.getElementById(id);
const TEST_HEAD = { price: '1 · Price', changes: '2 · Changes', circumvention: '3 · Circumvention', camels: '4 · Camels' };
const LIM = 2; // the colour scale saturates at ±2 (sd for benchmarking; test scores run from −2 to +2)

const state = { iso: (qs('iso') || 'KEN').toUpperCase(), set: 'structural', overrides: {}, registry: null, countries: [], scorecard: null, model: [] };

const css = (v, fb) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb;
const nameOf = (iso3) => (state.countries.find((c) => c.iso3 === iso3) || { name: iso3 }).name;
/** The set the verdict layer scored the tests with. The page's own choice (state.set) only steers the Evidence links; no cell depends on it. */
const activeSet = () => (state.scorecard && state.scorecard.meta && state.scorecard.meta.active_comparator_set) || 'structural';

// ---------- colour ----------
function lum(hex) {
  const c = d3.color(hex); if (!c) return 0;
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const { r, g, b } = c.rgb();
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/** Cell fill and ink for a value: toward binding in the binding colour, away in navy, neutral near zero. */
function cellPaint(v) {
  const surface = css('--surface', '#ffffff'), text = css('--text', '#1c2e4a');
  if (v == null) return null;
  const pole = v > 0 ? css('--tier-binding', '#9c1f45') : css('--tier-ruled', '#2e4060');
  const fill = d3.interpolateLab(surface, pole)(Math.min(1, Math.abs(v) / LIM) * 0.9);
  const hex = d3.color(fill).formatHex();
  // The most legible of the theme inks and plain black or white (mid-scale fills in the dark theme need the latter).
  const ink = [text, surface, '#000000', '#ffffff'].reduce((best, c) => (contrast(hex, c) > contrast(hex, best) ? c : best));
  return { fill: hex, ink };
}

// ---------- model ----------
/** Why a cell is empty (D7): "no test defined" (the registry has no specification, vector or indicator for it on this area: a gap in the tool), "no data" (this economy), or "stale (year)". */
function emptyReason(R, scope, test, sc) {
  // A measure with a value only outside the window says how old it is (Kenya's return to schooling: 2005).
  const stale = ((sc && sc.indicators) || []).filter((r) => r.test === test && (test === 'circumvention' || r.class === 'A' || r.class === 'B') && r.stale_value != null && !r.available && (r.nodes || []).some((n) => scope.includes(n)));
  if (stale.length) return `stale (${Math.max(...stale.map((r) => r.stale_year))})`;
  if (test === 'camels') {
    const has = R.indicators.indicators.some((i) => i.test === 'camels' && (i.nodes || []).some((n) => scope.includes(n)));
    return has ? 'no data' : 'no test defined';
  }
  if (test === 'changes') return (R.indicators.comovement_specs || []).some((s) => scope.includes(s.node) || (s.also_nodes || []).some((x) => scope.includes(x))) ? 'no data' : 'no test defined';
  return R.indicators.indicators.some((i) => i.test === test && i.direction && (i.nodes || []).some((n) => scope.includes(n))) ? 'no data' : 'no test defined';
}

function buildModel() {
  const R = state.registry, sc = state.scorecard;
  const rows = [];
  for (const g of railModel(R)) {
    const items = g.items.filter((it) => !VIEWS.includes(it.id));
    if (!items.length) continue;
    if (g.label) rows.push({ group: g.label });
    for (const it of items) {
      const scope = nodeScope(R, it.id);
      const hr = heatRow(sc, scope, state.set);
      const node = (sc.nodes || []).find((n) => n.id === it.id);
      // The rating under the comparison countries chosen above (the verdict layer computes one per set).
      let tier = it.context ? 'context_only' : node ? ((node.tier_by_set && node.tier_by_set[state.set]) || node.tier) : null;
      // W4: the evidence setting applies to the default comparison countries, for which the engine stores each reading
      const setting = currentSetting();
      if (setting !== 'standard' && state.set === 'structural' && node && node.tier_by_setting && node.tier_by_setting[setting]) tier = node.tier_by_setting[setting];
      const bySet = node && !it.context ? tierBySetLine(node, state.set) : '';
      // the engine's reason code describes the structural set; under another set the Desk derives it from the tier
      const tagNode = node && tier ? (tier === node.tier ? node : { ...node, tier, cannot_tell_reason: null, cannot_tell_detail: null }) : null;
      rows.push({
        ...hr, id: it.id, short: it.short, sub: !!it.sub, context: !!it.context, tier, bySet, tagNode,
        empty: Object.fromEntries(TEST_ORDER.map((t) => [t, hr.tests[t] == null ? emptyReason(R, scope, t, sc) : null])),
        benchEmpty: hr.bench == null ? (R.indicators.indicators.some((i) => i.direction && (i.nodes || []).some((n) => scope.includes(n))) ? 'no data' : 'no indicator') : null, // benchmarking: no indicator at all for the area
        why: Object.fromEntries(TEST_ORDER.map((t) => [t, hr.tests[t] == null ? missingTestReason(t, it.id, R) : null])),
      });
    }
  }
  state.model = rows;
}

// ---------- render ----------
function valueCell(v, empty, title) {
  if (v == null) return h('td', { class: 'sm-cell sm-empty', title: title || '' }, empty || '—');
  const p = cellPaint(v);
  return h('td', { class: 'sm-cell', style: `background:${p.fill};color:${p.ink}`, title: title || '' }, fmtSigned(Math.abs(v) < 0.05 ? 0 : v, 1));
}

function conclusionCells(r) {
  if (!r.id) return [];
  const ov = state.overrides[r.id];
  const sel = h('select', { 'aria-label': `Your conclusion for ${r.short}` }, h('option', { value: '' }, '— same as the verdict layer —'), ...USER_TIERS.map((t) => h('option', { value: t }, tierLabel(t))));
  sel.value = ov ? ov.tier : '';
  const note = h('input', { type: 'text', placeholder: ov ? 'Why (optional)' : 'Pick a conclusion first', 'aria-label': `Note on ${r.short}`, value: ov ? ov.note || '' : '' });
  note.disabled = !ov;
  sel.addEventListener('change', () => {
    if (sel.value) state.overrides[r.id] = { tier: sel.value, note: note.value }; else delete state.overrides[r.id];
    save(); render();
  });
  note.addEventListener('change', () => { if (state.overrides[r.id]) { state.overrides[r.id].note = note.value; save(); renderText(); } });
  return [h('td', { class: 'sm-you' }, sel), h('td', { class: 'sm-note' }, note)];
}

function render() {
  buildModel();
  const R = state.registry;
  const head = h('tr', {}, h('th', { scope: 'col', class: 'sm-node' }, 'Node'), h('th', { scope: 'col' }, 'Benchmarking', h('br'), h('span', { class: 'sm-unit' }, 'median sd')),
    ...TEST_ORDER.map((t) => h('th', { scope: 'col' }, `Test ${TEST_HEAD[t].split(' · ')[0]}`, h('br'), h('span', { class: 'sm-unit' }, TEST_HEAD[t].split(' · ')[1]))),
    h('th', { scope: 'col' }, 'Verdict layer'), h('th', { scope: 'col' }, 'Your conclusion'), h('th', { scope: 'col' }, 'Note'));
  const body = h('tbody', {});
  for (const r of state.model) {
    if (r.group) { body.append(h('tr', { class: 'sm-group' }, h('th', { colspan: '9', scope: 'colgroup' }, r.group))); continue; }
    const href = withData(`/growth-test-site/desk/evidence.html?iso=${state.iso}&node=${encodeURIComponent(r.id)}${state.set !== 'structural' ? `#set=${state.set}` : ''}`);
    const bt = r.bench != null ? `${r.nBench} indicators with data: ${r.toward} at least 0.75 sd toward binding, ${r.away} at least 0.75 sd away. Median of their binding-side distances from what income and structure predict.` : 'No indicator of this node has a value in the window.';
    body.append(h('tr', { class: `${r.sub ? 'sm-sub' : ''}${r.context ? ' sm-context' : ''}${state.overrides[r.id] ? ' sm-overridden' : ''}` },
      h('th', { scope: 'row', class: 'sm-node' }, h('a', { href }, h('span', { class: 'sm-id' }, r.sub ? '' : nodeCode(r.id)), ' ', r.short)),
      valueCell(r.bench == null ? null : Math.max(-3, Math.min(3, r.bench)), r.benchEmpty, bt),
      ...TEST_ORDER.map((t) => valueCell(r.tests[t], r.empty[t], r.why[t] || `${TEST_HEAD[t]}: the verdict layer's test score, from −2 (evidence against) to +2 (for).`)),
      h('td', { class: 'sm-tier' }, r.tier ? [h('span', { class: `tier-badge ${tierClass(r.tier)}`, title: r.bySet || null }, h('span', {}, plainTier(r.tier))), r.tagNode ? reasonTag(r.tagNode) : null, r.tagNode ? robustChip(r.tagNode) : null] : '—'),
      ...conclusionCells(r)));
  }
  $('heat-wrap').replaceChildren(h('table', { class: 'sm-table', id: 'heat' }, h('caption', { class: 'visually-hidden' }, `Diagnostic heat map for ${nameOf(state.iso)}`), h('thead', {}, head), body));
  renderKey();
  renderText();
}

function renderKey() {
  const steps = [-2, -1, -0.5, 0, 0.5, 1, 2];
  $('key').replaceChildren(h('span', { class: 'sm-key-l' }, '◀ away from binding'), ...steps.map((v) => { const p = cellPaint(v); return h('span', { class: 'sm-swatch', style: `background:${p.fill};color:${p.ink}` }, fmtSigned(v, 1).replace('+0.0', '0').replace('−0.0', '0')); }), h('span', { class: 'sm-key-r' }, 'toward binding ▶'));
}

function renderText() {
  const R = state.registry, sc = state.scorecard;
  const rows = state.model.filter((r) => r.id && !r.context);
  const both = rows.filter((r) => r.bench != null && r.bench >= 0.5 && TEST_ORDER.some((t) => r.tests[t] != null && r.tests[t] >= 0.5));
  const neg = rows.filter((r) => r.bench != null && r.bench <= -0.5 && TEST_ORDER.some((t) => r.tests[t] != null && r.tests[t] <= -0.5));
  const nm = (r) => (r.id.includes('.') ? r.short : `${r.id} ${r.short}`);
  const ovs = Object.entries(state.overrides);
  $('readout').innerHTML = [
    both.length ? `Benchmarking and at least one test both lean toward binding for <strong>${both.map(nm).join(', ')}</strong>.` : 'No node has benchmarking and a test both leaning toward binding (0.5 or more).',
    neg.length ? `Both lean away for ${neg.map(nm).join(', ')}.` : '',
    `The verdict layer rates ${rows.filter((r) => ['likely_binding', 'candidate'].includes(r.tier)).map(nm).join(', ') || 'no node'} as a candidate or likely binding.`,
    ovs.length ? `You have set your own conclusion on ${ovs.length} node${ovs.length > 1 ? 's' : ''}.` : '',
  ].filter(Boolean).join(' ');
  const active = activeSet();
  $('foot').textContent = `Benchmarking: the median, across the node's indicators with a value, of each one's distance from what income and structure predict, in standard deviations, turned so positive is the binding side (the C9 evidence strip's dots). Tests 1 to 4: the verdict layer's test scores (T), from −2 (evidence against the constraint binding) to +2 (for). Colour saturates at ±${LIM}. Comparators: benchmarking measures against every economy with data, not a comparator set; the test scores are computed with the verdict layer's ${active} comparators${state.set !== active ? `` : ''}. The rating column follows the comparators chosen above (the verdict layer computes a rating under each set; hover a rating to see where the sets disagree). "Not computed": the prototype has no specification or data connector for that test; "no data": it has one, but this economy has no usable value; "no indicator": nothing in the registry measures it. Hover a cell for details. Snapshot ${sc.meta ? sc.meta.snapshot_id : ''}, rubric ${sc.meta ? sc.meta.rubric_version : ''}. Your conclusions are yours, not the tool's; they live in this page's link, which the Bottom line and its memo read too.`;
  const hash = currentHash();
  $('to-snapshot').href = withData(`/growth-test-site/desk/country.html?iso=${state.iso}${hash}`);
  refreshNav();
}

function save() { writeState({ set: state.set, overrides: state.overrides }); renderText(); }

// ---------- export ----------
const fileBase = () => `${state.iso}-c10-summary-${state.scorecard.meta ? state.scorecard.meta.snapshot_id : ''}`.replace(/[^A-Za-z0-9._-]/g, '_');
const cellText = (v, e) => (v == null ? e || '' : fmtSigned(Math.abs(v) < 0.05 ? 0 : v, 2));
const csvNum = (v, e) => (v == null ? e || '' : String(Math.round(v * 1000) / 1000));

function exportCSV() {
  const lines = ['node,name,benchmarking_median_sd,indicators_with_data,test1_price,test2_changes,test3_circumvention,test4_camels,verdict_layer_tier,your_conclusion,your_note'];
  for (const r of state.model.filter((x) => x.id)) {
    const ov = state.overrides[r.id];
    lines.push([r.id, `"${r.short}"`, csvNum(r.bench, r.benchEmpty), r.nBench, ...TEST_ORDER.map((t) => csvNum(r.tests[t], r.empty[t])), r.tier || '', ov ? ov.tier : '', ov ? `"${(ov.note || '').replace(/"/g, '""')}"` : ''].join(','));
  }
  lines.push('', `# ${nameOf(state.iso)} (${state.iso}). Reading: ${readingText()}. Snapshot ${state.scorecard.meta.snapshot_id}, rubric ${state.scorecard.meta.rubric_version}. Benchmarking: median binding-side sd; tests: verdict-layer T from -2 to +2.`);
  downloadText(`${fileBase()}.csv`, lines.join('\n'), 'text/csv');
}

function exportMD() {
  const row = (c) => `| ${c.map((x) => String(x ?? '').replace(/\|/g, '\\|')).join(' | ')} |`;
  const out = [`# Diagnostic summary: ${nameOf(state.iso)} (${state.iso})`, '', `Reading: ${readingText()} · Snapshot ${state.scorecard.meta.snapshot_id} · rubric ${state.scorecard.meta.rubric_version}. Benchmarking is the median binding-side distance (sd) of the node's indicators; tests are the verdict layer's scores from −2 to +2.`, '',
    row(['Node', 'Benchmarking', 'Price', 'Changes', 'Circumvention', 'Camels', 'Verdict layer', 'Analyst', 'Note']), row(Array(9).fill('---'))];
  for (const r of state.model) {
    if (r.group) { out.push(row([`**${r.group}**`, '', '', '', '', '', '', '', ''])); continue; }
    const ov = state.overrides[r.id];
    out.push(row([`${r.sub ? '— ' : ''}${nodeCode(r.id)} ${r.short}`, cellText(r.bench, r.benchEmpty), ...TEST_ORDER.map((t) => cellText(r.tests[t], r.empty[t])), tierLabel(r.tier), ov ? tierLabel(ov.tier) : '', ov ? ov.note : '']));
  }
  downloadText(`${fileBase()}.md`, out.join('\n'));
}

/** The heat map as a standalone SVG, for slides. */
/** Every export carries the evidence setting (W4); off Standard it says it is not the release. */
function readingText() {
  const s = currentSetting();
  return s === 'standard' ? 'Standard (the reading to cite)' : `${SETTING_LABEL[s]}, not the one to cite`;
}

function heatSVG() {
  const surface = css('--bg', '#faf7f0'), text = css('--text', '#1c2e4a'), muted = css('--muted', '#4a5d7e'), rule = css('--rule', '#e6d9d0');
  const anyOv = Object.keys(state.overrides).length > 0;
  const cols = [['Benchmarking', 96], ...TEST_ORDER.map((t) => [TEST_HEAD[t].split(' · ')[1], 96]), ['Verdict layer', 170], ...(anyOv ? [['Analyst', 170]] : [])];
  const nameW = 220, rowH = 26, top = 70;
  const W = nameW + cols.reduce((s, c) => s + c[1], 0) + 16;
  const H = top + state.model.length * rowH + 40;
  const e = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const p = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, system-ui, sans-serif" font-size="12">`, `<rect width="${W}" height="${H}" fill="${surface}"/>`,
    `<text x="8" y="24" font-size="17" font-weight="600" fill="${text}">${e(`${nameOf(state.iso)}: diagnostic summary`)}</text>`,
    `<text x="8" y="44" fill="${muted}">${e(`Benchmarking: median sd toward binding · tests: verdict-layer scores, −2 to +2 · snapshot ${state.scorecard.meta.snapshot_id}`)}</text>`];
  let x = nameW;
  for (const [c, w] of cols) { p.push(`<text x="${x + w / 2}" y="${top - 8}" text-anchor="middle" font-weight="600" fill="${text}">${e(c)}</text>`); x += w; }
  state.model.forEach((r, i) => {
    const y = top + i * rowH;
    if (r.group) { p.push(`<text x="8" y="${y + 18}" font-size="11" font-weight="600" letter-spacing="1.5" fill="${muted}">${e(r.group.toUpperCase())}</text>`); return; }
    p.push(`<line x1="8" x2="${W - 8}" y1="${y + rowH}" y2="${y + rowH}" stroke="${rule}"/>`);
    p.push(`<text x="${r.sub ? 24 : 8}" y="${y + 17}" fill="${text}">${e(`${nodeCode(r.id)} ${r.short}`)}</text>`);
    let cx = nameW;
    const vals = [[r.bench, r.benchEmpty], ...TEST_ORDER.map((t) => [r.tests[t], r.empty[t]])];
    for (const [v, em] of vals) {
      const pt = cellPaint(v);
      if (pt) p.push(`<rect x="${cx + 2}" y="${y + 2}" width="92" height="${rowH - 4}" fill="${pt.fill}"/><text x="${cx + 48}" y="${y + 17}" text-anchor="middle" fill="${pt.ink}" font-weight="600">${e(fmtSigned(Math.abs(v) < 0.05 ? 0 : v, 1))}</text>`);
      else p.push(`<text x="${cx + 48}" y="${y + 17}" text-anchor="middle" fill="${muted}" font-style="italic" font-size="11">${e(em || '—')}</text>`);
      cx += 96;
    }
    p.push(`<text x="${cx + 6}" y="${y + 17}" fill="${text}">${e(plainTier(r.tier))}</text>`);
    if (anyOv && state.overrides[r.id]) p.push(`<text x="${cx + 176}" y="${y + 17}" fill="${text}" font-weight="600">${e(plainTier(state.overrides[r.id].tier))}</text>`);
  });
  p.push(`<text x="8" y="${H - 12}" fill="${muted}" font-size="11">${e(`The Growth Test (TNFA), prototype. Tests use the verdict layer's ${activeSet()} comparators. Analyst conclusions are the analyst's, not the tool's.`)}</text>`, '</svg>');
  return { text: p.join(''), w: W, h: H };
}
function exportSVG() { downloadText(`${fileBase()}.svg`, heatSVG().text, 'image/svg+xml'); }
function exportPNG() {
  const s = heatSVG(), img = new Image(), scale = 1600 / s.w;
  img.onerror = () => { const b = document.querySelector('[data-kind="png"]'); if (b && !b.parentElement.querySelector('.ev-export-error')) b.parentElement.append(h('span', { class: 'ev-export-error small', role: 'status' }, 'Export failed: the chart could not be drawn as an image. Try SVG.')); };
  img.onload = () => {
    const cv = document.createElement('canvas'); cv.width = 1600; cv.height = Math.round(s.h * scale);
    const g = cv.getContext('2d'); g.scale(scale, scale); g.drawImage(img, 0, 0);
    cv.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${fileBase()}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.text)}`;
}

// ---------- start ----------
async function loadCountry() {
  state.scorecard = await getJSON(`${DATA}/${state.iso}.json`);
  const name = nameOf(state.iso);
  $('page-title').textContent = `${name}: diagnostic summary`;
  document.title = `${name} · Heat map · The Growth Test`;
  $('page-sub').textContent = 'Each row is a node of the tree. The colour shows which way the evidence leans; the verdict layer\'s tier and your own conclusion sit beside it. Click a node to see its evidence.';
}

async function main() {
  try {
    const hs = parseHash();
    state.set = ['regional', 'aspirational'].includes(hs.set) ? hs.set : 'structural';
    state.overrides = hs.overrides || {};
    const [registry, countries] = await Promise.all([loadRegistry(), getJSON(`${DATA}/countries.json`)]);
    Object.assign(state, { registry, countries });
    if (!countries.some((c) => c.iso3 === state.iso)) state.iso = 'KEN';
    const cs = $('c-country');
    for (const c of countries.slice().sort((a, b) => a.name.localeCompare(b.name))) cs.append(h('option', { value: c.iso3 }, c.name));
    cs.value = state.iso;
    $('c-set').value = state.set;
    cs.addEventListener('change', async () => {
      state.iso = cs.value; state.overrides = {};
      const q = new URLSearchParams(location.search); q.set('iso', state.iso);
      writeHash(readHash(), { query: `?${q}` });
      save(); await loadCountry(); render();
    });
    $('c-set').addEventListener('change', () => { state.set = $('c-set').value; save(); render(); });
    $('x-csv').addEventListener('click', exportCSV);
    $('x-md').addEventListener('click', exportMD);
    $('x-svg').addEventListener('click', exportSVG);
    $('x-png').addEventListener('click', exportPNG);
    $('copy-link').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); $('copy-link').textContent = 'Link copied'; } catch { $('copy-link').textContent = 'Copy failed'; }
      setTimeout(() => { $('copy-link').textContent = 'Copy link with your conclusions'; }, 1600);
    });
    window.addEventListener('hashchange', () => { const p = parseHash(); state.overrides = p.overrides || {}; render(); });
    window.addEventListener('desk-setting', () => render());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const repaint = () => setTimeout(render, 30);
    mq.addEventListener('change', repaint);
    $('theme-toggle').addEventListener('click', repaint);
    await loadCountry();
    render();
  } catch (e) { const el = $('page-error'); el.hidden = false; el.textContent = `Could not load the summary: ${e.message}`; console.error(e); }
}
main();

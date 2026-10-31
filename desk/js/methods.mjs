// Methods page (front-door PRD W3, level 3): about the prototype, how it is tested, and the method documents,
// rendered from the Markdown in docs/ that build_site.py publishes (DOCS there must list the same files).
import './nav.mjs';
import { initTheme, h, qs } from './common.mjs';

initTheme();

export const DOCS = [
  { id: 'how-it-works', title: 'How Constraint Check works', who: 'Plain-language guide for program officers, Hill staff and managers' },
  { id: 'methodology-note', title: 'Methodology Note', who: 'For economists: every formula, threshold and rule, with the code that implements it' },
  { id: 'datasheet-and-model-card', title: 'Datasheet and model card', who: 'What the data are, intended uses and misuses, known limits' },
  { id: 'validation-report', title: 'Validation report', who: 'Internal checks and the current distribution of ratings, regenerated with every release' },
  { id: 'codebook', title: 'Indicator codebook', who: 'Every indicator: source, evidence class, test and direction' },
];

const list = document.getElementById('doc-list');
const body = document.getElementById('doc-body');

async function show(id, scroll) {
  const doc = DOCS.find((d) => d.id === id);
  if (!doc) return;
  for (const a of list.querySelectorAll('a')) a.setAttribute('aria-current', a.dataset.doc === id ? 'true' : 'false');
  body.replaceChildren(h('p', { class: 'small muted' }, `Loading ${doc.title}…`));
  try {
    const r = await fetch(`/constraint-check-site/docs/${id}.md`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const md = await r.text();
    // our own documents, rendered as written; marked is loaded from cdnjs in methods.html
    body.innerHTML = window.marked ? window.marked.parse(md) : `<pre>${md.replace(/[&<]/g, (c) => (c === '&' ? '&amp;' : '&lt;'))}</pre>`;
    for (const t of body.querySelectorAll('table')) t.outerHTML = `<div class="table-wrap">${t.outerHTML.replace('<table', '<table class="data"')}</div>`;
    const q = new URLSearchParams(location.search); q.set('doc', id);
    history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
    if (scroll) body.scrollIntoView({ block: 'start' });
  } catch (e) {
    body.replaceChildren(h('p', { class: 'note alert' }, `${doc.title} could not be loaded (${e.message}).`));
  }
}

list.replaceChildren(...DOCS.map((d) => h('li', {},
  h('a', { href: `?doc=${d.id}#docs`, 'data-doc': d.id, onclick: (e) => { e.preventDefault(); show(d.id, true); } }, d.title),
  h('span', { class: 'small muted' }, ` ${d.who}`))));
const want = qs('doc');
if (want) show(want, true);

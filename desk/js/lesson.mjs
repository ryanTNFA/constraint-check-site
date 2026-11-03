// Teaching mode (docs/teaching-plan.md): the lesson bar and Predict first. Display only; no accounts, no stored scores.
// State travels in the URL hash: #lesson=n puts the bar on the page; #predict=1 hides the verdicts until revealed.
// nav.mjs imports this module, so every page gets it; it mounts only when the hash asks.
import { h, withData } from './common.mjs';
import { LESSONS, lessonByN } from './lessons.mjs';

const hashParams = () => new URLSearchParams(location.hash.replace(/^#/, ''));
export const predictOn = () => hashParams().get('predict') === '1';
export const currentLesson = () => lessonByN(hashParams().get('lesson'));

/** The areas the learner has revealed under Predict first (per page; a reload starts over, as a prediction should). */
export const revealed = new Set();
export function reveal(id) {
  if (id) revealed.add(id); else document.body.classList.add('predict-all');
  for (const el of document.querySelectorAll(id ? `[data-id="${id}"], [data-area="${id}"], [data-node="${id}"]` : '[data-id], [data-area], [data-node]')) el.classList.add('revealed');
  window.dispatchEvent(new CustomEvent('desk-reveal', { detail: { id } }));
}

function setHash(k, v) {
  const p = hashParams();
  if (v == null || v === '' || v === false) p.delete(k); else p.set(k, String(v));
  const s = p.toString();
  history.replaceState(null, '', location.pathname + location.search + (s ? `#${s}` : ''));
}
const lessonHref = (l) => withData(l.page) + `#lesson=${l.n}${l.predict ? '&predict=1' : ''}`;

function applyPredict() {
  document.body.classList.toggle('predict', predictOn());
  // once revealed, stays revealed on this page
  for (const el of document.querySelectorAll('[data-id], [data-area], [data-node]')) if (revealed.has(el.dataset.id || el.dataset.area || el.dataset.node)) el.classList.add('revealed');
}

function bar(l) {
  const next = lessonByN(l.n + 1), prev = lessonByN(l.n - 1);
  const details = h('details', { class: 'lesson-check' }, h('summary', {}, 'Check yourself'), h('p', { class: 'lesson-q' }, l.check), h('details', { class: 'lesson-answer' }, h('summary', {}, 'Show the answer'), h('p', {}, l.answer), h('p', { class: 'small muted' }, l.mindbook)));
  const predictBtn = h('button', { type: 'button', class: 'btn quiet small', 'aria-pressed': String(predictOn()) }, predictOn() ? 'Predict first: on' : 'Predict first: off');
  predictBtn.addEventListener('click', () => { setHash('predict', predictOn() ? null : '1'); predictBtn.textContent = predictOn() ? 'Predict first: on' : 'Predict first: off'; predictBtn.setAttribute('aria-pressed', String(predictOn())); applyPredict(); window.dispatchEvent(new CustomEvent('desk-predict')); });
  const revealAll = h('button', { type: 'button', class: 'btn quiet small' }, 'Reveal everything on this page');
  revealAll.addEventListener('click', () => reveal(null));
  const el = h('aside', { class: 'lesson-bar', role: 'complementary', 'aria-label': `Lesson ${l.n} of ${LESSONS.length}` },
    h('div', { class: 'wrap' },
      h('div', { class: 'lesson-head' },
        h('span', { class: 'kicker' }, `Learning the method · lesson ${l.n} of ${LESSONS.length}`),
        h('nav', { class: 'lesson-nav', 'aria-label': 'Lessons' },
          prev ? h('a', { href: lessonHref(prev) }, `← ${prev.n}`) : null,
          h('a', { href: withData('/constraint-check-site/desk/learn.html') }, 'All lessons'),
          next ? h('a', { class: 'lesson-next', href: lessonHref(next) }, `Next: lesson ${next.n}, ${next.title} →`) : h('a', { class: 'lesson-next', href: withData('/constraint-check-site/desk/learn.html#exit') }, 'Done: the exit test →'))),
      h('h2', { class: 'lesson-title' }, l.title),
      h('p', { class: 'lesson-task' }, l.task),
      h('div', { class: 'lesson-tools' }, predictBtn, predictOn() ? revealAll : null, details)));
  return el;
}

function mount() {
  const l = currentLesson();
  applyPredict();
  if (!l) return;
  const header = document.querySelector('header.topbar');
  const old = document.querySelector('.lesson-bar'); if (old) old.remove();
  if (header) header.after(bar(l));
}
mount();
window.addEventListener('hashchange', () => { const had = !!document.querySelector('.lesson-bar'); mount(); if (!had && !currentLesson()) applyPredict(); });

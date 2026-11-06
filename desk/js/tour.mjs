// @ts-check
// The tour (docs/learn-tour-plan.md): a guided walk over the live pages. shell.mjs loads this module on every page; it
// does nothing unless the hash carries tour=n. Then it draws the bar under the site bar, waits for the stop's anchor to
// have a box, rings it, puts the callout beside it, and wires back and next, the keyboard, Predict first and the country
// guard. Display only: no accounts, no stored scores; the stop travels in the link. The ring is a separate element with
// no transition, so nothing animates on a rating; the callout reveals through motion.mjs.
import { h, withData, HASH, readHash, setHashKeys, qs } from './common.mjs';
import { TOUR, stopByN, TOUR_ISO, TOUR_COUNTRY } from './tour_stops.mjs';
import { reveal as revealIn } from './motion.mjs';

export const predictOn = () => readHash().get(HASH.predict) === '1';
/** The stop the hash names, or null. */
export const currentStop = () => stopByN(readHash().get(HASH.tour));

/** The areas the learner has revealed under Predict first (per page; a reload starts over, as a prediction should). */
export const revealed = new Set();
/** Reveal one area's rating (or everything on the page when id is null). @param {string | null} id */
export function reveal(id) {
  if (id) revealed.add(id); else document.body.classList.add('predict-all');
  for (const el of document.querySelectorAll(id ? `[data-id="${id}"], [data-area="${id}"], [data-node="${id}"]` : '[data-id], [data-area], [data-node]')) el.classList.add('revealed');
  window.dispatchEvent(new CustomEvent('desk-reveal', { detail: { id } }));
}

/** The link that opens a stop: its page, then the tour key, Predict first and the stop's own hash keys. @param {import('./tour_stops.mjs').Stop} s */
export function stopHref(s) {
  const p = new URLSearchParams({ [HASH.tour]: String(s.n) });
  if (s.predict) p.set(HASH.predict, '1');
  for (const [k, v] of Object.entries(s.hash || {})) p.set(k, v);
  return `${withData(s.page)}#${p.toString()}`;
}
/** This page without the tour (the bar's "Leave the tour"). */
function leaveHref() {
  const p = readHash(); p.delete(HASH.tour); p.delete(HASH.predict);
  return `${location.pathname}${location.search}${p.toString() ? `#${p}` : ''}`;
}

function applyPredict() {
  document.body.classList.toggle('predict', predictOn());
  for (const el of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('[data-id], [data-area], [data-node]'))) {
    if (revealed.has(el.dataset.id || el.dataset.area || el.dataset.node || '')) el.classList.add('revealed');
  }
}

// ---------- the bar ----------
/** @param {import('./tour_stops.mjs').Stop} s */
function navLinks(s, cls = 'tour-nav') {
  const prev = stopByN(s.n - 1), next = stopByN(s.n + 1);
  return h('nav', { class: cls, 'aria-label': 'Tour stops' },
    prev ? h('a', { href: stopHref(prev), rel: 'prev' }, `← ${prev.n}. ${prev.title}`) : h('a', { href: withData('/growth-test-site/desk/learn.html') }, '← The tour’s start'),
    next ? h('a', { class: 'tour-next', href: stopHref(next), rel: 'next' }, `Next: ${next.n}. ${next.title} →`)
      : h('a', { class: 'tour-next', href: withData('/growth-test-site/desk/learn.html#exit') }, 'Done: the exit test →'));
}
/** @param {import('./tour_stops.mjs').Stop} s */
function bar(s) {
  const predictBtn = h('button', { type: 'button', class: 'btn quiet small', 'aria-pressed': String(predictOn()) }, predictOn() ? 'Predict first: on' : 'Predict first: off');
  predictBtn.addEventListener('click', () => {
    setHashKeys({ [HASH.predict]: predictOn() ? null : '1' });
    predictBtn.textContent = predictOn() ? 'Predict first: on' : 'Predict first: off'; predictBtn.setAttribute('aria-pressed', String(predictOn()));
    applyPredict(); window.dispatchEvent(new CustomEvent('desk-predict'));
  });
  const revealAll = h('button', { type: 'button', class: 'btn quiet small' }, 'Reveal everything on this page');
  revealAll.addEventListener('click', () => reveal(null));
  const check = s.check ? h('details', { class: 'tour-check' }, h('summary', {}, 'Check yourself'), h('p', { class: 'tour-q' }, s.check.q),
    h('details', { class: 'tour-answer' }, h('summary', {}, 'Show the answer'), h('p', {}, s.check.a), s.mindbook ? h('p', { class: 'small muted' }, s.mindbook) : null)) : null;
  // the country guard: the stops are written for one country
  const iso = (document.body.dataset.iso || qs('iso') || '').toUpperCase();
  const away = iso && iso !== TOUR_ISO;
  return h('aside', { class: 'tour-bar', role: 'complementary', 'aria-label': `The tour, stop ${s.n} of ${TOUR.length}` },
    h('div', { class: 'wrap' },
      h('div', { class: 'tour-head' },
        h('span', { class: 'kicker' }, `The tour · stop ${s.n} of ${TOUR.length} · ${TOUR_COUNTRY}`),
        h('div', { class: 'tour-links' }, h('a', { href: withData('/growth-test-site/desk/learn.html#stops') }, 'All stops'), h('a', { href: leaveHref() }, 'Leave the tour'))),
      h('h2', { class: 'tour-title' }, s.title),
      away ? h('p', { class: 'tour-away note alert' }, `This page shows ${iso}; the tour’s stops are written for ${TOUR_COUNTRY}. `,
        h('a', { href: stopHref(s) }, `Back to ${TOUR_COUNTRY} →`)) : null,
      h('div', { class: 'tour-tools' }, navLinks(s), predictBtn, predictOn() ? revealAll : null, check),
      h('div', { class: 'tour-dock' })));
}

// ---------- the ring and the callout ----------
/** @param {import('./tour_stops.mjs').Stop} s */
function callout(s) {
  return h('aside', { class: 'tour-callout', role: 'note', 'aria-label': `Stop ${s.n}: ${s.title}` },
    h('p', { class: 'kicker tour-kicker' }, `Stop ${s.n} · look here`),
    ...s.say.map((p) => h('p', {}, p)),
    s.look && s.look.length ? h('ul', { class: 'tour-look' }, ...s.look.map((x) => h('li', {}, x))) : null,
    navLinks(s, 'tour-nav small'));
}
/** Wait for the selector to match an element with a box, up to ms. @param {string} sel @param {number} ms @returns {Promise<Element | null>} */
function waitFor(sel, ms) {
  return new Promise((res) => {
    const t0 = performance.now();
    const tick = () => {
      const el = document.querySelector(sel);
      if (el && el.getClientRects().length) return res(el);
      if (performance.now() - t0 > ms) return res(null);
      setTimeout(tick, 120);
    };
    tick();
  });
}
/** Open every <details> above the element, so it can be seen. @param {Element} el */
function openAncestors(el) {
  for (let p = el.parentElement; p; p = p.parentElement) if (p instanceof HTMLDetailsElement && !p.open) p.open = true;
}
const clear = () => { for (const el of document.querySelectorAll('.tour-ring, .tour-callout')) el.remove(); };
/** Where to append: inside the drawer when the anchor is in it (its focus trap must reach the callout), else the body. @param {Element} el */
const hostOf = (el) => /** @type {HTMLElement} */ (el.closest('#drawer') || document.body);
const narrow = () => window.matchMedia('(max-width: 760px)').matches;

/** Place the ring on the anchor and the callout beside it. @param {Element} el @param {HTMLElement} ring @param {HTMLElement} box */
function position(el, ring, box) {
  const host = hostOf(el);
  const r = el.getBoundingClientRect();
  const hr = host === document.body ? { left: -window.scrollX, top: -window.scrollY } : host.getBoundingClientRect();
  const sx = host === document.body ? 0 : host.scrollLeft, sy = host === document.body ? 0 : host.scrollTop;
  const left = r.left - hr.left + sx, top = r.top - hr.top + sy;
  Object.assign(ring.style, { left: `${left}px`, top: `${top}px`, width: `${r.width}px`, height: `${r.height}px` });
  if (box.classList.contains('docked')) return;
  const w = Math.min(380, (host === document.body ? window.innerWidth : host.clientWidth) - 32);
  box.style.width = `${w}px`;
  const maxLeft = (host === document.body ? window.innerWidth : host.clientWidth) - w - 16;
  const bl = Math.max(16, Math.min(left, maxLeft + (host === document.body ? window.scrollX : sx)));
  // a tall anchor (a whole chart section) gets the callout inside its top-right corner, so both are in view together;
  // otherwise below the ring, unless that runs off the end of the document (the page scrolls to show both)
  if (r.height > window.innerHeight * 0.6) {
    box.style.left = `${Math.max(16, Math.min(left + r.width - w - 16, maxLeft + (host === document.body ? window.scrollX : sx)))}px`;
    box.style.top = `${top + 16}px`;
    return;
  }
  const docH = host === document.body ? document.documentElement.scrollHeight : host.scrollHeight;
  const below = top + r.height + 12 + box.offsetHeight <= docH || top - box.offsetHeight - 12 < 0;
  box.style.left = `${bl}px`;
  box.style.top = below ? `${top + r.height + 12}px` : `${Math.max(0, top - box.offsetHeight - 12)}px`;
}

/** @type {{stop: import('./tour_stops.mjs').Stop, el: Element, ring: HTMLElement, box: HTMLElement, top: number} | null} */
let placed = null;
/** The anchor's top in page coordinates. @param {Element} el */
const pageTop = (el) => el.getBoundingClientRect().top + window.scrollY;
/** Scroll so the anchor sits in the upper part of the window (instant: a smooth scroll depends on animation frames the page may not get). @param {Element} el */
function show(el) {
  if (hostOf(el) === document.body) window.scrollTo({ top: Math.max(0, pageTop(el) - Math.round(window.innerHeight * 0.22)) });
  else el.scrollIntoView({ block: 'start' });
}
/** Find the stop's anchor and draw; dock the callout under the bar when the anchor has not drawn. @param {import('./tour_stops.mjs').Stop} s */
async function place(s) {
  clear(); placed = null;
  const el = await waitFor(s.anchor, 8000); // the Analyst View draws slowly
  if (currentStop() !== s) return; // the learner moved on while we waited
  clear();
  const box = callout(s);
  const dock = document.querySelector('.tour-bar .tour-dock');
  if (!el) {
    box.classList.add('docked');
    box.prepend(h('p', { class: 'tour-missing small muted' }, `The page has not drawn ${s.anchorName} yet. Scroll to find it, or move on.`));
    if (dock) dock.replaceChildren(box);
    return;
  }
  openAncestors(el);
  const ring = h('div', { class: 'tour-ring', 'aria-hidden': 'true' });
  const host = hostOf(el);
  if (narrow() && host === document.body) { box.classList.add('docked'); if (dock) dock.replaceChildren(box); host.append(ring); }
  else if (host !== document.body) { host.append(ring); el.after(box); } // in the drawer the callout follows its anchor in the flow
  else host.append(ring, box);
  placed = { stop: s, el, ring, box, top: pageTop(el) };
  position(el, ring, box);
  show(el);
  revealIn(box);
  // pages keep drawing after their data arrive, with no event for it: look again a few times and follow the anchor
  for (const t of [700, 1600, 3200]) window.setTimeout(replace, t);
}
let timer = 0;
/** Re-find and re-place after the page redraws (debounced). */
function replace() {
  const s = currentStop(); if (!s) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (placed && placed.stop === s && document.contains(placed.el)) {
      position(placed.el, placed.ring, placed.box);
      // the page kept drawing after the ring was placed and pushed the anchor down: follow it
      const top = pageTop(placed.el);
      if (Math.abs(top - placed.top) > 40) { placed.top = top; show(placed.el); }
    } else place(s);
  }, 350);
}

// ---------- mount ----------
let shown = null;
function mount() {
  const s = currentStop();
  applyPredict();
  // the tour speaks in the tool's voice only: TNFA's boxes hide while it is on
  document.body.classList.toggle('tour', !!s);
  const old = document.querySelector('.tour-bar');
  if (!s) { if (old) old.remove(); clear(); placed = null; shown = null; return; }
  if (shown === s.n && old) { replace(); return; }
  shown = s.n;
  if (old) old.remove();
  const header = document.querySelector('header.topbar');
  if (header) header.after(bar(s));
  place(s);
}
mount();
window.addEventListener('hashchange', () => { const had = !!document.querySelector('.tour-bar'); mount(); if (!had && !currentStop()) applyPredict(); });
for (const ev of ['desk-hash', 'desk-setting', 'desk-reveal', 'desk-predict']) window.addEventListener(ev, replace);
window.addEventListener('resize', replace);
// ← and → move between stops when the focus is not in a field; Esc puts the callout away (the bar stays)
window.addEventListener('keydown', (e) => {
  const s = currentStop(); if (!s || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const t = e.target instanceof HTMLElement ? e.target : null;
  if (t && (t.closest('input, textarea, select, [contenteditable="true"]'))) return;
  if (e.key === 'Escape') { clear(); return; }
  const to = e.key === 'ArrowRight' ? stopByN(s.n + 1) : e.key === 'ArrowLeft' ? stopByN(s.n - 1) : null;
  if (to) { e.preventDefault(); location.href = stopHref(to); }
});

// @ts-check
// The tour (docs/learn-tour-plan.md): a screen-by-screen walk over the live pages. shell.mjs loads this module on every
// page; it does nothing unless the hash carries tour=n. Then the page goes into focus mode (everything on the page
// hides except the one element the stop is about and what the stop says to keep; the site bar stays) and a sheet
// carries the words, Back and Next: fixed at the bottom on a phone, a panel at the right on a desktop (at the left
// when the stop is inside the drawer, which slides in from the right). Only the sheet's words scroll; its head and
// its buttons stay put. Nothing is drawn over a rating and nothing animates one; focus mode is a class on the hidden
// siblings, removed when the stop ends. Display only: no accounts, no stored scores; the stop travels in the link.
import { h, withData, HASH, readHash, writeHash, setHashKeys, currentHash, qs, currentSetting } from './common.mjs';
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
  for (const el of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(id ? `[data-id="${id}"], [data-area="${id}"], [data-node="${id}"]` : '[data-id], [data-area], [data-node]'))) {
    el.classList.add('revealed');
    if (!id) revealed.add(el.dataset.id || el.dataset.area || el.dataset.node || '');
  }
  window.dispatchEvent(new CustomEvent('desk-reveal', { detail: { id } }));
}

/** The link that opens a stop: its page, then the tour key, Predict first and the stop's own hash keys. @param {import('./tour_stops.mjs').Stop} s */
export function stopHref(s) {
  const p = new URLSearchParams({ [HASH.tour]: String(s.n) });
  if (s.predict) p.set(HASH.predict, '1');
  for (const [k, v] of Object.entries(s.hash || {})) p.set(k, v);
  return `${withData(s.page)}#${p.toString()}`;
}
/** This page without the tour (the sheet's "Leave"). */
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

// ---------- the sheet ----------
const HIDE = 'tour-hide';
const phone = () => !window.matchMedia('(min-width: 900px)').matches;
/** @param {import('./tour_stops.mjs').Stop} s */
function sheet(s) {
  const prev = stopByN(s.n - 1), next = stopByN(s.n + 1);
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
  const body = h('div', { class: 'tour-body', id: 'tour-body' },
    away ? h('p', { class: 'tour-away note alert' }, `This page shows ${iso}; the tour’s stops are written for ${TOUR_COUNTRY}. `, h('a', { href: stopHref(s) }, `Back to ${TOUR_COUNTRY} →`)) : null,
    ...s.say.map((p) => h('p', {}, p)),
    s.look && s.look.length ? h('ul', { class: 'tour-look' }, ...s.look.map((x) => h('li', {}, x))) : null,
    h('div', { class: 'tour-tools' }, s.predict || predictOn() ? predictBtn : null, predictOn() ? revealAll : null, check));
  const handle = h('button', { type: 'button', class: 'tour-handle', 'aria-expanded': 'true', 'aria-controls': 'tour-body' }, 'Hide the words');
  const el = h('aside', { class: 'tour-sheet', role: 'complementary', tabindex: '-1', 'aria-label': `The tour, stop ${s.n} of ${TOUR.length}` },
    h('div', { class: 'tour-head' },
      h('span', { class: 'kicker', 'aria-live': 'polite' }, `The tour · ${s.n} of ${TOUR.length} · ${TOUR_COUNTRY}`),
      h('span', { class: 'tour-links' }, h('a', { href: withData('/growth-test-site/desk/learn.html#stops') }, 'All stops'), h('a', { href: leaveHref() }, 'Leave'), handle)),
    h('h2', { class: 'tour-title' }, s.title),
    body,
    h('nav', { class: 'tour-nav', 'aria-label': 'Tour stops' },
      prev ? h('a', { class: 'btn quiet small', href: stopHref(prev), rel: 'prev', 'aria-label': `Back: stop ${prev.n}, ${prev.title}` }, `← ${prev.n}`)
        : h('a', { class: 'btn quiet small', href: withData('/growth-test-site/desk/learn.html'), 'aria-label': 'Back to the tour’s start' }, '← Start'),
      next ? h('a', { class: 'btn primary small tour-next', href: stopHref(next), rel: 'next' }, `Next: ${next.title} →`)
        : h('a', { class: 'btn primary small tour-next', href: withData('/growth-test-site/desk/learn.html#exit') }, 'Done: the exit test →')));
  handle.addEventListener('click', () => {
    const open = el.classList.toggle('collapsed') === false;
    handle.setAttribute('aria-expanded', String(open)); handle.textContent = open ? 'Hide the words' : 'Show the words';
    setSheetRoom(el);
  });
  return el;
}
/**
 * Give the scrolling region room under its content, so the stop's element can scroll to the top of the screen clear of
 * the sheet; and place the desktop panel under the site bar. Set inline: a page's own stylesheet (the pages layer) would
 * beat a shared rule, and the Analyst View sets its own padding.
 * @param {HTMLElement} sh the sheet
 */
function setSheetRoom(sh) {
  const region = placed ? regionOf(placed.el) : document.getElementById('main');
  if (!region) return;
  if (phone()) region.style.paddingBottom = `${Math.round(sh.offsetHeight + window.innerHeight * 0.7)}px`;
  else {
    region.style.paddingBottom = `${Math.round(window.innerHeight * 0.4)}px`;
    const bar = document.querySelector('header.topbar');
    sh.style.top = bar ? `${Math.round(bar.getBoundingClientRect().bottom + window.scrollY + 8)}px` : '';
    if (sh.classList.contains('collapsed')) { sh.classList.remove('collapsed'); const hd = sh.querySelector('.tour-handle'); if (hd) { hd.setAttribute('aria-expanded', 'true'); hd.textContent = 'Hide the words'; } }
  }
}
/** Take the room back when the tour ends. */
function clearSheetRoom() { for (const el of [document.getElementById('main'), document.getElementById('drawer')]) if (el) el.style.removeProperty('padding-bottom'); }

// ---------- focus mode ----------
/** An element that is really on the screen: a box with height, something in it, and not inside a closed drawer. @param {Element | null} el */
function shown(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (!(r.height > 0 && r.width > 0)) return false;
  if (!(el.textContent || '').trim() && !el.childElementCount) return false;
  const d = el.closest('#drawer');
  return !d || d.classList.contains('open');
}
/** Wait for the selector to match a shown element, up to ms, opening the <details> above it on the way. @param {string} sel @param {number} ms @returns {Promise<Element | null>} */
function waitFor(sel, ms) {
  return new Promise((res) => {
    const t0 = performance.now();
    const tick = () => {
      const el = document.querySelector(sel);
      if (el && !shown(el)) openAncestors(el);
      if (el && shown(el)) return res(el);
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
/** The region focus mode works in: the drawer when the element is in it, else the page's main. @param {Element} el */
const regionOf = (el) => /** @type {HTMLElement} */ (el.closest('#drawer') || document.getElementById('main') || document.body);
/** The elements a stop keeps on the screen beside its anchor, plus the page's own error line. @param {import('./tour_stops.mjs').Stop} s @param {HTMLElement} region @returns {Element[]} */
const keepsOf = (s, region) => [...(s.keep || []), '#page-error', '[role="alert"]'].flatMap((sel) => Array.from(region.querySelectorAll(sel)));
/** Hide everything in the region except the element, what the stop keeps, and their ancestors. @param {Element} el @param {Element[]} keeps */
function isolate(el, keeps) {
  const region = regionOf(el);
  const protect = new Set();
  for (const k of [el, ...keeps]) for (let n = k; n && n !== region; n = n.parentElement) protect.add(n);
  for (const k of [el, ...keeps]) {
    for (let n = k; n && n !== region && n.parentElement; n = n.parentElement) {
      for (const sib of n.parentElement.children) if (sib !== n && !protect.has(sib)) sib.classList.add(HIDE);
    }
  }
}
const unisolate = () => { for (const el of document.querySelectorAll(`.${HIDE}`)) el.classList.remove(HIDE); };
/** Mount the sheet on the body, focused; at the left on a desktop when the stop is inside the drawer. @param {HTMLElement} sh @param {Element | null} el */
function mountSheet(sh, el) {
  document.querySelector('.tour-sheet')?.remove();
  sh.classList.toggle('left', !!el && regionOf(el).id === 'drawer');
  document.body.append(sh);
  setSheetRoom(sh);
  sh.focus({ preventScroll: true });
}
/** Scroll so the element starts at the top of its scrolling region (instant: a smooth scroll depends on animation frames the page may not get). @param {Element} el */
function show(el) {
  const region = regionOf(el);
  if (region.id === 'drawer') { region.scrollTop = Math.max(0, el.getBoundingClientRect().top - region.getBoundingClientRect().top + region.scrollTop - 12); return; }
  window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 12) });
}

/** @type {{stop: import('./tour_stops.mjs').Stop, el: Element} | null} */
let placed = null;
/** The sheet alone, with a line on why the stop's element is not on the screen. @param {import('./tour_stops.mjs').Stop} s @param {Element | null} el */
function fallback(s, el) {
  const sh = sheet(s); sh.dataset.missing = '1';
  const d = el ? el.closest('#drawer') : null;
  const closed = !!d && !d.classList.contains('open');
  const note = h('p', { class: 'tour-missing small muted' }, closed ? 'The card is closed. ' : `The page has not drawn ${s.anchorName}. `,
    closed ? h('button', { type: 'button', class: 'btn quiet small', onclick: () => location.reload() }, 'Reopen the card') : 'Scroll to find it, or move on.');
  sh.querySelector('.tour-body')?.prepend(note);
  unisolate(); placed = null;
  mountSheet(sh, null);
}
/** Find the stop's element, go into focus mode and mount the sheet. @param {import('./tour_stops.mjs').Stop} s */
async function place(s) {
  unisolate(); placed = null;
  const el = await waitFor(s.anchor, 8000);
  if (currentStop() !== s) return; // the learner moved on while we waited
  if (!el) { fallback(s, document.querySelector(s.anchor)); return; }
  focusOn(s, el, true);
  for (const t of [700, 1600, 3200]) window.setTimeout(refresh, t); // pages keep drawing after their data arrive, with no event for it
}
/** Focus mode around the element, with the sheet (rebuilt when asked or missing). @param {import('./tour_stops.mjs').Stop} s @param {Element} el @param {boolean} rebuild */
function focusOn(s, el, rebuild) {
  unisolate(); openAncestors(el);
  isolate(el, keepsOf(s, regionOf(el)));
  const old = /** @type {HTMLElement | null} */ (document.querySelector('.tour-sheet'));
  placed = { stop: s, el };
  if (rebuild || !old || old.dataset.missing) { const sh = sheet(s); mountSheet(sh, el); revealIn(sh); } else setSheetRoom(old);
  show(el);
}
let timer = 0;
/** After the page redraws (debounced): the element may be new, gone, or back, so isolate again around it. */
function refresh() {
  const s = currentStop(); if (!s) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    const el = document.querySelector(s.anchor);
    const sh = /** @type {HTMLElement | null} */ (document.querySelector('.tour-sheet'));
    if (!shown(el)) { if (!sh || !sh.dataset.missing) fallback(s, el); return; }
    if (!placed || placed.stop !== s || placed.el !== el || !sh || sh.dataset.missing) focusOn(s, /** @type {Element} */ (el), false);
    else setSheetRoom(sh);
  }, 350);
}

// ---------- mount ----------
let shownStop = null;
/** @type {URLSearchParams | null} */
let lastParams = null;
function mount() {
  const s = currentStop();
  applyPredict();
  // the tour speaks in the tool's voice only: TNFA's boxes hide while it is on; focus mode is the body class too
  document.body.classList.toggle('tour', !!s);
  if (!s) {
    // an in-page link (href="#class-key") inside a kept element would end the tour by replacing the hash: keep the stop, show the target
    const frag = currentHash().slice(1);
    if (shownStop && lastParams && frag && !frag.includes('=') && document.getElementById(frag)) {
      writeHash(lastParams);
      const t = document.getElementById(frag); if (t) { openAncestors(t); t.scrollIntoView({ block: 'start' }); }
      document.body.classList.add('tour'); return;
    }
    unisolate(); document.querySelector('.tour-sheet')?.remove(); clearSheetRoom(); placed = null; shownStop = null; return;
  }
  lastParams = readHash();
  if (shownStop === s.n && document.querySelector('.tour-sheet')) { refresh(); return; }
  const samePage = shownStop != null;
  shownStop = s.n;
  document.body.classList.remove('predict-all');
  place(s);
  // a hash-only move between stops on one page: the page keeps its reading in memory, so tell it the stop's
  if (samePage && document.querySelector('.setting-switch')) {
    const setting = (s.hash && s.hash.setting) || 'standard';
    if (setting !== currentSetting()) setHashKeys({ [HASH.setting]: setting === 'standard' ? null : setting });
    window.dispatchEvent(new CustomEvent('desk-setting', { detail: { setting } }));
  }
}
mount();
window.addEventListener('hashchange', () => { const had = !!document.querySelector('.tour-sheet'); mount(); if (!had && !currentStop()) applyPredict(); });
for (const ev of ['desk-hash', 'desk-setting', 'desk-reveal', 'desk-predict']) window.addEventListener(ev, refresh);
window.addEventListener('resize', refresh);
// the drawer opening or closing under a stop (Close, Escape, the scrim) changes what is on the screen
const drawer = document.getElementById('drawer');
if (drawer) new MutationObserver(refresh).observe(drawer, { attributes: true, attributeFilter: ['class'] });
// ← and → move between stops when the focus is on the page itself or in the sheet, never from a control of the page's own
window.addEventListener('keydown', (e) => {
  const s = currentStop(); if (!s || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const t = e.target instanceof HTMLElement ? e.target : null;
  if (t && t !== document.body && !t.closest('.tour-sheet')) return;
  if (t && t.closest('input, textarea, select, [contenteditable="true"]')) return;
  const to = e.key === 'ArrowRight' ? stopByN(s.n + 1) : e.key === 'ArrowLeft' ? stopByN(s.n - 1) : null;
  if (to) { e.preventDefault(); location.href = stopHref(to); }
});

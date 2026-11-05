// @ts-check
// The one motion helper (Growth Test PRD, Part 6C, C6; D9; tenet 6). Under 5 KB; no DOM access at import time.
// One easing family and one duration scale, read from the tokens in css/tokens.css; every motion has a static
// equivalent under prefers-reduced-motion; nothing animates on a rating surface: the helpers refuse any element
// on one (RATING), throwing in development and doing nothing in production.

/** Selectors of the rating surfaces (tenet 6): a tier badge, the strip, the three lists, the rail's dots, an area square. */
export const RATING = '.tier-badge, .strip, .bl-list, .tier-dot, [data-area]';
const DURS = { 1: 150, 2: 250, 3: 400 };

/** True when the reader asked for reduced motion (or there is no window, as under Node). */
export function reducedMotion() {
  return typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
/** A design token's value from :root ('' when absent). */
export function token(name) {
  return typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
/** --dur-1, --dur-2 or --dur-3 in milliseconds (0 under reduced motion). */
export function dur(n = 2) {
  if (reducedMotion()) return 0;
  const v = token(`--dur-${n}`);
  const ms = v.endsWith('ms') ? parseFloat(v) : v.endsWith('s') ? parseFloat(v) * 1000 : NaN;
  return Number.isFinite(ms) ? ms : DURS[n] || DURS[2];
}
/** The --ease token as a CSS easing string, for the Web Animations API and transitions. */
export function easing() { return token('--ease') || 'ease'; }
/** The --ease token as a function of t in [0, 1], for D3 transitions (a cubic Bézier solved by bisection). */
export function easeFn(t) {
  const m = easing().match(/cubic-bezier\(([^)]*)\)/);
  if (!m) return t;
  const [x1, y1, x2, y2] = m[1].split(',').map(Number);
  const bez = (a, b, s) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  let lo = 0, hi = 1, s = t;
  for (let i = 0; i < 24; i++) { s = (lo + hi) / 2; if (bez(x1, x2, s) < t) lo = s; else hi = s; }
  return bez(y1, y2, s);
}

const isDev = () => typeof location === 'undefined' || /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname);
/** False (production) or a throw (development) when the element is on a rating surface; true otherwise. */
function allowed(el, what) {
  if (!el || typeof el.matches !== 'function') return false;
  if (el.matches(RATING) || (el.closest && el.closest(RATING))) {
    const msg = `motion.${what}: refused, the element is on a rating surface (${RATING}); nothing animates a rating (tenet 6)`;
    if (isDev()) throw new Error(msg);
    console.warn(msg);
    return false;
  }
  return true;
}

/**
 * Reveal an element as it scrolls into view: CSS animation-timeline where the browser has it (motion.css,
 * .reveal-scroll), an IntersectionObserver that adds .in otherwise. The static equivalent is simply being there:
 * under reduced motion, or without either mechanism, .in is added at once.
 */
export function reveal(el) {
  if (!allowed(el, 'reveal')) return;
  el.classList.add('reveal');
  if (reducedMotion()) { el.classList.add('in'); return; }
  if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('animation-timeline: view()')) { el.classList.add('reveal-scroll'); return; }
  if (typeof IntersectionObserver === 'undefined') { el.classList.add('in'); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.2 });
  io.observe(el);
}

/**
 * Animate a <details> open and closed (its height, --dur-2, --ease) through the Web Animations API. Under reduced
 * motion, or without the API, the browser's instant open is the static equivalent and nothing is attached.
 */
export function disclose(details) {
  if (!allowed(details, 'disclose')) return;
  const summary = details.querySelector(':scope > summary');
  if (!summary || reducedMotion() || typeof details.animate !== 'function') return;
  let anim = null;
  summary.addEventListener('click', (e) => {
    e.preventDefault();
    if (anim) anim.cancel();
    const opening = !details.open;
    const from = details.offsetHeight;
    if (opening) details.open = true; // lay the content out to measure it; while closing it stays open until the end
    const to = opening ? details.offsetHeight : summary.offsetHeight;
    details.style.overflow = 'hidden';
    const a = details.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: dur(2), easing: easing() });
    const finish = () => { if (anim !== a) return; anim = null; if (!opening) details.open = false; details.style.overflow = ''; };
    anim = a;
    a.onfinish = finish;
    a.oncancel = finish;
    setTimeout(() => { if (anim === a) { finish(); a.cancel(); } }, dur(2) + 100); // a stalled animation clock must not leave the fold half way
  });
}

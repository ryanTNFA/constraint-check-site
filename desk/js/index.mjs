// @ts-check
// The root page: the story (Growth Test PRD, Part 10), the scrolling front door in six beats. The copy is
// static HTML (index.html), so the first paint needs nothing from here. This module mounts the Long View after first paint
// (beat 1, drawing itself once per session; static under reduced motion), wires the two country searches (D5: a country is
// one click from the first screen), and reveals beats 2 to 6 as they scroll into view through motion.mjs (D9: scroll-linked
// motion on the argument surfaces only; the page has no rating surface).
import './shell.mjs';
import { initTheme, h, getJSON, dataBase, withData } from './common.mjs';
import { reveal } from './motion.mjs';

initTheme();

// ---------- beat 1: the Long View, after first paint, drawn once per session ----------
const DRAWN = 'gt-longview-drawn';
const drawn = () => { try { return sessionStorage.getItem(DRAWN) === '1'; } catch { return false; } };
const markDrawn = () => { try { sessionStorage.setItem(DRAWN, '1'); } catch { /* storage may be unavailable */ } };
const host = document.getElementById('longview');
// after first paint: a macrotask (requestAnimationFrame never fires while the tab is in the background, and the chart must still arrive)
setTimeout(() => {
  import('./longview.mjs')
    .then((m) => m.mountLongView(host, { autoplay: !drawn() }))
    .then(() => { markDrawn(); if (host) { host.removeAttribute('aria-busy'); host.classList.add('ready'); } })
    .catch((e) => { console.error(e); if (host) host.hidden = true; });
}, 0);

// ---------- the country search (beats 1 and 6): the list loads on first touch, a typed ISO code works without it ----------
/** @type {Array<{iso3: string, name: string}> | null} */
let countries = null;
let loading = null;
function loadCountries() {
  if (!loading) loading = getJSON(`${dataBase()}/countries.json`, { optional: true }).then((cs) => {
    countries = (cs || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const dl = document.getElementById('gt-countries');
    if (dl) dl.replaceChildren(...countries.map((c) => h('option', { value: c.name }, c.iso3)));
    return countries;
  });
  return loading;
}
function find(q) {
  const v = q.trim().toLowerCase(); if (!v) return null;
  const hit = (countries || []).find((c) => c.name.toLowerCase() === v || c.iso3.toLowerCase() === v) ||
    (countries || []).find((c) => c.name.toLowerCase().startsWith(v));
  if (hit) return hit.iso3;
  return /^[a-z]{3}$/.test(v) ? v.toUpperCase() : null; // an ISO3 code typed before the list arrives
}
for (const form of /** @type {NodeListOf<HTMLFormElement>} */ (document.querySelectorAll('form.gt-ask, form.gt-entry'))) {
  const input = /** @type {HTMLInputElement | null} */ (form.querySelector('input[data-ask]'));
  if (!input) continue;
  for (const ev of ['focus', 'pointerenter']) input.addEventListener(ev, () => { loadCountries(); }, { once: true });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await loadCountries();
    const iso = find(input.value);
    if (!iso) { input.setCustomValidity('No economy by that name or code.'); input.reportValidity(); return; }
    location.href = withData(`/growth-test-site/desk/country.html?iso=${encodeURIComponent(iso)}`);
  });
  input.addEventListener('input', () => input.setCustomValidity(''));
}

// ---------- beats 2 to 6: reveal as they scroll into view (static under reduced motion) ----------
for (const el of document.querySelectorAll('.beat:not(.beat-hero) > .beat-in')) reveal(el);

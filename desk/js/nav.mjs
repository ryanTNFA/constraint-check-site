// The two-row top bar, the same on every page (front-door PRD W3, section 3.2).
// Row 1, global: brand, Home, Methods, About this prototype, and a small Display menu.
// Row 2, once a country is chosen: the country with a type-to-search switcher; the tabs
// Bottom line · Areas · (For analysts) Charts · Heat map; and the comparison set in use.
// State travels in the URL: every tab link carries the comparison set, edited peers and overrides
// (#set=, #peers=, #o=) read at click time, because the pages rewrite their hash as the user works.
// Import this module first on every page: it mounts synchronously, before initTheme looks for its button.
import { h, withData, qs, getJSON, dataBase } from './common.mjs';

const PAGE = document.body.dataset.page || '';
export const TABS = [
  { key: 'bottom', label: 'Bottom line', path: '/constraint-check-site/desk/country.html' },
  { key: 'areas', label: 'Areas', path: '/constraint-check-site/desk/areas.html' },
  { key: 'charts', label: 'Charts', path: '/constraint-check-site/desk/evidence.html', analyst: true },
  { key: 'heat', label: 'Heat map', path: '/constraint-check-site/desk/summary.html', analyst: true },
];
const SET_WORDS = { structural: 'similar economies', regional: 'regional neighbours', aspirational: 'faster growers that were once as rich', custom: 'your own list' };

let countries = null;
const nameOf = (iso) => { const c = (countries || []).find((x) => x.iso3 === iso); return c ? c.name : iso; };

/** The URL state that follows the user between tabs: only the keys every country page understands. */
export function carriedHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  const keep = new URLSearchParams();
  for (const k of ['set', 'peers', 'o']) if (p.get(k) != null) keep.set(k, p.get(k));
  const s = keep.toString();
  return s ? `#${s}` : '';
}
/** A link to a country tab with the current state; `extra` adds query parameters such as node=. */
export function tabHref(path, iso, extra = '') {
  return withData(`${path}?iso=${encodeURIComponent(iso)}${extra}`) + carriedHash();
}
const currentIso = () => (qs('iso') || '').toUpperCase();

function row1() {
  const menu = h('details', { class: 'nav-menu' },
    h('summary', {}, 'Display'),
    h('div', { class: 'nav-menu-body' }, h('button', { id: 'theme-toggle', class: 'btn quiet small', type: 'button' }, 'Theme: Auto')));
  const link = (href, label, key) => h('a', { href: withData(href), 'aria-current': PAGE === key ? 'page' : null }, label);
  return h('div', { class: 'nav-row nav-global' },
    h('div', { class: 'wrap' },
      h('a', { class: 'brand', href: withData('/constraint-check-site/desk/') }, h('img', { class: 'brand-logo', src: '/constraint-check-site/desk/img/tnfa-logo.webp', alt: 'The New Foreign Assistance', width: '72', height: '36' }), h('strong', {}, 'Constraint Check'), h('span', {}, 'prototype')),
      h('nav', { class: 'topnav', 'aria-label': 'Site' },
        link('/constraint-check-site/desk/', 'Home', 'home'),
        link('/constraint-check-site/desk/methods.html', 'Methods', 'methods'),
        h('a', { href: withData('/constraint-check-site/desk/methods.html#about') }, 'About', h('span', { class: 'nav-long' }, ' this prototype')),
        menu)));
}

function row2(iso) {
  const tab = (t) => {
    const a = h('a', { class: 'tab', href: tabHref(t.path, iso), 'aria-current': PAGE === t.key ? 'page' : null }, t.label);
    // the page may have changed its hash or its country since the bar was drawn
    a.addEventListener('click', () => { a.href = tabHref(t.path, currentIso() || iso); });
    return a;
  };
  const input = h('input', { type: 'search', id: 'nav-country', list: 'nav-countries', placeholder: 'Switch country…', autocomplete: 'off', 'aria-label': 'Switch country: type a name or ISO code' });
  const list = h('datalist', { id: 'nav-countries' });
  const go = () => {
    const v = input.value.trim().toLowerCase(); if (!v || !countries) return;
    const hit = countries.find((c) => c.name.toLowerCase() === v || c.iso3.toLowerCase() === v) || countries.find((c) => c.name.toLowerCase().startsWith(v));
    if (!hit) return;
    // peers and overrides belong to one country; the comparison-set choice carries over
    const set = new URLSearchParams(location.hash.replace(/^#/, '')).get('set');
    const path = location.pathname.replace(/\/$/, '/index.html');
    const page = TABS.some((t) => path.endsWith(t.path.split('/').pop())) ? location.pathname : '/constraint-check-site/desk/country.html';
    location.href = withData(`${page}?iso=${hit.iso3}`) + (set ? `#set=${set}` : '');
  };
  input.addEventListener('change', go);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  // the comparison set in use; it links to where it can be changed (Areas, comparison countries)
  const setNote = h('a', { class: 'nav-set small', id: 'nav-set', href: tabHref('/constraint-check-site/desk/areas.html', iso, '&section=comparators') });
  setNote.addEventListener('click', () => { setNote.href = tabHref('/constraint-check-site/desk/areas.html', currentIso() || iso, '&section=comparators'); });
  return h('div', { class: 'nav-row nav-country' },
    h('div', { class: 'wrap' },
      h('div', { class: 'nav-country-id' }, h('span', { class: 'nav-country-name', id: 'nav-country-name' }, iso), input, list),
      h('nav', { class: 'tabs', 'aria-label': 'Country views' },
        tab(TABS[0]), tab(TABS[1]),
        h('span', { class: 'tab-group' }, h('span', { class: 'tab-group-label' }, 'For analysts'), tab(TABS[2]), tab(TABS[3]))),
      setNote));
}

/** Redraw the country line: name, the comparison set in use, and the tab links (pages call this when they switch country). */
export function refreshNav() {
  const iso = currentIso();
  const name = document.getElementById('nav-country-name');
  if (name) name.textContent = nameOf(iso);
  for (const a of document.querySelectorAll('.nav-country a.tab')) { const t = TABS.find((x) => x.label === a.textContent); if (t) a.href = tabHref(t.path, iso); }
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  const set = p.get('peers') != null ? 'custom' : (p.get('set') || 'structural');
  const note = document.getElementById('nav-set');
  if (note) note.textContent = `Compared with ${SET_WORDS[set] || set}${p.get('peers') != null ? '' : ` (${set})`}`;
}

function mount() {
  const header = document.querySelector('header.topbar');
  if (!header) return;
  const iso = currentIso();
  const showCountry = !!iso && TABS.some((t) => t.key === PAGE);
  header.replaceChildren(row1(), showCountry ? row2(iso) : '');
  header.classList.add('two-row');
  if (!showCountry) return;
  refreshNav();
  window.addEventListener('hashchange', refreshNav);
  // pages rewrite their hash with history.replaceState, which fires no event: refresh on the next interactions
  document.addEventListener('click', () => setTimeout(refreshNav, 0));
  document.addEventListener('change', () => setTimeout(refreshNav, 0));
  getJSON(`${dataBase()}/countries.json`, { optional: true }).then((cs) => {
    countries = (cs || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const dl = document.getElementById('nav-countries');
    if (dl) dl.replaceChildren(...countries.map((c) => h('option', { value: c.name }, c.iso3)));
    refreshNav();
  });
}
mount();

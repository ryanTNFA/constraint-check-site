// @ts-check
// The page shell (Growth Test PRD, Part 6C, C2): the two-row top bar and the footer, the same on every page,
// rendered into the empty <header class="topbar"> and <footer class="foot"> hosts of desk/_template.html.
// Row 1, global: brand, Home, Methods, About this prototype, and a small Display menu (front-door PRD W3, 3.2).
// Row 2, once a country is chosen: the country with a type-to-search switcher; the tabs
// Bottom line · Areas · (For analysts) Charts · Heat map; and the comparison set in use.
// State travels in the URL: every tab link carries the comparison set, edited peers and overrides
// (#set=, #peers=, #o=) read at click time, because the pages rewrite their hash as the user works.
// Import this module first on every page: it mounts synchronously, before initTheme looks for its button.
// The footer carries #versions (pages with data fill it), the prototype sentence, the citation and the affiliation note.
import { h, withData, qs, getJSON, dataBase, SETTINGS, SETTING_LABEL, SETTING_HINT, currentSetting, HASH, CARRIED_KEYS, readHash,
  setHashKeys } from './common.mjs';
import './components/elements.mjs'; // <gt-term> and <gt-fold>, on every page (C7)

const PAGE = document.body.dataset.page || '';
export const TABS = [
  { key: 'bottom', label: 'Bottom line', path: '/constraint-check-site/desk/country.html' },
  { key: 'areas', label: 'Areas', path: '/constraint-check-site/desk/areas.html' },
  { key: 'charts', label: 'Charts', path: '/constraint-check-site/desk/evidence.html', analyst: true },
  { key: 'heat', label: 'Heat map', path: '/constraint-check-site/desk/summary.html', analyst: true },
];
const SET_WORDS = { structural: 'similar economies', regional: 'regional neighbours', aspirational: 'faster growers that were once as rich',
  custom: 'your own list' };

let countries = null;
const nameOf = (iso) => { const c = (countries || []).find((x) => x.iso3 === iso); return c ? c.name : iso; };

/** The URL state that follows the user between tabs: only the keys every country page understands. */
export function carriedHash() {
  const p = readHash();
  const keep = new URLSearchParams();
  for (const k of CARRIED_KEYS) if (p.get(k) != null) keep.set(k, p.get(k));
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
  return h('div', { class: 'nav-global' },
    h('div', { class: 'wrap' },
      h('a', { class: 'brand', href: withData('/constraint-check-site/desk/') }, h('img', { class: 'brand-logo', src: '/constraint-check-site/desk/img/tnfa-logo.webp', alt: 'The New Foreign Assistance',
        width: '72', height: '36' }), h('strong', {}, 'Constraint Check'), h('span', {}, 'prototype')),
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
  const input = h('input', { type: 'search', id: 'nav-country', list: 'nav-countries', placeholder: 'Switch country…', autocomplete: 'off',
    'aria-label': 'Switch country: type a name or ISO code' });
  const list = h('datalist', { id: 'nav-countries' });
  const go = () => {
    const v = input.value.trim().toLowerCase(); if (!v || !countries) return;
    const hit = countries.find((c) => c.name.toLowerCase() === v || c.iso3.toLowerCase() === v) || countries.find((c) => c.name.toLowerCase().startsWith(v));
    if (!hit) return;
    // peers and overrides belong to one country; the comparison-set choice and the evidence setting carry over
    const cur = readHash();
    const keep = new URLSearchParams();
    for (const k of [HASH.set, HASH.setting]) if (cur.get(k)) keep.set(k, cur.get(k));
    const path = location.pathname.replace(/\/$/, '/index.html');
    const page = TABS.some((t) => path.endsWith(t.path.split('/').pop())) ? location.pathname : '/constraint-check-site/desk/country.html';
    location.href = withData(`${page}?iso=${hit.iso3}`) + (keep.toString() ? `#${keep}` : '');
  };
  input.addEventListener('change', go);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  // the comparison set in use; it links to where it can be changed (Areas, comparison countries)
  const setNote = h('a', { class: 'nav-set small', id: 'nav-set', href: tabHref('/constraint-check-site/desk/areas.html', iso, '&section=comparators') });
  setNote.addEventListener('click', () => { setNote.href = tabHref('/constraint-check-site/desk/areas.html', currentIso() || iso, '&section=comparators'); });
  return h('div', { class: 'nav-country' },
    h('div', { class: 'wrap' },
      h('div', { class: 'nav-country-id' }, h('span', { class: 'nav-country-name', id: 'nav-country-name' }, iso), input, list),
      h('nav', { class: 'tabs', 'aria-label': 'Country views' },
        tab(TABS[0]), tab(TABS[1]),
        h('span', { class: 'tab-group' }, h('span', { class: 'tab-group-label' }, 'For analysts'), tab(TABS[2]), tab(TABS[3]))),
      h('div', { class: 'nav-meta' }, settingSwitch(), setNote)));
}

/**
 * The evidence setting (front-door PRD W4): three named readings, never a slider. Standard is the default and the
 * only citable reading. The choice lives in the link (#setting=) and pages redraw on the 'desk-setting' event.
 */
function settingSwitch() {
  const cur = currentSetting();
  const group = h('div', { class: 'setting-switch', role: 'group', 'aria-label': 'Evidence setting' },
    h('span', { class: 'setting-label' }, 'Reading'),
    ...SETTINGS.map((s) => h('button', { type: 'button', class: 'setting-btn', 'data-setting': s, 'aria-pressed': s === cur ? 'true' : 'false',
      title: SETTING_HINT[s] }, SETTING_LABEL[s])),
    h('a', { class: 'setting-help small', href: withData('/constraint-check-site/desk/methods.html#settings'), title: 'What the three readings are' }, 'What’s this?'));
  group.addEventListener('click', (e) => {
    const b = e.target instanceof Element ? /** @type {HTMLElement | null} */ (e.target.closest('button[data-setting]')) : null; if (!b) return;
    const s = b.dataset.setting;
    setHashKeys({ [HASH.setting]: s === 'standard' ? null : s }); // writeHash tells the bar (desk-hash)
    for (const x of /** @type {NodeListOf<HTMLElement>} */ (group.querySelectorAll('button[data-setting]'))) {
      x.setAttribute('aria-pressed', x.dataset.setting === s ? 'true' : 'false');
    }
    window.dispatchEvent(new CustomEvent('desk-setting', { detail: { setting: s } }));
  });
  return group;
}

/** Redraw the country line: name, the comparison set in use, and the tab links (pages call this when they switch country). */
export function refreshNav() {
  const iso = currentIso();
  const name = document.getElementById('nav-country-name');
  if (name) name.textContent = nameOf(iso);
  // V2: the page shell paints the ISO code at once; swap in the name as soon as the country list is here, until the page
  // module writes its own title (it removes data-country-title or overwrites the text)
  if (countries) for (const el of document.querySelectorAll('[data-country-title]')) {
    if (el.textContent.startsWith(iso)) el.textContent = el.textContent.replace(iso, nameOf(iso));
    if (document.title.startsWith(`${iso} ·`)) document.title = document.title.replace(iso, nameOf(iso));
  }
  for (const a of /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll('.nav-country ' +
    'a.tab'))) { const t = TABS.find((x) => x.label === a.textContent); if (t) a.href = tabHref(t.path,
    iso); }
  const p = readHash();
  const set = p.get(HASH.peers) != null ? 'custom' : (p.get(HASH.set) || 'structural');
  for (const b of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.setting-btn'))) b.setAttribute('aria-pressed',
    b.dataset.setting === currentSetting() ? 'true' : 'false');
  const note = document.getElementById('nav-set');
  if (note) note.textContent = `Compared with ${SET_WORDS[set] || set}`;
}

/** The footer, the same on every page: the data vintage (filled by pages that have one), the prototype sentence, the citation and the affiliation note. */
function footer() {
  return h('div', { class: 'wrap' },
    h('p', { id: 'versions' }),
    h('p', {},
      'Constraint Check, a prototype by The New Foreign Assistance. Overrides and comparator edits live in the page URL and are never sent anywhere. This ' +
        'tool never recommends funding; it states what the public evidence can and cannot support.'),
    h('p', { id: 'cite-as' }, 'Cite as: Moore, Ryan A., and The New Foreign Assistance, ', h('em', {}, 'Constraint Check'), ', ',
      h('a', { href: 'https://doi.org/10.5281/zenodo.23924472' }, 'doi:10.5281/zenodo.23924472'),
      ' (the DOI resolves to the latest release; each release has its own). Code Apache 2.0; documents and derived data CC BY 4.0.'),
    h('p', { class: 'small muted', id: 'affiliation' },
      'Constraint Check is not affiliated with or endorsed by the Growth Lab at Harvard Kennedy School, the Observatory of Economic Complexity or the ' +
        'Millennium Challenge Corporation. It reimplements methods published in the research literature (Hausmann, Rodrik and Velasco; Hausmann and Rodrik; ' +
        'Hidalgo, Hausmann and coauthors) and uses public data, credited where used. See the ',
      h('a', { href: 'https://atlas.hks.harvard.edu/', target: '_blank', rel: 'noopener' },
        'Atlas of Economic Complexity'), ' for the Growth Lab’s own tools.'));
}

function mount() {
  const foot = document.querySelector('footer.foot');
  if (foot && !foot.childElementCount) foot.replaceChildren(footer());
  const header = document.querySelector('header.topbar');
  if (!header) return;
  const iso = currentIso();
  const showCountry = !!iso && TABS.some((t) => t.key === PAGE);
  header.replaceChildren(row1(), showCountry ? row2(iso) : '');
  header.classList.add('two-row');
  if (!showCountry) return;
  refreshNav();
  window.addEventListener('hashchange', refreshNav); // back and forward
  window.addEventListener('desk-hash', refreshNav); // every writeHash (common.mjs), since replaceState fires no event
  getJSON(`${dataBase()}/countries.json`, { optional: true }).then((cs) => {
    countries = (cs || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const dl = document.getElementById('nav-countries');
    if (dl) dl.replaceChildren(...countries.map((c) => h('option', { value: c.name }, c.iso3)));
    refreshNav();
  });
}
mount();
// teaching mode (docs/teaching-plan.md): the lesson bar and Predict first mount after the bar, when the hash asks
import('./lesson.mjs').catch((e) => console.error(e));

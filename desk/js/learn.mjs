// The Learn page (docs/learn-tour-plan.md): the tour's front door and index. The start button opens stop 1; the list of
// stops is drawn from tour_stops.mjs so the page and the bar never disagree; the data vintage comes from the index.
import './shell.mjs';
import { getJSON, initTheme, h, dataBase, withData } from './common.mjs';
import { TOUR, TOUR_COUNTRY, RUBRIC } from './tour_stops.mjs';
import { stopHref } from './tour.mjs';
import { reveal } from './motion.mjs';

initTheme();
const $ = (id) => document.getElementById(id);

function main() {
  const first = TOUR[0];
  for (const a of document.querySelectorAll('a[data-start]')) a.setAttribute('href', stopHref(first));
  $('stop-count').textContent = String(TOUR.length);
  $('stop-list').replaceChildren(...TOUR.map((s) => h('li', {},
    h('a', { href: stopHref(s) }, `${s.n}. ${s.title}`), ' ',
    h('span', { class: 'small muted' }, `${pageName(s.page)} · ${s.say[0].split('. ')[0]}.`))));
  for (const sec of document.querySelectorAll('.learn-sec')) reveal(sec);
  getJSON(`${dataBase()}/index.json`, { optional: true }).then((ix) => {
    if (!ix) return;
    $('learn-meta').textContent = `Rubric ${ix.rubric_version || RUBRIC} · public data snapshot ${ix.snapshot_id || ''} · the stops quote the tool’s reading of ${TOUR_COUNTRY} on that date, and a test checks every number they quote against the data.`;
  });
}
/** The page a stop opens, in words. @param {string} page */
function pageName(page) {
  const file = page.replace(/^\/desk\//, '').replace(/[?#].*$/, '');
  return { 'countries.html': 'Countries', 'country.html': 'The Bottom line', 'areas.html': 'Areas', 'evidence.html': 'The Analyst View', 'summary.html': 'The heat map' }[file] || file;
}
main();

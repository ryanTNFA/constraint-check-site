// @ts-check
// The country signature (visual-upgrade PRD V3): one square per area, always in tree order (the first decision, the
// finance branch, then the low-return branch, the micro-risk roll-up, self-discovery, the sector-study area), each
// painted by its tier. A fingerprint, not a score: there is no total and nothing ever sorts by it.
// A shared render function (Growth Test PRD 6C, C7), drawn by the home page's cards and the compact tree.
import { h, tierClass } from '../common.mjs';

/** The areas in tree order. */
export const STRIP_AREAS = ['N0', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N10', 'N11', 'N12', 'N13'];

/**
 * @param {Record<string, string | null> | null | undefined} tiers tier by area id
 * @param {{size?: 'sm' | 'md' | 'lg', label?: (id: string) => string, plain?: (tier: string | null) => string,
 *   href?: ((id: string) => string) | null, leans?: Record<string, {band: string, mark: string, words: string}> | null,
 *   highlight?: string | null, overrides?: Record<string, {tier: string}> | null}} [opts]
 *   size 'sm' | 'md' | 'lg'; label(id) and plain(tier) for the words; href(id) makes each square a link; leans {id: leanOf()}
 *   puts the arrow on a grey square; highlight marks one area; overrides {id: {tier}} marks the user's own calls.
 * @returns {HTMLElement}
 */
export function strip(tiers, { size = 'sm', label = (id) => id, plain = (t) => t || 'not rated', href = null, leans = null, highlight = null,
  overrides = null } = {}) {
  const row = h('div', { class: `strip strip-${size}`, role: 'list', 'aria-label': 'Each area\'s rating, in tree order' });
  for (const id of STRIP_AREAS) {
    const t = (tiers || {})[id] || null;
    const ov = overrides && overrides[id];
    const lean = leans && leans[id];
    const words = `${label(id)}: ${plain(t).toLowerCase()}${lean ? `, ${lean.words}` : ''}${ov ? ' (your override)' : ''}`;
    row.append(h(href ? 'a' : 'span', {
      class: `sq ${t ? tierClass(t) : 't-none'}${id === highlight ? ' hi' : ''}${ov ? ' ov' : ''}`,
      role: 'listitem', 'data-area': id, href: href ? href(id) : null, title: words, 'aria-label': words,
    }, lean ? h('span', { class: `lean-mark ${lean.band}`, 'aria-hidden': 'true' }, lean.mark) : null));
  }
  return row;
}
/** Mark one area on every strip on the page (the home map's picker calls this), so the map and the cards read together. */
export function highlightStrips(area) {
  const a = area && area.startsWith('N11.') ? 'N11' : area;
  for (const sq of document.querySelectorAll('.strip .sq')) sq.classList.toggle('hi', sq.getAttribute('data-area') === a);
}

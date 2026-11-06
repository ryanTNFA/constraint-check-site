// @ts-check
// The two marks that sit beside a rating on every surface (Growth Test PRD 6C, C7): the robustness chip (front-door
// PRD W4, Q7) and the reason-and-lean tag beside a grey badge (W1). Drawn by the node card, the Bottom line, the
// Analyst View's node head and the heat map, so they are the same everywhere. card.mjs imports this module and this
// module imports plainTier from card.mjs; the cycle is harmless because neither uses the other at load time.
import { h, ROBUST_PLAIN, robustDetail, cannotTellCode, leanOf, CANNOT_TELL_PLAIN } from '../common.mjs';
import { plainTierOf } from '../card.mjs';

/**
 * W4: one robustness mark per rated area, with the readings on hover (Q7). Null for unrated areas.
 * @param {any} n a node of the scorecard
 * @returns {HTMLElement | null}
 */
export function robustChip(n) {
  if (!n || !n.robustness) return null;
  const m = n.robustness.mark;
  const detail = robustDetail(n, (t) => plainTierOf(n.id, t)); // the first decision reads as a direction under each reading too
  const note = h('span', { class: 'robust-detail', hidden: true }, detail);
  const btn = h('button', { type: 'button', class: `robust robust-${m}`, title: detail, 'aria-expanded': 'false' }, ROBUST_PLAIN[m]);
  btn.addEventListener('click',
    (e) => { e.preventDefault(); e.stopPropagation(); const open = note.hidden; note.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
  return h('span', { class: 'robust-wrap' }, btn, note);
}

/**
 * Reason and lean beside a grey badge: "one kind of evidence ↗". Null for any other tier.
 * @param {any} n a node of the scorecard
 * @returns {HTMLElement | null}
 */
export function reasonTag(n) {
  const code = cannotTellCode(n);
  const lean = leanOf(n);
  if (!code && !lean) return null;
  return h('span', { class: 'ct-reason' },
    lean ? h('span', { class: `lean-mark ${lean.band}`, title: lean.words, 'aria-label': lean.words }, lean.mark) : null,
    code ? ` ${CANNOT_TELL_PLAIN[code].label}` : '');
}

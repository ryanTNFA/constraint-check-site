// @ts-check
// The Bottom line's words, DOM-free (Growth Test PRD D1, D3): the one sentence that answers the page's question, and the
// three lists' areas, both read from bottomLine() in card.mjs. tests/test_desk_pages.py runs this under Node on Kenya's file
// and checks the lists match the engine's statements (ruled out and probably not; worth a closer look; the unclear groups).
import { englishList } from './common.mjs';

/** The area a Bottom line item is named by: a roll-up (micro risk) is named by the sub-area that sets its rating. */
export function itemName(x) { return x.ev !== x.node ? `${x.evShort} (under ${x.short})` : x.short; }

/**
 * The three lists' area ids, in the order the current Bottom line shows them: stop (ruled out, then probably not),
 * look (worth a closer look), unclear (grouped: one kind, mixed, data gap, tool gap, sector study, elimination).
 * @param {any} bl the result of bottomLine()
 * @returns {{stop: string[], look: string[], unclear: string[]}}
 */
export function listAreas(bl) {
  const g = bl.groups;
  return {
    stop: [...bl.ruled, ...bl.probNot].map((x) => x.id),
    look: bl.look.map((x) => x.id),
    unclear: [...g.oneKind, ...g.mixed, ...g.dataGap, ...g.toolGap, ...g.sector, ...g.elimination].map((x) => x.id),
  };
}

/**
 * The one sentence first (D1), in the tool's voice: where the public data point first, what they argue against, and how
 * much they cannot settle. Never a verdict and never "fund this"; the lists below carry the caveats.
 * @param {any} bl the result of bottomLine()
 * @param {string} country the economy's name
 * @returns {string}
 */
export function answerSentence(bl, country) {
  const look = englishList(bl.look.map(itemName));
  const stops = englishList([...bl.ruled, ...bl.probNot].map((x) => x.short));
  const n = bl.nUnclear, total = bl.nAreas;
  const unclear = n === total ? `all ${total} areas are unclear` : `${n} of ${total} areas stay unclear`;
  if (bl.look.length && stops.length) {
    return `The public data point first to ${look}, worth a closer look and not established, argue against ${stops}, and cannot settle the other ` +
      `${n} of ${total} areas.`;
  }
  if (bl.look.length) return `The public data point first to ${look}, worth a closer look, not established; nothing is ruled out for ${country} yet, and ${unclear}.`;
  if (stops.length) return `The public data argue against ${stops} as what holds investment back in ${country}; no area stands out yet, and ${unclear}.`;
  return `The public data point to no area and rule none out for ${country} yet: ${unclear}, each for a reason given below.`;
}

// @ts-check
// The Desk's two custom elements (Growth Test PRD 6C, C7), and the only two: light DOM, no shadow roots, one attribute
// each. Everything else on the site is an h() render function (desk/README.md, "New-page checklist").
//   <gt-term def="what it means">term</gt-term>   a term whose definition appears on hover and on focus (the .tooltip component)
//   <gt-fold><details>…</details></gt-fold>       a disclosure whose open and close are animated by motion.mjs; instant under reduced motion
// shell.mjs imports this module, so every page has both. Not importable under Node (HTMLElement), by design.
import { h } from '../common.mjs';
import { disclose } from '../motion.mjs';

let n = 0;

class GtTerm extends HTMLElement {
  connectedCallback() {
    const def = this.getAttribute('def');
    if (!def || this.dataset.ready) return;
    this.dataset.ready = '1';
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    /** @type {HTMLElement | null} */
    let tip = null;
    const show = () => {
      if (tip) return;
      tip = h('div', { class: 'tooltip show', role: 'tooltip', id: `gt-term-${++n}` }, def);
      document.body.append(tip);
      const r = this.getBoundingClientRect();
      const left = Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - tip.offsetWidth - 8));
      tip.style.left = `${left}px`;
      tip.style.top = `${window.scrollY + r.bottom + 6}px`;
      this.setAttribute('aria-describedby', tip.id);
    };
    const hide = () => { if (tip) { tip.remove(); tip = null; this.removeAttribute('aria-describedby'); } };
    this.addEventListener('mouseenter', show);
    this.addEventListener('mouseleave', hide);
    this.addEventListener('focus', show);
    this.addEventListener('blur', hide);
    this.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  }
}

class GtFold extends HTMLElement {
  connectedCallback() {
    const details = /** @type {HTMLDetailsElement | null} */ (this.querySelector(':scope > details'));
    if (details && !details.dataset.fold) { details.dataset.fold = '1'; disclose(details); }
  }
}

if (!customElements.get('gt-term')) customElements.define('gt-term', GtTerm);
if (!customElements.get('gt-fold')) customElements.define('gt-fold', GtFold);

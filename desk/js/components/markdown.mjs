// @ts-check
// The memo's Markdown turned into HTML (Growth Test PRD 6C, C7: a shared render function). The memo and the briefing are
// written as Markdown (memo.mjs, briefing.mjs); this renders the small subset they use (headings, rules, quotes, tables,
// lists, bold, links) into a self-contained page for "Copy for email or Word" and "Print or save as PDF". Every piece of
// text passes through esc(), so narrative text cannot inject markup (C10).

/**
 * @param {string} md
 * @param {{title?: string}} [opts]
 * @returns {{body: string, page: string}} the rendered body, and a whole printable page
 */
export function memoHTML(md, { title = 'The Growth Test memo' } = {}) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const TD = 'border:1px solid #c9c2b8;padding:3px 6px;text-align:left;vertical-align:top';
  const lines = md.split('\n'); const out = []; let i = 0;
  const cells = (r) => r.replace(/^\|\s?/, '').replace(/\s?\|$/, '').split(/\s\|\s/).map((x) => x.replace(/\\\|/g, '|'));
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let mm;
    if ((mm = l.match(/^(#{1,3})\s+(.*)$/))) { out.push(`<h${mm[1].length}>${inline(mm[2])}</h${mm[1].length}>`); i++; continue; }
    if (/^---\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (l.startsWith('>')) { const buf = []; while (i < lines.length && lines[i].startsWith('>')) { buf.push(lines[i].replace(/^>\s?/,
      '')); i++; } out.push(`<blockquote style="margin:8px 0;padding:6px 10px;background:#f5e6d4;border-left:3px solid ` +
        `#b8682a">${buf.filter((x) => x.trim()).map(inline).join('<br><br>')}</blockquote>`); continue; }
    if (l.startsWith('|')) {
      const rows = []; while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i++; }
      const head = cells(rows[0]); const body = rows.slice(2).map(cells);
      out.push(`<table style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:9pt;margin:6px 0"><thead><tr>${head.map((x) => `<th ` +
        `style="${TD};background:#f4ede0">${inline(x)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((x) => `<td ` +
        `style="${TD}">${inline(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*- /.test(l)) {
      const buf = []; while (i < lines.length && /^\s*- /.test(lines[i])) { buf.push(lines[i]); i++; }
      let html = '<ul>'; let open = false; let nested = false;
      for (const b of buf) {
        const ind = b.match(/^(\s*)/)[1].length; const text = inline(b.replace(/^\s*- /, ''));
        if (ind >= 2) { if (!nested) { html += '<ul>'; nested = true; } html += `<li>${text}</li>`; }
        else { if (nested) { html += '</ul>'; nested = false; } if (open) html += '</li>'; html += `<li>${text}`; open = true; }
      }
      if (nested) html += '</ul>'; if (open) html += '</li>';
      out.push(`${html}</ul>`);
      continue;
    }
    const buf = []; while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|\||\s*- |---\s*$)/.test(lines[i])) { buf.push(lines[i]); i++; }
    if (!buf.length) { buf.push(lines[i]); i++; }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  const body = `<div style="font-family:Georgia,'Times New Roman',serif;color:#1c2e4a;line-height:1.45">${out.join('\n')}</div>`;
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{color:#1c2e4a;max-width:46em;margin:2em auto;padding:0 1em;font-size:11pt}
h1{font-size:18pt;margin:0 0 .3em}h2{font-size:13pt;margin:1.3em 0 .3em;padding-bottom:2px;border-bottom:1px solid #e6d9d0}
h3{font-size:11.5pt;margin:1em 0 .2em}
ul{padding-left:1.3em}li{margin:.15em 0}hr{border:0;border-top:1px solid #e6d9d0;margin:1.2em 0}
@media print{body{margin:0;max-width:none;font-size:10.5pt}a{color:inherit}h2,h3{break-after:avoid}table,blockquote{break-inside:avoid}}
</style></head><body>${body}</body></html>`;
  return { body, page };
}

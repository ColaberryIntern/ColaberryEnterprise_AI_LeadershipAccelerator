/**
 * A small, deliberate Markdown subset for turning the lifecycle documents into printable HTML.
 *
 * ## Why a local converter and not a dependency
 *
 * This repo has no markdown library installed, and adding one to render ticket artifacts would be
 * a dependency add for a build-time concern. The documents being converted are ours, written in a
 * narrow and consistent style, so the subset below is the whole of what they use. Anything outside
 * it is escaped and shown verbatim rather than silently dropped, which is the important property:
 * a converter that quietly swallows a construct produces a PDF that LOOKS complete.
 *
 * Handled: ATX headings, fenced code, tables (with alignment ignored), blockquotes, unordered and
 * ordered lists, horizontal rules, paragraphs, and the inline set (code, bold, italic, links).
 *
 * Not handled, on purpose: nested lists, HTML passthrough, reference links, images, footnotes.
 * `unconvertedConstructs` reports any it sees, so a caller can refuse rather than ship a PDF with
 * a hole in it.
 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);

/**
 * Inline spans, applied to already-escaped text.
 *
 * Code FIRST, and the order is load bearing: a backticked `**not bold**` must stay literal, so
 * code spans are extracted to placeholders before bold and italic run, then restored.
 */
function inline(escaped) {
  const codes = [];
  let s = escaped.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000CODE${codes.length - 1}\u0000`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => `<a href="${href}">${text}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isDivider = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/** Constructs this converter does not handle, so a caller can refuse instead of shipping a hole. */
function unconvertedConstructs(raw) {
  /*
   * NORMALIZED FIRST, and the class is `[ \t]` rather than `\s`.
   *
   * These documents are CRLF on disk, and `\s` matches `\r` and `\n`, so `/^\s{2,}[-*+]\s/m`
   * matched the TWO NEWLINES before an ordinary top-level bullet and reported it as a nested
   * list. Every document with a bullet after a blank line was refused, which is most of them.
   * Indentation is spaces and tabs; a line ending is not indentation.
   */
  /*
   * FENCED BLOCKS ARE REMOVED FIRST. They are taken verbatim by the renderer, so nothing inside
   * one is a markdown construct and nothing inside one can be "unconverted".
   *
   * Without this, `morning-five-schedule.md` was refused for a "doubly nested list" that was a
   * JavaScript string continuation inside a code fence:
   *
   *     description: 'The five most pressing tasks, each walked through, '
   *       + 'with the one move worth making today',
   *
   * Four spaces and a `+` reads as a second-level bullet to a line-based scanner. Every detector
   * below has the same exposure, which is why the strip happens once, here, rather than per rule.
   */
  const md = String(raw)
    .replace(/\r\n/g, '\n')
    .replace(/^[ \t]*```[\s\S]*?^[ \t]*```[ \t]*$/gm, '');
  const found = [];
  // ONE level of nesting is handled. Four spaces or more is a second level, which is not.
  if (/^[ \t]{4,}[-*+][ \t]/m.test(md)) found.push('doubly nested list');
  if (/^!\[/m.test(md)) found.push('image');
  if (/^\s*<[a-z]+[\s>]/m.test(md)) found.push('raw HTML block');
  if (/^\[[^\]]+\]:\s/m.test(md)) found.push('reference link definition');
  return found;
}

function render(md) {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const flushParagraph = (buf) => {
    if (buf.length) out.push(`<p>${inline(escapeHtml(buf.join(' ')))}</p>`);
    return [];
  };
  let para = [];

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code: taken verbatim, never inlined, because these blocks are commands people run.
    if (/^\s*```/.test(line)) {
      para = flushParagraph(para);
      const body = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { body.push(lines[i]); i += 1; }
      i += 1;
      out.push(`<pre><code>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      para = flushParagraph(para);
      const level = heading[1].length;
      out.push(`<h${level}>${inline(escapeHtml(heading[2]))}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      para = flushParagraph(para);
      out.push('<hr>');
      i += 1;
      continue;
    }

    if (isTableRow(line)) {
      para = flushParagraph(para);
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) { rows.push(lines[i]); i += 1; }
      const head = rows[0];
      const bodyRows = rows.slice(isDivider(rows[1] || '') ? 2 : 1);
      const th = cells(head).map((c) => `<th>${inline(escapeHtml(c))}</th>`).join('');
      const tb = bodyRows
        .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(escapeHtml(c))}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      para = flushParagraph(para);
      const body = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${inline(escapeHtml(body.join(' ')))}</blockquote>`);
      continue;
    }

    const bullet = /^[ \t]*[-*+][ \t]+(.*)$/.exec(line);
    const numbered = /^[ \t]*\d+\.[ \t]+(.*)$/.exec(line);
    if (bullet || numbered) {
      para = flushParagraph(para);
      const tag = bullet ? 'ul' : 'ol';
      /*
       * ONE LEVEL OF NESTING, because the documents genuinely use it: this session's log writes
       * every entry as a top-level bullet with its `Date:`, `Session:`, `What changed:`,
       * `Verification:` and `Notes:` lines nested under it. Refusing that construct refused every
       * build ticket's evidence.
       *
       * `items` holds `{ text, children }`. A deeper level is not supported and
       * `unconvertedConstructs` still reports it, so the refusal survives for the case this does
       * not handle rather than being quietly widened to everything.
       */
      const items = [];
      const indentOf = (l) => (/^([ \t]*)/.exec(l) || ['', ''])[1].length;
      const baseIndent = indentOf(line);

      while (i < lines.length) {
        const cur = lines[i];
        const m = bullet
          ? /^[ \t]*[-*+][ \t]+(.*)$/.exec(cur)
          : /^[ \t]*\d+\.[ \t]+(.*)$/.exec(cur);
        const anyBullet = /^[ \t]*(?:[-*+]|\d+\.)[ \t]+(.*)$/.exec(cur);

        if (m && indentOf(cur) <= baseIndent) {
          items.push({ text: m[1], children: [] });
          i += 1;
          continue;
        }
        // A nested bullet of either kind, under the item above it.
        if (anyBullet && indentOf(cur) > baseIndent && items.length) {
          items[items.length - 1].children.push(anyBullet[1]);
          i += 1;
          continue;
        }
        // A continuation line: indented with SPACES OR TABS, non-empty, not a new block. `\s`
        // here would have the same defect as the detector above.
        if (/^[ \t]{2,}\S/.test(cur) && items.length) {
          const last = items[items.length - 1];
          if (last.children.length) last.children[last.children.length - 1] += ` ${cur.trim()}`;
          else last.text += ` ${cur.trim()}`;
          i += 1;
          continue;
        }
        break;
      }

      const li = items.map((it) => {
        const kids = it.children.length
          ? `<ul>${it.children.map((c) => `<li>${inline(escapeHtml(c))}</li>`).join('')}</ul>`
          : '';
        return `<li>${inline(escapeHtml(it.text))}${kids}</li>`;
      }).join('');
      out.push(`<${tag}>${li}</${tag}>`);
      continue;
    }

    if (!line.trim()) { para = flushParagraph(para); i += 1; continue; }

    para.push(line.trim());
    i += 1;
  }
  flushParagraph(para);
  return out.join('\n');
}

module.exports = { render, inline, escapeHtml, unconvertedConstructs };

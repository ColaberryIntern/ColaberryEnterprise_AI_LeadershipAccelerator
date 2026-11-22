/**
 * `scripts/artifacts/md2html.js`, the Markdown subset the ticket artifacts are rendered through.
 *
 * ## Why this has tests at all
 *
 * It exists to turn documents into PDFs that go on a Basecamp ticket as the evidence a human
 * reads before closing it. A converter that silently drops a construct produces a PDF that LOOKS
 * complete, which is the same class of defect as a release packet that understates its migration:
 * nothing is visibly wrong and the reader stops looking.
 *
 * So the two properties worth testing are not "does it render bold" but:
 *   1. nothing is dropped, and
 *   2. it REPORTS the constructs it cannot handle, so a caller can refuse rather than ship a hole.
 */
/* eslint-disable @typescript-eslint/no-var-requires */
const { render, unconvertedConstructs } = require('../../../../scripts/artifacts/md2html.js') as {
  render: (md: string) => string;
  unconvertedConstructs: (md: string) => string[];
};

describe('the blocks these documents actually use', () => {
  it('headings carry their level', () => {
    expect(render('# One\n\n### Three')).toContain('<h1>One</h1>');
    expect(render('# One\n\n### Three')).toContain('<h3>Three</h3>');
  });

  it('a table becomes a table, with its header row in a thead', () => {
    const html = render('| Key | What |\n|---|---|\n| `a` | first |\n| `b` | second |');
    expect(html).toContain('<thead><tr><th>Key</th><th>What</th></tr></thead>');
    expect(html).toContain('<td><code>a</code></td>');
    expect(html).toContain('<td>second</td>');
    // The alignment divider is consumed, never rendered as a row of dashes.
    expect(html).not.toContain('---');
  });

  it('a fenced block is verbatim, and its contents are NOT treated as markdown', () => {
    // These blocks are commands somebody runs. An asterisk in a shell glob must survive.
    const html = render('```sh\nrm -rf *.tmp && echo **done**\n```');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('rm -rf *.tmp');
    expect(html).toContain('**done**');
    expect(html).not.toContain('<strong>');
  });

  it('lists keep their kind, and a wrapped item stays one item', () => {
    const ul = render('- first\n- second\n  continued here');
    expect(ul).toContain('<ul>');
    expect(ul).toContain('<li>second continued here</li>');
    expect((ul.match(/<li>/g) || []).length).toBe(2);

    expect(render('1. one\n2. two')).toContain('<ol>');
  });

  it('ONE level of nesting, which is the shape the session log is written in', () => {
    /*
     * Every entry in `docs/sessions/CC-*.md` is a top-level bullet with `Date:`, `Session:`,
     * `What changed:`, `Verification:` and `Notes:` nested under it, so refusing nested lists
     * refused every build ticket's evidence document. This is that shape, including a wrapped
     * continuation line, which must join the nested item rather than the parent.
     */
    const html = render([
      '- [x] **A title**',
      '  - Date: 2026-11-22',
      '  - Notes: a long note',
      '    that wraps onto a second line',
      '- [x] **Another**',
      '  - Date: 2026-11-21',
    ].join('\n'));

    expect(html).toContain('<li>[x] <strong>A title</strong><ul>');
    expect(html).toContain('<li>Notes: a long note that wraps onto a second line</li>');
    // Two parents, each with its own nested list, not one flat run of six.
    expect((html.match(/<ul><li>/g) || []).length).toBe(3);
    expect(html).toContain('<li>Date: 2026-11-21</li>');
  });

  it('and a SECOND level is still refused, so the subset did not quietly widen to everything', () => {
    // The boundary. One level is handled; four spaces is a second level and is reported.
    expect(unconvertedConstructs('- one\n  - two\n    - three')).toContain('doubly nested list');
    expect(unconvertedConstructs('- one\n  - two')).toEqual([]);
  });

  it('a blockquote is a blockquote, which is how these documents carry a ticket\'s own words', () => {
    expect(render('> the ticket said this')).toContain('<blockquote>the ticket said this</blockquote>');
  });
});

describe('the inline set, where the ordering is load bearing', () => {
  it('code wins over bold, so a backticked asterisk pair stays literal', () => {
    /*
     * The bug this prevents: `**not bold**` inside backticks is a real string in these documents
     * (a glob, a regex, a mutation needle). Applying bold first would eat it and the PDF would
     * show formatting where the document meant characters.
     */
    const html = render('see `**not bold**` and **really bold**');
    expect(html).toContain('<code>**not bold**</code>');
    expect(html).toContain('<strong>really bold</strong>');
  });

  it('a link keeps its href and its text', () => {
    expect(render('see [PR #4311](https://example.test/4311)'))
      .toContain('<a href="https://example.test/4311">PR #4311</a>');
  });

  it('HTML in the source is ESCAPED, not executed', () => {
    // These documents quote `<meta name="robots">` and `<SOURCE_BLOCKS>` as literal text.
    const html = render('the tag is <meta name="robots" content="noindex"> and <SOURCE_BLOCKS>');
    expect(html).toContain('&lt;meta name=&quot;robots&quot;');
    expect(html).toContain('&lt;SOURCE_BLOCKS&gt;');
    expect(html).not.toContain('<meta');
  });

  it('an underscore in an identifier is not italics', () => {
    // `demo_share_enabled` and `plan_sha256` appear constantly. Italics keys on asterisks only,
    // which is why this converter does not accept `_text_` at all.
    const html = render('the column is `demo_share_enabled` and the field plan_sha256');
    expect(html).not.toContain('<em>');
    expect(html).toContain('plan_sha256');
  });
});

describe('it REPORTS what it cannot handle, which is the property that matters', () => {
  it('names a nested list, an image, a raw HTML block and a reference link', () => {
    expect(unconvertedConstructs('- one\n    - doubly nested')).toContain('doubly nested list');
    expect(unconvertedConstructs('![alt](x.png)')).toContain('image');
    expect(unconvertedConstructs('<div class="x">\n')).toContain('raw HTML block');
    expect(unconvertedConstructs('[ref]: https://example.test')).toContain('reference link definition');
  });

  it('does NOT call a top-level bullet after a blank line nested, in either line ending', () => {
    /*
     * The false positive that refused a real document. `\s` matches `\r` and `\n`, so
     * `/^\s{2,}[-*+]\s/m` matched the two newlines before an ordinary bullet. Asserted for CRLF
     * AND LF, because the documents are CRLF on disk and LF in other checkouts and the bug was
     * only visible in one of them.
     */
    const lf = 'a paragraph\n\n- a top-level bullet\n';
    expect(unconvertedConstructs(lf)).toEqual([]);
    expect(unconvertedConstructs(lf.replace(/\n/g, '\r\n'))).toEqual([]);

    // A singly nested bullet is HANDLED, so it is not reported in either line ending.
    const single = '- one\n  - nested\n';
    expect(unconvertedConstructs(single)).toEqual([]);
    expect(unconvertedConstructs(single.replace(/\n/g, '\r\n'))).toEqual([]);

    // And a doubly nested one still IS, in both line endings.
    const nested = '- one\n  - two\n    - three\n';
    expect(unconvertedConstructs(nested)).toContain('doubly nested list');
    expect(unconvertedConstructs(nested.replace(/\n/g, '\r\n'))).toContain('doubly nested list');
  });

  it('ignores what is inside a fenced block, because nothing in one is markdown', () => {
    /*
     * The second false positive that refused a real document. `morning-five-schedule.md` carries
     * a JavaScript object in a fence whose string continuation is indented four spaces and starts
     * with `+`, which a line-based scan reads as a second-level bullet. Every detector had the
     * same exposure, so the fences are stripped once before any of them run.
     */
    const fenced = [
      '```js', "  description: 'part one '", "    + 'part two',", '```',
    ].join('\n');
    expect(unconvertedConstructs(fenced)).toEqual([]);

    // A fence containing each of the other three constructs is also quiet.
    expect(unconvertedConstructs('```\n![alt](x.png)\n<div>\n[ref]: https://x.test\n```')).toEqual([]);

    // And the SAME constructs outside a fence are still reported, so the strip is not a blanket.
    expect(unconvertedConstructs('![alt](x.png)')).toContain('image');
    expect(unconvertedConstructs('- a\n    - b')).toContain('doubly nested list');
  });

  it('and reports NOTHING for a document built only from the handled subset', () => {
    // The control. A reporter that always returned a finding would make the caller refuse every
    // document, and one that always returned none would be decorative.
    const ok = [
      '# Title', '', 'A paragraph with `code` and **bold**.', '',
      '| a | b |', '|---|---|', '| 1 | 2 |', '',
      '- a bullet', '1. a number', '', '> a quote', '', '```sh', 'echo hi', '```', '', '---',
    ].join('\n');
    expect(unconvertedConstructs(ok)).toEqual([]);
  });

  it('nothing in the handled subset is silently dropped', () => {
    /*
     * The anti-hole check, stated as a property rather than per construct: every non-empty source
     * line must leave a trace in the output. A converter that skipped an unrecognized line would
     * pass every test above.
     */
    const src = [
      '# Heading', 'prose line', '| h1 | h2 |', '|---|---|', '| c1 | c2 |',
      '- bullet text', '1. numbered text', '> quoted text', '```', 'code text', '```',
    ].join('\n');
    const html = render(src);
    for (const needle of [
      'Heading', 'prose line', 'h1', 'c2', 'bullet text', 'numbered text', 'quoted text', 'code text',
    ]) {
      expect(html).toContain(needle);
    }
  });
});

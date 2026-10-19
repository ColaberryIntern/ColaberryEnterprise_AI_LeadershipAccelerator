/**
 * The L9.6 one-page visual: why the completeness check cannot see the overflow.
 *
 * ONE PAGE, landscape, or the renderer refuses. The job of this page is to answer, before anyone
 * opens the document, a single question: how can a check that says "every requirement block is
 * covered" be true of a prompt that is missing most of the blocks?
 *
 * The answer is positional, so the page is a diagram of the prompt rather than a chart. The ids
 * sit ABOVE the clipped region and the check reads the ids.
 */
const D = require('./l71Data');
const { esc, baseCss, TOKENS } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const CSS = `${baseCss()}
  body { font-size: 8.6pt; }
  h1 { font-size: 16pt; margin: 0 0 3px; }
  .sub { color: var(--muted); font-size: 8pt; margin: 0 0 7px; }
  .takeaway { background: var(--cherry-bg); border-left: 3px solid var(--cherry);
              padding: 7px 11px; margin: 0 0 9px; font-size: 8.4pt; }
  .wrap { display: flex; gap: 16px; align-items: flex-start; }
  .col { flex: 1; min-width: 0; }
  h2 { font-size: 8pt; text-transform: uppercase; letter-spacing: .07em; color: var(--ink);
       border: 0; padding: 0; margin: 0 0 5px; }
  .part { border: 1px solid var(--border); border-radius: 5px; padding: 6px 9px; margin-bottom: 6px;
          font-size: 7.6pt; position: relative; }
  .part .tag { font-weight: 700; font-size: 7pt; letter-spacing: .04em; }
  .safe { background: #eef7ef; border-color: #a8d3ad; }
  .cut  { background: #fdf3f2; border-color: #f3c9c6; }
  .flag { position: absolute; right: 8px; top: 6px; font-size: 6.6pt; font-weight: 700;
          letter-spacing: .04em; }
  .flag.ok { color: #2f7d32; }
  .flag.bad { color: #b3261e; }
  table { font-size: 7.4pt; margin: 0 0 8px; width: 100%; }
  th { padding: 4px 6px; font-size: 6.7pt; }
  td { padding: 4px 6px; vertical-align: top; }
  .no  { color: #b3261e; font-weight: 700; }
  .yes { color: #2f7d32; font-weight: 700; }
  .look { background: var(--bg-alt); border: 1px solid var(--border); border-radius: 5px;
          padding: 7px 10px; font-size: 7.8pt; margin-top: 4px; }
  .foot { margin-top: 9px; font-size: 6.8pt; color: var(--muted);
          border-top: 1px solid var(--border); padding-top: 5px; }
`;

function promptAnatomy() {
  return D.PROMPT_PARTS.map((p) => {
    const cls = p.clipped ? 'cut' : 'safe';
    const flag = p.clipped
      ? '<span class="flag bad">CLIPPED</span>'
      : '<span class="flag ok">NEVER CLIPPED</span>';
    const read = p.checked
      ? '<div class="tag" style="color:#2f7d32">&#9679; THIS is what coversRequirementBlocks reads</div>'
      : '';
    return `<div class="part ${cls}">${flag}${read}${esc(p.part)}</div>`;
  }).join('');
}

function clipTable() {
  const rows = D.CLIPS.map((c) => `<tr>
    <td><code>${esc(c.where)}</code></td>
    <td>${esc(c.cap)}</td>
    <td>${esc(c.effect)}</td>
    <td class="${c.labeled ? 'yes' : 'no'}">${c.labeled ? 'labeled' : 'SILENT'}</td>
  </tr>`).join('');
  return `<table>
    <tr><th style="width:34%">Where it clips</th><th style="width:17%">Cap</th>
        <th style="width:33%">Effect</th><th style="width:16%">Says so?</th></tr>
    ${rows}
  </table>`;
}

function build() {
  const body = `
<h1>The check says every requirement block is covered. Most of them are not in the prompt.</h1>
<p class="sub">L9.6 &middot; source overflow on the factory decompose path &middot; measured ${esc(D.META.date)}</p>

<div class="takeaway">
  <strong>What to look at.</strong> The block ids sit in the instruction line at the TOP, which no
  clipping touches. The block TEXT sits inside the delimited sections, which clip.
  <code>coversRequirementBlocks</code> reads the ids. So it verifies that we
  <strong>asked for</strong> the blocks, never that we <strong>supplied</strong> them, and returns
  true for a prompt the model cannot answer from.
</div>

<div class="wrap">
  <div class="col">
    <h2>Anatomy of the prompt</h2>
    ${promptAnatomy()}
    <div class="look">
      <strong>The consequence, stated plainly.</strong> Send 201 requirement blocks and the 201st
      is dropped entirely. Its id is still listed at the top, so the check passes, and nothing
      anywhere in the prompt says a block was removed.
    </div>
  </div>

  <div class="col">
    <h2>Three places it clips, ${D.HEADLINE.clipsUnlabelled} of ${D.HEADLINE.clipsTotal} without saying so</h2>
    ${clipTable()}
    <div class="look">
      <strong>Only the third is labeled, and it is the one that almost never fires.</strong> The
      first two shrink the body long before it could reach 800,000 characters, so in practice the
      <code>[truncated at N chars]</code> note never appears.
    </div>
    <h2 style="margin-top:9px">Pinned, not just written down</h2>
    <div class="look">
      Tests named <strong>RECORDED GAP</strong> assert this behavior, including that no label
      appears. <strong>When the fix lands they fail</strong>, which is the signal that the gap
      closed rather than drifted. The SAFE-002 delimiters and the source-before-context ordering
      are asserted alongside, because any fix that chunks or refuses must not spring that trap.
    </div>
  </div>
</div>

<div class="foot">
  ${esc(D.META.title)} &middot; ticket ${esc(D.META.alsoOn)} &middot; ${esc(D.META.date)} &middot;
  session ${esc(D.META.session)} &middot; built from the same data module as the document
</div>`;
  return htmlDoc({ title: 'L9.6 source overflow, one page', css: CSS, body });
}

module.exports = { build };

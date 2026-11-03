/**
 * l112Document — DOC 12's self-check, its generated Markdown, and the rendered PDF.
 *
 * DOC 12 IS FULLY GENERATED, unlike DOC 11. The difference is deliberate: DOC 11 is twenty-three
 * sections of architecture prose that a person should write, while DOC 12 *is* its diagrams plus
 * one caption each. Keeping the Mermaid source in a data module means the committed Markdown and
 * the rendered PDF cannot disagree about what the architecture looks like — which is the whole
 * failure mode of diagrams-as-documentation.
 *
 * Check 4 is the one that makes these diagrams trustworthy: every node listed in `notBuilt` must
 * carry the `nb` class in its own Mermaid source. A diagram that draws an unbuilt path exactly
 * like a working one is the most persuasive wrong thing this repo could ship, and this is the
 * assertion that stops it.
 */
const fs = require('fs');
const path = require('path');
const D = require('./l112Data');
const { TOKENS, esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const ROOT = path.join(__dirname, '..', '..', '..');

/** The `class X,Y nb` statements in one diagram's source, flattened to node names. */
function classedNotBuilt(mermaid) {
  const out = new Set();
  mermaid.split('\n').forEach((ln) => {
    const m = ln.trim().match(new RegExp(`^class\\s+([A-Za-z0-9_,]+)\\s+${D.META.nbClass}$`));
    if (m) m[1].split(',').forEach((n) => out.add(n.trim()));
  });
  return out;
}

function selfCheck() {
  // 1. TEN DIAGRAMS, IDS 1..10, EACH ONCE. The ticket asks for ten; a nine would be a cut, and
  //    cutting scope is Ali's call rather than a build's.
  if (D.DIAGRAMS.length !== 10) {
    throw new Error(`${D.DIAGRAMS.length} diagrams, the ticket asks for ten`);
  }
  const ids = D.DIAGRAMS.map((d) => d.id);
  for (let n = 1; n <= 10; n += 1) {
    const hits = ids.filter((x) => x === n).length;
    if (hits !== 1) throw new Error(`diagram ${n} appears ${hits} times, expected once`);
  }

  D.DIAGRAMS.forEach((d) => {
    // 2. EVERY DIAGRAM NEEDS ITS CAPTION. The bootstrap requires it in those words: "Every
    //    diagram must have a short explanation under it: what the viewer should learn from this
    //    diagram." A diagram without one is a picture, not documentation.
    if (!d.learn || d.learn.trim().length < 40) {
      throw new Error(`diagram ${d.id} (${d.title}) has no "what you should learn" explanation`);
    }
    if (!d.mermaid || !d.mermaid.trim()) {
      throw new Error(`diagram ${d.id} has no Mermaid source`);
    }

    // 3. THE BOOTSTRAP'S NAMED ELEMENTS MUST APPEAR IN THE SOURCE. Requirement -> artifact; a
    //    contract read back off the diagrams would pass by construction.
    const missing = d.required.filter(
      (r) => !d.mermaid.toLowerCase().includes(r.toLowerCase()),
    );
    if (missing.length) {
      throw new Error(`diagram ${d.id} (${d.title}) omits ${missing.length} required `
        + `element(s): ${missing.join('; ')}`);
    }

    // 4. AN UNBUILT PATH MUST LOOK UNBUILT.
    const classed = classedNotBuilt(d.mermaid);
    const unstyled = d.notBuilt.filter((n) => !classed.has(n));
    if (unstyled.length) {
      throw new Error(`diagram ${d.id} (${d.title}) names ${unstyled.join(', ')} as not built `
        + `but does not style them with the "${D.META.nbClass}" class — an unbuilt path drawn `
        + 'like a working one is the most persuasive wrong thing this document could say');
    }
    const strays = [...classed].filter((n) => !d.notBuilt.includes(n));
    if (strays.length) {
      throw new Error(`diagram ${d.id} styles ${strays.join(', ')} as not built without `
        + 'declaring it in notBuilt; the data and the picture have to agree in both directions');
    }

    // 5. AND THE STYLING HAS TO BE DEFINED, or the class is a no-op that silently renders a
    //    dashed-red node as an ordinary one.
    if (d.notBuilt.length && !d.mermaid.includes(`classDef ${D.META.nbClass}`)) {
      throw new Error(`diagram ${d.id} uses the "${D.META.nbClass}" class without defining it`);
    }
  });

  // 6. THE GENERATED FILE ON DISK MUST BE WHAT THE DATA RENDERS.
  const abs = path.join(ROOT, D.META.file);
  if (!fs.existsSync(abs)) throw new Error(`DOC 12 missing: ${D.META.file}`);
  const onDisk = fs.readFileSync(abs, 'utf8');
  if (onDisk !== markdown()) {
    throw new Error('DOC 12 on disk differs from what the data module renders. It is generated — '
      + 're-run the builder, and move any hand-edit into l112Data.js.');
  }

  // 7. NAVIGABILITY, the same contract the other documents carry.
  if (!onDisk.includes('DOC 00')) throw new Error('DOC 12 never points back at DOC 00');

  return true;
}

/** The committed document. Generated — never hand-edited. */
function markdown() {
  const toc = D.DIAGRAMS.map((d) => {
    const slug = d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const tag = d.needs.includes('L11.3') ? ' — **needed by DOC 13**' : '';
    return `${d.id}. [${d.title}](#${d.id}-${slug})${tag}`;
  }).join('\n');

  const bodies = D.DIAGRAMS.map((d) => {
    const nb = d.notBuilt.length
      ? `\n> **${d.notBuilt.length} element(s) in this diagram are not built**, drawn dashed and `
        + 'red. They are requirements, not description.\n'
      : '';
    return `## ${d.id}. ${d.title}

\`\`\`mermaid
${d.mermaid}
\`\`\`
${nb}
**What you should learn from this diagram.** ${d.learn}`;
  }).join('\n\n---\n\n');

  return `# DOC 12 — Colaberry Live: Architecture Diagrams

> Generated from \`scripts/artifacts/tickets/l112Data.js\`. **Do not hand-edit** — change the data
> module and re-run \`node scripts/artifacts/buildL112Artifacts.js\`, which refuses to emit a PDF
> if any diagram failed to render.

| | |
|---|---|
| **Required by** | \`docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md\` §3.1 |
| **Basecamp ticket** | ${D.META.ticket} |
| **Owner** | ${D.META.owner} |
| **Written** | ${D.META.built} |
| **Start here** | [DOC 00](DOC_00_READ_FIRST_AI_OPERATING_BRIEF.md) · the handbook is [DOC 11](DOC_11_SYSTEM_ARCHITECTURE_HANDBOOK.md) · the contract is [DOC 02](DOC_02_BROADCAST_ARCHITECTURE_AND_SECURITY_CONTRACT.md) |

**${D.TOTALS.diagrams} diagrams, ${D.TOTALS.required} required elements, all checked against the
Mermaid source.** Mermaid is the source of record so the committed document and the rendered PDF
cannot disagree about what the architecture looks like.

## Read this first: a dashed red node does not exist yet

**${D.TOTALS.notBuiltNodes} nodes across ${D.TOTALS.withNotBuilt} of these ${D.TOTALS.diagrams}
diagrams are drawn dashed and red, because they are not built.** That styling is enforced: the
build fails if a node declared unbuilt is drawn like a working one, and fails again if a node is
drawn unbuilt without being declared.

This matters more than it sounds. A clean box-and-arrow picture of a capability nobody has is the
most persuasive wrong thing this repository could produce, and it would be read as a description of
the system by exactly the people least able to check it. **Diagram 7 is the clearest case: it looks
like an orchestration engine, and there is no timeline runtime at all.**

For what is proven rather than merely built, see DOC 11's capability proof register — 4 of 28
claims have run in a real airing.

## The ten diagrams

${toc}

**${D.TOTALS.neededByOperatorManual} of the ten are the ones DOC 13, the studio operator manual,
needs** (marked above). L0.3 proposed cutting this ticket down to exactly those three; all ten are
built here because scoping cuts are Ali's call, and marking them means the cut is one edit away
rather than a re-derivation.

---

${bodies}
`;
}

function build() {
  const blocks = D.DIAGRAMS.map((d) => `
<section class="dia">
  <h2>${d.id}. ${esc(d.title)}</h2>
  <div class="mermaid">${esc(d.mermaid)}</div>
  ${d.notBuilt.length ? `<p class="nbnote"><strong>${d.notBuilt.length} element(s) here are not
    built</strong> — drawn dashed and red. Requirements, not description.</p>` : ''}
  <p class="learn"><strong>What you should learn.</strong> ${esc(d.learn)}</p>
</section>`).join('\n');

  const body = `
<h1>DOC 12 — Colaberry Live architecture diagrams</h1>
<p class="sub">${esc(D.META.ticket)} · ${esc(D.META.built)} · ${D.TOTALS.diagrams} diagrams,
${D.TOTALS.required} required elements checked against the Mermaid source · generated from
<code>l112Data.js</code></p>
<p class="warn"><strong>${D.TOTALS.notBuiltNodes} nodes across ${D.TOTALS.withNotBuilt} diagrams
are dashed and red because they are not built.</strong> A clean picture of a capability nobody has
is the most persuasive wrong thing this repository could produce. Diagram 7 is the clearest case:
it looks like an orchestration engine, and there is no timeline runtime at all.</p>
${blocks}
`;

  return htmlDoc({
    title: 'DOC 12 — architecture diagrams',
    css: `${baseCss()}
      .sub { color: ${TOKENS.MUTED}; font-size: 10px; line-height: 1.4; }
      .warn { font-size: 10.5px; line-height: 1.5; border-left: 3px solid ${TOKENS.SEV.bad};
        padding-left: 10px; margin: 10px 0 16px; }
      section.dia { page-break-inside: avoid; margin: 0 0 22px; }
      section.dia h2 { font-size: 13px; margin: 0 0 6px; }
      .mermaid { margin: 4px 0 8px; }
      .learn { font-size: 10px; line-height: 1.5; background: ${TOKENS.BG_ALT};
        border: 1px solid ${TOKENS.BORDER}; border-radius: 5px; padding: 8px 10px; margin: 6px 0 0; }
      .nbnote { font-size: 9.5px; color: ${TOKENS.SEV.bad}; margin: 2px 0 0; }`,
    body,
  });
}

module.exports = { selfCheck, markdown, build };

/**
 * L11.2, the one-pager: what the ten architecture diagrams say about the system.
 *
 * WHAT THIS PAGE IS FOR. The document answers "show me the diagram". This page answers the
 * question asked before opening it, and it is not "are there ten" - counting to ten is not a
 * finding. It is: SEVEN OF THE TEN DIAGRAMS CONTAIN SOMETHING THAT DOES NOT EXIST, and a
 * reader who skims a clean box-and-arrow picture will not notice unless the page says so first.
 *
 * That is the same hazard the data module was built around. A diagram of a capability nobody
 * has is the most persuasive wrong thing this repository could produce, because it is read as a
 * description of the system by exactly the people least able to check it. The document defends
 * against that with dashed red styling; this page defends against it with the headline.
 *
 * Capped at one page by the builder, and the renderer throws rather than spilling onto a second,
 * so a clean exit is the evidence that it is a one-pager.
 */
const D = require('./l112Data');
const { TOKENS, esc, baseCss, barChart, stackBar } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

/**
 * Colored by how much of the diagram is fiction, not by whether it has any. One unbuilt node in
 * a ten-node context diagram and five in an eight-node pipeline are different claims about how
 * much of the picture you can trust, and a single alarm color would flatten them into one.
 */
function nbColor(n) {
  if (n === 0) return TOKENS.SEV.ok;
  if (n <= 2) return TOKENS.SEV.watch;
  return TOKENS.SEV.bad;
}

/**
 * Resolve an unbuilt node key to the label it carries in its own diagram.
 *
 * The point is not convenience. Reading the label out of the Mermaid means the page cannot
 * describe a node as something other than what the diagram draws, and a key that names no node
 * fails outright instead of being counted into "14 unbuilt" while pointing at nothing.
 */
function nbLabel(diagram, key) {
  const m = diagram.mermaid.match(new RegExp(`(?:^|[\\s>|.-])${key}\\["([^"]+)"\\]`, 'm'));
  if (!m) {
    throw new Error(`l112Visual: diagram ${diagram.id} lists "${key}" as not built, but no node `
      + 'by that name is declared in its Mermaid source. A count of unbuilt nodes that includes '
      + 'a name pointing at nothing is worse than no count.');
  }
  return m[1];
}

function build() {
  const fullyBuilt = D.TOTALS.diagrams - D.TOTALS.withNotBuilt;

  const bar = stackBar({
    parts: [
      { label: `Every node exists (${fullyBuilt})`, value: fullyBuilt, color: TOKENS.SEV.ok },
      { label: `Contains something unbuilt (${D.TOTALS.withNotBuilt})`,
        value: D.TOTALS.withNotBuilt, color: TOKENS.SEV.bad },
    ],
    width: 1000,
    height: 26,
  });

  /**
   * NOT a chart of "ten diagrams exist". A bar per diagram all at the same height would be a
   * picture of the number ten, which the tile above already gives for free. This plots how many
   * nodes in each one are drawn as not built - the only quantity on this page that varies.
   */
  const nb = barChart({
    rows: D.DIAGRAMS.map((d) => ({
      label: `${d.id}. ${d.title.replace(/ Diagram$/, '')}`,
      value: d.notBuilt.length,
      display: `${d.notBuilt.length}`,
      color: nbColor(d.notBuilt.length),
    })),
    max: Math.max(...D.DIAGRAMS.map((d) => d.notBuilt.length)),
    width: 440,
    barH: 15,
    gap: 5,
    labelW: 250,
  });

  const tiles = [
    { n: `${D.TOTALS.withNotBuilt} of ${D.TOTALS.diagrams}`,
      l: 'diagrams contain something that does not exist', bad: true },
    { n: D.TOTALS.notBuiltNodes, l: 'nodes drawn dashed and red because they are not built' },
    { n: D.TOTALS.required, l: 'required elements checked against the Mermaid source' },
    { n: D.TOTALS.neededByOperatorManual,
      l: 'are the ones the Operator Manual actually needs' },
  ].map((t) => `<div class="tile${t.bad ? ' bad' : ''}">
      <div class="n">${esc(String(t.n))}</div><div class="l">${esc(t.l)}</div>
    </div>`).join('\n');

  const needed = D.DIAGRAMS.filter((d) => d.needs.includes('L11.3')).map((d) => `<li>
      <strong>${d.id}. ${esc(d.title)}</strong>
      ${d.notBuilt.length
    ? `<span class="gap">${d.notBuilt.length} unbuilt</span>`
    : '<span class="okmark">all built</span>'}
    </li>`).join('\n');

  // The worst one, named rather than left to be found in a bar. Picked by count, not by opinion.
  const worst = D.DIAGRAMS.reduce((a, b) => (b.notBuilt.length > a.notBuilt.length ? b : a));

  /**
   * WHAT THE UNBUILT NODES ACTUALLY ARE. A reader given the number 14 and no list has to open
   * the 7-page document to learn whether it means anything. Grouped by diagram so seven lines
   * carry all fourteen, and every label is read out of the Mermaid rather than retyped.
   */
  const nbList = D.DIAGRAMS.filter((d) => d.notBuilt.length).map((d) => `<li>
      <strong>${d.id}.</strong> ${d.notBuilt.map((k) => esc(nbLabel(d, k))).join('; ')}
    </li>`).join('\n');

  const body = `
<h1>DOC 12 &mdash; ${D.TOTALS.withNotBuilt} of the ${D.TOTALS.diagrams} diagrams draw something
that does not exist</h1>
<p class="sub">L11.2 &middot; ${esc(D.META.built)} &middot; ten diagrams, Mermaid source generated
from <code>l112Data.js</code> &middot; every required element checked against the source, in that
direction only</p>

<div class="tiles">${tiles}</div>

<div class="bar">${bar}</div>

<div class="cols">
  <div>
    <h2>Nodes drawn as not built, per diagram</h2>
    ${nb}
    <p class="sub">${fullyBuilt} diagrams are entirely real. The rest carry at least one node
    that exists only on paper.</p>
  </div>
  <div>
    <h2>The rule the build enforces</h2>
    <p class="gapbox"><strong>A diagram must not draw an unbuilt path the same way it draws a
    working one.</strong> Every node named as unbuilt carries the <code>nb</code> class &mdash;
    dashed, red &mdash; and the self-check asserts the styling is there. A diagram cannot quietly
    promote an unbuilt path by dropping it.</p>
    <p class="sub">The heaviest is <strong>${esc(worst.title)}</strong>, with
    ${worst.notBuilt.length} of its nodes unbuilt. The studio diagram is drawn from hardware
    nobody has installed, and the timeline diagram from a runtime that does not exist.</p>

    <h2>The ${D.TOTALS.neededByOperatorManual} the Operator Manual needs</h2>
    <ul class="rem">${needed}</ul>
    <p class="sub">L0.3 proposed cutting this ticket from ten diagrams to these three. All ten
    were built and these three marked, so the cut stays one edit away rather than a
    re-derivation. That call is Ali's.</p>

    <h2>What the ${D.TOTALS.notBuiltNodes} are, in the diagrams' own words</h2>
    <ul class="rem tight">${nbList}</ul>
    <p class="sub">Read out of the Mermaid source, not retyped. Two are not missing work: 8 is a
    warning about Zoom and OBS, and the QR state in 7 was rejected by design. So 14 counts nodes
    drawn as not-working, not a backlog.</p>
  </div>
</div>
`;

  return htmlDoc({
    title: 'Colaberry Live — architecture diagrams',
    css: `${baseCss()}
      .tiles { display: flex; gap: 10px; margin: 14px 0 10px; }
      .tile { flex: 1; border: 1px solid ${TOKENS.BORDER}; border-radius: 6px; padding: 9px 11px;
        background: ${TOKENS.BG_ALT}; }
      .tile .n { font-size: 21px; font-weight: 700; color: ${TOKENS.INK}; line-height: 1.1; }
      .tile .l { font-size: 9.5px; color: ${TOKENS.MUTED}; margin-top: 3px; line-height: 1.3; }
      .tile.bad .n { color: ${TOKENS.SEV.bad}; }
      .bar { margin: 6px 0 14px; }
      .cols { display: flex; gap: 22px; }
      .cols > div { flex: 1; }
      h2 { font-size: 12px; margin: 10px 0 6px; }
      .sub { color: ${TOKENS.MUTED}; font-size: 9.5px; line-height: 1.4; }
      ul.rem { margin: 0; padding-left: 15px; font-size: 10px; line-height: 1.6; }
      ul.tight { font-size: 9.5px; line-height: 1.45; }
      .gap { color: ${TOKENS.SEV.bad}; font-weight: 700; }
      .okmark { color: ${TOKENS.SEV.ok}; font-weight: 700; }
      .gapbox { font-size: 10px; line-height: 1.45; border-left: 3px solid ${TOKENS.SEV.bad};
        padding-left: 9px; margin: 4px 0 6px; }`,
    body,
  });
}

/**
 * The guards are about one thing: this page must never be readable as "ten diagrams, done".
 * Every one of them defends a statement a skimming reader would take away.
 */
function selfCheck() {
  const html = build();
  const fail = (msg) => { throw new Error(`l112Visual: ${msg}`); };

  // 1. The headline count against the rows that support it. A diagram with an unbuilt node must
  //    be counted as one, or the page understates how much of the picture is fiction.
  const withNb = D.DIAGRAMS.filter((d) => d.notBuilt.length > 0).length;
  if (withNb !== D.TOTALS.withNotBuilt) {
    fail(`the headline says ${D.TOTALS.withNotBuilt} diagrams contain something unbuilt while `
      + `${withNb} of the rows do. The headline is the whole defense of this page.`);
  }

  // 2. The node tally against the rows. Same rule one level down.
  const nodes = D.DIAGRAMS.reduce((n, d) => n + d.notBuilt.length, 0);
  if (nodes !== D.TOTALS.notBuiltNodes) {
    fail(`the tile says ${D.TOTALS.notBuiltNodes} unbuilt nodes and the rows hold ${nodes}.`);
  }

  // 3. Every diagram must appear in the chart, including the fully-built ones. Dropping the
  //    zero rows would make the page look like every diagram carries fiction.
  for (const d of D.DIAGRAMS) {
    if (!html.includes(esc(`${d.id}. ${d.title.replace(/ Diagram$/, '')}`))) {
      fail(`diagram ${d.id} (${d.title}) does not appear on the page.`);
    }
  }

  // 4. The styling rule must be stated. It is the mechanism that makes every other number on
  //    this page mean anything, and it is one sentence away from being lost in an edit.
  if (!/must not draw an unbuilt path the same way/.test(html)) {
    fail('the page no longer states the rule that an unbuilt path is not drawn like a working '
      + 'one. Without it a reader has no reason to believe the dashed nodes are complete.');
  }

  // 5. The three the Operator Manual needs must each be named, because the cut L0.3 proposed
  //    is decided from this list.
  const needed = D.DIAGRAMS.filter((d) => d.needs.includes('L11.3'));
  if (needed.length !== D.TOTALS.neededByOperatorManual) {
    fail(`${needed.length} diagrams are marked for L11.3 but the tile says `
      + `${D.TOTALS.neededByOperatorManual}.`);
  }
  for (const d of needed) {
    if (!html.includes(`${d.id}. ${esc(d.title)}</strong>`)) {
      fail(`diagram ${d.id} is needed by the Operator Manual but is not named in that list.`);
    }
  }

  // 6. A diagram carrying unbuilt nodes must never be drawn in the all-built color.
  for (const d of D.DIAGRAMS) {
    if (d.notBuilt.length > 0 && nbColor(d.notBuilt.length) === TOKENS.SEV.ok) {
      fail(`diagram ${d.id} has ${d.notBuilt.length} unbuilt nodes and would be drawn in the `
        + 'all-built color.');
    }
  }

  // 7. Every unbuilt key must resolve to a node that exists in its own diagram. `nbLabel`
  //    throws on a miss, so calling it across the set is the assertion.
  for (const d of D.DIAGRAMS) for (const k of d.notBuilt) nbLabel(d, k);

  // 8. The page claims two of the fourteen are not missing work - a warning, and a design
  //    rejection. That claim is typed prose, so it is pinned to the labels it describes. If
  //    either node is renamed or reclassified, the sentence must be rewritten rather than
  //    silently becoming false.
  const warn = D.DIAGRAMS.find((d) => d.id === 8);
  const timeline = D.DIAGRAMS.find((d) => d.id === 7);
  if (!warn || !warn.notBuilt.length || !/does NOT mute/i.test(nbLabel(warn, warn.notBuilt[0]))) {
    fail('the page says diagram 8\'s unbuilt node is a warning about Zoom and OBS, and the '
      + 'data no longer supports that sentence.');
  }
  if (!timeline || !timeline.notBuilt.some((k) => /rejected/i.test(nbLabel(timeline, k)))) {
    fail('the page says the QR state in diagram 7 was rejected by design, and no node in that '
      + 'diagram says so any more.');
  }

  return {
    diagrams: D.TOTALS.diagrams,
    withNotBuilt: D.TOTALS.withNotBuilt,
    nodes: D.TOTALS.notBuiltNodes,
    required: D.TOTALS.required,
    needed: needed.length,
  };
}

module.exports = { build, selfCheck };

/**
 * L10.3, the spec: one console, every human task on it, and external surfaces still external.
 *
 * WHY THE THIRD CONDITION GETS ITS OWN SECTION. "External surfaces are labeled as external
 * rather than counted as consoles" cannot be settled by this decomposition, because Herriman's
 * stored document contains no external surface. That makes it the one condition whose evidence
 * has to come from the test suite instead of from production, and a document that quietly folded
 * it into "met" alongside the two measured conditions would be overstating what was checked.
 *
 * Multi-page by design.
 */
const D = require('./l10Data');
const { TOKENS, esc, baseCss } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const CLAUSES = [
  {
    clause: 'Exactly one surface of kind console exists',
    verdict: 'met, measured in production',
    source: 'the stored document',
    evidence: () => `<strong>${D.TOTALS.consoles}</strong> surface of kind `
      + `<code>console</code>: &ldquo;${esc(D.SURFACES[0].name)}&rdquo; `
      + `(<code>${esc(D.SURFACES[0].id)}</code>). <code>ONE_CONSOLE</code> is the rule that counts `
      + `them and <code>NO_CONSOLE</code> the rule for zero; both are silent.`,
  },
  {
    clause: 'every human task lands on exactly one surface',
    verdict: 'met, measured in production',
    source: 'the stored document',
    evidence: () => `Allocation reports <strong>${D.COUNTS.human}</strong> tasks of class `
      + `<code>human</code>. The console holds <strong>${D.SURFACES[0].taskCount}</strong>. `
      + `Human tasks landing on no surface at all: <strong>${D.ORPHAN_HUMAN_TASKS}</strong>. `
      + `That last number is the one worth reading &mdash; <code>HUMAN_TASK_WITHOUT_SURFACE</code> `
      + `is <em>blocking</em>, so a single orphan would have failed the gate rather than warned.`,
  },
  {
    clause: 'external surfaces are labeled as external rather than counted as consoles',
    verdict: 'met in the gate, NOT exercised by this decomposition',
    source: 'the test suite',
    evidence: () => `Herriman's document contains <strong>no external surface</strong>, so `
      + `production cannot evidence this condition either way. The gate implements it by filtering `
      + `on <code>kind === 'console'</code>, and the suite pins it: `
      + `<code>humanAiStructure.test.ts:257</code> places a surface of kind `
      + `<code>external</code> alongside the console and asserts <code>consoleCount</code> stays 1. `
      + `A second <em>console</em> is caught separately at <code>:253</code>. `
      + `This is a tested guarantee, not a measured outcome, and the difference is stated rather `
      + `than blurred.`,
  },
];

function build() {
  const clauses = CLAUSES.map((c, i) => `<section>
      <h2>Condition ${i + 1} &mdash; <span class="v${c.source === 'the test suite' ? ' part' : ''}">${
    esc(c.verdict)}</span></h2>
      <p class="cl">&ldquo;${esc(c.clause)}&rdquo;</p>
      <p class="src">evidence from <strong>${esc(c.source)}</strong></p>
      <p class="ev">${c.evidence()}</p>
    </section>`).join('\n');

  const controls = D.CONTROLS.map((c) => `<tr><td>${esc(c.claim)}</td>
      <td class="mono">${esc(c.evidence)}</td></tr>`).join('\n');
  const keys = D.STORED_KEYS.map((k) => `<li><code>${esc(k)}</code>${
    D.KEYS_RECOVERED.includes(k) ? ' <span class="rec">recovered</span>' : ''}</li>`).join('');
  const notClaimed = D.NOT_CLAIMED.map((n) => `<li>${esc(n)}</li>`).join('\n');

  const body = `
<h1>L10.3 &mdash; the one console: every human task has a destination</h1>
<p class="sub"><strong>Asked:</strong> add the surface concept so human tasks land somewhere, and
build the operator console that holds all of them. <strong>Delivered:</strong> one console holding
all ${D.COUNTS.human} human tasks with ${D.ORPHAN_HUMAN_TASKS} orphans, measured on a real stored
decomposition, with the external-surface rule pinned by test rather than claimed.</p>
<p class="meta">${esc(D.META.project)} &middot; <code>${esc(D.META.deliveryProjectId)}</code>
&middot; ${esc(D.META.track)} v${D.META.version} (${esc(D.META.status)}) &middot; measured
${esc(D.META.built)} &middot; backend <code>${esc(D.META.deployedSha)}</code></p>

<div class="takeaway">
  <strong>TAKEAWAY.</strong> ${D.SURFACES[0].taskCount} of ${D.COUNTS.human} human tasks land on
  one console and <strong>${D.ORPHAN_HUMAN_TASKS}</strong> land nowhere. The defect this ticket
  existed to prevent was not "too few consoles" &mdash; it was a generated app that grew one
  screen and one login per role, which the first cohort shipped, because the contract permitted
  it. The contract no longer permits it: a human task with no surface is a blocking finding.
</div>

<h2 class="big">The done-when, one condition at a time</h2>
<p class="sub">Two of the three are measured against the stored document. The third cannot be, and
says so.</p>
${clauses}

<h2 class="big">The count that looks wrong and is not</h2>
<p class="ev"><code>${D.COUNTS.allocationRows}</code> allocation rows across
<code>${D.COUNTS.tasks}</code> tasks. The task with no allocation row is
<code>${esc(D.UNALLOCATED.taskId)}</code> &mdash; <strong>kind=${esc(D.UNALLOCATED.kind)}</strong>,
&ldquo;${esc(D.UNALLOCATED.title)}&rdquo; &mdash; and ${esc(D.UNALLOCATED.why)}.
This document was drafted saying &ldquo;one task has no execution class&rdquo;, which reads as a
defect. It was checked in the container before shipping. A false alarm in an artifact whose only
value is that its numbers can be trusted costs more than a missing line.</p>

<h2 class="big">What the stored document actually contains</h2>
<ul class="keys">${keys}</ul>
<p class="sub">Two of these keys were being generated and then silently dropped by the write path
until ${esc(D.META.built)}: <code>${D.KEYS_RECOVERED.join('</code> and <code>')}</code>. The
decomposition was computing the agent teams and the console and then discarding them on the way
to the database, so <em>both of this ticket's measured conditions would have read as absent</em>
regardless of what the model produced. Fixing the write path is what made this ticket checkable
at all.</p>

<h2 class="big">Shown to catch, not merely shown to pass</h2>
<table>
  <thead><tr><th>Claim</th><th>Where it is proven</th></tr></thead>
  <tbody>${controls}</tbody>
</table>

<h2 class="big">Not claimed</h2>
<ul class="nc">${notClaimed}</ul>
`;

  return htmlDoc({
    title: 'L10.3 — the one console (spec)',
    css: `${baseCss()}
      .sub { color: ${TOKENS.MUTED}; font-size: 10px; line-height: 1.5; }
      .meta { color: ${TOKENS.MUTED}; font-size: 9px; line-height: 1.5; margin-top: -4px; }
      .takeaway { border: 1px solid ${TOKENS.CHERRY}; background: ${TOKENS.CHERRY_BG};
        border-radius: 6px; padding: 10px 13px; font-size: 10.5px; line-height: 1.55;
        margin: 13px 0 16px; }
      h2.big { font-size: 13px; margin: 20px 0 6px; border-bottom: 1px solid ${TOKENS.BORDER};
        padding-bottom: 4px; }
      section { margin: 10px 0 12px; }
      section h2 { font-size: 11px; margin: 0 0 3px; }
      .v { color: ${TOKENS.SEV.ok}; font-weight: 700; }
      .v.part { color: ${TOKENS.SEV.watch}; }
      .cl { font-size: 10px; font-style: italic; margin: 0 0 2px; }
      .src { font-size: 9px; color: ${TOKENS.MUTED}; margin: 0 0 4px; }
      .ev { font-size: 10px; line-height: 1.5; border-left: 3px solid ${TOKENS.BORDER};
        padding-left: 10px; margin: 4px 0; }
      table { width: 100%; border-collapse: collapse; font-size: 9.5px; margin: 5px 0; }
      th { text-align: left; background: ${TOKENS.BG_ALT}; padding: 5px 7px;
        border-bottom: 1px solid ${TOKENS.BORDER}; font-size: 9px; color: ${TOKENS.MUTED}; }
      td { padding: 5px 7px; border-bottom: 1px solid ${TOKENS.BORDER}; vertical-align: top;
        line-height: 1.45; }
      td.mono, .mono { font-family: ui-monospace, monospace; font-size: 8.5px;
        color: ${TOKENS.MUTED}; }
      ul.keys { columns: 3; font-size: 9px; margin: 4px 0; padding-left: 15px;
        font-family: ui-monospace, monospace; line-height: 1.7; }
      .rec { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 8px;
        color: ${TOKENS.SEV.watch}; font-weight: 700; }
      ul.nc { font-size: 10px; line-height: 1.5; padding-left: 16px; }`,
    body,
  });
}

module.exports = { build, CLAUSES };

/**
 * L10.3, the one-pager: every human task has one destination.
 *
 * WHAT THIS PAGE ANSWERS. The orphan count. "One console" is only a claim about the console; the
 * claim worth checking is that no human task was left pointing at nothing, because the defect
 * this ticket exists to prevent was never "too few consoles" - it was a generated app that grew
 * one screen and one login per role because the contract permitted it.
 *
 * So the page leads with 11 of 11 and zero orphans, and states the pre-AI baseline beside it,
 * because a number with nothing to compare against does not show an improvement.
 *
 * One page, enforced by the builder.
 */
const D = require('./l10Data');
const { TOKENS, esc, baseCss, stackBar } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

function build() {
  const console_ = D.SURFACES.find((s) => s.kind === 'console');

  const tiles = [
    { n: D.TOTALS.consoles, l: 'console surfaces — exactly one', ok: D.TOTALS.consoles === 1 },
    { n: `${D.TOTALS.humanTasksOnSurfaces} of ${D.COUNTS.human}`, l: 'human tasks with a destination',
      ok: D.TOTALS.humanTasksOnSurfaces === D.COUNTS.human },
    { n: D.ORPHAN_HUMAN_TASKS, l: 'human tasks on no surface', ok: D.ORPHAN_HUMAN_TASKS === 0 },
    { n: D.COUNTS.tasks, l: 'tasks in the decomposition' },
    { n: D.COUNTS.sourceBlocks, l: 'source blocks behind them' },
  ].map((t) => `<div class="tile${t.ok ? ' ok' : ''}">
      <div class="n">${esc(String(t.n))}</div><div class="l">${esc(t.l)}</div></div>`).join('\n');

  const split = stackBar({
    parts: [
      { label: `Human, on the console (${D.COUNTS.human})`, value: D.COUNTS.human,
        color: TOKENS.LEAF },
      { label: `AI, in a team (${D.COUNTS.ai})`, value: D.COUNTS.ai, color: TOKENS.CHERRY },
    ],
    width: 1000,
    height: 26,
  });

  const controls = D.CONTROLS.map((c) => `<li><strong>${esc(c.claim)}</strong>
      <div class="evi">${esc(c.evidence)}</div></li>`).join('\n');

  const body = `
<h1>Every human task has one destination</h1>
<p class="sub">L10.3 &middot; ${esc(D.META.project)} &middot; ${esc(D.META.built)}
&middot; measured on ${esc(D.META.track)} v${D.META.version} (${esc(D.META.status)})
&middot; backend ${esc(D.META.deployedSha)}</p>

<div class="tiles">${tiles}</div>
<div class="bar">${split}</div>

<div class="cols">
  <div>
    <h2>The one console</h2>
    <p class="ev"><strong>${esc(console_.name)}</strong>
      <span class="id">${esc(console_.id)} &middot; kind=${esc(console_.kind)}</span><br>
      Holds <strong>${console_.taskCount}</strong> human tasks, which is all of them.
      <strong>${D.ORPHAN_HUMAN_TASKS}</strong> human tasks land on no surface.</p>
    <p class="sub">The orphan count is the load-bearing number. One console with ten of eleven
    tasks on it is not one console; it is one console and an invisible eleventh screen.</p>

    <h2>Before this ticket</h2>
    <p class="base">${esc(D.BASELINE['L10.3'])}</p>
  </div>
  <div>
    <h2>What the gate is shown to catch</h2>
    <p class="sub">A gate that reports no problem proves nothing until it is shown reporting one.
    Each of these is a case the ${D.GATE.tests}-test suite proves it does catch.</p>
    <ul class="ctl">${controls}</ul>
  </div>
</div>

<h2>The count that looks wrong and is not</h2>
<p class="okbox">${D.COUNTS.allocationRows} allocation rows across ${D.COUNTS.tasks} tasks.
The unallocated one is <code>${esc(D.UNALLOCATED.taskId)}</code>
(<strong>kind=${esc(D.UNALLOCATED.kind)}</strong>, "${esc(D.UNALLOCATED.title)}") &mdash;
${esc(D.UNALLOCATED.why)}. Checked in the container rather than inferred from the name, because
this page was about to report it as a missing execution class.</p>

<h2>Outstanding</h2>
<p class="gapbox">The document is a <strong>v1 draft and was not approved</strong>; approval forks
a version and is not this ticket's to do. Not in the done-when, stated here rather than
discovered later.</p>
`;

  return htmlDoc({
    title: 'L10.3 — the one console',
    css: `${baseCss()}
      .tiles { display: flex; gap: 9px; margin: 13px 0 9px; }
      .tile { flex: 1; border: 1px solid ${TOKENS.BORDER}; border-radius: 6px; padding: 9px 11px;
        background: ${TOKENS.BG_ALT}; }
      .tile .n { font-size: 21px; font-weight: 700; line-height: 1.1; color: ${TOKENS.INK}; }
      .tile .l { font-size: 9.5px; color: ${TOKENS.MUTED}; margin-top: 3px; line-height: 1.3; }
      .tile.ok .n { color: ${TOKENS.SEV.ok}; }
      .bar { margin: 4px 0 13px; }
      h2 { font-size: 12px; margin: 11px 0 5px; }
      .cols { display: flex; gap: 20px; }
      .cols > div { flex: 1; }
      .sub { color: ${TOKENS.MUTED}; font-size: 9.5px; line-height: 1.4; }
      .id { font-size: 8.5px; color: ${TOKENS.MUTED}; font-family: ui-monospace, monospace; }
      .ev { font-size: 10px; line-height: 1.5; border-left: 3px solid ${TOKENS.SEV.ok};
        padding-left: 9px; margin: 3px 0 6px; }
      .base { font-size: 10px; line-height: 1.45; border-left: 3px solid ${TOKENS.MUTED};
        padding-left: 9px; margin: 3px 0; }
      ul.ctl { margin: 4px 0 0; padding-left: 15px; font-size: 9.5px; line-height: 1.4; }
      ul.ctl li { margin-bottom: 5px; }
      .evi { color: ${TOKENS.MUTED}; font-size: 8.5px; font-family: ui-monospace, monospace; }
      .gapbox { font-size: 10px; line-height: 1.45; border-left: 3px solid ${TOKENS.SEV.watch};
        padding-left: 9px; margin: 3px 0; }
      .okbox { font-size: 10px; line-height: 1.45; border-left: 3px solid ${TOKENS.SEV.ok};
        padding-left: 9px; margin: 3px 0; }`,
    body,
  });
}

module.exports = { build };

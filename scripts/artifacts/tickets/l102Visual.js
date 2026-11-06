/**
 * L10.2, the one-pager: the AI work is owned, by name, by subject.
 *
 * WHAT THIS PAGE ANSWERS. Not "what is an agent team" - the spec does that. This answers the
 * question asked before opening anything: did the generated decomposition actually produce named,
 * subject-bounded agents with a human holding the approval, or did it produce the generic blob
 * the ticket was written to prevent.
 *
 * The approver column is the point of the page. A reader who sees "role-proposal_manager" twice
 * should be able to tell, without opening the spec, whether a system approved its own work.
 *
 * One page, enforced by the builder. The renderer throws rather than spilling.
 */
const D = require('./l10Data');
const { TOKENS, esc, baseCss, stackBar } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

function build() {
  const tiles = [
    { n: D.TOTALS.blocking, l: 'blocking findings — the done-when', ok: D.TOTALS.blocking === 0 },
    { n: `${D.TOTALS.aiTasksInTeams} of ${D.COUNTS.ai}`, l: 'AI tasks in exactly one team' },
    { n: `${D.TOTALS.subjects} of ${D.TOTALS.teams}`, l: 'teams with a distinct subject' },
    { n: D.APPROVER_EVIDENCE.agentsHoldingApproval, l: 'agents holding an approval',
      ok: D.APPROVER_EVIDENCE.agentsHoldingApproval === 0 },
    { n: D.TOTALS.warnings, l: 'warnings, named below not rounded away', watch: true },
  ].map((t) => `<div class="tile${t.ok ? ' ok' : ''}${t.watch ? ' watch' : ''}">
      <div class="n">${esc(String(t.n))}</div><div class="l">${esc(t.l)}</div></div>`).join('\n');

  const split = stackBar({
    parts: [
      { label: `AI, with approval (${D.COUNTS.ai})`, value: D.COUNTS.ai, color: TOKENS.CHERRY },
      { label: `Human (${D.COUNTS.human})`, value: D.COUNTS.human, color: TOKENS.LEAF },
    ],
    width: 1000,
    height: 26,
  });

  const teams = D.TEAMS.map((t) => `<tr>
      <td><strong>${esc(t.subject)}</strong><div class="id">${esc(t.id)}</div></td>
      <td class="c">${t.taskCount}</td>
      <td>${esc(t.approverRoleId)}</td>
      <td>${esc(t.executionPolicy)}</td>
      <td class="c ${t.autonomyStage === null ? 'gapcell' : ''}">${
    t.autonomyStage === null ? 'not set' : esc(String(t.autonomyStage))}</td>
    </tr>`).join('\n');

  const gaps = D.FINDINGS.filter((f) => f.gap).map((f) => `<li>
      <strong>${esc(f.rule)}</strong> &times;${f.count} — ${esc(f.detail)}</li>`).join('\n');

  const body = `
<h1>The AI work is owned, by name and by subject</h1>
<p class="sub">L10.2 &middot; ${esc(D.META.project)} &middot; ${esc(D.META.built)}
&middot; measured on ${esc(D.META.track)} v${D.META.version} (${esc(D.META.status)}) by
${esc(D.META.measuredBy)} &middot; backend ${esc(D.META.deployedSha)}</p>

<div class="tiles">${tiles}</div>
<div class="bar">${split}</div>

<h2>The two teams, as stored</h2>
<table>
  <thead><tr><th>Subject</th><th class="c">AI tasks</th><th>Approver role</th>
    <th>Execution policy</th><th class="c">Autonomy stage</th></tr></thead>
  <tbody>${teams}</tbody>
</table>

<div class="cols">
  <div>
    <h2>Did a system approve its own work? No.</h2>
    <p class="ev">Under <code>${esc(D.APPROVER_EVIDENCE.roleId)}</code>, across
    ${D.COUNTS.assignments} assignment rows:
    an agent is <strong>PERFORMER</strong> on ${D.APPROVER_EVIDENCE.agentPerformerTasks} tasks and
    a <strong>person is APPROVER</strong> on ${D.APPROVER_EVIDENCE.personApproverTasks}.
    <strong>${D.APPROVER_EVIDENCE.agentsHoldingApproval} agents hold an approval.</strong>
    The oversight is real and it is a person's. What the role does not do is tell a reader which
    side of the handoff an approval came from, which is the warning below.</p>
  </div>
  <div>
    <h2>Before this ticket</h2>
    <p class="base">${esc(D.BASELINE['L10.2'])}</p>
  </div>
</div>

<h2>Outstanding, and not rounded away</h2>
<ul class="gaps">${gaps}</ul>
`;

  return htmlDoc({
    title: 'L10.2 — agent teams',
    css: `${baseCss()}
      .tiles { display: flex; gap: 9px; margin: 13px 0 9px; }
      .tile { flex: 1; border: 1px solid ${TOKENS.BORDER}; border-radius: 6px; padding: 9px 11px;
        background: ${TOKENS.BG_ALT}; }
      .tile .n { font-size: 21px; font-weight: 700; line-height: 1.1; color: ${TOKENS.INK}; }
      .tile .l { font-size: 9.5px; color: ${TOKENS.MUTED}; margin-top: 3px; line-height: 1.3; }
      .tile.ok .n { color: ${TOKENS.SEV.ok}; }
      .tile.watch .n { color: ${TOKENS.SEV.watch}; }
      .bar { margin: 4px 0 13px; }
      h2 { font-size: 12px; margin: 11px 0 5px; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th { text-align: left; background: ${TOKENS.BG_ALT}; border-bottom: 1px solid ${TOKENS.BORDER};
        padding: 5px 7px; font-size: 9.5px; color: ${TOKENS.MUTED}; font-weight: 600; }
      td { padding: 5px 7px; border-bottom: 1px solid ${TOKENS.BORDER}; vertical-align: top; }
      td.c { text-align: center; }
      td.gapcell { color: ${TOKENS.SEV.watch}; font-weight: 700; }
      .id { font-size: 8.5px; color: ${TOKENS.MUTED}; font-family: ui-monospace, monospace; }
      .cols { display: flex; gap: 20px; margin-top: 4px; }
      .cols > div { flex: 1; }
      .sub { color: ${TOKENS.MUTED}; font-size: 9.5px; line-height: 1.4; }
      .ev { font-size: 10px; line-height: 1.45; border-left: 3px solid ${TOKENS.SEV.ok};
        padding-left: 9px; margin: 3px 0; }
      .base { font-size: 10px; line-height: 1.45; border-left: 3px solid ${TOKENS.MUTED};
        padding-left: 9px; margin: 3px 0; color: ${TOKENS.INK}; }
      ul.gaps { margin: 3px 0 0; padding-left: 15px; font-size: 9.5px; line-height: 1.45; }
      ul.gaps strong { color: ${TOKENS.SEV.watch}; }`,
    body,
  });
}

module.exports = { build };

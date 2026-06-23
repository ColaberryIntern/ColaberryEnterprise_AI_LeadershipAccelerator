// Pure decision logic for the daily reporting orchestrator's audit/alert email.
//
// Why this exists: the orchestrator (runReportingAuditAndSend.js) used to send
// the alert email ONLY when a report failed PREFLIGHT (`totalFail > 0`). A
// report that passed preflight and then failed its actual SEND (child process
// exit code != 0) was logged as "healthy run - audit email suppressed" and Ali
// was never told. Two daily reports (Anthropic Partner Network, Interview Prep)
// were broken for days inside this blind spot. The alert must fire on EITHER a
// preflight failure OR a send failure. Extracted here so it is unit-testable in
// isolation from the I/O-heavy orchestrator.

// Send-result exit-code contract (set by runReportingAuditAndSend.js):
//   null  -> audit-only run, the send was intentionally skipped
//   0     -> report sent OK
//   -2    -> send skipped because PREFLIGHT failed (already counted by totalFail)
//   other -> the send actually FAILED (child exit 1, spawn error -1, guard -3, ...)
function summarizeReporting(auditResults, sendResults) {
  const totalFail = auditResults.filter((r) => r.overall === 'fail').length; // preflight failures
  const totalWarn = auditResults.filter((r) => r.overall === 'warn').length;
  const sentCount = sendResults.filter((s) => s && s.exitCode === 0).length;
  const sendFailCount = sendResults.filter(
    (s) => s && s.exitCode !== 0 && s.exitCode !== -2
  ).length;
  return { total: auditResults.length, totalFail, totalWarn, sentCount, sendFailCount };
}

// Alert when ANY report failed preflight OR failed to send.
function shouldSendAuditEmail(counts) {
  return counts.totalFail > 0 || counts.sendFailCount > 0;
}

module.exports = { summarizeReporting, shouldSendAuditEmail };

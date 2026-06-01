// Single source of truth for ALL daily/weekly reports.
//
// Each entry declares: name, scriptPath, args, projectId, recipients,
// cadence ("daily" or { day: 1-7 (Mon=1..Sun=7) }), CB runner state file
// (if applicable), skipFlag for manual exclusion.
//
// The audit orchestrator (runReportingAuditAndSend.js) iterates this list,
// runs preflight + send per report whose cadence fires today.

const STANDARD_RECIPIENTS = { to: 'ali@colaberry.com', cc: ['alimuwwakkil@gmail.com', 'ram@colaberry.com'] };

const REPORTS = [
  // ---- Project dashboards (daily Mon-Fri) ----
  {
    name: 'Launch PMO',
    scriptPath: 'backend/src/scripts/runLaunchPmoDailyUpdate.js',
    args: [],
    projectId: 47502609,
    needsOpenai: true,
    recipients: STANDARD_RECIPIENTS,
    cbRunnerState: 'tmp/launch-pmo-ai-runner-state.json',
    skipFlag: '--skip-launch-pmo',
    cadence: 'daily',
    description: 'AI Systems Architect Accelerator launch project. YOUR TURN banner, per-area cards, AI completion log, blockers, escalations.',
  },
  {
    name: 'Gov Contracts',
    scriptPath: 'backend/src/scripts/dailyGovContractsAnalysis.js',
    args: [],
    projectId: 47346103,
    needsOpenai: true,
    recipients: STANDARD_RECIPIENTS,
    cbRunnerState: null,
    skipFlag: '--skip-gov',
    cadence: 'daily',
    description: 'Per-bid feasibility scorecard, NEXT HUMAN STEP per bid, recently-completed.',
  },
  {
    name: 'AI Pathway',
    scriptPath: 'backend/src/scripts/dailyClientProjectsReport.js',
    args: ['--only=AI Pathway'],
    projectId: 46697389,
    needsOpenai: true,
    recipients: STANDARD_RECIPIENTS,
    cbRunnerState: 'tmp/cb-ai-runner-state-46697389.json',
    skipFlag: '--skip-clients',
    cadence: 'daily',
    description: 'Client project. Per-list cards with DRAFTED BY CB pattern.',
  },
  {
    name: 'ShipCES (Autonomous Brokerage)',
    scriptPath: 'backend/src/scripts/dailyClientProjectsReport.js',
    args: ['--only=ShipCES'],
    projectId: 47126345,
    needsOpenai: true,
    recipients: STANDARD_RECIPIENTS,
    cbRunnerState: 'tmp/cb-ai-runner-state-47126345.json',
    skipFlag: '--skip-clients',
    cadence: 'daily',
    description: 'Client project. Per-list cards with DRAFTED BY CB pattern.',
  },
  {
    name: 'LandJet',
    scriptPath: 'backend/src/scripts/dailyClientProjectsReport.js',
    args: ['--only=LandJet'],
    projectId: 46699826,
    needsOpenai: true,
    recipients: STANDARD_RECIPIENTS,
    cbRunnerState: 'tmp/cb-ai-runner-state-46699826.json',
    skipFlag: '--skip-clients',
    cadence: 'daily',
    description: 'Client project. Per-list cards with DRAFTED BY CB pattern.',
  },
  {
    name: 'Anthropic Partner Network',
    scriptPath: 'backend/src/scripts/dailyAnthropicPartnerCountdown.js',
    args: [],
    projectId: 47477101,
    needsOpenai: false,
    recipients: STANDARD_RECIPIENTS,
    cbRunnerState: null,
    skipFlag: '--skip-anthropic',
    cadence: 'daily',
    description: 'Daily countdown + per-employee progress on the 4 Anthropic courses.',
  },
  // ---- Intern reports ----
  {
    name: 'Intern Daily Nudges (BLACK/RED/ORANGE)',
    scriptPath: 'backend/src/scripts/dailyInternNudges.js',
    args: [],
    projectId: 24865175,
    needsOpenai: true,
    recipients: STANDARD_RECIPIENTS,
    cbRunnerState: null,
    skipFlag: '--skip-intern-nudges',
    cadence: 'daily',
    description: 'Daily intern nudge digest. BLACK = day 10+ exit cliff, RED 7-9d, ORANGE 4-6d, YELLOW 1-3d, GREEN today.',
  },
  {
    name: 'Intern Weekly Report (last 10 days)',
    scriptPath: 'backend/src/scripts/weeklyInternReport.js',
    args: [],
    projectId: 24865175,
    needsOpenai: true,
    recipients: STANDARD_RECIPIENTS,
    cbRunnerState: null,
    skipFlag: '--skip-intern-weekly',
    cadence: { dayOfWeek: 6 }, // Saturday (matches existing cadence from "Week of May 23 - May 30" subject)
    description: 'Weekly intern activity report. STRONG (3+ updates), LIGHT (1-2), INACTIVE (0) buckets over last 10 days.',
  },
  // ---- Cohort training report ----
  {
    name: 'Weekly Cohort Performance Report',
    scriptPath: 'backend/src/scripts/weeklyCohortReport.js',
    args: [],
    projectId: null, // CCPP-based, not a single BC project
    needsOpenai: true,
    recipients: STANDARD_RECIPIENTS,
    cbRunnerState: null,
    skipFlag: '--skip-cohort',
    cadence: { dayOfWeek: 3 }, // Wednesday (matches Taiwo's existing cadence)
    description: 'Active class cohorts performance + IPBC signups for completed cohorts. CCPP-driven, interactive HTML.',
  },
];

// Determine if a report should fire today based on cadence
function shouldFireToday(report, now = new Date()) {
  if (report.cadence === 'daily') {
    // Daily = Mon-Fri (cron 0 13 * * 1-5 already restricts this)
    return true;
  }
  if (report.cadence && typeof report.cadence.dayOfWeek === 'number') {
    // 1=Mon, ..., 7=Sun. JS getUTCDay: 0=Sun, 1=Mon, ..., 6=Sat.
    // Convert: 1-6 maps to 1-6; 7 maps to 0.
    const targetDow = report.cadence.dayOfWeek === 7 ? 0 : report.cadence.dayOfWeek;
    return now.getUTCDay() === targetDow;
  }
  return false;
}

function recipientsSummary() {
  return STANDARD_RECIPIENTS;
}

module.exports = { REPORTS, shouldFireToday, STANDARD_RECIPIENTS, recipientsSummary };

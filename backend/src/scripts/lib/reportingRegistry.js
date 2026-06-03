// Single source of truth for ALL daily/weekly reports.
//
// Each entry declares: name, scriptPath, args, projectId, recipients,
// cadence ("daily" or { day: 1-7 (Mon=1..Sun=7) }), CB runner state file
// (if applicable), skipFlag for manual exclusion, sendHourUTC (which UTC
// hour this report fires in — used by the orchestrator's hourly stagger).
//
// The audit orchestrator (runReportingAuditAndSend.js) iterates this list,
// runs preflight + send per report whose cadence fires today AND whose
// sendHourUTC matches the current hour (unless --all-hours override).
//
// Stagger map (2026-06-02): the 8 daily reports used to all blast at
// 13 UTC = 8 AM CT every weekday. Ali's inbox was overwhelmed. Spread
// to one per hour, 8 AM CT (13 UTC) through 3 PM CT (20 UTC). VPS root
// crontab updated to `0 13-20 * * 1-5 runReportingAuditAndSend.js` so
// the orchestrator fires hourly and self-filters by sendHourUTC.

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
    sendHourUTC: 15,  // 10 AM CT
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
    sendHourUTC: 14,  // 9 AM CT
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
    sendHourUTC: 18,  // 1 PM CT
    description: 'Client project. Per-list cards with DRAFTED BY CB pattern.',
  },
  {
    name: 'ShipCES (Autonomous Brokerage)',
    scriptPath: 'backend/src/scripts/dailyClientProjectsReport.js',
    args: ['--only=ShipCES', '--cc-add=karun@colaberry.com'],
    projectId: 47126345,
    needsOpenai: true,
    recipients: { to: 'ali@colaberry.com', cc: ['alimuwwakkil@gmail.com', 'ram@colaberry.com', 'karun@colaberry.com'] },
    cbRunnerState: 'tmp/cb-ai-runner-state-47126345.json',
    skipFlag: '--skip-clients',
    cadence: 'daily',
    sendHourUTC: 19,  // 2 PM CT
    description: 'Client project. Per-list cards with DRAFTED BY CB pattern. Karun on CC (added 2026-06-01).',
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
    sendHourUTC: 20,  // 3 PM CT
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
    sendHourUTC: 16,  // 11 AM CT
    description: 'Daily countdown + per-employee progress on the 4 Anthropic courses.',
  },
  // ---- Personal decisions report ----
  {
    name: 'Ali Personal Decisions',
    scriptPath: 'backend/src/scripts/dailyAliPersonalDecisionsReport.js',
    args: [],
    projectId: 7463955,
    needsOpenai: true,
    recipients: { to: 'ali@colaberry.com', cc: ['alimuwwakkil@gmail.com'] },
    cbRunnerState: null,
    skipFlag: '--skip-ali-personal',
    cadence: 'daily',
    sendHourUTC: 13,  // 8 AM CT — first in the day, highest decisional priority
    description: 'Daily decisions-owed report for Ali Personal. Gov Contracts format: per-topic-group cards with NEXT HUMAN STEP, full task sequence, tier pills, recently-completed. Replaces the Mon/Wed/Fri sendAliDecisionsOwedDigest.js cadence.',
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
    sendHourUTC: 17,  // 12 PM CT (lunch-break friendly)
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
    sendHourUTC: 13,  // 8 AM CT on Saturday (Saturday already has nothing else firing)
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
    sendHourUTC: 13,  // 8 AM CT on Wednesday — coexists with Ali Personal Decisions (different topics, fine in same hour)
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

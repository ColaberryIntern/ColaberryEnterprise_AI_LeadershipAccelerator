/**
 * promptBuilder — deterministic generator of a complete, self-contained Claude
 * Code prompt for a 'code'-classified Basecamp task. Pure, never throws. The
 * output is meant to be pasted into (or run by) a Claude Code agent working in
 * the Colaberry Enterprise AI Leadership Accelerator repo.
 */

function slugify(title) {
  return (
    String(title || 'task')
      .toLowerCase()
      .replace(/\[[^\]]*\]/g, ' ') // drop [Ali] etc.
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .split('-')
      .filter(Boolean)
      .slice(0, 5)
      .join('-') || 'task'
  );
}

function projectHint(project) {
  const p = String(project || '').toLowerCase();
  if (p.includes('pathway')) {
    return 'AI Pathway curriculum/content generation lives in backend/src/services/ (curriculumGenerationService.ts, contentGenerationService.ts, chapterQualityService.ts, chapterOnTopicGuard.ts, qualityScoringService.ts); models in backend/src/models/ (CurriculumLesson, MiniSection, Enrollment, LessonInstance). For the JD/skill pipeline, grep "jd parser" / "skill".';
  }
  if (p.includes('architect')) {
    return 'Reporting/cron pattern: a script in backend/src/scripts/*.js registered in backend/src/scripts/lib/reportingRegistry.js and run by runReportingAuditAndSend.js. Admin dashboards: backend/src/routes/admin/ + frontend/src/pages/admin/. The ticket lives in the "Launch Readiness Dashboard" area.';
  }
  return 'Discover the relevant subsystem with Grep/Glob before implementing.';
}

/**
 * @param {{title:string,url?:string,project?:string,list?:string,due?:string,summary?:string}} task
 * @returns {string}
 */
function buildPrompt(task) {
  const title = task.title || 'Untitled task';
  const slug = slugify(title);
  const summary = String(task.summary || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  return [
    'You are a Claude Code agent working in the Colaberry Enterprise AI Leadership Accelerator repo (Node/Express/TypeScript backend + React frontend).',
    '',
    `TICKET: "${title}"`,
    `Basecamp: ${task.url || '(no url)'}`,
    `Project: ${task.project || '?'}${task.list ? ' / ' + task.list : ''}${task.due ? ' | due ' + task.due : ''}`,
    '',
    "STEP 0 - authoritative spec: read this Basecamp ticket's full comment thread and any linked briefs BEFORE coding. The ticket body is often a CB-drafted placeholder; the real spec is in the comments/briefs.",
    summary ? `Ticket summary: ${summary}` : '',
    '',
    'GOAL: implement the task exactly as the ticket specifies. Prefer a deterministic solution; only call an LLM where the task inherently needs one.',
    '',
    'WHERE TO LOOK:',
    `- ${projectHint(task.project)}`,
    '',
    "OPERATING CONTRACT (from this repo's CLAUDE.md - non-negotiable):",
    '- Typed contracts; `tsc --noEmit` clean for the files you touch.',
    '- Tests: happy + failure + boundary + idempotency (jest).',
    '- Idempotent + failure-first (timeouts/retries around anything external).',
    '- Update PROGRESS.md with a fresh Session ID (CC-YYYYMMDD-xxxx) + verification evidence.',
    `- Work on a new branch workstream/${slug}; open a PR when green. DO NOT deploy. DO NOT auto-post to Basecamp. No secrets in code.`,
    '',
    'DELIVERABLE: a PR with the implementation + tests. Report back the files changed, the test results, and the PR link. If the ticket turns out to need a human decision or data you do not have, STOP and say so instead of guessing.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

module.exports = { buildPrompt, slugify, projectHint };

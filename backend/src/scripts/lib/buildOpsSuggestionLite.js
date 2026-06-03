/**
 * buildOpsSuggestionLite — JS mirror of runMyDayPromptService.buildSuggestion
 * + generatePrompt for use from contexts that can't require compiled TS
 * (cb-system-handler.js, the daily Your-Turn email script, etc.).
 *
 * Keep this in sync with backend/src/services/ops/runMyDayPromptService.ts
 * — same action recipes, same resource list, same prompt template. Single
 * source of truth is intent: any tweak to the TS service should be
 * mirrored here within the same commit.
 */

const DECISION_KEYWORDS = /\b(REVIEW|APPROVE|DECISION|DECIDE|SIGN[\s-]?OFF)\b/i;
const REPLY_KEYWORDS = /\b(REPLY|RESPOND|FOLLOW[\s-]?UP|EMAIL|MESSAGE|RE:|SEND)\b/i;
const RESEARCH_KEYWORDS = /\b(RESEARCH|ANALYZE|INVESTIGATE|REPORT|PREP|DRAFT|WRITE)\b/i;
const MEETING_KEYWORDS = /\b(MEETING|CALL|SCHEDULE|CALENDAR|AGENDA)\b/i;

function detectAction(title, description) {
  const text = `${title || ''} ${description || ''}`;
  if (DECISION_KEYWORDS.test(text)) return 'decision';
  if (REPLY_KEYWORDS.test(text)) return 'reply';
  if (MEETING_KEYWORDS.test(text)) return 'meeting';
  if (RESEARCH_KEYWORDS.test(text)) return 'research';
  return 'default';
}

const BASE_RESOURCES = [
  { kind: 'tool',     name: 'sendWithBcAttach',         why: 'Required outbound email path. Sends via Mandrill + auto-attaches the email back on the originating BC ticket as a structured comment + uploads any produced doc to the BC Vault. ticketId is required.' },
  { kind: 'tool',     name: 'CB context walker',        why: 'Pulls full BC ticket context (comments, attached emails, linked Vault docs) into LLM-readable form. Run: node scripts/ops-engine/cb-context-walker.js <bc-url>' },
  { kind: 'mcp',      name: 'Gmail MCP',                why: 'Search / get email threads, attach labels.' },
  { kind: 'mcp',      name: 'Google Drive MCP',         why: 'Search + read docs the team has dropped in Drive.' },
];

const ACTION_RECIPES = {
  reply: {
    one_line: 'Read the latest inbound, draft a reply in Ali\'s voice, send via sendWithBcAttach so it lands on this ticket as a comment.',
    steps: [
      'Pull the full thread context via the CB walker.',
      'Identify the most recent inbound message that needs a reply (sender, subject, last paragraph).',
      'Draft a reply in Ali\'s voice (concise, no em-dashes, plaintext for campaigns / HTML for 1:1).',
      'Send via sendWithBcAttach with ticketId = this todo so the email lands as a comment on the BC ticket.',
      'Post a one-line summary of what was sent back on the ticket.',
    ],
    extra_resources: [
      { kind: 'workflow', name: 'Outbound email auto-attach doctrine', why: 'Memory: feedback_ali_personal_attach_emails_docs_to_ticket. Every outbound email + produced document gets attached to its originating ticket.' },
      { kind: 'skill',    name: 'BC HTML comment formatter',           why: 'Rich HTML cards + sender chips per the feedback_bc_comment_html_formatting memory. Use for any plaintext email content posted back to BC.' },
    ],
    stop_conditions: [
      'Stop if the reply would send to a new external party (not in the prior thread) without Ali approving the recipients first.',
      'Stop if the reply commits to money, contracts, hiring, or anything crossing a governance boundary per CLAUDE.md.',
    ],
  },
  decision: {
    one_line: 'Pull the artifact, summarize the decision points, post the summary on BC, wait for Ali\'s Approve before any external action.',
    steps: [
      'Pull the full ticket context via the CB walker.',
      'Summarize the decision points in one HTML block: what is being decided, the options, the constraints, the recommended call with a one-line rationale.',
      'Post that summary as a BC comment on this ticket.',
      'DO NOT send anything externally yet. Wait for Approve / Revise / Reject reply on the BC comment.',
      'After Approve, execute the resulting action (email via sendWithBcAttach with this ticketId, or BC comment, or Vault upload).',
    ],
    extra_resources: [
      { kind: 'workflow', name: 'Approval Workspace (this page)', why: 'Ali can decide directly here; the 4-branch decision tree writes back to this BC ticket.' },
    ],
    stop_conditions: [
      'Never execute the decision\'s downstream action before Ali approves.',
      'If the recommended call is ambiguous, surface both options + recommend the more conservative one.',
    ],
  },
  meeting: {
    one_line: 'Pull context, propose 3 time windows via Calendar MCP, send the meeting request via sendWithBcAttach with an agenda outline.',
    steps: [
      'Pull the ticket context via the CB walker.',
      'Use Google Calendar MCP suggest_time to propose 3 windows in the next 5 business days that work for Ali (avoid 9-10am M-F, avoid lunch 12-1pm CST).',
      'Draft the meeting-request email + send via sendWithBcAttach with ticketId = this todo.',
      'Include an agenda outline (3-5 bullets) based on the ticket context.',
    ],
    extra_resources: [
      { kind: 'mcp', name: 'Google Calendar MCP', why: 'suggest_time / create_event / respond_to_event.' },
    ],
    stop_conditions: [
      'Stop if you do not have all attendees\' emails — surface what is missing and wait.',
      'Stop if the meeting type is sensitive (1:1 layoff, partnership pitch, etc.); draft only, wait for Ali to send.',
    ],
  },
  research: {
    one_line: 'Pull context, do the research, ship a styled HTML doc + standalone variant, email via sendWithBcAttach so it lands on this ticket.',
    steps: [
      'Pull the ticket context via the CB walker.',
      'Do the research / analysis described in the ticket. Use WebSearch + CCPP MSSQL + alumni data where relevant.',
      'Produce the output as a styled HTML doc under docs/ AND a base64-inlined standalone variant under docs/<slug>-standalone.html.',
      'Email the result to Ali via sendWithBcAttach with ticketId = this todo so it lands as a BC comment + Vault upload.',
    ],
    extra_resources: [
      { kind: 'tool', name: 'WebSearch',           why: 'External research.' },
      { kind: 'tool', name: 'CCPP MSSQL connection', why: '1166-table operational DB (configured in prod backend .env). Use for anything about Colaberry alumni, partner schools, ops history.' },
      { kind: 'skill', name: 'baseline-ui / frontend-design', why: 'For consistent visual styling of HTML doc output (Bloomberg-meets-Salesforce per the design system).' },
    ],
    stop_conditions: [
      'Stop and ask if the research scope is unclear or could go in multiple directions — surface the branches.',
    ],
  },
  default: {
    one_line: 'Pull context, propose the most concrete next action, wait for Ali\'s greenlight before executing.',
    steps: [
      'Pull the full ticket context via the CB walker.',
      'Read the ticket carefully.',
      'Propose the single most concrete next action you can take (email draft, BC comment, doc, ticket creation, etc.).',
      'Post the proposal as a BC comment on this ticket.',
      'Wait for Ali\'s go / redirect before executing.',
      'After greenlight, execute. Any outbound goes through sendWithBcAttach with ticketId = this todo.',
    ],
    extra_resources: [],
    stop_conditions: [
      'When in doubt, propose + wait. Default to the conservative branch.',
    ],
  },
};

function describeUrgencyShort(todo) {
  const parts = [];
  if (todo.urgency_score != null) parts.push(`urgency ${todo.urgency_score}/100`);
  if (todo.category && todo.category !== 'unscored') parts.push(todo.category);
  const due = todo.due_on ? String(todo.due_on).slice(0, 10) : null;
  if (due) {
    const days = Math.floor((new Date(due).getTime() - Date.now()) / 86400000);
    if (days < 0) parts.push(`OVERDUE by ${Math.abs(days)}d`);
    else if (days === 0) parts.push('due TODAY');
    else if (days <= 3) parts.push(`due in ${days}d`);
    else parts.push(`due ${due}`);
  }
  return parts.join(' · ');
}

function buildSuggestion(todo) {
  const action_kind = detectAction(todo.title, todo.description);
  const recipe = ACTION_RECIPES[action_kind];
  return {
    action_kind,
    one_line: recipe.one_line,
    steps: recipe.steps,
    resources: [...BASE_RESOURCES, ...recipe.extra_resources],
    stop_conditions: recipe.stop_conditions,
    urgency_summary: describeUrgencyShort(todo),
  };
}

function generatePrompt(todo) {
  const suggestion = buildSuggestion(todo);
  const updated = todo.bc_updated_at
    ? new Date(todo.bc_updated_at).toISOString()
    : new Date().toISOString();
  const url = todo.bc_app_url || `https://app.basecamp.com/3945211/buckets/${todo.project_id || '?'}/todos/${todo.bc_id}`;
  return `# Run-my-day task: ${todo.title}

## Task context
- Project: **${todo.project_name || todo.project_id || 'unknown'}**
- Todolist: **${todo.todolist_name || 'unknown'}**
- BC ticket: ${url}
- BC todo id: \`${todo.bc_id}\`
- Urgency: ${suggestion.urgency_summary || 'unscored'}
- Last updated: ${updated}

## What you (Claude Code) have access to in this repo
- Basecamp 3 API via \`BASECAMP_ACCESS_TOKEN\` (env)
- \`backend/src/scripts/lib/sendWithBcAttach.js\` — REQUIRED outbound email path; sends via Mandrill, uploads any produced docs to BC Vault, and posts a structured comment on the originating ticket. \`ticketId\` is required at the call site.
- \`scripts/ops-engine/cb-context-walker.js\` — pulls the full BC ticket context (comments, attached emails, linked Vault docs) into LLM-readable form. Invoke: \`node scripts/ops-engine/cb-context-walker.js ${url}\`
- Gmail MCP (\`mcp__claude_ai_Gmail__*\`) — search/get threads, attach labels
- Google Drive MCP, Google Calendar MCP
- Mandrill SMTP for outbound from \`ali@colaberry.com\`

## What I want you to do
${suggestion.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Auto-attach contract
- Every outbound email **must** use \`sendWithBcAttach\` with \`ticketId: ${todo.bc_id}\`.
- Em-dashes are auto-stripped from outbound bodies.
- Any produced doc gets uploaded to BC Vault under the "CB Context Dossiers" folder and linked in the BC comment.
- If the task does not have an obvious outbound, post your output as a BC comment on todo \`${todo.bc_id}\` instead.

## Stop conditions
${suggestion.stop_conditions.map((s) => `- ${s}`).join('\n')}

Start now.`;
}

module.exports = { buildSuggestion, generatePrompt, detectAction };

/**
 * runMyDayPromptService — for each high-priority BC todo, generate a
 * concrete Claude Code prompt that Ali can paste verbatim into his
 * terminal to kick off agentic work on that task.
 *
 * The prompt is templated against:
 *   - what the agent has access to (BC API, sendWithBcAttach, CB walker,
 *     Gmail MCP, Drive MCP, Mandrill)
 *   - the task's category + keywords (drives the "what I want you to do"
 *     section)
 *   - the auto-attach contract (every outbound goes back to this ticket)
 *
 * v0: deterministic template per category. v1 (later) will LLM-tune the
 * prompt based on the BC ticket body + linked artifacts pulled via the
 * CB context walker.
 */
import type { OpsTodoCategory } from '../../models/OpsBcTodo';

export interface TodoForPrompt {
  bc_id: string;
  title: string;
  description: string | null;
  bc_app_url: string | null;
  project_id: string;
  project_name: string | null;
  todolist_name: string | null;
  due_on: Date | string | null;
  bc_updated_at: Date | string;
  urgency_score: number | null;
  category: OpsTodoCategory;
}

const DECISION_KEYWORDS = /\b(REVIEW|APPROVE|DECISION|DECIDE|SIGN[\s-]?OFF)\b/i;
const REPLY_KEYWORDS = /\b(REPLY|RESPOND|FOLLOW[\s-]?UP|EMAIL|MESSAGE|RE:|SEND)\b/i;
const RESEARCH_KEYWORDS = /\b(RESEARCH|ANALYZE|INVESTIGATE|REPORT|PREP|DRAFT|WRITE)\b/i;
const MEETING_KEYWORDS = /\b(MEETING|CALL|SCHEDULE|CALENDAR|AGENDA)\b/i;

function detectAction(title: string, description: string | null): string {
  const text = `${title} ${description || ''}`;
  if (DECISION_KEYWORDS.test(text)) return 'decision';
  if (REPLY_KEYWORDS.test(text)) return 'reply';
  if (MEETING_KEYWORDS.test(text)) return 'meeting';
  if (RESEARCH_KEYWORDS.test(text)) return 'research';
  return 'default';
}

function describeUrgency(todo: TodoForPrompt): string {
  const parts: string[] = [];
  if (todo.urgency_score != null) parts.push(`${todo.urgency_score}/100`);
  if (todo.category && todo.category !== 'unscored') parts.push(todo.category);
  const due = todo.due_on ? (todo.due_on instanceof Date ? todo.due_on.toISOString().slice(0, 10) : String(todo.due_on).slice(0, 10)) : null;
  if (due) {
    const dueMs = new Date(due).getTime();
    const now = Date.now();
    const days = Math.floor((dueMs - now) / 86400000);
    if (days < 0) parts.push(`OVERDUE by ${Math.abs(days)} day(s)`);
    else if (days === 0) parts.push('due TODAY');
    else if (days <= 3) parts.push(`due in ${days} day(s)`);
    else parts.push(`due ${due}`);
  }
  return parts.join(' · ');
}

const WHAT_YOU_HAVE = `## What you (Claude Code) have access to in this repo
- Basecamp 3 API via \`BASECAMP_ACCESS_TOKEN\` (env)
- \`backend/src/scripts/lib/sendWithBcAttach.js\` — REQUIRED outbound email path; sends via Mandrill, uploads any produced docs to BC Vault, and posts a structured comment on the originating ticket. \`ticketId\` is required at the call site.
- \`scripts/ops-engine/cb-context-walker.js\` — pulls the full BC ticket context (comments, attached emails, linked Vault docs) into LLM-readable form. Invoke: \`node scripts/ops-engine/cb-context-walker.js <bc-url>\`
- Gmail MCP (\`mcp__claude_ai_Gmail__*\`) — search/get threads, attach labels
- Google Drive MCP, Google Calendar MCP
- Mandrill SMTP for outbound from \`ali@colaberry.com\``;

function actionBlock(action: string, bcId: string): string {
  switch (action) {
    case 'decision':
      return `## What I want you to do
1. Pull the full ticket context via the CB walker: \`node scripts/ops-engine/cb-context-walker.js <URL above>\`
2. Summarize the decision points in one HTML block: what is being decided, the options, the constraints, the recommended call with one-line rationale.
3. Post that summary as a BC comment on this ticket. **Do not send anything externally yet** — wait for my Approve / Revise / Reject reply on the BC comment.
4. After I approve, execute the resulting action (email send via \`sendWithBcAttach\` with \`ticketId: ${bcId}\`, or BC comment, or Vault upload).`;
    case 'reply':
      return `## What I want you to do
1. Pull the full thread context via the CB walker: \`node scripts/ops-engine/cb-context-walker.js <URL above>\`
2. Identify the most recent inbound message that needs a reply (sender, subject, last paragraph).
3. Draft a reply in my voice (concise, no em-dashes, no preamble, plaintext for campaigns / HTML for 1:1).
4. **Send via \`sendWithBcAttach\` with \`ticketId: ${bcId}\`** so the email lands as a comment on this ticket automatically.
5. Post a one-line summary of what you sent.`;
    case 'meeting':
      return `## What I want you to do
1. Pull the ticket context via the CB walker.
2. Use the Google Calendar MCP (\`mcp__claude_ai_Google_Calendar__suggest_time\`) to propose 3 windows in the next 5 business days that work for me (avoid 9-10am M-F, avoid lunch 12-1pm CST).
3. Draft the meeting-request email + send via \`sendWithBcAttach\` with \`ticketId: ${bcId}\`.
4. Include an agenda outline (3-5 bullets) based on the ticket context.`;
    case 'research':
      return `## What I want you to do
1. Pull the ticket context via the CB walker.
2. Do the research / analysis described in the ticket. Use WebSearch + the company memory (\`CCPP\` MSSQL, alumni data, etc.) where relevant.
3. Produce the output as a styled HTML doc under \`docs/\` AND a base64-inlined standalone variant under \`docs/<slug>-standalone.html\`.
4. Email me the result via \`sendWithBcAttach\` with \`ticketId: ${bcId}\` so it lands on this ticket as a comment + Vault upload.`;
    default:
      return `## What I want you to do
1. Pull the full ticket context via the CB walker: \`node scripts/ops-engine/cb-context-walker.js <URL above>\`
2. Read the ticket carefully. Propose the single most concrete next action you can take (email draft, BC comment, doc, ticket creation, etc.).
3. Post the proposal as a BC comment on this ticket and wait for my go/redirect.
4. After I greenlight, execute. Any outbound goes through \`sendWithBcAttach\` with \`ticketId: ${bcId}\`.`;
  }
}

export function generatePrompt(todo: TodoForPrompt): string {
  const action = detectAction(todo.title, todo.description);
  const urgency = describeUrgency(todo);
  const updated = todo.bc_updated_at instanceof Date
    ? todo.bc_updated_at.toISOString()
    : new Date(todo.bc_updated_at).toISOString();

  return `# Run-my-day task: ${todo.title}

## Task context
- Project: **${todo.project_name || todo.project_id}**
- Todolist: **${todo.todolist_name || 'unknown'}**
- BC ticket: ${todo.bc_app_url || '(no app url)'}
- BC todo id: \`${todo.bc_id}\`
- Urgency: ${urgency || 'unscored'}
- Last updated: ${updated}

${WHAT_YOU_HAVE}

${actionBlock(action, todo.bc_id)}

## Auto-attach contract
- Every outbound email **must** use \`sendWithBcAttach\` with \`ticketId: ${todo.bc_id}\`.
- Em-dashes are auto-stripped from outbound bodies.
- Any produced doc gets uploaded to BC Vault under the "CB Context Dossiers" folder and linked in the BC comment.
- If the task does not have an obvious outbound, post your output as a BC comment on todo \`${todo.bc_id}\` instead.

## Stop conditions
- Stop and wait for me if: the action would send something externally (email, BC comment on someone else's ticket, Mandrill broadcast) without my explicit Approve.
- Stop and escalate if: the task touches money, contracts, hiring, or anything that crosses a governance boundary per CLAUDE.md.

Start now.`;
}

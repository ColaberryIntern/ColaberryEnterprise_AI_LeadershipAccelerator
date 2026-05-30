/**
 * CB System open-ended handler (v1).
 *
 * Invoked by inbound-dispatcher when an @CB-System comment from Ali does NOT
 * match one of the fixed keyword recipes (grep/ccpp/gmail/help). Uses OpenAI
 * function-calling to interpret the comment, pull thread context, and pick
 * the right action.
 *
 * Hard rules baked into the system prompt:
 *  - Voice is Ali (terse, executive, no em-dashes, no fluff, no emojis unless asked)
 *  - Auto-execute only "internal" tools (reply in the same thread, email Ali,
 *    queue a Basecamp todo). Anything outside-facing (email to non-Ali,
 *    public social post, calendar invite to external) is NOT in v1 — model
 *    must use queue_followup with notes describing what should happen.
 *  - Never share personal info / credentials / pricing commitments.
 *
 * v1 tools:
 *   - basecamp_reply(html)             -- post a comment back in the same thread
 *   - email_ali(subject, body_html, body_text)  -- Mandrill send to ali@colaberry.com only
 *   - queue_followup(title, notes)     -- create a Basecamp todo in same bucket
 *   - finish()                         -- stop the loop
 *
 * Audit: appends one JSONL line per invocation to tmp/ops-engine/cb-handler-log.jsonl.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const LOG_PATH = path.resolve(REPO, 'tmp/ops-engine/cb-handler-log.jsonl');

// Load deps from the backend container's node_modules (mounted by cron-env-wrapper)
const OpenAI = require(path.resolve(REPO, 'backend/node_modules/openai')).default;
const nodemailer = require(path.resolve(REPO, 'backend/node_modules/nodemailer'));
let validateBeforeSend;
try {
  ({ validateBeforeSend } = require(path.resolve(REPO, 'backend/src/scripts/lib/mandrillPreflight')));
} catch (_e) {
  validateBeforeSend = () => {}; // soft-fail if preflight not deployed yet
}

const MODEL = process.env.CB_HANDLER_MODEL || 'gpt-4o';
const MAX_ITERATIONS = 5;

const SYSTEM_PROMPT = `You are "CB System", Ali Muwwakkil's executive AI agent. You operate inside Basecamp at Colaberry Inc. When Ali tags @CB System in a comment, the dispatcher routes the comment to you.

YOUR VOICE
- Terse, executive, decision-focused. No fluff, no "happy to help," no excessive enthusiasm.
- No em-dashes (—) anywhere. Use commas or hyphens instead. This is a hard rule.
- No emojis unless Ali asks. Plain HTML markup only.
- Write at a 12th-grade reading level. Direct, not casual.

YOUR JOB
- Read Ali's comment + the thread context.
- Decide the smallest action that moves it forward.
- Take that action via a tool call. Always end with basecamp_reply summarizing what you did, then call finish.

HARD CONSTRAINTS (violations are production defects)
1. Outside-facing actions are NOT in your v1 toolkit. For anything that would send an email to a non-Ali recipient, post publicly, book external calendar time, or make a financial commitment, use queue_followup with notes describing what should happen. Do NOT attempt to do it.
2. Never share Ali's personal info, credentials, or internal-only pricing.
3. Never commit Ali to a deadline, a price, or a hire on his behalf.
4. If you are unsure whether an action is internal or outside-facing, treat it as outside-facing and queue it.

TOOL PICKING GUIDE
- basecamp_reply: ALWAYS call this at least once per invocation, as the visible response in the thread. Brief acknowledgement + what you did or queued. Use Basecamp HTML (<div>, <strong>, <em>, <br>, <ul><li>). Sign off as "CB System" only if the thread is with someone other than Ali, otherwise no signoff.
- email_ali: when Ali asked you to email him something (a summary, research notes, a draft). Recipient is locked to ali@colaberry.com.
- queue_followup: when the request needs work you cannot do in this turn (live research, cross-system lookups, external comms drafting, calendar booking). Creates a Basecamp todo in the same project, assigned to Ali, with your notes so Claude Code can finish it in his next session.
- finish: terminates the loop. Call after your final basecamp_reply.

ALWAYS END WITH: basecamp_reply, then finish.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'basecamp_reply',
      description: 'Post a comment back in the same Basecamp thread Ali tagged you from. This is the visible response. Always call this at least once.',
      parameters: {
        type: 'object',
        properties: {
          content_html: { type: 'string', description: 'Basecamp-compatible HTML. Use <div> for paragraphs, <br> for line breaks, <strong>/<em>/<ul>/<li> as needed. No em-dashes.' },
        },
        required: ['content_html'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'email_ali',
      description: 'Send an email to Ali (ali@colaberry.com only) via Mandrill. Use when Ali asked you to email him something (research summary, draft, notes). Body goes through preflight: no em-dashes, no double signatures.',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Subject line. Prefix with [CB] for visibility.' },
          body_html: { type: 'string', description: 'HTML body. Signature block is auto-appended.' },
          body_text: { type: 'string', description: 'Plain-text fallback.' },
        },
        required: ['subject', 'body_html', 'body_text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'queue_followup',
      description: 'Create a Basecamp todo in the same project, assigned to Ali. Use for anything outside-facing or anything that needs a live session to finish. Your notes become the body so the next Claude Code session can pick it up.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short task title.' },
          notes: { type: 'string', description: 'What needs to happen, with enough context that a future Claude Code session can run it without re-asking.' },
        },
        required: ['title', 'notes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: 'Done. No more actions needed.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

const SIGNATURE_HTML = `<br><br>--<br><strong>CB System</strong><br>Ali Muwwakkil's executive agent<br>Colaberry Inc.`;
const SIGNATURE_TEXT = `\n\n--\nCB System\nAli Muwwakkil's executive agent\nColaberry Inc.`;

function stripEmDashes(s) {
  return (s || '').replace(/—/g, '-').replace(/–/g, '-');
}

function appendLog(entry) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.error('[cb-handler] log append failed:', e.message);
  }
}

// Build the toolImpls closure that has access to bc functions + state.
function buildToolImpls({ bcGet, bcPost, bucketId, recId, mention, invocationId }) {
  const sideEffects = { repliedHtml: null, emailMessageId: null, followupTodoId: null };

  async function basecamp_reply({ content_html }) {
    const html = stripEmDashes(content_html);
    await bcPost(`/buckets/${bucketId}/recordings/${recId}/comments.json`, { content: html });
    sideEffects.repliedHtml = html;
    return { ok: true };
  }

  async function email_ali({ subject, body_html, body_text }) {
    if (!process.env.MANDRILL_API_KEY) return { ok: false, error: 'MANDRILL_API_KEY not set' };
    const subjectClean = stripEmDashes(subject);
    const htmlClean = stripEmDashes(body_html) + SIGNATURE_HTML;
    const textClean = stripEmDashes(body_text) + SIGNATURE_TEXT;
    try { validateBeforeSend(htmlClean, textClean); }
    catch (e) { return { ok: false, error: `preflight: ${e.message}` }; }
    const transport = nodemailer.createTransport({
      host: 'smtp.mandrillapp.com', port: 587,
      auth: { user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com', pass: process.env.MANDRILL_API_KEY },
    });
    const r = await transport.sendMail({
      from: '"CB System" <ali@colaberry.com>',
      to: 'ali@colaberry.com',
      subject: subjectClean,
      text: textClean,
      html: htmlClean,
      headers: { 'X-MC-Track': 'none', 'X-MC-AutoText': 'false', 'X-CB-Invocation': invocationId },
    });
    sideEffects.emailMessageId = r.messageId;
    return { ok: true, messageId: r.messageId };
  }

  async function queue_followup({ title, notes }) {
    // Find the project's "Todos" tool to get a todoset, then the first todolist.
    // Simpler approach: post the followup as a structured comment in the same
    // thread (we'd need a todoset id to create a real todo). v1 = comment with FOLLOWUP tag.
    const html = `<div><strong>[FOLLOWUP for next Claude Code session]</strong></div>
<div>${mention()} ${stripEmDashes(title)}</div>
<div><br></div>
<div>${stripEmDashes(notes).replace(/\n/g, '<br>')}</div>
<div><br></div>
<div style="font-size:11px;color:#64748b">Queued by CB System (invocation ${invocationId}). Reply with "go" or "skip" once you have decided.</div>`;
    await bcPost(`/buckets/${bucketId}/recordings/${recId}/comments.json`, { content: html });
    sideEffects.followupTodoId = `comment-followup-${Date.now()}`;
    return { ok: true };
  }

  return {
    impls: { basecamp_reply, email_ali, queue_followup, finish: async () => ({ ok: true, done: true }) },
    sideEffects,
  };
}

async function fetchThreadContext({ bcGet, bucketId, recId }) {
  let recording = null;
  let comments = [];
  try { recording = await bcGet(`/buckets/${bucketId}/recordings/${recId}.json`); } catch (_e) {}
  try {
    const all = await bcGet(`/buckets/${bucketId}/recordings/${recId}/comments.json`);
    comments = (Array.isArray(all) ? all : []).slice(-10);
  } catch (_e) {}
  return { recording, comments };
}

function summarizeRecording(r) {
  if (!r) return '(no parent recording available)';
  const title = r.title || r.subject || r.name || '(untitled)';
  const type = r.type || 'Recording';
  return `[${type}] ${title}`;
}

function summarizeComments(comments, aliId) {
  return comments.map((c) => {
    const who = c.creator?.id === aliId ? 'Ali' : (c.creator?.name || 'Other');
    const when = c.created_at;
    const text = (c.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
    return `- [${when}] ${who}: ${text}`;
  }).join('\n');
}

/**
 * Main entry point. Called by inbound-dispatcher.
 *   ctx = { bcGet, bcPost, bucketId, recId, comment, mention, aliId }
 * Returns { ok, summary } so dispatcher can update state.
 */
async function handleOpenEnded(ctx) {
  const { bcGet, bcPost, bucketId, recId, comment, mention, aliId } = ctx;
  const invocationId = `cb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!process.env.OPENAI_API_KEY) {
    appendLog({ invocationId, comment_id: comment.id, status: 'no_api_key' });
    return { ok: false, summary: 'OPENAI_API_KEY not set' };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { recording, comments } = await fetchThreadContext({ bcGet, bucketId, recId });

  const userMessage = `Ali's comment (the one that tagged you):
"""
${(comment.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
"""

Parent recording: ${summarizeRecording(recording)}

Recent thread (last 10 comments):
${summarizeComments(comments, aliId) || '(none)'}

Decide and act. Always end with basecamp_reply, then finish.`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  const { impls, sideEffects } = buildToolImpls({ bcGet, bcPost, bucketId, recId, mention, invocationId });
  const toolsCalled = [];
  let finished = false;
  let lastError = null;

  for (let i = 0; i < MAX_ITERATIONS && !finished; i++) {
    let resp;
    try {
      resp = await openai.chat.completions.create({
        model: MODEL,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.3,
      });
    } catch (e) {
      lastError = `openai: ${e.message}`;
      break;
    }
    const choice = resp.choices?.[0];
    const msg = choice?.message;
    if (!msg) { lastError = 'no choice'; break; }
    messages.push(msg);
    const calls = msg.tool_calls || [];
    if (calls.length === 0) {
      // Model returned text without a tool — force a basecamp_reply with the text
      const text = msg.content || '(no content)';
      try {
        await impls.basecamp_reply({ content_html: `<div>${mention()} ${stripEmDashes(text).replace(/\n/g, '<br>')}</div>` });
        toolsCalled.push({ name: 'basecamp_reply', forced: true });
      } catch (e) { lastError = `forced reply: ${e.message}`; }
      finished = true;
      break;
    }
    for (const call of calls) {
      const name = call.function?.name;
      let args = {};
      try { args = JSON.parse(call.function?.arguments || '{}'); } catch (_e) {}
      let result;
      try {
        const fn = impls[name];
        if (!fn) { result = { ok: false, error: `unknown tool: ${name}` }; }
        else { result = await fn(args); }
      } catch (e) {
        result = { ok: false, error: e.message };
      }
      toolsCalled.push({ name, args: Object.keys(args), result_ok: result?.ok });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      if (name === 'finish') finished = true;
    }
  }

  // Safety net: if we never posted a reply, post a graceful fallback.
  if (!sideEffects.repliedHtml) {
    try {
      await bcPost(`/buckets/${bucketId}/recordings/${recId}/comments.json`, {
        content: `<div>${mention()} Got your message. I tried to handle it but ran out of steps. Queued for review.</div>`,
      });
    } catch (_e) {}
  }

  appendLog({
    invocationId,
    ts: new Date().toISOString(),
    comment_id: comment.id,
    bucket_id: bucketId,
    rec_id: recId,
    model: MODEL,
    tools_called: toolsCalled,
    side_effects: sideEffects,
    finished,
    error: lastError,
    status: lastError ? 'error' : (finished ? 'finished' : 'truncated'),
  });

  return {
    ok: !lastError,
    summary: `invocation=${invocationId} tools=${toolsCalled.map(t => t.name).join(',')} email=${sideEffects.emailMessageId ? 'sent' : '-'}`,
    error: lastError,
  };
}

module.exports = { handleOpenEnded };

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

// Load deps from the host's repo-root node_modules (the dispatcher runs on
// the VPS host directly, not inside the backend container).
const OpenAI = require(path.resolve(REPO, 'node_modules/openai')).default;
const nodemailer = require(path.resolve(REPO, 'node_modules/nodemailer'));
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
- exit_intern_preview: when Ali asks you to remove, exit, terminate, kick out, or place-out an intern. PREVIEW ONLY - it does NOT execute the exit. Returns the CCPP candidate and the Basecamp todos that would be affected. You MUST follow exit_intern_preview with a basecamp_reply that shows Ali the preview AND the exact CLI command he can run to confirm. The execution is intentionally outside your reach - personnel actions need a human in the loop.
- set_intern_nudge_mode: when Ali says "go live with nudges", "pause nudges", "enable intern nudges", "set nudge mode preview/live", or anything that flips the daily intern nudge cycle between digest-only (preview) and intern-facing (live). Updates a file on the VPS that the next scheduled run reads. ALWAYS follow this with a basecamp_reply confirming the change (what mode it was, what mode it is now, when it takes effect).

GOV BIDS - two-step add flow (IMPORTANT):
When Ali asks to add Gov Contracts bids, FIRST determine whether he has already downloaded the RFP packages from Opportunity Pulse + Bonfire.
- If Ali specified a SPECIFIC bid title + deadline (e.g., "add bid Harris County RFP 26_0075 deadline 2026-06-22") → he has the documents, call add_gov_bid directly with that info.
- If Ali says generically "add N bids" / "find me N new gov bids" / "I want to add more" with NO titles + deadlines → he does NOT yet have the documents. Call post_gov_bid_download_instructions(count). This posts a Message Board UPDATE on Gov Contracts with download instructions. Then tell Ali in your basecamp_reply: "Posted instructions to the Message Board (link in the result). Once you have the zips downloaded, reply on that MB post with the title + deadline + agency for each bid and tag me again - I will build out the projects."
- When Ali later replies with the list of bids (title + deadline + agency per bid), parse his text and call add_gov_bid once per bid.

Never call add_gov_bid when you do not have a real title + a real deadline. Placeholders defeat the purpose.
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
      name: 'set_intern_nudge_mode',
      description: 'Switch the daily intern nudge engine between PREVIEW and LIVE mode. PREVIEW (the default) suppresses all intern-facing emails and Basecamp comments, sending only the Ali digest. LIVE actually emails interns and posts BC comments. Reads/writes the file tmp/ops-engine/intern-nudge-mode.txt on the VPS host, so changes take effect on the next scheduled run (Mon-Fri 5pm CT). Use when Ali says "go live with nudges", "pause nudges", "set nudge mode to X", etc.',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['preview', 'live'], description: 'preview = digest-only (default), live = fire intern emails + BC comments' },
        },
        required: ['mode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scrap_gov_bid',
      description: 'Trash a Gov Contracts bid (move its todolist to Basecamp trash). Use when Ali says "scrap bid X" / "kill the X bid" / "drop X" referring to a government contract bid in the Gov Contracts project. Recoverable from BC trash for 30 days.',
      parameters: {
        type: 'object',
        properties: {
          name_or_keyword: { type: 'string', description: 'Substring of the bid name (e.g., "Harris County" or "Detroit"). Must match exactly one bid; otherwise the tool errors.' },
        },
        required: ['name_or_keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vip_add',
      description: 'Add a VIP contact so their inbound emails trigger SMS routing. Use when Ali says "add <name> to VIP list" / "mark <person> as VIP" / "VIP <email>". Email and/or domain can be specified; at least one is required. Priority 1-10 (1=highest, default 5).',
      parameters: {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'Specific email address (case-insensitive).' },
          domain: { type: 'string', description: 'Email domain (e.g., colaberry.com). Matches any sender at that domain.' },
          display_name: { type: 'string', description: 'How the VIP appears in SMS body (e.g., "Mike Reynolds" or "ShipCES team").' },
          topic_tags: { type: 'array', items: { type: 'string' }, description: 'Optional topic tags (e.g., ["client", "gov-bid"]).' },
          priority: { type: 'integer', description: 'Routing priority 1-10. 1 = highest. Default 5.' },
        },
        required: ['display_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vip_remove',
      description: 'Deactivate a VIP contact (does not delete, just sets active=false). Use when Ali says "remove <person> from VIP" / "stop SMS for <email>".',
      parameters: {
        type: 'object',
        properties: {
          email: { type: 'string' },
          domain: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vip_list',
      description: 'List all VIP contacts (active + inactive). Use when Ali asks "who is on the VIP list" / "show VIPs" / "list my important contacts".',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_vip_sms_mode',
      description: 'Toggle the VIP SMS router between log_only and live. log_only = compute and store everything but do NOT send actual SMS via Twilio. live = real SMS via Twilio. Use when Ali says "go live with SMS" / "pause SMS routing" / "set SMS mode live". Default is log_only until Twilio is provisioned.',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['live', 'log_only'] },
        },
        required: ['mode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'post_gov_bid_download_instructions',
      description: 'Post a Message Board UPDATE on Gov Contracts telling Ali to go to Opportunity Pulse + Bonfire and download RFP packages. Use this when Ali says "add N bids" / "find me new gov bids" / "I want to add more bids" WITHOUT specifying titles + deadlines. The MB message gives him step-by-step instructions and asks him to reply with (title, deadline, agency) for each bid once he has the downloads. He then tags CB again with that list and you call add_gov_bid per item. This two-step flow is necessary because CB cannot pull RFP packages on its own (they require a logged-in browser session).',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'integer', description: 'Number of bids Ali wants to add (1-10).' },
          criteria_summary: { type: 'string', description: 'Optional. Short summary of any criteria Ali mentioned (e.g., "AI / data platform RFPs", "Texas state agencies", "anything closing in the next 30 days").' },
        },
        required: ['count'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_gov_bid',
      description: 'Add a new Gov Contracts bid to Basecamp with the standard 14-task template. Use ONLY when Ali has already downloaded the RFP package and is providing the title + deadline + agency. Tasks are pre-populated with HUMAN/AI tier classification and due dates distributed backward from the deadline. If Ali just said "add N bids" without specifying titles + deadlines, call post_gov_bid_download_instructions instead - he needs to download the packages first.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Display title for the bid (e.g., "Harris County - Agenda & Meeting Management System (RFP 26_0075)"). Becomes the BC todolist name.' },
          deadline: { type: 'string', description: 'Submission deadline as YYYY-MM-DD. Due dates for the 14 tasks distribute backward from (deadline - 1 day).' },
          agency_name: { type: 'string', description: 'Optional. Agency / buyer name for context.' },
          fit_thesis: { type: 'string', description: 'Optional. Short rationale for why this bid is a fit. Goes in the list description.' },
        },
        required: ['title', 'deadline'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'exit_intern_preview',
      description: 'Preview an intern exit (CCPP UPDATE + Basecamp un-assign). READ-ONLY: does NOT modify CCPP or Basecamp. Use when Ali asks you to remove, exit, terminate, kick out, or graduate-as-placed an intern. Returns CCPP candidate(s) + Basecamp todos that would be affected. Ali must then run the standalone confirmInternExit.js CLI to actually execute - this tool is preview-only by design (personnel actions need human-in-the-loop confirmation, not autonomous LLM execution).',
      parameters: {
        type: 'object',
        properties: {
          intern_query: { type: 'string', description: 'Name, email, or InternID of the intern to exit. Substring search supported.' },
          reason: { type: 'string', description: 'One of: quit | nochow | placed | fired | never. Used to populate the preview only.', enum: ['quit', 'nochow', 'placed', 'fired', 'never'] },
        },
        required: ['intern_query', 'reason'],
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

  async function set_intern_nudge_mode({ mode }) {
    try {
      const { writeMode, readMode } = require(path.resolve(REPO, 'backend/src/scripts/lib/internNudgeMode'));
      const before = readMode();
      const result = writeMode(mode, { changedBy: `cb-system-invocation-${invocationId}`, reason: 'changed via @CB tool' });
      sideEffects.nudgeModeChange = { from: before, to: result.current };
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function vip_add({ email, domain, display_name, topic_tags, priority }) {
    try {
      const { addVip } = require(path.resolve(REPO, 'backend/src/scripts/lib/vipSmsRouter'));
      const result = addVip({ email, domain, displayName: display_name, topicTags: topic_tags, priority });
      sideEffects.vipAdded = { id: result.id, displayName: result.displayName };
      return result;
    } catch (e) { return { ok: false, error: e.message }; }
  }
  async function vip_remove({ email, domain }) {
    try {
      const { removeVip } = require(path.resolve(REPO, 'backend/src/scripts/lib/vipSmsRouter'));
      return removeVip({ email, domain });
    } catch (e) { return { ok: false, error: e.message }; }
  }
  async function vip_list() {
    try {
      const { listVips } = require(path.resolve(REPO, 'backend/src/scripts/lib/vipSmsRouter'));
      const vips = listVips();
      return { ok: true, count: vips.length, vips };
    } catch (e) { return { ok: false, error: e.message }; }
  }
  async function set_vip_sms_mode({ mode }) {
    try {
      const { writeMode } = require(path.resolve(REPO, 'backend/src/scripts/lib/vipSmsRouter'));
      const result = writeMode(mode);
      sideEffects.vipSmsModeChange = { from: result.previous, to: result.current };
      return { ok: true, ...result };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  async function post_gov_bid_download_instructions({ count, criteria_summary }) {
    try {
      const { postGovBidDownloadInstructions } = require(path.resolve(REPO, 'backend/src/scripts/lib/govBidOps'));
      const result = await postGovBidDownloadInstructions({ count, criteriaSummary: criteria_summary });
      sideEffects.govBidInstructionsPosted = { messageId: result.messageId, count };
      return { ok: true, ...result };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  async function scrap_gov_bid({ name_or_keyword }) {
    try {
      const { scrapBid } = require(path.resolve(REPO, 'backend/src/scripts/lib/govBidOps'));
      const result = await scrapBid(name_or_keyword);
      sideEffects.scrapGovBid = { listId: result.trashed, name: result.name };
      return { ok: true, ...result };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  async function add_gov_bid({ title, deadline, agency_name, fit_thesis }) {
    try {
      const { addBid } = require(path.resolve(REPO, 'backend/src/scripts/lib/govBidOps'));
      const result = await addBid({ displayTitle: title, deadline, agencyName: agency_name, fitThesis: fit_thesis });
      sideEffects.addGovBid = { listId: result.listId, name: result.listName, taskCount: result.tasksCreated };
      return { ok: true, ...result };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  async function exit_intern_preview({ intern_query, reason }) {
    try {
      const { previewExit } = require(path.resolve(REPO, 'backend/src/scripts/lib/internExit'));
      const result = await previewExit({ query: intern_query, reason });
      sideEffects.exitPreview = {
        query: intern_query,
        reason,
        topCandidate: result.primary ? { internId: result.primary.InternID, name: result.primary.name, email: result.primary.email, isActive: result.primary.isActive } : null,
        bcTodos: result.basecampTodos.length,
        confirmHint: result.confirmHint,
      };
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  return {
    impls: { basecamp_reply, email_ali, queue_followup, set_intern_nudge_mode, scrap_gov_bid, add_gov_bid, post_gov_bid_download_instructions, vip_add, vip_remove, vip_list, set_vip_sms_mode, exit_intern_preview, finish: async () => ({ ok: true, done: true }) },
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

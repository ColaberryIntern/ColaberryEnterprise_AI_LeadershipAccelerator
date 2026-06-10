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
const { sanitizeReplyHtml, looksLikeToolCallLeak } = require('./cb-reply-sanitizer');

// Durable self-improvement lessons. Each confirmed failure pattern gets one
// line appended here (by cb-quality-audit.js) and is injected into the system
// prompt so CB stops repeating it. Soft-fail if the file is absent.
const LESSONS_PATH = path.resolve(__dirname, 'cb-lessons.md');
function loadLessons() {
  try {
    const raw = fs.readFileSync(LESSONS_PATH, 'utf8').trim();
    return raw ? `\n\nLESSONS LEARNED (do not repeat these past failures):\n${raw}` : '';
  } catch (_e) { return ''; }
}
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
5. OUTPUT FORMAT (critical): Invoke tools ONLY through the real function-calling mechanism. NEVER write tool-call syntax as prose - do not type "functions.basecamp_reply({...})", "content_html:", "functions.finish()", or any JSON/JS code that names a tool. If that text appears in a Basecamp comment it is a visible production defect. Your basecamp_reply content_html is plain Basecamp HTML for a human to read, nothing else.
6. ADDRESSING: The system automatically @-mentions the person who tagged you, so they are notified. Do NOT paste raw <bc-attachment> mention tags yourself. Address the relevant person by first name in prose (e.g. "Ram, ...") when your reply answers their specific point.

TOOL PICKING GUIDE
- basecamp_reply: ALWAYS call this at least once per invocation, as the visible response in the thread. Brief acknowledgement + what you did or queued. Use Basecamp HTML (<div>, <strong>, <em>, <br>, <ul><li>). Sign off as "CB System" only if the thread is with someone other than Ali, otherwise no signoff.
- email_ali: when Ali asked you to email him something (a summary, research notes, a draft). Recipient is locked to ali@colaberry.com.
HANDLING WORK - decide among THREE tiers (this is the most common place to get stuck; pick deliberately):
- EXECUTE NOW: if the request is something your tools can finish this turn (reply, summarize prior thread content, create a PDF/XLSX, complete a todo, run a gov-bid op), just do it. Do not queue work you can actually do. "Execute" is internal-only: never send outside-facing comms, post publicly, book external calendar, or take personnel action yourself - those get queued.
- create_task: when the request is a concrete unit of WORK someone must own and finish later ("make a task to X", "track this", "someone needs to do Y by Friday"). This creates a REAL tracked Basecamp todo with an owner and a due date. Use this, not queue_followup, when the thing is a deliverable with an owner.
- queue_followup: lightweight parking only - when you need to hand a note to Ali's next Claude Code session (live research, cross-system lookups, external comms drafting) and there is no clean owner/due-date yet. It posts a FOLLOWUP note as a comment in this thread; it does NOT create a tracked todo.
When you are unsure whether to create_task or queue_followup: if it has a clear owner and a deadline, create_task; if it is "hold this thought for the next working session", queue_followup. Never reply that you "are not sure what to do" without taking one of these three actions.
- exit_intern_preview: when Ali asks you to remove, exit, terminate, kick out, or place-out an intern. PREVIEW ONLY - it does NOT execute the exit. Returns the CCPP candidate and the Basecamp todos that would be affected. You MUST follow exit_intern_preview with a basecamp_reply that shows Ali the preview AND the exact CLI command he can run to confirm. The execution is intentionally outside your reach - personnel actions need a human in the loop.
- set_intern_nudge_mode: when Ali says "go live with nudges", "pause nudges", "enable intern nudges", "set nudge mode preview/live", or anything that flips the daily intern nudge cycle between digest-only (preview) and intern-facing (live). Updates a file on the VPS that the next scheduled run reads. ALWAYS follow this with a basecamp_reply confirming the change (what mode it was, what mode it is now, when it takes effect).
- complete_todo: when Ali (or the requester) says "close this", "mark done", "complete it", "close out", "we're done here", or anything that resolves the ticket. Pass a closure_note explaining the reason - it gets posted as an auditable comment before completion. NEVER say "I will close this ticket" in a basecamp_reply without actually calling complete_todo in the same turn. Saying you will close it and then not closing it is the single worst failure pattern: Ali sees the promise, trusts you, then has to come back hours later and notice the ticket is still open. Either call complete_todo or do not promise to close.

GOV BIDS - three flows (IMPORTANT, read carefully):
When Ali asks to add Gov Contracts bids, identify the SHAPE of the request:

FLOW A (NUMBERED reference to prior list) - use add_gov_bid_by_number:
- "@CB add bid 5" / "@CB add bids 1, 3, 5" / "go ahead and add bid 3" / any reference to numbered bid cards from a prior "Top N active opportunities" MB UPDATE that you posted earlier.
- The CURRENT thread is the MB UPDATE itself (the user is replying on it). Call add_gov_bid_by_number({ bid_numbers: [5] }) or [1, 3, 5]. The tool parses the cards from the parent message deterministically and calls add_gov_bid per number.
- CRITICAL: when the user says "add bid 5" or "add bid N" where N is a small number (1-9) AND the thread looks like a numbered-bids list, do NOT interpret N as the COUNT of bids to find. That is Flow C and re-runs the discovery step. Use Flow A.
- After the tool returns, basecamp_reply with the BC project URL for each added bid (or per-bid error if any failed).

FLOW B (SPECIFIC bid with full info) - use add_gov_bid directly:
- "add bid Harris County RFP 26_0075 deadline 2026-06-22" / Ali pasted a specific title + deadline + agency.
- He has the document. Call add_gov_bid(displayTitle, deadline, opportunityUuid?, agencyName?, fitThesis?) directly.

FLOW C (DISCOVERY) - use post_gov_bid_download_instructions:
- "find me 5 new gov bids" / "I want to add more bids" / "show me what's available" / NO specific titles + NO numbered references to a prior list.
- He has NOT yet selected anything. Call post_gov_bid_download_instructions(count). Posts a new MB UPDATE with the top N opportunities + 3-step upload flow. Then tell Ali "Posted Top N opportunities to the MB. Once you've uploaded the zips + screenshots in Opp Pulse, reply on that post with the bid numbers (e.g. @CB add bids 1, 3, 5) and I'll build the projects."
- When ambiguous between Flow A and Flow C: look at the current thread title/subject. If it's "Top N active opportunities..." you're in Flow A territory; "add bid 5" means card #5. If it's a fresh thread with no prior list, Flow C.
- When Ali later replies with the list of bids (title + deadline + agency per bid), do NOT call add_gov_bid yourself N times - instead call finalize_gov_bids_from_reply(reply_body=<Ali's reply text>) ONCE. The deterministic parser inside that tool is more reliable than LLM extraction for multi-bid lists. After it returns, post a basecamp_reply listing each bid that landed (with its BC list URL + the "mode" it used: zip-aware or light) and any that failed (with the reason). If failures happened, give Ali the exact correction (e.g., "Mystery RFP - add deadline YYYY-MM-DD") so he can fix and re-tag you.
- If Ali replies with ONLY ONE bid and a clean title+deadline (e.g., "@CB add bid Plano IT, deadline 2026-09-01"), you may call add_gov_bid directly OR finalize_gov_bids_from_reply (both work; finalize is fine for the single-bid case too).
- Zip-aware mode: if Ali pastes a Basecamp Vault upload URL on a bid row (with "zip <url>" or just the bare URL), the finalize tool will download that zip, extract it, upload each file to a per-bid Docs & Files sub-folder, and create a richer todolist that links to each uploaded file. Mode will show as "zip-aware" in the per-bid result. If no zip is provided, the lighter 14-task template path runs ("mode": "light").

Never call add_gov_bid when you do not have a real title + a real deadline. Placeholders defeat the purpose.
- finish: terminates the loop. Call after your final basecamp_reply.

EXTRACTING PRIOR CONTENT (zero tolerance for hallucinated regeneration)
When Ali says "PDF this" / "format that" / "email me what you sent" / "include everything from your prior deliverable" / "put it in xlsx" or any reference to PRIOR CB OUTPUT in the thread:
- READ the prior CB System comments in the thread context BLOCK BY BLOCK.
- COPY the prior text VERBATIM into the new artifact (create_pdf sections[].body, create_xlsx sheets[].rows cells, etc.). Word-for-word, including bullets, structure, examples.
- DO NOT regenerate, summarize, paraphrase, or substitute placeholder text. The 2026-06-01 ShipCES failure (todo 9946715864) was exactly this: CB regenerated a "small paragraph" PDF instead of copying its 3982-char prior deliverable. That is the worst failure mode.
- If the prior deliverable is multi-section, the new PDF MUST have one section per logical block of the original. Section headings inherit from the prior structure.
- If you genuinely cannot find the prior deliverable in your context window, say so explicitly in basecamp_reply and ask Ali to paste it. Do not fabricate.

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
      name: 'create_task',
      description: 'Create a REAL, tracked Basecamp todo in the current project (not just a comment). Use when the request is a concrete unit of work that someone needs to own and complete later: "make a task for X", "add a todo to follow up on Y", "track this", "someone needs to do Z by Friday". Differs from queue_followup (which only parks a note as a comment) and from doing the work now. The todo lands in the todolist this thread belongs to (or the project default list), gets a due date, and is assigned. Every todo gets a due date at creation (hard rule).',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short, action-oriented todo title (e.g. "Draft 3-week milestone landing copy").' },
          notes: { type: 'string', description: 'Optional. Body/description with enough context that the assignee can act without re-asking.' },
          due_on: { type: 'string', description: 'Due date as YYYY-MM-DD. If omitted, defaults to 3 days out. Always set when a real deadline exists.' },
          assign_to: { type: 'string', enum: ['ali', 'requester'], description: 'Who owns it when it is Ali or the person who tagged CB. Default "ali". For a named third party use assignee_name instead.' },
          assignee_name: { type: 'string', description: 'Optional. Name (or email) of a specific project member to assign, e.g. "Sohail". Resolved against the project roster; takes priority over assign_to. If it cannot be matched uniquely, the task falls back to Ali and the reply must say so.' },
        },
        required: ['title'],
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
      name: 'vip_list',
      description: 'List VIP contacts from the Inbox COS VIP manager (the same list Ali manages at /admin/inbox/vips). Use when Ali asks "who is on the VIP list" / "show VIPs". To ADD or REMOVE VIPs, direct Ali to the admin UI at https://enterprise.colaberry.ai/admin/inbox (the UI is the source of truth, not CB).',
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
      name: 'finalize_gov_bids_from_reply',
      description: 'Parse Ali\'s reply on the Gov Contracts Message Board "download instructions" post and create all bids in one call. Use this when Ali has replied to the MB instructions post with a numbered list of bids (title + deadline + agency + uuid + bonfire url per row) and tagged @CB. The parser is deterministic - it will only create bids it can find a title + deadline for, and will return a per-bid status. ALWAYS call this once on Ali\'s reply rather than calling add_gov_bid multiple times yourself - the parser is more reliable than LLM extraction. Two modes auto-dispatch per bid: if a bid row includes a Basecamp Vault upload URL (Ali pasted the zip\'s BC link), zip-aware mode runs (extract zip, upload files to per-bid sub-folder, rich todolist). Otherwise light mode (14-task generic template). After this returns, follow with basecamp_reply that summarizes which bids landed + the mode used + any failures so Ali can fix the format and re-tag you.',
      parameters: {
        type: 'object',
        properties: {
          reply_body: { type: 'string', description: 'The raw comment body (HTML or text) from Ali\'s reply that contains the numbered bid list. Pass it verbatim; the parser handles HTML stripping and structured field extraction itself.' },
        },
        required: ['reply_body'],
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
      name: 'create_pdf',
      description: 'Generate a PDF document and post it as an attachment on the current Basecamp thread. Use this when someone asks for a PDF: a meeting agenda, a one-pager, a briefing doc, a status report. The PDF will appear as a downloadable attachment under your reply.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Document title shown at the top of the PDF' },
          filename: { type: 'string', description: 'Filename ending in .pdf (e.g., "open-house-agenda-2026-06-15.pdf")' },
          sections: {
            type: 'array',
            description: 'Ordered list of content sections. Each section can have a heading, body text, bullet list, and/or a table.',
            items: {
              type: 'object',
              properties: {
                heading: { type: 'string', description: 'Section heading (optional)' },
                body: { type: 'string', description: 'Paragraph text under the heading (optional)' },
                bullets: { type: 'array', items: { type: 'string' }, description: 'Bullet list (optional)' },
              },
            },
          },
          caption: { type: 'string', description: 'One-line caption shown above the attachment in the Basecamp comment' },
        },
        required: ['title', 'filename', 'sections'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_xlsx',
      description: 'Generate an Excel (.xlsx) spreadsheet and post it as an attachment on the current Basecamp thread. Use this for tabular data: roster, schedule, budget tracker, content calendar, A/B test plan, enrollment dashboard sample, etc.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Filename ending in .xlsx' },
          sheets: {
            type: 'array',
            description: 'One or more sheets. Each has a name, optional headers row, and a 2D array of rows.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Sheet name (<=30 chars)' },
                headers: { type: 'array', items: { type: 'string' }, description: 'Top header row (optional, but recommended)' },
                rows: { type: 'array', items: { type: 'array', items: {} }, description: '2D array of data rows. Each inner array is one row. Cell values can be strings, numbers, or null.' },
              },
              required: ['name', 'rows'],
            },
          },
          caption: { type: 'string', description: 'One-line caption shown above the attachment in the Basecamp comment' },
        },
        required: ['filename', 'sheets'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_image',
      description: 'Generate an image via OpenAI gpt-image-1 (DALL-E successor) and post it as an attachment on the current Basecamp thread. Use this for marketing visuals, mockups, brand-direction illustrations, social media graphics. Output is a single PNG image. Cost ~$0.04 per image.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Image generation prompt. Be specific about style ("flat illustration"), subject, mood, colors. Avoid generating real people\'s faces.' },
          filename: { type: 'string', description: 'Filename ending in .png' },
          size: { type: 'string', enum: ['1024x1024', '1536x1024', '1024x1536'], description: 'Image dimensions. Square for general use, landscape for headers, portrait for stories.' },
          caption: { type: 'string', description: 'One-line caption shown above the attachment in the Basecamp comment' },
        },
        required: ['prompt', 'filename'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_gov_bid_by_number',
      description: 'Add a specific numbered bid (or set of numbered bids) from a previously-posted "Top N active opportunities" Gov Contracts MB UPDATE. Use when the requester says "add bid N", "add bids X, Y, Z", "add bid 5 only", "go ahead and add bid 3", etc. - any reference to a numbered card in the prior list. The CURRENT thread MUST be that MB UPDATE itself (the requester replied on it). Parses the bid cards deterministically by number, extracts title + agency + deadline + Opp Pulse UUID, and calls add_gov_bid per number. DO NOT use post_gov_bid_download_instructions when the requester is referencing a numbered prior bid - that tool is only for the initial "find me N bids" request.',
      parameters: {
        type: 'object',
        properties: {
          bid_numbers: {
            type: 'array',
            items: { type: 'integer' },
            description: 'Array of bid numbers to add. For "add bid 5" pass [5]. For "add bids 1, 3, 5" pass [1, 3, 5].',
          },
        },
        required: ['bid_numbers'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_todo',
      description: 'Mark a Basecamp todo as complete (close the ticket). Default closes the current todo (the one this @CB mention is on). Pass a different todo_id to close a related ticket in the same project. Use when the requester says "close this", "mark done", "complete", "close out", or has explicitly resolved the work described in the ticket. Posts a closure-note comment before flipping the completion flag so the close is auditable in the thread.',
      parameters: {
        type: 'object',
        properties: {
          todo_id: { type: 'integer', description: 'Optional. If omitted, closes the current todo. Pass to close a different todo in the same project.' },
          closure_note: { type: 'string', description: 'One-line note explaining WHY you are closing. Posted as a comment first.' },
        },
        required: ['closure_note'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_prompt',
      description: 'Generate a Claude Code prompt for the current Basecamp todo and post it as a comment. Use when Ali (or any allowed requester) says "suggest prompt", "give me the prompt", "build me a prompt for this", "what should I run in Claude Code", or asks @CB for the next-step prompt. Pulls the todo title + description + project context, classifies the action kind (reply / decision / meeting / research / default), and produces a copy-paste-ready prompt block formatted for Claude Code. The prompt explicitly declares what tools / skills / agents the runner has access to + step-by-step instructions + auto-attach contract + stop conditions. The runner pastes the prompt block into a Claude Code session and the agent does the work; result lands back on this BC ticket via sendWithBcAttach.',
      parameters: { type: 'object', properties: {}, required: [] },
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

// Per-tool permission gating. Tools listed here are restricted to Ali only
// (creator.id === ALI_ID). All other tools default to "any allowed requester".
// "Allowed requesters" is the team roster filter applied in the dispatcher
// before this handler ever fires.
const ALI_ONLY_TOOLS = new Set([
  'email_ali',              // sends email to ali@colaberry.com - only Ali can request
  'set_intern_nudge_mode',  // changes a global system mode
  'set_vip_sms_mode',       // changes a global system mode
  'exit_intern_preview',    // personnel preview
  'scrap_gov_bid',          // gov-bid-specific Ali ops
  'add_gov_bid',
  'add_gov_bid_by_number',
  'post_gov_bid_download_instructions',
  'finalize_gov_bids_from_reply',
  'vip_list',
]);
// Implicit always-allowed: basecamp_reply, queue_followup, create_pdf,
// create_xlsx, create_image, finish.

function filterToolsForRequester(requesterId, aliId) {
  if (requesterId === aliId) return TOOLS;
  return TOOLS.filter((t) => !ALI_ONLY_TOOLS.has(t.function?.name));
}

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
function buildToolImpls({ bcGet, bcPost, bucketId, recId, mention, invocationId, requesterId, requesterName, aliId }) {
  const sideEffects = { repliedHtml: null, emailMessageId: null, followupTodoId: null, qualityFlags: [] };

  const MENTION_RE = /content-type="application\/vnd\.basecamp\.mention"/;

  // The single choke point every CB reply passes through.
  //  1. Runs the deterministic sanitizer (kills leaked tool-call scaffolding).
  //  2. Guarantees the requester is @-mentioned exactly once so the right
  //     person is notified (the "tagged Ram, not Ali" contract).
  async function basecamp_reply({ content_html }) {
    const { html: cleaned, wasLeak } = sanitizeReplyHtml(content_html);
    if (wasLeak) sideEffects.qualityFlags.push('tool_call_leak_sanitized');
    let body = cleaned;
    // Recovered plain-text (e.g. from a leak) has newlines, no markup: keep
    // the paragraph breaks by promoting them to <br>.
    if (!/<[a-z][\s\S]*>/i.test(body)) body = body.replace(/\n/g, '<br>');
    if (!MENTION_RE.test(body)) {
      body = `<div>${mention()} ${body}</div>`;
    }
    await bcPost(`/buckets/${bucketId}/recordings/${recId}/comments.json`, { content: body });
    sideEffects.repliedHtml = body;
    return { ok: true };
  }

  async function add_gov_bid_by_number({ bid_numbers }) {
    try {
      const { addBidsByNumber } = require(path.resolve(REPO, 'backend/src/scripts/lib/govBidOps'));
      // The current recId IS the MB UPDATE the user replied on
      const result = await addBidsByNumber({ messageId: recId, bidNumbers: bid_numbers || [], bucketId });
      sideEffects.govBidsAddedByNumber = result;
      return result;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function complete_todo({ todo_id, closure_note }) {
    const targetId = todo_id || recId;
    try {
      if (closure_note) {
        const noteHtml = `<div>${mention()} closing this todo. <em>${stripEmDashes(closure_note)}</em></div>`;
        await bcPost(`/buckets/${bucketId}/recordings/${targetId}/comments.json`, { content: noteHtml });
      }
      // Completion endpoint takes empty body. bcPost serializes {} which BC accepts.
      await bcPost(`/buckets/${bucketId}/todos/${targetId}/completion.json`, {});
      sideEffects.completedTodoId = targetId;
      return { ok: true, todo_id: targetId };
    } catch (e) {
      return { ok: false, error: e.message };
    }
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

  // Resolve the todolist a new todo should land in: prefer the list this
  // thread's todo belongs to, else the most-recently-updated list in the
  // project's first todoset.
  async function resolveTargetTodolist() {
    try {
      const rec = await bcGet(`/buckets/${bucketId}/todos/${recId}.json`);
      if (rec && rec.parent && rec.parent.id && /todolist/i.test(rec.parent.type || '')) {
        return rec.parent.id;
      }
    } catch (_e) { /* recId may be a message, not a todo */ }
    const project = await bcGet(`/projects/${bucketId}.json`);
    const todoset = (project.dock || []).find((d) => d.name === 'todoset');
    if (!todoset) throw new Error('project has no todoset');
    let lists = [];
    try { lists = await bcGet(`/buckets/${bucketId}/todosets/${todoset.id}/todolists.json`); } catch (_e) {}
    if (!Array.isArray(lists) || lists.length === 0) throw new Error('project has no todolist');
    lists.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    return lists[0].id;
  }

  // Resolve who a task should be assigned to. assignee_name (a named project
  // member like "Sohail") wins; then assign_to=requester; default Ali. Returns
  // { id, name, note } where note flags any fallback so the reply stays honest.
  async function resolveAssignee({ assign_to, assignee_name }) {
    if (assignee_name && assignee_name.trim()) {
      const q = assignee_name.trim().toLowerCase();
      try {
        const people = await bcGet(`/projects/${bucketId}/people.json`);
        const list = Array.isArray(people) ? people : [];
        let matches = list.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.email_address || '').toLowerCase().includes(q));
        if (matches.length > 1) {
          const exact = matches.filter((p) => (p.name || '').toLowerCase().split(' ')[0] === q);
          if (exact.length === 1) matches = exact;
        }
        if (matches.length === 1) return { id: matches[0].id, name: matches[0].name };
        if (matches.length > 1) return { id: aliId, name: 'Ali', note: `"${assignee_name}" matched ${matches.length} people (${matches.map((m) => m.name).join(', ')}); assigned Ali instead` };
        return { id: aliId, name: 'Ali', note: `"${assignee_name}" is not a member of this project; assigned Ali instead` };
      } catch (e) {
        return { id: aliId, name: 'Ali', note: `could not look up "${assignee_name}" (${e.message}); assigned Ali instead` };
      }
    }
    if (assign_to === 'requester' && requesterId) return { id: requesterId, name: requesterName || 'requester' };
    return { id: aliId || requesterId, name: 'Ali' };
  }

  async function create_task({ title, notes, due_on, assign_to, assignee_name }) {
    try {
      const listId = await resolveTargetTodolist();
      const assignee = await resolveAssignee({ assign_to, assignee_name });
      // Hard rule (memory: feedback_bc_todos_must_have_due_dates): every todo
      // gets a due_on at creation. Default to 3 days out when none provided.
      let due = (typeof due_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(due_on)) ? due_on : null;
      if (!due) { const d = new Date(); d.setDate(d.getDate() + 3); due = d.toISOString().slice(0, 10); }
      const body = {
        content: stripEmDashes(title),
        due_on: due,
        assignee_ids: assignee.id ? [assignee.id] : undefined,
      };
      if (notes) body.description = `<div>${stripEmDashes(notes).replace(/\n/g, '<br>')}</div>`;
      const todo = await bcPost(`/buckets/${bucketId}/todolists/${listId}/todos.json`, body);
      sideEffects.createdTask = { todoId: todo.id, listId, url: todo.app_url || null, due_on: due, assigneeId: assignee.id, assigneeName: assignee.name, assigneeNote: assignee.note || null };
      return { ok: true, todo_id: todo.id, url: todo.app_url || null, due_on: due, list_id: listId, assignee: assignee.name, assignee_note: assignee.note || null };
    } catch (e) { return { ok: false, error: e.message }; }
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

  async function finalize_gov_bids_from_reply({ reply_body }) {
    try {
      const { finalizeBidsFromReply } = require(path.resolve(REPO, 'backend/src/scripts/lib/govBidOps'));
      // Pass token + IDs so zip-aware mode can download from Basecamp Vault.
      // Token resolution mirrors govBidOps.js BASECAMP_TOKEN_FALLBACK pattern.
      let token = process.env.BASECAMP_ACCESS_TOKEN
        || '';
      if (token.toLowerCase().startsWith('bearer ')) token = token.slice(7).trim();
      const result = await finalizeBidsFromReply({
        replyBody: reply_body,
        basecampToken: token,
        basecampIds: { accountId: '3945211', projectId: '47346103', vaultId: '9908475797', todosetId: '9908475794', messageBoardId: '9908475791' },
      });
      const successes = result.results.filter((r) => r.ok);
      const failures = result.results.filter((r) => !r.ok);
      sideEffects.finalizeGovBids = {
        parsedCount: result.parsedCount,
        successCount: successes.length,
        failureCount: failures.length,
        zipAwareCount: successes.filter((r) => r.mode === 'zip-aware').length,
        lightCount: successes.filter((r) => r.mode === 'light').length,
        parseWarnings: result.parseWarnings.slice(0, 5),
      };
      return { ok: true, ...result, successCount: successes.length, failureCount: failures.length };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  // -------------------------------------------------------------------------
  // Artifact tools: create_pdf, create_xlsx, create_image
  // Each generates a file, uploads to BC, posts as comment attachment on the
  // current thread. Side-effect tracking captures the comment URL.
  // -------------------------------------------------------------------------
  async function create_pdf({ title, filename, sections, caption }) {
    try {
      const { buildPdf, uploadAndAttach } = require('./cb-artifact-tools');
      const localPath = await buildPdf({ title, sections, filename });
      const result = await uploadAndAttach({ bcGet, bcPost, bucketId, recId, localFilePath: localPath, filename, caption });
      sideEffects.artifactCreated = { kind: 'pdf', filename, commentId: result.commentId };
      return { ok: true, kind: 'pdf', ...result };
    } catch (e) { return { ok: false, error: e.message }; }
  }
  async function create_xlsx({ filename, sheets, caption }) {
    try {
      const { buildXlsx, uploadAndAttach } = require('./cb-artifact-tools');
      const localPath = await buildXlsx({ sheets, filename });
      const result = await uploadAndAttach({ bcGet, bcPost, bucketId, recId, localFilePath: localPath, filename, caption });
      sideEffects.artifactCreated = { kind: 'xlsx', filename, commentId: result.commentId };
      return { ok: true, kind: 'xlsx', ...result };
    } catch (e) { return { ok: false, error: e.message }; }
  }
  async function create_image({ prompt, filename, size = '1024x1024', caption }) {
    try {
      const { buildImage, uploadAndAttach } = require('./cb-artifact-tools');
      const localPath = await buildImage({ prompt, size, filename });
      const result = await uploadAndAttach({ bcGet, bcPost, bucketId, recId, localFilePath: localPath, filename, caption });
      sideEffects.artifactCreated = { kind: 'image', filename, commentId: result.commentId };
      return { ok: true, kind: 'image', ...result };
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

  async function suggest_prompt() {
    try {
      // Pull the current todo's metadata via BC. recId is the todo id.
      const todo = await bcGet(`/buckets/${bucketId}/todos/${recId}.json`);
      const todoForPrompt = {
        bc_id: String(todo.id),
        title: todo.title || '',
        description: todo.description || todo.content || '',
        bc_app_url: todo.app_url || null,
        project_id: String(bucketId),
        project_name: todo.bucket?.name || null,
        todolist_name: todo.parent?.title || null,
        due_on: todo.due_on || null,
        bc_updated_at: todo.updated_at || new Date().toISOString(),
        urgency_score: null,
        category: 'unscored',
      };
      // Try contextual v2 first (walker + LLM extraction). Falls back to
      // the lite template internally on any error or missing OPENAI key.
      let suggestion;
      let prompt;
      let analysisBlock = '';
      try {
        const { buildContextualSuggestion } = require(path.resolve(REPO, 'backend/src/scripts/lib/buildContextualSuggestionV2'));
        const result = await buildContextualSuggestion({
          todo: todoForPrompt,
          bcGet,
          bucketId,
          openaiKey: process.env.OPENAI_API_KEY,
        });
        prompt = result.long_prompt;
        // Build a suggestion-like shape from the v2 analysis for the comment renderer
        const a = result.analysis || {};
        suggestion = {
          action_kind: a.action_kind || (a.next_step ? 'next-step' : 'default'),
          one_line: a.next_step || a.goal || 'See steps below.',
          steps: result.basic_steps || [],
          resources: (a.tools_needed || []).map((t) => ({
            kind: t.exists === false ? 'create' : (t.kind || 'tool'),
            name: t.name,
            why: t.why,
          })),
          stop_conditions: a.blockers || [],
        };
        if (result.source === 'contextual_v2') {
          analysisBlock = `<div style="margin-top:10px;padding:10px 14px;background:#f8fafc;border-left:4px solid #1a365d;border-radius:0 6px 6px 0;font-size:12.5px;color:#1f2937">${a.goal ? `<div><strong>Goal:</strong> ${stripEmDashes(a.goal)}</div>` : ''}${a.progress_so_far ? `<div style="margin-top:4px"><strong>Progress so far:</strong> ${stripEmDashes(a.progress_so_far)}</div>` : ''}${a.last_action ? `<div style="margin-top:4px"><strong>Last action:</strong> ${stripEmDashes(a.last_action)}</div>` : ''}${a.complexity ? `<div style="margin-top:6px;font-size:11px;color:#475569"><strong>${a.complexity}</strong> · ~${a.estimated_minutes || '?'}min · v2 $${(result.cost_usd || 0).toFixed(5)}</div>` : ''}</div>`;
        }
      } catch (e2) {
        // Hard fallback to lite template
        const { buildSuggestion, generatePrompt } = require(path.resolve(REPO, 'backend/src/scripts/lib/buildOpsSuggestionLite'));
        suggestion = buildSuggestion(todoForPrompt);
        prompt = generatePrompt(todoForPrompt);
      }

      // Format the BC comment with a structured suggestion block + the
      // copy-paste-ready prompt in a pre tag so the operator can grab it.
      const stepsHtml = suggestion.steps
        .map((s, i) => `<li style="margin-bottom:4px">${stripEmDashes(s)}</li>`)
        .join('');
      const resourcesHtml = suggestion.resources
        .map((r) => `<li style="margin-bottom:3px"><strong>[${r.kind}] ${stripEmDashes(r.name)}</strong> - ${stripEmDashes(r.why)}</li>`)
        .join('');
      const stopsHtml = suggestion.stop_conditions
        .map((s) => `<li style="margin-bottom:3px;color:#78350f">${stripEmDashes(s)}</li>`)
        .join('');
      const escapedPrompt = String(prompt)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const commentHtml = `<div style="background:linear-gradient(135deg,#14532d 0%,#1a365d 100%);color:white;padding:18px 22px;border-radius:8px">
<div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#fbbf24;font-weight:700">@CB suggested prompt</div>
<div style="font-size:15px;font-weight:700;margin-top:6px">${stripEmDashes(suggestion.one_line)}</div>
</div>
${analysisBlock}
<div style="margin-top:14px"><strong>Suggested steps</strong></div>
<ol style="padding-left:22px;line-height:1.6">${stepsHtml}</ol>
<div style="margin-top:12px"><strong>Tools / Skills / Agents / Workflows you have access to</strong></div>
<ul style="padding-left:22px;line-height:1.5">${resourcesHtml}</ul>
${suggestion.stop_conditions.length ? `<div style="margin-top:12px"><strong style="color:#78350f">Stop conditions</strong></div><ul style="padding-left:22px;line-height:1.5">${stopsHtml}</ul>` : ''}
<div style="margin-top:18px;padding:12px 14px;background:#fef9e7;border-left:5px solid #d4a017;border-radius:0 6px 6px 0">
<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">Paste this into Claude Code</div>
<pre style="background:#0b1220;color:#cbd5e1;border:1px solid #1d2a44;border-radius:6px;padding:12px;font-size:11.5px;line-height:1.5;margin-top:8px;overflow-x:auto;white-space:pre-wrap;word-break:break-word">${escapedPrompt}</pre>
</div>
<div style="margin-top:10px;font-size:12px;color:#475569;font-style:italic">When the Claude Code agent completes, its result will land on this ticket as the next comment (via sendWithBcAttach with ticketId ${recId}).</div>`;

      await bcPost(`/buckets/${bucketId}/recordings/${recId}/comments.json`, { content: commentHtml });
      sideEffects.suggestedPromptPosted = { todoId: recId, actionKind: suggestion.action_kind };
      return { ok: true, action_kind: suggestion.action_kind, steps_count: suggestion.steps.length };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  return {
    impls: { basecamp_reply, complete_todo, add_gov_bid_by_number, email_ali, queue_followup, create_task, set_intern_nudge_mode, scrap_gov_bid, add_gov_bid, post_gov_bid_download_instructions, finalize_gov_bids_from_reply, vip_list, set_vip_sms_mode, exit_intern_preview, create_pdf, create_xlsx, create_image, suggest_prompt, finish: async () => ({ ok: true, done: true }) },
    sideEffects,
  };
}

async function fetchThreadContext({ bcGet, bucketId, recId }) {
  let recording = null;
  let comments = [];
  try { recording = await bcGet(`/buckets/${bucketId}/recordings/${recId}.json`); } catch (_e) {}
  try {
    // BC paginates comments at 15 per page, oldest-first. Walk Link headers
    // to get the full set, then take the last 12 so we always include the
    // most recent activity. Single-page bcGet would miss recent comments on
    // any todo with more than 15 entries.
    let next = `https://3.basecampapi.com/3945211/buckets/${bucketId}/recordings/${recId}/comments.json`;
    const all = [];
    while (next) {
      const r = await fetch(next, { headers: { Authorization: `Bearer ${(process.env.BASECAMP_ACCESS_TOKEN || '').replace(/^bearer\s+/i, '')}`, 'User-Agent': 'Colaberry CB Handler', Accept: 'application/json' } });
      if (!r.ok) break;
      const page = await r.json();
      if (!Array.isArray(page)) break;
      all.push(...page);
      const lh = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/);
      next = lh ? lh[1] : null;
    }
    comments = all.slice(-12);
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
  // CRITICAL: do NOT truncate to 400 chars. CB needs to see its own prior
  // multi-paragraph deliverables verbatim so that when Ali asks to PDF /
  // email / format the prior output, the LLM has the actual text to copy.
  // Confirmed 2026-06-01 against ShipCES todo 9946715864 where CB's prior
  // deliverable was 3982 chars - truncating to 400 caused the regenerated
  // PDF to contain a single paragraph (LLM hallucinated to fill the gap).
  // Cap each comment at 4000 chars (still defends gpt-4o input budget for a
  // 12-comment window) instead.
  return comments.map((c) => {
    const who = c.creator?.id === aliId ? 'Ali' : (c.creator?.name || 'Other');
    const when = c.created_at;
    const text = (c.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
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
  const requesterId = comment.creator?.id;
  const requesterName = comment.creator?.name || 'team member';
  const isAli = requesterId === aliId;
  const availableTools = filterToolsForRequester(requesterId, aliId);

  if (!process.env.OPENAI_API_KEY) {
    appendLog({ invocationId, comment_id: comment.id, status: 'no_api_key' });
    return { ok: false, summary: 'OPENAI_API_KEY not set' };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // 4-layer Basecamp graph walk (Ali 2026-06-01): LIST + TASK + COMMENTS + DOCUMENTS,
  // with URLs in description/comments auto-followed (BC uploads -> text extract via
  // pdf-parse / mammoth; BC todo/message links -> body + recent comments; external
  // URLs gated by CB_FOLLOW_EXTERNAL_URLS=1). Recursion depth capped.
  let walkedContext = '';
  try {
    const { walkContext, formatContextForLlm } = require('./cb-context-walker');
    const ctx = await walkContext({ bcGet, bucketId, recId });
    walkedContext = formatContextForLlm(ctx, aliId);
  } catch (e) {
    console.error('[cb-handler] context-walker failed, falling back:', e.message);
    const fb = await fetchThreadContext({ bcGet, bucketId, recId });
    walkedContext = `## TASK\n${summarizeRecording(fb.recording)}\n\n## RECENT COMMENTS\n${summarizeComments(fb.comments, aliId) || '(none)'}\n(walker fallback: ${e.message})`;
  }

  const requesterContext = isAli
    ? 'The requester is Ali Muwwakkil (Managing Director, Executive Sponsor).'
    : `The requester is ${requesterName} (team member, not Ali). You can use basecamp_reply, queue_followup, create_pdf, create_xlsx, create_image, finish. Ali-only tools (email_ali, system mode toggles, gov-bid ops, exit_intern_preview, vip_list) are not available to non-Ali requesters.`;

  const userMessage = `${requesterContext}

Their comment (the one that tagged you):
"""
${(comment.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
"""

# CONTEXT (4-layer Basecamp graph walk)

${walkedContext}

# END CONTEXT

Decide and act. Always end with basecamp_reply, then finish.`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + loadLessons() },
    { role: 'user', content: userMessage },
  ];

  const { impls, sideEffects } = buildToolImpls({ bcGet, bcPost, bucketId, recId, mention, invocationId, requesterId, requesterName, aliId });
  const toolsCalled = [];
  let finished = false;
  let lastError = null;

  for (let i = 0; i < MAX_ITERATIONS && !finished; i++) {
    let resp;
    try {
      resp = await openai.chat.completions.create({
        model: MODEL,
        messages,
        tools: availableTools,
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
      // Model returned text without a real tool_call. This is the exact path
      // that leaked `functions.basecamp_reply({...})` into a live comment
      // (2026-06-10, todo 9946499609). Hand the RAW text to basecamp_reply,
      // which sanitizes it (recovers content_html from any leaked literal) and
      // tags the requester. Do NOT pre-wrap - that defeated the extractor.
      const text = msg.content || '(no content)';
      if (looksLikeToolCallLeak(text)) sideEffects.qualityFlags.push('model_emitted_tool_call_as_text');
      try {
        await impls.basecamp_reply({ content_html: text });
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
    requester_id: requesterId,
    requester_name: requesterName,
    model: MODEL,
    tools_called: toolsCalled,
    quality_flags: sideEffects.qualityFlags,
    forced_reply: toolsCalled.some((t) => t.forced),
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

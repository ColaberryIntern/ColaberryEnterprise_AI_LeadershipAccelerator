/**
 * draftDeliverable — the Phase-1 reasoning step for the Ali Task Agent.
 *
 * Given one task, produce a first-pass deliverable in Ali's voice. This is the
 * lightweight reasoning layer (a single gpt-4o call, like runCbAiTasksGeneric):
 * it DRAFTS. For internal tasks the draft is posted as Ali; for outward-facing
 * tasks the same draft is handed back via queueForApproval for Ali to send.
 *
 * The richer reasoning layer (a scheduled Claude Code agent that actually runs
 * tools to DO the work) calls the executor primitives directly and does not
 * need this module - this is the fallback that makes the entrypoint useful on
 * its own today.
 *
 * Network call is isolated here so the rest of the agent stays pure/testable.
 */
const path = require('path');

function loadOpenAI() {
  try {
    const m = require('openai');
    return m.default || m;
  } catch {
    return require(path.resolve(__dirname, '../../../../../node_modules/openai')).default;
  }
}

function stripHtml(s) { return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function stripEm(s) { return (s || '').replace(/—/g, '-').replace(/–/g, '-'); }

/** Minimal, safe Markdown -> HTML for posting a deliverable into a BC comment. */
function mdToHtml(md) {
  const s = (md || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/^\* (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*?<\/li>(\n<li>.*?<\/li>)*)/gs, '<ul>$1</ul>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  return `<div><p>${s}</p></div>`;
}

/**
 * @param {object} a
 * @param {{content:string, description?:string, due_on?:string}} a.task
 * @param {string} a.projectName
 * @param {'internal'|'outward'} a.kind
 * @param {Array<{creator?:{name?:string},content?:string,created_at?:string}>} [a.threadComments]
 * @returns {Promise<{ markdown: string, html: string, tokens?: object }>}
 */
async function generateDraft(a) {
  const { task, projectName, kind, threadComments } = a;
  const OpenAI = loadOpenAI();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const outwardClause = kind === 'outward'
    ? `This task is OUTWARD-FACING (it leaves the building). Draft the actual content Ali will send (the email body, the message, the post). Open the draft with "[DRAFT - Ali reviews + sends]". Do NOT address it from "Ali's AI assistant"; write it as Ali would send it himself.`
    : `This task is INTERNAL. Produce the deliverable itself (the analysis, the doc, the answer, the spec, the code).`;

  const systemPrompt = `You are Ali Muwwakkil's AI assistant (ATA), taking a first pass on a task assigned to Ali in project "${projectName}".

${outwardClause}

RULES:
- Write in Ali's voice: direct, executive, decision-focused. No fluff, no filler phrases.
- No em-dashes anywhere (use commas or hyphens).
- Output ONLY the deliverable in clean GitHub-flavored Markdown (real H2/H3, real bullets, real tables).
- Code/spec tasks: give actual code or pseudo-code. Copy/draft tasks: write the copy. Research tasks: summarize with sources.
- You DRAFT only. You never send emails, post to social, book meetings, or make external commitments.
- 250-1200 words, scaled to the task. If the task is ambiguous, state the 1-2 assumptions you made at the top and proceed.`;

  const userPrompt = `# Task
**Title:** ${task.content}
**Due:** ${task.due_on || 'unset'}

**Description:**
${stripHtml(task.description).slice(0, 2000)}

${threadComments && threadComments.length ? `# Recent thread
${threadComments.slice(-5).map((c) => `- ${(c.created_at || '').slice(0, 10)} ${c.creator?.name || '?'}: ${stripHtml(c.content).slice(0, 240)}`).join('\n')}` : ''}

Produce the first-pass deliverable now.`;

  const resp = await openai.chat.completions.create({
    model: process.env.ATA_MODEL || 'gpt-4o',
    temperature: 0.3,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  const markdown = stripEm(resp.choices?.[0]?.message?.content || '');
  return { markdown, html: mdToHtml(markdown), tokens: resp.usage };
}

module.exports = { generateDraft, mdToHtml };

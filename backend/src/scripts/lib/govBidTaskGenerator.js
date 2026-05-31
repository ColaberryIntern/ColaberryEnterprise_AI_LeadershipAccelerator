// Generate a tailored gov bid task list from RFP file contents via gpt-4o.
//
// Given the bid metadata + extracted text from each RFP doc, ask gpt-4o to
// produce 10-15 tasks specific to this RFP. Each task: { content, note }
// matching the shape buildTaskList() in govBidPipeline.js consumes.
//
// We don't return a "tier" field because the pipeline doesn't use it - that
// was only in the old hardcoded STANDARD_TEMPLATE for human reference.
//
// Output format is enforced via response_format JSON schema so we get a
// structured array, not free-form text.

const path = require('path');

const SYSTEM_PROMPT = `You are a Colaberry proposal manager building the task list for a government RFP response.

You will be given:
  - Bid metadata (title, agency, deadline)
  - The text content of the RFP documents (PDF/DOCX/XLSX extracts)

Produce a 10-15 task list specific to THIS RFP. Each task must:
  - Be a discrete deliverable a single owner can execute
  - Reference the actual RFP document or section when applicable
  - Be ordered logically: read/qualify -> respond to requirements -> compliance forms -> pricing -> review -> submit
  - Use "RFP" / "Bonfire" / specific document names when they appear in the text

HARD RULES:
  - No em-dashes anywhere (use commas or hyphens). Em-dashes break our preflight.
  - No fluff phrases like "make sure to" / "be sure that" / "as needed"
  - Task content must be under 100 chars; note must be under 350 chars
  - Always include a "Bid / no-bid decision" task early
  - Always include the Bonfire submission task LAST with the deadline date in the content
  - Always include an internal review/sign-off task before submission
  - Never invent facts not in the source documents. If unsure, write "TBD per Ali" rather than guessing.

Return ONLY the JSON array of tasks.`;

async function generateTasksFromContent({ bidConfig, fileTexts, openaiKey, model = 'gpt-4o' }) {
  const key = openaiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY required for task generation');
  const OpenAI = require(path.resolve(__dirname, '../../../../node_modules/openai')).default;
  const openai = new OpenAI({ apiKey: key });

  const corpus = fileTexts.map((f) => `=== FILE: ${f.filename}${f.truncated ? ' (truncated)' : ''} ===\n${f.text}`).join('\n\n');
  const userPrompt = `Bid metadata:
- Title: ${bidConfig.display_title}
- Agency: ${bidConfig.agency_name || '(not specified)'}
- Deadline: ${bidConfig.deadline || '(not specified)'}
- Opportunity UUID: ${bidConfig.opportunity_uuid || '(not specified)'}
${bidConfig.fit_thesis ? `- Fit thesis: ${bidConfig.fit_thesis}` : ''}

RFP file content:
${corpus}

Produce the task list.`;

  const resp = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: 'json_schema', json_schema: {
      name: 'gov_bid_task_list',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tasks: {
            type: 'array',
            minItems: 8,
            maxItems: 18,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                content: { type: 'string', description: 'Task title shown in Basecamp (under 100 chars)' },
                note: { type: 'string', description: 'Task description (under 350 chars). References specific RFP doc/section when applicable.' },
              },
              required: ['content', 'note'],
            },
          },
        },
        required: ['tasks'],
      },
    } },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = resp.choices?.[0]?.message?.content || '{}';
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { throw new Error(`gpt-4o returned non-JSON: ${raw.slice(0, 200)}`); }
  const tasks = (parsed.tasks || []).map((t) => ({
    content: (t.content || '').replace(/—/g, '-').replace(/–/g, '-').slice(0, 250),
    note: (t.note || '').replace(/—/g, '-').replace(/–/g, '-').slice(0, 800),
  }));
  return { tasks, modelUsed: model, tokens: resp.usage };
}

module.exports = { generateTasksFromContent, SYSTEM_PROMPT };

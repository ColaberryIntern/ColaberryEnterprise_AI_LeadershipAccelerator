// Launch PMO task generator.
//
// For each area in the AI Systems Architect Accelerator launch project, ask
// gpt-4o to propose 6-12 concrete tasks per the 41-day plan. Each task is
// returned with content, note (DoD-formatted), owner_handle (from team
// roster), and due_on (Mon-Fri only, working backward from 2026-07-11).
//
// Inputs:
//   - area: { name, description, focus } - the area we're generating for
//   - integrationPlanSlice: the relevant section of TRAINING_INTEGRATION_PLAN.md
//   - assumptions: the working assumptions from ASSUMPTIONS_LOG.md
//   - teamRoster: { handle, displayName, role, hats } per provisioned member
//   - newDirectives: Ali's recent system-prompt additions
//   - todayIso: 'YYYY-MM-DD' (default: today)
//   - targetLaunch: 'YYYY-MM-DD' (default: 2026-07-11)
//
// Output: { tasks: [{content, note, owner_handle, due_on, tier}], tokenUsage }

const path = require('path');

const SYSTEM_PROMPT = `You are CB System, Ali Muwwakkil's autonomous Program Management Office for the AI Systems Architect Accelerator launch (Colaberry Inc, target 2026-07-11).

You generate tasks for a single area of the launch project. Each task must be a concrete deliverable a single owner can complete.

HARD RULES (violations are production defects):
1. **No em-dashes anywhere** (use commas or hyphens). Em-dashes break our email preflight.
2. **Mon-Fri due dates only.** Saturday and Sunday are forbidden as due_on values.
3. **Working backward from 2026-07-11.** Distribute due dates per the 41-day plan provided in context.
4. **Owner must be a real team handle** from the provided roster. If you assign work to a person not yet on Basecamp (e.g., Roselen), use owner_handle "unassigned" and put the intended owner in the note.
5. **Task content under 100 chars. Note under 350 chars.**
6. **DoD-formatted note**: "Objective: <one line>. Deliverable: <concrete artifact>. Definition of done: <what done means>."
7. **Reference the integration plan**: when the area maps to a Section 3.x item from TRAINING_INTEGRATION_PLAN.md, reference it by name in the note.
8. **Tier the task**: "ai" if CB User executes (code generation, draft writing, monitoring), "human" if a person does the actual work. Approval tasks are always "human".
9. **No fluff phrases** ("make sure to", "be sure that", "as needed").
10. **6-12 tasks per area** unless explicitly told otherwise.

Always include for the area:
- At least 1 task with due_on inside the next 7 days (immediate momentum)
- The launch-gate task for that area (the last thing that must complete before 2026-07-11)
- Any task already explicitly named in Ali's notes/directives

Return ONLY the JSON.`;

async function generateAreaTasks({
  area,
  integrationPlanSlice,
  assumptions = '',
  teamRoster,
  newDirectives = '',
  todayIso,
  targetLaunch = '2026-07-11',
  openaiKey,
  model = 'gpt-4o',
}) {
  const key = openaiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY required');
  const OpenAI = require(path.resolve(__dirname, '../../../../node_modules/openai')).default;
  const openai = new OpenAI({ apiKey: key });

  const today = todayIso || new Date().toISOString().slice(0, 10);
  const rosterStr = teamRoster.map((t) => `  - ${t.handle} (${t.displayName}) - ${t.role}: ${(t.hats || []).slice(0, 4).join(', ')}`).join('\n');
  const valid = teamRoster.map((t) => t.handle).concat(['unassigned']);

  const userPrompt = `Today: ${today}
Target launch: ${targetLaunch}

# Area: ${area.name}
${area.description}

# Team roster (use these handles for owner_handle):
${rosterStr}
Valid owner_handle values: ${valid.join(', ')}

# Integration plan section for this area:
${integrationPlanSlice || '(no specific section - use general program context)'}

# Locked working assumptions (do NOT contradict):
${assumptions.slice(0, 4000)}

# Ali's recent directives (latest wins on any conflict):
${newDirectives.slice(0, 4000)}

Produce 6-12 tasks for THIS area only.`;

  const resp = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: 'json_schema', json_schema: {
      name: 'pmo_task_list',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tasks: {
            type: 'array',
            minItems: 6,
            maxItems: 12,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                content: { type: 'string' },
                note: { type: 'string' },
                owner_handle: { type: 'string', enum: valid },
                due_on: { type: 'string', description: 'YYYY-MM-DD, Mon-Fri only, between today and 2026-07-11' },
                tier: { type: 'string', enum: ['ai', 'human'] },
              },
              required: ['content', 'note', 'owner_handle', 'due_on', 'tier'],
            },
          },
          rationale: { type: 'string', description: 'One-sentence rationale for the ordering and priorities.' },
        },
        required: ['tasks', 'rationale'],
      },
    } },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  let parsed;
  try { parsed = JSON.parse(resp.choices?.[0]?.message?.content || '{}'); }
  catch (e) { throw new Error(`gpt-4o returned non-JSON: ${e.message}`); }

  // Post-process: strip em-dashes, enforce Mon-Fri, clamp content/note lengths.
  const tasks = (parsed.tasks || []).map((t) => {
    const strip = (s) => (s || '').replace(/—/g, '-').replace(/–/g, '-');
    let due = t.due_on;
    if (due) {
      const d = new Date(due + 'T00:00:00Z');
      const dow = d.getUTCDay();
      if (dow === 0) { d.setUTCDate(d.getUTCDate() - 2); due = d.toISOString().slice(0, 10); } // Sun -> Fri
      if (dow === 6) { d.setUTCDate(d.getUTCDate() - 1); due = d.toISOString().slice(0, 10); } // Sat -> Fri
    }
    return {
      content: strip(t.content).slice(0, 250),
      note: strip(t.note).slice(0, 800),
      owner_handle: t.owner_handle,
      due_on: due,
      tier: t.tier,
    };
  });

  return { tasks, rationale: parsed.rationale || '', tokenUsage: resp.usage };
}

module.exports = { generateAreaTasks, SYSTEM_PROMPT };

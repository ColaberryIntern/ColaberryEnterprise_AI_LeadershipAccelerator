// Launch PMO task generator (v2).
//
// For each area in the AI Systems Architect Accelerator launch project, ask
// gpt-4o to propose 6-12 concrete tasks per the 41-day plan. Each task is
// returned with:
//   - content (Basecamp todo title, <=120 chars)
//   - objective (one-line business outcome)
//   - deliverable (concrete artifact)
//   - definition_of_done (what "done" means)
//   - dependencies (other tasks or briefs that must complete first)
//   - claude_code_recipe (mini-playbook: how to do this in Claude Code)
//   - relevant_brief_slugs (slugs from the vault URL map, used by the runner
//     to embed clickable links in the BC description)
//   - owner_handle (from team roster)
//   - due_on (YYYY-MM-DD, Mon-Fri only, between today and launch)
//   - tier ("ai" or "human")
//
// Output is JSON-schema-enforced. The runner then formats the description.

const path = require('path');

const SYSTEM_PROMPT = `You are CB System, the autonomous Program Management Office for the AI Systems Architect Accelerator launch (Colaberry Inc, target 2026-07-11).

You generate tasks for a single area of the launch project. Each task must be a concrete deliverable a single owner can complete, with enough detail that the assignee can drop the task + their role brief into Claude Code and start working immediately.

HARD RULES (violations break the build):
1. **No em-dashes anywhere** (use commas or hyphens). Em-dashes break the email preflight.
2. **Mon-Fri due dates only.** Saturday/Sunday are forbidden as due_on.
3. **Working backward from 2026-07-11.** Distribute due dates per the 41-day plan.
4. **owner_handle must be from the roster.** If a task should belong to someone not yet on Basecamp (e.g., Roselen), use "unassigned" and note the intended owner in the deliverable.
5. **content <= 120 chars. Each text field <= 400 chars except claude_code_recipe (<= 700).**
6. **Reference brief slugs by their exact slug** (e.g., "kes-ai-systems", "swati-curriculum-twc", "brand-pricing"). Listed at the bottom of the user prompt.
7. **Tier the task**: "ai" if CB User executes (code generation, drafting, monitoring), "human" if a person does the work. Approvals are always "human". Reviews are "human".
8. **No fluff phrases** ("make sure to", "be sure that", "as needed", "in order to").
9. **Each task must reference 1-3 relevant briefs.** The first should always be the area's owner brief (e.g., for AI Systems area, first slug is "kes-ai-systems"). Shared briefs like "program-overview" can be the second slug for any area.
10. **Quality bar:** each task must read like a senior PM wrote it. Specific artifact names. Specific file paths when applicable. Specific Stripe SKU names. Specific URLs. No vagueness.

Per area, return 8-12 tasks ordered logically:
- 1-2 immediate tasks (this week) for momentum
- The launch-gate task for the area (last thing before 2026-07-11)
- The dependencies between tasks named explicitly when they exist

Return ONLY the JSON.`;

async function generateAreaTasks({
  area,
  integrationPlanSlice,
  assumptions = '',
  teamRoster,
  newDirectives = '',
  briefSlugMap,
  todayIso,
  targetLaunch = '2026-07-11',
  openaiKey,
  model = 'gpt-4o',
}) {
  const key = openaiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY required');
  const { getInstrumentedOpenAI } = require(path.resolve(__dirname, './openaiInstrumented'));
  const openai = getInstrumentedOpenAI({ workflow_id: 'launch_pmo_task_gen' }, { apiKey: key });

  const today = todayIso || new Date().toISOString().slice(0, 10);
  const rosterStr = teamRoster.map((t) => `  - ${t.handle} (${t.displayName}) - ${t.role}: ${(t.hats || []).slice(0, 4).join(', ')}`).join('\n');
  const validHandles = teamRoster.map((t) => t.handle).concat(['unassigned']);
  const briefSlugs = Object.keys(briefSlugMap || {});
  const briefSummary = briefSlugs.map((s) => `  - ${s}: ${(briefSlugMap[s].description || '').slice(0, 100)}`).join('\n');

  const userPrompt = `Today: ${today}
Target launch: ${targetLaunch}

# Area: ${area.name}
${area.description?.slice(0, 600) || ''}
${area.suggestedOwnerBrief ? `\nThe owner's brief slug for this area is: "${area.suggestedOwnerBrief}". Every task in this area should reference it as the first brief slug.` : ''}

# Team roster (use these handles for owner_handle):
${rosterStr}
Valid owner_handle values: ${validHandles.join(', ')}

# Integration plan section for this area:
${(integrationPlanSlice || '').slice(0, 6000) || '(no specific section - use general program context)'}

# Locked working assumptions (do NOT contradict):
${assumptions.slice(0, 4000)}

# Ali's latest directives (latest wins on any conflict):
${newDirectives.slice(0, 4000)}

# Available brief slugs (use the EXACT slug strings in relevant_brief_slugs):
${briefSummary}

Generate 8-12 tasks for THIS area only. Each task must have enough detail that the assignee can drop the brief + this task into Claude Code and start working without further clarification.`;

  const resp = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: 'json_schema', json_schema: {
      name: 'pmo_task_list_v2',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tasks: {
            type: 'array',
            minItems: 6,
            maxItems: 14,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                content: { type: 'string', description: 'BC todo title, action-oriented, <=120 chars' },
                objective: { type: 'string', description: 'One-line business outcome' },
                deliverable: { type: 'string', description: 'Concrete artifact (URL, file, decision, approval, document)' },
                definition_of_done: { type: 'string', description: 'What "done" means in plain English' },
                dependencies: { type: 'string', description: 'Upstream tasks or briefs that must complete first; "none" if standalone' },
                claude_code_recipe: { type: 'string', description: 'How to execute this in Claude Code: 2-4 short steps. Reference the briefs to load + the specific instruction to give Claude. Empty string if human-only task.' },
                relevant_brief_slugs: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 4,
                  items: { type: 'string', enum: briefSlugs.length ? briefSlugs : ['program-overview'] },
                },
                owner_handle: { type: 'string', enum: validHandles },
                due_on: { type: 'string', description: 'YYYY-MM-DD, Mon-Fri, between today and 2026-07-11' },
                tier: { type: 'string', enum: ['ai', 'human'] },
              },
              required: ['content', 'objective', 'deliverable', 'definition_of_done', 'dependencies', 'claude_code_recipe', 'relevant_brief_slugs', 'owner_handle', 'due_on', 'tier'],
            },
          },
          rationale: { type: 'string' },
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
  catch (e) { throw new Error(`gpt-4o non-JSON: ${e.message}`); }

  const strip = (s) => (s || '').replace(/—/g, '-').replace(/–/g, '-');
  const tasks = (parsed.tasks || []).map((t) => {
    let due = t.due_on;
    if (due) {
      const d = new Date(due + 'T00:00:00Z');
      const dow = d.getUTCDay();
      if (dow === 0) { d.setUTCDate(d.getUTCDate() - 2); due = d.toISOString().slice(0, 10); }
      if (dow === 6) { d.setUTCDate(d.getUTCDate() - 1); due = d.toISOString().slice(0, 10); }
    }
    return {
      content: strip(t.content).slice(0, 250),
      objective: strip(t.objective).slice(0, 500),
      deliverable: strip(t.deliverable).slice(0, 500),
      definition_of_done: strip(t.definition_of_done).slice(0, 500),
      dependencies: strip(t.dependencies).slice(0, 400),
      claude_code_recipe: strip(t.claude_code_recipe).slice(0, 900),
      relevant_brief_slugs: t.relevant_brief_slugs || [],
      owner_handle: t.owner_handle,
      due_on: due,
      tier: t.tier,
    };
  });

  return { tasks, rationale: parsed.rationale || '', tokenUsage: resp.usage };
}

module.exports = { generateAreaTasks, SYSTEM_PROMPT };

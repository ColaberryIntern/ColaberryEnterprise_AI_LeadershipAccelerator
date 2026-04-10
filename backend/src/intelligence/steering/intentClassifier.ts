/**
 * Intent Classifier — uses LLM to classify user NLP input into a structured intent.
 * The LLM is ONLY used for classification. No execution decisions.
 * Returns a deterministic intent type that maps to system changes.
 */

export type SteeringIntent =
  | { type: 'add_process'; description: string }
  | { type: 'mode_change'; target: string; scope: 'project' | 'process'; processName?: string }
  | { type: 'priority_boost'; processName: string; reason: string }
  | { type: 'defer_process'; processName: string }
  | { type: 'activate_process'; processName: string }
  | { type: 'quality_focus'; dimension: string; processName?: string }
  | { type: 'rename_process'; processName: string; newName: string }
  | { type: 'merge_processes'; sourceProcess: string; targetProcess: string }
  | { type: 'split_process'; processName: string; newProcessName: string; description: string }
  | { type: 'move_requirements'; fromProcess: string; toProcess: string; description: string }
  | { type: 'regenerate_taxonomy' }
  | { type: 'unknown'; raw: string };

/**
 * Classify user NLP input into a structured intent.
 * Uses GPT-4o-mini with strict JSON schema and existing process names for matching.
 */
export async function classifyIntent(
  userInput: string,
  existingProcesses: string[]
): Promise<SteeringIntent> {
  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const processList = existingProcesses.slice(0, 50).join('\n- ');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You classify user instructions into exactly ONE intent type. Respond with valid JSON only.

Intent types:
- "add_process": User wants to create something new (a feature, dashboard, service, page)
- "mode_change": User wants to switch project mode (mvp, production, enterprise, autonomous) or a specific process mode
- "priority_boost": User wants to prioritize or focus on a specific existing process
- "defer_process": User wants to postpone or skip a specific existing process
- "activate_process": User wants to reactivate a previously deferred process
- "quality_focus": User wants to focus on a quality dimension (reliability, performance, monitoring, automation, ux)
- "rename_process": User wants to rename an existing process
- "merge_processes": User wants to combine two processes into one
- "split_process": User wants to split a process into two separate ones
- "move_requirements": User wants to move specific requirements from one process to another
- "regenerate_taxonomy": User wants to regenerate/rebuild the business process categories
- "unknown": Cannot classify

Existing business processes:
- ${processList}

Response formats:
{"type":"add_process","description":"what to build"}
{"type":"mode_change","target":"mvp","scope":"project"}
{"type":"priority_boost","processName":"closest match","reason":"why"}
{"type":"defer_process","processName":"closest match"}
{"type":"activate_process","processName":"closest match"}
{"type":"quality_focus","dimension":"reliability|performance|monitoring|automation|ux"}
{"type":"rename_process","processName":"closest match","newName":"new name"}
{"type":"merge_processes","sourceProcess":"process to merge FROM","targetProcess":"process to merge INTO"}
{"type":"split_process","processName":"process to split","newProcessName":"name for new process","description":"what goes in the new process"}
{"type":"move_requirements","fromProcess":"source process","toProcess":"destination process","description":"which requirements to move"}
{"type":"regenerate_taxonomy"}
{"type":"unknown","raw":"original input"}

RULES:
- Match processName to the CLOSEST existing process name from the list above
- "rename X to Y" / "call X something else" → rename_process
- "merge X and Y" / "combine X with Y" → merge_processes (sourceProcess=smaller, targetProcess=larger)
- "split X" / "separate the auth stuff from X" → split_process
- "move the lead stuff from X to Y" → move_requirements
- "reclassify" / "regenerate taxonomy" / "redo the categories" → regenerate_taxonomy
- If user mentions creating/building something new → add_process
- If user mentions MVP/production/enterprise → mode_change
- If user mentions prioritize/focus/urgent → priority_boost
- If user mentions skip/defer/later → defer_process`,
        },
        { role: 'user', content: userInput },
      ],
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
    if (!parsed.type) return { type: 'unknown', raw: userInput };
    return parsed as SteeringIntent;
  } catch (err: any) {
    console.error('[IntentClassifier] Error:', err.message);
    return { type: 'unknown', raw: userInput };
  }
}

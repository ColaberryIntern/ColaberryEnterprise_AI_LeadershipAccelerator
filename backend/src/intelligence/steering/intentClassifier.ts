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
- "unknown": Cannot classify

Existing business processes:
- ${processList}

Response format:
{"type":"add_process","description":"what to build"}
{"type":"mode_change","target":"mvp","scope":"project"}
{"type":"mode_change","target":"enterprise","scope":"process","processName":"User Management"}
{"type":"priority_boost","processName":"closest match from list","reason":"why"}
{"type":"defer_process","processName":"closest match from list"}
{"type":"activate_process","processName":"closest match from list"}
{"type":"quality_focus","dimension":"reliability|performance|monitoring|automation|ux"}
{"type":"unknown","raw":"original input"}

RULES:
- Match processName to the CLOSEST existing process name from the list above
- If user mentions creating/building/adding something new → add_process
- If user mentions MVP/production/enterprise/autonomous → mode_change
- If user mentions prioritize/focus/urgent/next → priority_boost
- If user mentions skip/defer/later/postpone → defer_process
- If user mentions quality/reliability/performance/monitoring → quality_focus`,
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

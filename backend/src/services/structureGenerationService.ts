import OpenAI from 'openai';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

export interface GeneratedEvent {
  type: string;
  student_label: string;
  title: string;
  description: string;
  learning_goal: string;
}

const SYSTEM_PROMPT = `You are an expert curriculum designer for an enterprise AI leadership program targeting senior business executives (aged 35-60).

You will be given a structure prompt describing a section of a learning program. Your job is to generate exactly 5 learning events for that section.

Each event must follow this pedagogical arc:
1. executive_reality_check (student label: "Concept Snapshot") — Reality-check analysis grounding AI concepts in operational reality
2. ai_strategy (student label: "AI Strategy") — Strategic framework defining AI vs human decision boundaries
3. prompt_template (student label: "Prompt Template") — Hands-on prompt engineering exercise producing a reusable template
4. implementation_task (student label: "Implementation Task") — Practical assessment building a real deliverable
5. knowledge_check (student label: "Knowledge Check") — Scenario-based assessment validating comprehension

Return ONLY valid JSON in this exact format:
{
  "events": [
    { "type": "executive_reality_check", "student_label": "Concept Snapshot", "title": "...", "description": "...", "learning_goal": "..." },
    { "type": "ai_strategy", "student_label": "AI Strategy", "title": "...", "description": "...", "learning_goal": "..." },
    { "type": "prompt_template", "student_label": "Prompt Template", "title": "...", "description": "...", "learning_goal": "..." },
    { "type": "implementation_task", "student_label": "Implementation Task", "title": "...", "description": "...", "learning_goal": "..." },
    { "type": "knowledge_check", "student_label": "Knowledge Check", "title": "...", "description": "...", "learning_goal": "..." }
  ]
}

Requirements:
- Titles: concise (3-5 words), professional, specific to the section topic
- Descriptions: 1-2 sentences explaining what the learner will do
- Learning Goals: measurable outcomes starting with action verbs (Analyze, Design, Build, Evaluate, Assess)
- Events should build progressively on each other
- No markdown, no explanation — just the JSON object`;

const EXPECTED_TYPES = [
  'executive_reality_check',
  'ai_strategy',
  'prompt_template',
  'implementation_task',
  'knowledge_check',
];

export async function generateSectionStructure(structurePrompt: string): Promise<GeneratedEvent[]> {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: structurePrompt },
    ],
    temperature: 0.7,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content || '';
  const parsed = JSON.parse(raw);
  const events: GeneratedEvent[] = parsed.events;

  if (!Array.isArray(events) || events.length !== 5) {
    throw new Error('AI returned invalid structure: expected exactly 5 events');
  }

  for (const expectedType of EXPECTED_TYPES) {
    if (!events.find(e => e.type === expectedType)) {
      throw new Error(`Missing event type: ${expectedType}`);
    }
  }

  return events;
}

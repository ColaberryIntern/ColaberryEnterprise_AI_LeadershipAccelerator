import OpenAI from 'openai';
import LessonInstance from '../models/LessonInstance';
import CurriculumLesson from '../models/CurriculumLesson';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const MAX_ITERATIONS = 10;

interface PromptLabIteration {
  prompt: string;
  response: string;
  timestamp: string;
}

export async function executePromptLab(
  enrollmentId: string,
  lessonId: string,
  promptText: string
): Promise<{ response: string; iteration_count: number }> {
  const instance = await LessonInstance.findOne({
    where: { enrollment_id: enrollmentId, lesson_id: lessonId },
  });
  if (!instance) throw new Error('Lesson not started');

  const lesson = await CurriculumLesson.findByPk(lessonId);
  if (!lesson) throw new Error('Lesson not found');

  const content = instance.generated_content_json || {};
  if (content.content_version !== 'v2') {
    throw new Error('Prompt Lab is only available for v2 lessons');
  }

  const responses = instance.structured_responses_json || {};
  const history: PromptLabIteration[] = responses.prompt_lab || [];

  if (history.length >= MAX_ITERATIONS) {
    throw new Error(`Maximum ${MAX_ITERATIONS} prompt iterations reached for this lesson`);
  }

  const systemMessage = `You are an AI assistant helping an executive learner iterate on prompts for the topic: "${lesson.title}".

The learner is working through the AI-Native Learning System. Their current lesson covers:
${lesson.description}

The lesson's prompt template is:
${content.prompt_template?.template || 'No template available'}

Help the learner refine their prompt and provide a high-quality response. Be concise and practical.
If the prompt is unclear, suggest improvements. If it's good, execute it and show the result.`;

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemMessage },
  ];

  // Include last 3 iterations for context
  const recentHistory = history.slice(-3);
  for (const iter of recentHistory) {
    messages.push({ role: 'user', content: iter.prompt });
    messages.push({ role: 'assistant', content: iter.response });
  }
  messages.push({ role: 'user', content: promptText });

  const completion = await getOpenAI().chat.completions.create({
    model: MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 2000,
  });

  const aiResponse = completion.choices[0]?.message?.content || 'No response generated.';

  history.push({
    prompt: promptText,
    response: aiResponse,
    timestamp: new Date().toISOString(),
  });

  await instance.update({
    structured_responses_json: { ...responses, prompt_lab: history },
  });

  return { response: aiResponse, iteration_count: history.length };
}

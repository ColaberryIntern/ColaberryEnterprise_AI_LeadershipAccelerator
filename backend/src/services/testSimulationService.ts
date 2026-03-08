import OpenAI from 'openai';
import CurriculumLesson from '../models/CurriculumLesson';
import { MiniSection, PromptTemplate, ProgramBlueprint } from '../models';
import CurriculumModule from '../models/CurriculumModule';
import TestSimulationResult from '../models/TestSimulationResult';
import * as variableService from './variableService';
import { buildCompositePromptForSimulation } from './contentGenerationService';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

export interface TestProfile {
  industry: string;
  company_name: string;
  role: string;
  ai_maturity_level: number;
  goal: string;
  company_size?: string;
  identified_use_case?: string;
}

export interface SimulationResult {
  id: string;
  content: Record<string, any> | null;
  promptUsed: { system: string; user: string };
  tokenCount: number;
  durationMs: number;
  modelUsed: string;
  status: 'completed' | 'failed';
  error?: string;
}

/**
 * Execute a test simulation: build the composite prompt with a mock profile,
 * call the LLM, and store the result for audit.
 */
export async function simulateContentGeneration(
  lessonId: string,
  testProfile: TestProfile,
  testVariables: Record<string, string>,
  adminUserId?: string
): Promise<SimulationResult> {
  const startTime = Date.now();

  // Load lesson with module
  const lesson = await CurriculumLesson.findByPk(lessonId, {
    include: [{ model: CurriculumModule, as: 'module' }],
  });
  if (!lesson) throw new Error('Lesson not found');

  // Load mini-sections
  const miniSections = await MiniSection.findAll({
    where: { lesson_id: lessonId, is_active: true },
    include: [
      { model: PromptTemplate, as: 'conceptPrompt' },
      { model: PromptTemplate, as: 'buildPrompt' },
      { model: PromptTemplate, as: 'mentorPrompt' },
    ],
    order: [['mini_section_order', 'ASC']],
  });

  if (miniSections.length === 0) {
    throw new Error('No active mini-sections found for this lesson');
  }

  // Build personalization context from test profile
  const personalizationParts: string[] = [];
  if (testProfile.company_name) personalizationParts.push(`Company: ${testProfile.company_name}`);
  if (testProfile.industry) personalizationParts.push(`Industry: ${testProfile.industry}`);
  if (testProfile.company_size) personalizationParts.push(`Company Size: ${testProfile.company_size}`);
  if (testProfile.role) personalizationParts.push(`Role: ${testProfile.role}`);
  if (testProfile.goal) personalizationParts.push(`Goal: ${testProfile.goal}`);
  if (testProfile.ai_maturity_level) personalizationParts.push(`AI Maturity Level: ${testProfile.ai_maturity_level}/5`);
  if (testProfile.identified_use_case) personalizationParts.push(`Identified Use Case: ${testProfile.identified_use_case}`);

  // Add test variables
  for (const [key, value] of Object.entries(testVariables)) {
    personalizationParts.push(`${key}: ${value}`);
  }

  const personalizationContext = personalizationParts.join('\n');

  // Build composite prompt (uses exported function)
  const { systemPrompt, userPrompt } = await buildCompositePromptForSimulation(
    lesson,
    miniSections,
    personalizationContext,
    testVariables
  );

  // Create pending record
  const simRecord = await TestSimulationResult.create({
    id: undefined as any, // auto-generated
    lesson_id: lessonId,
    admin_user_id: adminUserId || null,
    test_profile_json: testProfile,
    test_variables_json: testVariables,
    composite_prompt_text: `SYSTEM:\n${systemPrompt}\n\nUSER:\n${userPrompt}`,
    model_used: MODEL,
    status: 'pending',
    generated_content_json: null,
    token_count: null,
    duration_ms: null,
    error_message: null,
  });

  try {
    const response = await getOpenAI().chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content || '{}';
    const tokenCount = response.usage?.total_tokens || 0;
    const durationMs = Date.now() - startTime;

    let content: Record<string, any>;
    try {
      content = JSON.parse(raw);
    } catch {
      content = { raw_response: raw };
    }

    // Update record
    await simRecord.update({
      generated_content_json: content,
      token_count: tokenCount,
      duration_ms: durationMs,
      status: 'completed',
    });

    return {
      id: simRecord.id,
      content,
      promptUsed: { system: systemPrompt, user: userPrompt },
      tokenCount,
      durationMs,
      modelUsed: MODEL,
      status: 'completed',
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    await simRecord.update({
      status: 'failed',
      error_message: err.message,
      duration_ms: durationMs,
    });

    return {
      id: simRecord.id,
      content: null,
      promptUsed: { system: systemPrompt, user: userPrompt },
      tokenCount: 0,
      durationMs,
      modelUsed: MODEL,
      status: 'failed',
      error: err.message,
    };
  }
}

/**
 * List past simulation results for a lesson.
 */
export async function listSimulations(lessonId: string): Promise<TestSimulationResult[]> {
  return TestSimulationResult.findAll({
    where: { lesson_id: lessonId },
    order: [['created_at', 'DESC']],
    limit: 20,
  });
}

/**
 * Delete a simulation result.
 */
export async function deleteSimulation(id: string): Promise<void> {
  const record = await TestSimulationResult.findByPk(id);
  if (!record) throw new Error('Simulation not found');
  await record.destroy();
}

import { PromptTemplate } from '../models';
import * as variableService from './variableService';
import OpenAI from 'openai';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export async function listPromptTemplates(filters?: {
  prompt_type?: string;
  is_active?: boolean;
}): Promise<PromptTemplate[]> {
  const where: any = {};
  if (filters?.prompt_type) where.prompt_type = filters.prompt_type;
  if (filters?.is_active !== undefined) where.is_active = filters.is_active;

  return PromptTemplate.findAll({ where, order: [['name', 'ASC']] });
}

export async function getPromptTemplate(id: string): Promise<PromptTemplate | null> {
  return PromptTemplate.findByPk(id);
}

export async function createPromptTemplate(data: Partial<PromptTemplate>): Promise<PromptTemplate> {
  return PromptTemplate.create(data as any);
}

export async function updatePromptTemplate(
  id: string,
  data: Partial<PromptTemplate>
): Promise<PromptTemplate | null> {
  const template = await PromptTemplate.findByPk(id);
  if (!template) return null;
  await template.update(data);
  return template;
}

export async function deletePromptTemplate(id: string): Promise<boolean> {
  const count = await PromptTemplate.destroy({ where: { id } });
  return count > 0;
}

export async function renderPrompt(
  templateId: string,
  enrollmentId: string
): Promise<{ systemPrompt: string; userPrompt: string } | null> {
  const template = await PromptTemplate.findByPk(templateId);
  if (!template) return null;

  const systemPrompt = template.system_prompt
    ? await variableService.resolveTemplate(enrollmentId, template.system_prompt)
    : '';

  const userPrompt = template.user_prompt_template
    ? await variableService.resolveTemplate(enrollmentId, template.user_prompt_template)
    : '';

  return { systemPrompt, userPrompt };
}

export async function executePrompt(
  templateId: string,
  enrollmentId: string,
  additionalContext?: string
): Promise<{ response: string; tokensUsed: number } | null> {
  const rendered = await renderPrompt(templateId, enrollmentId);
  if (!rendered) return null;

  const template = await PromptTemplate.findByPk(templateId);
  if (!template) return null;

  const messages: any[] = [];
  if (rendered.systemPrompt) {
    messages.push({ role: 'system', content: rendered.systemPrompt });
  }

  let userContent = rendered.userPrompt;
  if (additionalContext) {
    userContent += '\n\n' + additionalContext;
  }
  messages.push({ role: 'user', content: userContent });

  const completion = await getOpenAI().chat.completions.create({
    model: template.model_id || 'gpt-4o-mini',
    messages,
    temperature: template.temperature || 0.7,
    max_tokens: template.max_tokens || 1024,
  });

  const response = completion.choices[0]?.message?.content || '';
  const tokensUsed = completion.usage?.total_tokens || 0;

  return { response, tokensUsed };
}

export async function previewPrompt(
  templateId: string,
  sampleVariables: Record<string, string>
): Promise<{ systemPrompt: string; userPrompt: string } | null> {
  const template = await PromptTemplate.findByPk(templateId);
  if (!template) return null;

  let systemPrompt = template.system_prompt || '';
  let userPrompt = template.user_prompt_template || '';

  for (const [key, value] of Object.entries(sampleVariables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    systemPrompt = systemPrompt.replace(regex, value);
    userPrompt = userPrompt.replace(regex, value);
  }

  return { systemPrompt, userPrompt };
}

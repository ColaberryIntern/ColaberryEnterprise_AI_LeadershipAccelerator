import { z } from 'zod';
import { callLLMWithAudit } from '../../llmCallWrapper';
import { COMMS_HUB_LLM_NAMESPACE } from '../eventDescribe';
import { TEMPLATES, type TemplateId } from './templateSvg';
import { STYLE_FAMILIES, type StyleFamily } from './stylePrompts';
import { THUMBNAIL_CHANGE_SYSTEM, thumbnailChangeUserPrompt } from './prompts/thumbnailChangePrompt';

/**
 * "Ask for a change" (CH4.4): the organizer says in words what to change, a small model turns it into
 * edits of the things the studio controls (the text, the date line, the template, the AI style, a short
 * note on the look), and code applies them by generating a new option. The model never draws and never
 * writes the picture text on its own: anything it returns is validated here and guarded again before
 * generation. When the request does not map to those edits, the organizer is told so in plain words.
 */
export const CHANGE_MODEL = 'gpt-4o-mini';

export interface ChangeBase { source: 'template' | 'ai'; style: TemplateId | StyleFamily; headline: string; supporting: string | null; showWhen: boolean }
export interface ChangePlan { style: TemplateId | StyleFamily; headline: string; supporting: string | null; showWhen: boolean; artNote: string | null; summary: string }

export class ChangeNotUnderstoodError extends Error {}

const NOT_UNDERSTOOD = 'I could not turn that into a change to this picture. Try something like "shorter headline", "use the white template", or "make the background brighter".';

const Reply = z.object({
  understood: z.boolean(),
  headline: z.string().trim().min(1).max(80).optional(),
  supporting: z.string().trim().max(120).nullable().optional(),
  show_when: z.boolean().optional(),
  template: z.enum(TEMPLATES as [TemplateId, ...TemplateId[]]).optional(),
  style: z.enum(STYLE_FAMILIES as [StyleFamily, ...StyleFamily[]]).optional(),
  art_note: z.string().trim().min(3).max(200).optional(),
  summary: z.string().trim().min(3).max(200),
}).passthrough();

/** Apply a validated reply to the base option. Pure, so every rule is tested without a model. */
export function planFrom(base: ChangeBase, reply: unknown): ChangePlan {
  const r = Reply.safeParse(reply);
  if (!r.success || !r.data.understood) throw new ChangeNotUnderstoodError(NOT_UNDERSTOOD);
  const d = r.data;
  let style: TemplateId | StyleFamily = base.style;
  if (base.source === 'template') {
    if (d.style) throw new ChangeNotUnderstoodError('That asks for an AI look. Pick an AI style above and generate, or ask for a different template.');
    if (d.art_note && !d.template && d.headline === undefined && d.supporting === undefined && d.show_when === undefined) {
      throw new ChangeNotUnderstoodError('Templates have a fixed look. Ask for a different template or different words, or pick an AI style above.');
    }
    if (d.template) style = d.template;
  } else {
    if (d.template) throw new ChangeNotUnderstoodError('That asks for a template. Pick "Branded templates" above and generate.');
    if (d.style) style = d.style;
  }
  const plan: ChangePlan = {
    style,
    headline: d.headline ?? base.headline,
    supporting: d.supporting === undefined ? base.supporting : (d.supporting || null),
    showWhen: d.show_when ?? base.showWhen,
    artNote: base.source === 'ai' ? d.art_note ?? null : null,
    summary: d.summary,
  };
  const changed = plan.style !== base.style || plan.headline !== base.headline || plan.supporting !== base.supporting || plan.showWhen !== base.showWhen || plan.artNote !== null;
  if (!changed) throw new ChangeNotUnderstoodError(NOT_UNDERSTOOD);
  return plan;
}

export async function planChange(base: ChangeBase, request: string): Promise<ChangePlan> {
  const result = await callLLMWithAudit({
    lessonId: COMMS_HUB_LLM_NAMESPACE,
    generationType: 'admin_structure',
    step: 'comms_hub_thumbnail_change',
    systemPrompt: THUMBNAIL_CHANGE_SYSTEM,
    userPrompt: thumbnailChangeUserPrompt(base, request),
    model: CHANGE_MODEL,
    temperature: 0,
    maxTokens: 300,
    responseFormat: { type: 'json_object' },
    // The same words on a different picture mean a different change; never reuse a cached answer.
    force: true,
  });
  let parsed: unknown;
  try { parsed = JSON.parse(result.content); } catch { throw new ChangeNotUnderstoodError(NOT_UNDERSTOOD); }
  return planFrom(base, parsed);
}

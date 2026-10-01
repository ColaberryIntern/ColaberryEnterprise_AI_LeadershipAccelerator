import type { PresentationTemplate } from './templateContract';
import { CORE_TEMPLATES } from './templatesCore';
import { EXTENDED_TEMPLATES } from './templatesExtended';

export type { PresentationTemplate, TemplateBeat, TemplateExample, RubricDimension } from './templateContract';
export { validateTemplate, validateTemplates } from './templateContract';

/**
 * All seven presentation templates.
 *
 * Order matters for the student chooser: the four prominent ones come first, which is
 * what the spec asks for, and `prominent` is carried on each template so the UI does
 * not have to rely on array position.
 *
 * Split across two files purely for CLAUDE.md's 500-line ceiling — `templatesCore.ts`
 * holds the four prominent templates and `templatesExtended.ts` the other three. They
 * share one contract and one rubric shape, so a student's score means the same thing
 * whichever template they picked.
 */
export const PRESENTATION_TEMPLATES: readonly PresentationTemplate[] = [
  ...CORE_TEMPLATES,
  ...EXTENDED_TEMPLATES,
];

/** Template ids, as the per-card variant vocabulary. */
export const PRESENTATION_TEMPLATE_IDS: readonly string[] =
  PRESENTATION_TEMPLATES.map((t) => t.id);

export function templateById(id: string): PresentationTemplate | undefined {
  return PRESENTATION_TEMPLATES.find((t) => t.id === id);
}

/**
 * The default template for a required final demo. Instructor settings override this;
 * it exists so a cohort that has configured nothing still gets a sensible requirement
 * rather than no requirement at all.
 */
export const DEFAULT_REQUIRED_TEMPLATE_ID = 'final_showcase';

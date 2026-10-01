import { getOwnedProjectTree } from '../projects/projectReadService';
import type { ProjectTreeDto, ProjectTaskDto } from '../projects/projectTreeDto';
import { assemblePrompt, type AssembledPrompt, type PromptOptions, type PromptProjectContext } from './promptAssembly';
import { templateById, DEFAULT_REQUIRED_TEMPLATE_ID, type PresentationTemplate } from '.';

/**
 * Resolves a learner's presentation prompt from AUTHORIZED project context.
 *
 * The ownership check is the whole security story here, and it is deliberately the
 * same one the rest of the projects surface uses: `getOwnedProjectTree` compares the
 * project's `enrollment_id` against `req.participant.sub` and returns null otherwise.
 * The caller then 404s. Never 403 — `projectsPortalRoutes.ts` makes the point that a
 * 404 covers both "no such project" and "not yours", so probing another student's
 * project ids tells you nothing.
 *
 * Nothing here accepts project content from the client. Every value in the prompt is
 * read server-side from the learner's own stored project, which is what stops a
 * crafted request from putting words into the prompt it then gets back.
 */

/** Which template a prep task uses when nothing has been configured for it. */
const DEFAULT_TEMPLATE_BY_STORY: Record<string, string> = {
  'PREP-1': 'project_introduction',
  'PREP-2': 'working_system_demo',
  'PREP-3': 'ai_visual_presentation',
  'PREP-4': 'working_system_demo',
  'PREP-5': 'final_showcase',
  'PREP-6': 'final_showcase',
};

export function defaultTemplateIdFor(storyId: string | null | undefined): string {
  return (storyId && DEFAULT_TEMPLATE_BY_STORY[storyId]) || DEFAULT_REQUIRED_TEMPLATE_ID;
}

const isPrep = (t: ProjectTaskDto): boolean => /^PREP-\d+$/.test(t.story_id || '');

/**
 * Flattens the project tree into the narrow shape the assembler takes.
 *
 * Stories are the learner's PLAN stories, not their prep tasks — a presentation is
 * about the thing they built, and listing "Record a first run-through" as project
 * content would be circular.
 *
 * The evidence inventory is derived from what is actually complete. A task that is
 * merely planned is not evidence, and the assembler is explicitly told to label
 * anything absent rather than fill the gap.
 */
export function contextFromTree(tree: ProjectTreeDto): PromptProjectContext {
  const tasks: ProjectTaskDto[] = (tree.lists || []).flatMap((l) => l.tasks || []);
  const planStories = tasks.filter((t) => !isPrep(t) && Boolean(t.story_id));

  // A description is assembled from the stable project facts rather than invented.
  // Each part is omitted when absent, so the assembler sees a real gap as a gap.
  const descriptionParts = [tree.organization_name, tree.industry, tree.project_stage]
    .map((p) => (p || '').trim())
    .filter(Boolean);

  return {
    projectTitle: tree.name,
    projectDescription: descriptionParts.length ? descriptionParts.join(' · ') : null,
    ownerDisplayName: null, // Not exposed on the tree; the assembler renders "(not supplied)".
    stories: planStories.map((t) => ({ id: t.story_id, title: t.title, status: t.status })),
    evidence: planStories
      .filter((t) => t.status === 'complete')
      .map((t) => ({ label: t.title, status: 'complete' })),
  };
}

export interface PromptRequest {
  enrollmentId: string;
  projectId: string;
  /** PREP-n. Decides the default template when none is given. */
  storyId: string;
  templateId?: string | null;
  options?: PromptOptions;
}

export type PromptResult =
  | { ok: true; prompt: AssembledPrompt; template: PresentationTemplate }
  | { ok: false; reason: 'not_found' | 'unknown_template' };

export async function buildPresentationPrompt(req: PromptRequest): Promise<PromptResult> {
  const tree = await getOwnedProjectTree(req.enrollmentId, req.projectId);
  // Not owned, or no such project. Same answer either way, on purpose.
  if (!tree) return { ok: false, reason: 'not_found' };

  // The learner's Prepare answers, if they have made any. Read directly rather than
  // through getOrCreateAssignment: ownership is already established above, and a READ
  // of the prompt must not create a row as a side effect.
  //
  // Precedence is explicit request > saved Prepare answers > template default. The
  // request wins so an instructor or a "try another audience" control can override
  // without destroying what the learner saved.
  const { default: PresentationAssignment } = await import('../../models/PresentationAssignment');
  const saved = await PresentationAssignment.findOne({
    where: { project_id: req.projectId, story_id: req.storyId },
  });
  const savedChecklist = (saved?.checklist_json || {}) as Record<string, unknown>;

  const wanted = (req.templateId || '').trim()
    || (saved?.template_slug || '').trim()
    || defaultTemplateIdFor(req.storyId);
  const template = templateById(wanted);
  // An unknown template is rejected rather than silently swapped for the default:
  // quietly building the wrong presentation is worse than saying the id is wrong.
  if (!template) return { ok: false, reason: 'unknown_template' };

  const options: PromptOptions = {
    ...(req.options || {}),
    audience: req.options?.audience || saved?.audience || null,
    purpose: req.options?.purpose || (savedChecklist.purpose as string) || null,
  };

  const prompt = assemblePrompt(template, contextFromTree(tree), options);
  return { ok: true, prompt, template };
}

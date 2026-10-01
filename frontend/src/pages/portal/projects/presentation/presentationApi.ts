import portalApi from '../../../../utils/portalApi';

/**
 * Client for the Presentation Studio's read-only prompt endpoint.
 *
 * The client sends only the template id and presentation options. Every piece of
 * project content in the returned prompt is resolved server-side from the learner's
 * own project, so there is deliberately no way to pass project text in from here.
 */

export interface PresentationPromptResponse {
  prompt: string;
  template_id: string;
  template_version: number;
  template_label: string;
  speaking_seconds: number;
  qa_seconds: number;
  /** Fields the server could not fill — shown to the student rather than hidden. */
  missing: string[];
}

export interface PromptQuery {
  template?: string;
  audience?: string;
  purpose?: string;
  style?: string;
  theme?: string;
  presenters?: string;
}

/**
 * One template's authored lesson. Mirrors the backend `PresentationTemplate`; the
 * backend stays the single source of truth so the lesson a student reads and the
 * prompt their deck is built from can never drift apart.
 */
export interface TemplateLesson {
  id: string;
  label: string;
  prominent: boolean;
  defaultSeconds: number;
  qaSeconds: number;
  outcome: string;
  objective: string;
  expectedOutput: string;
  preface: string;
  structure: string[];
  strongExample: { text: string; why: string };
  weakExample: { text: string; why: string };
  timedOutline: Array<{ beat: string; seconds: number; say: string }>;
  vocabulary: Array<{ term: string; plain: string }>;
  prepare: string[];
  checklist: string[];
  practiceDrill: string;
  rubric: Array<{ dimension: string; weight: number; lookFor: string }>;
  reflection: string;
}

export async function fetchTemplateLesson(templateId: string): Promise<TemplateLesson> {
  const { data } = await portalApi.get<TemplateLesson>(
    `/api/portal/presentation-templates/${encodeURIComponent(templateId)}`,
  );
  return data;
}

/** The learner's saved Prepare answers for one task. */
export interface PresentationAssignment {
  storyId: string;
  templateId: string;
  templateLabel: string;
  audience: string | null;
  purpose: string | null;
  checklist: Record<string, boolean>;
  prepState: string;
  /** Checklist items for the selected template — the UI never invents its own. */
  checklistItems: string[];
}

export interface AssignmentPatchBody {
  template?: string;
  audience?: string | null;
  purpose?: string | null;
  checklist?: Record<string, boolean>;
}

const assignmentPath = (projectId: string, storyId: string) =>
  `/api/portal/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(storyId)}/presentation-assignment`;

export async function fetchAssignment(projectId: string, storyId: string): Promise<PresentationAssignment> {
  const { data } = await portalApi.get<PresentationAssignment>(assignmentPath(projectId, storyId));
  return data;
}

/**
 * Saves the learner's Prepare answers. The server derives `prepState` from what was
 * actually filled in, so the response is authoritative and replaces local state —
 * the client never decides it is ready.
 */
export async function saveAssignment(
  projectId: string,
  storyId: string,
  patch: AssignmentPatchBody,
): Promise<PresentationAssignment> {
  const { data } = await portalApi.patch<PresentationAssignment>(assignmentPath(projectId, storyId), patch);
  return data;
}

export async function fetchPresentationPrompt(
  projectId: string,
  storyId: string,
  query: PromptQuery = {},
): Promise<PresentationPromptResponse> {
  // Empty values are dropped rather than sent as blanks: the route's schema is
  // `.strict()` and the server treats an absent field as a real gap, which is the
  // signal we want rather than an empty string that looks supplied.
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    const t = (v || '').trim();
    if (t) params.set(k, t);
  }
  const qs = params.toString();
  const { data } = await portalApi.get<PresentationPromptResponse>(
    `/api/portal/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(storyId)}/presentation-prompt${qs ? `?${qs}` : ''}`,
  );
  return data;
}

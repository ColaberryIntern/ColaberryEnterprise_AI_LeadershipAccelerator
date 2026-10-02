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

/** One row of the template chooser. The full lesson is a separate, heavier read. */
export interface TemplateSummary {
  id: string;
  label: string;
  prominent: boolean;
  outcome: string;
  speaking_seconds: number;
  qa_seconds: number;
}

export async function fetchTemplates(): Promise<TemplateSummary[]> {
  const { data } = await portalApi.get<TemplateSummary[]>('/api/portal/presentation-templates');
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

/**
 * One practice take and the room it happens in. Mirrors the backend `SessionView`;
 * the backend stays the single source of truth.
 *
 * THERE IS NO URL FIELD HERE AND THAT IS DELIBERATE. The server returns
 * `meetingReady` only. Entitlement to join is re-checked at the moment a student
 * asks to join, so a link carried in a page payload would outlive the permission
 * that produced it.
 */
export interface PracticeSession {
  attemptId: string;
  attemptNo: number;
  mode: string;
  attemptState: string;
  recordingState: string;
  bookingId: string | null;
  roomId: string | null;
  title: string | null;
  startAt: string | null;
  endAt: string | null;
  timezone: string | null;
  bookingState: string | null;
  meetingReady: boolean;
  recordingPolicy: string | null;
}

const taskPath = (projectId: string, storyId: string, leaf: string) =>
  `/api/portal/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(storyId)}/${leaf}`;

export async function fetchPracticeSession(projectId: string, storyId: string): Promise<PracticeSession | null> {
  const { data } = await portalApi.get<{ session: PracticeSession | null }>(
    taskPath(projectId, storyId, 'presentation-session'),
  );
  return data.session;
}

export async function fetchPracticeSessions(projectId: string, storyId: string): Promise<PracticeSession[]> {
  const { data } = await portalApi.get<{ sessions: PracticeSession[] }>(
    taskPath(projectId, storyId, 'presentation-sessions'),
  );
  return data.sessions;
}

/**
 * The host is busy. Carries the truthful next-available instant so the student can
 * be told when they CAN practise, not only that they cannot now.
 */
export class SlotUnavailableError extends Error {
  readonly why: string;
  readonly nextAvailable: string | null;
  constructor(message: string, why: string, nextAvailable: string | null) {
    super(message);
    this.name = 'SlotUnavailableError';
    this.why = why;
    this.nextAvailable = nextAvailable;
  }
}

export interface StartPracticeBody {
  /** ISO-8601 instants. A naive local string would be read in the server's zone. */
  start_at: string;
  end_at: string;
  mode?: 'practice_solo' | 'practice_peer';
  new_attempt?: boolean;
}

export async function startPractice(
  projectId: string,
  storyId: string,
  body: StartPracticeBody,
): Promise<PracticeSession> {
  try {
    const { data } = await portalApi.post<PracticeSession>(
      taskPath(projectId, storyId, 'presentation-practice'),
      body,
    );
    return data;
  } catch (err: any) {
    // 409 is not a failure of the request — it is a real answer about the room.
    if (err?.response?.status === 409) {
      const d = err.response.data || {};
      throw new SlotUnavailableError(
        d.error || 'That time is already taken.',
        d.why || 'taken',
        d.next_available ?? null,
      );
    }
    throw err;
  }
}

/**
 * What a student must be told BEFORE they are inside a recorded call.
 * Mirrors the backend `LaunchBrief`.
 */
export interface LaunchBrief {
  whoCanSee: string;
  recordingAutomatic: boolean;
  recordingPolicy: string;
}

export interface LaunchResponse {
  join_url: string;
  attempt_id: string;
  brief: LaunchBrief;
}

/** The room is yours but not usable yet — a real state, not a failure. */
export class LaunchNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LaunchNotReadyError';
  }
}

/**
 * Asks for the join link at the moment of launching.
 *
 * A POST on purpose. The server re-checks room entitlement on this call, so the
 * link is never carried in a page payload where it would outlive the permission
 * that produced it.
 */
export async function launchPractice(
  projectId: string,
  storyId: string,
  attemptId: string,
): Promise<LaunchResponse> {
  try {
    const { data } = await portalApi.post<LaunchResponse>(
      taskPath(projectId, storyId, 'presentation-launch'),
      { attempt_id: attemptId },
    );
    return data;
  } catch (err: any) {
    const status = err?.response?.status;
    const message = err?.response?.data?.error;
    if (status === 409) throw new LaunchNotReadyError(message || 'The room is not ready yet.');
    if (status === 403) throw new Error(message || 'You are not authorized to join this session.');
    throw err;
  }
}

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
  /**
   * The learner's own ingested takes, earliest part first.
   *
   * `shareState` mirrors the server's view of how far this attempt has got towards
   * being public, so the panel can stop calling a take private once it is not.
   * Optional, and absent degrades to `private` — the safe direction to be wrong in
   * on a page about who can see your face.
   */
  recordings?: Array<{
    id: string;
    partNo: number;
    playbackUrl: string;
    shareState?: TakeShareState;
    /** What kind of presentation this take is; inherited from the task when unset. */
    presentationType?: string | null;
    presentationTypeLabel?: string | null;
    /** Where that answer came from, so the page never shows inherited as chosen. */
    typeSource?: 'take' | 'task' | 'unset';
    /** The live showcase, so the switch can turn sharing back off. */
    showcaseId?: string | null;
    viewCount?: number;
    viewLabel?: string;
  }>;
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

/**
 * A demo this learner has published, and how many people watched it.
 *
 * `viewLabel` is composed server-side rather than from `viewCount` here, so the
 * wording of "No views yet" lives in one place and cannot drift between the page
 * and anything else that reports the same number.
 */
export interface PublishedDemo {
  showcaseId: string;
  recordingId: string;
  audience: string;
  publishedAt: string | null;
  summary: string | null;
  durationSeconds: number | null;
  viewCount: number;
  viewLabel: string;
  /** Already carries its own signed ticket: a <video> cannot send a bearer. */
  playbackUrl: string;
}

export async function fetchPublished(projectId: string, storyId: string): Promise<PublishedDemo[]> {
  const { data } = await portalApi.get<{ published: PublishedDemo[] }>(
    taskPath(projectId, storyId, 'published'),
  );
  return data?.published ?? [];
}

/**
 * Take a published demo down. Needs nobody's approval — see the route comment.
 */
export async function withdrawPublished(
  projectId: string,
  storyId: string,
  showcaseId: string,
): Promise<void> {
  await portalApi.post(
    `${taskPath(projectId, storyId, 'published')}/${encodeURIComponent(showcaseId)}/withdraw`,
  );
}

/**
 * How far a take has got from "only mine" towards "my cohort is watching it".
 *
 * Three states, because the middle one is what a student gets wrong: having asked
 * to share, they must not believe it is already public, nor that nothing happened.
 */
export type TakeShareState = 'private' | 'pending' | 'published';

/** The server could not use this summary, and said why. */
export class ShareRejectedError extends Error {
  notices: string[];
  constructor(message: string, notices: string[]) {
    super(message);
    this.name = 'ShareRejectedError';
    this.notices = notices;
  }
}

/**
 * Ask staff to publish this take to the cohort.
 *
 * The learner's half of the publish chain: this records THEIR approval and nothing
 * else. A staff member still has to agree before anybody can watch it, which is why
 * the result says `awaiting` rather than anything resembling "done".
 */
export async function requestShare(
  projectId: string,
  storyId: string,
  attemptId: string,
  recordingId: string,
  summary: string,
): Promise<{ showcaseId: string; created: boolean }> {
  try {
    const { data } = await portalApi.post<{ showcase_id: string; created: boolean }>(
      taskPath(projectId, storyId, 'showcase'),
      { attempt_id: attemptId, recording_id: recordingId, summary },
    );
    return { showcaseId: data.showcase_id, created: data.created };
  } catch (err: any) {
    // 422 is the grounding check refusing a summary that claims something the
    // project does not support. Its notices are the actionable part and must reach
    // the learner rather than collapsing into "something went wrong".
    if (err?.response?.status === 422) {
      throw new ShareRejectedError(
        err.response.data?.error || 'That summary needs fixing before it can be shared.',
        err.response.data?.notices || [],
      );
    }
    throw err;
  }
}

/** One option in the take-type chooser. Served, never hardcoded in the page. */
export interface PresentationTypeOption {
  id: string;
  label: string;
  prominent: boolean;
  defaultSeconds: number;
}

export async function fetchPresentationTypes(): Promise<PresentationTypeOption[]> {
  const { data } = await portalApi.get<{ types: PresentationTypeOption[] }>(
    '/api/portal/presentation-types',
  );
  return data?.types ?? [];
}

/** Classify one take. The server proves ownership inside its UPDATE. */
export async function setTakeType(
  projectId: string,
  storyId: string,
  recordingId: string,
  presentationType: string,
): Promise<void> {
  await portalApi.post(
    `${taskPath(projectId, storyId, 'recordings')}/${encodeURIComponent(recordingId)}/type`,
    { presentation_type: presentationType },
  );
}

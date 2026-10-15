/**
 * A handed-in rehearsal, expressed as a portfolio artifact.
 *
 * WHY BOTH STORES EXIST, since the obvious reading is that one is redundant.
 *
 * `runtime_portfolio_artifacts` answers "what did this learner make". It has no
 * audience, no approval and no publication state — every other output on the
 * platform lands there (case studies, cert evidence, the classroom portfolio rail),
 * and `kind` already listed `presentation` before anything wrote one.
 *
 * `presentation_showcases` answers "who may see it, and has anyone signed off". It
 * carries audience, the author's approval, staff's approval, publication and
 * withdrawal. That is a consent workflow, not a second copy of the work.
 *
 * So a recording becomes an ARTIFACT the moment it is handed in — it is the
 * learner's own record of their own work and needs nobody's permission to exist —
 * and a SHOWCASE only if they later choose to show it to someone. Before this,
 * neither happened: a handed-in recording earned points and then appeared nowhere.
 *
 * THE ARTIFACT HOLDS A REFERENCE, NEVER THE VIDEO. Bytes stay on disk behind the
 * ticketed playback route, so portfolio visibility never becomes video visibility
 * by accident. An artifact a stranger can read still cannot be watched.
 *
 * This module is pure: inputs in, a row shape out. Writing it is `recordPresentationArtifact`.
 */

export const PRESENTATION_ARTIFACT_KIND = 'presentation';

export interface PresentationArtifactInput {
  /** `recording:<attemptId>` — the same namespaced ref frozen onto the task row. */
  recordingRef: string;
  storyId: string;
  projectName: string | null;
  taskTitle: string | null;
  attemptNo: number | null;
  durationSeconds: number | null;
  hasAudio: boolean | null;
  hasSharedScreen: boolean | null;
  mode: string | null;
  recordedAt: string | null;
}

export interface PresentationArtifactRow {
  title: string;
  summary: string | null;
  content: Record<string, unknown>;
  competencies: string[];
}

/** mm:ss, or null when the length is unknown — never a guessed "0:00". */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * The one-line summary a reader sees in a portfolio list.
 *
 * States only what is known. A take whose length Zoom never reported says nothing
 * about its length rather than claiming zero, for the same reason the capture flags
 * distinguish `null` from `false`: a confident wrong fact is worse than a gap.
 */
export function summarize(input: PresentationArtifactInput): string {
  const parts: string[] = [];
  const dur = formatDuration(input.durationSeconds);
  if (dur) parts.push(`${dur} recorded rehearsal`);
  else parts.push('Recorded rehearsal');
  if (input.projectName) parts.push(`of ${input.projectName}`);
  // Only mention the screen when we actually know. Silence is not absence.
  if (input.hasSharedScreen === true) parts.push('with the demo on screen');
  else if (input.hasSharedScreen === false) parts.push('camera only, no demo on screen');
  return `${parts.join(' ')}.`;
}

export function buildPresentationArtifact(input: PresentationArtifactInput): PresentationArtifactRow {
  const title = input.taskTitle?.trim()
    || (input.projectName ? `${input.projectName} — rehearsal` : 'Recorded rehearsal');

  return {
    title: title.slice(0, 400),
    summary: summarize(input),
    content: {
      // The reference, not the file. See the note at the top of this module.
      recordingRef: input.recordingRef,
      storyId: input.storyId,
      attemptNo: input.attemptNo,
      durationSeconds: input.durationSeconds,
      // Carried through as tri-state. A reader can tell "we know there was no
      // audio" from "nobody ever told us", which a boolean would flatten.
      hasAudio: input.hasAudio,
      hasSharedScreen: input.hasSharedScreen,
      mode: input.mode,
      recordedAt: input.recordedAt,
      projectName: input.projectName,
    },
    // Claimed because the learner demonstrably did the thing, not because a model
    // inferred it: they prepared a presentation and delivered it out loud.
    competencies: ['communication', 'presentation'],
  };
}

/**
 * File the artifact. Returns its id, whether this call created it or found it.
 *
 * `ON CONFLICT DO NOTHING` against the partial unique index on
 * `(content->>'recordingRef') WHERE kind = 'presentation'` — a constraint rather
 * than a read-then-write, because the hand-in path is retryable and two requests
 * must not both win. The follow-up SELECT is what makes the second caller get the
 * existing id instead of null.
 *
 * NEVER THROWS INTO THE HAND-IN. Filing a portfolio copy is a consequence of
 * handing in, not a precondition for it: a learner who has earned their points
 * must not lose them because this failed. The caller logs and carries on.
 */
export async function recordPresentationArtifact(
  enrollmentId: string,
  input: PresentationArtifactInput,
): Promise<{ id: string; created: boolean } | null> {
  const { sequelize } = await import('../../config/database');
  const row = buildPresentationArtifact(input);

  const [inserted] = await sequelize.query(
    `INSERT INTO runtime_portfolio_artifacts
       (enrollment_id, kind, title, summary, content, competencies)
     VALUES (:eid, :kind, :title, :summary, CAST(:content AS jsonb), CAST(:competencies AS jsonb))
     ON CONFLICT ((content->>'recordingRef')) WHERE kind = 'presentation' DO NOTHING
     RETURNING id`,
    {
      replacements: {
        eid: enrollmentId,
        kind: PRESENTATION_ARTIFACT_KIND,
        title: row.title,
        summary: row.summary,
        content: JSON.stringify(row.content),
        competencies: JSON.stringify(row.competencies),
      },
    },
  ) as [Array<{ id: string }>, unknown];

  if (inserted?.length) return { id: String(inserted[0].id), created: true };

  // Already filed. Hand back the one that exists so the caller can reference it.
  const [found] = await sequelize.query(
    `SELECT id FROM runtime_portfolio_artifacts
      WHERE kind = :kind AND content->>'recordingRef' = :ref
      LIMIT 1`,
    { replacements: { kind: PRESENTATION_ARTIFACT_KIND, ref: input.recordingRef } },
  ) as [Array<{ id: string }>, unknown];

  return found?.length ? { id: String(found[0].id), created: false } : null;
}

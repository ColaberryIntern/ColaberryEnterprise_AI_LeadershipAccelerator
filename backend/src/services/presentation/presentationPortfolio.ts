import { PRESENTATION_TEMPLATES } from './index';

/**
 * THE SEVEN SLOTS — one per presentation type, filled or empty.
 *
 * Steps 5 and 6 were both placeholders that read and wrote nothing. This replaces
 * them with the thing a learner actually accumulates: a portfolio with one video
 * per kind of presentation, and a visible hole where each missing one goes.
 *
 * ALWAYS SEVEN, ALWAYS IN TEMPLATE ORDER. The empty slots are the point — they are
 * what tells a learner there are six more kinds of presentation to practise, and
 * clicking one is how they start it. A grid that only showed what exists would
 * make an empty portfolio look finished.
 *
 * A TYPE IS "DONE" WHEN ANY INGESTED RECORDING CARRIES IT. Not when a showcase is
 * published, and not when staff have approved anything: the portfolio is about
 * what the learner has made, which is a different question from who may see it.
 * Sharing is per video and lives on the slot.
 *
 * THE LATEST TAKE REPRESENTS THE SLOT, with the count beside it. A learner who
 * recorded a type four times has one portfolio entry and four takes, and the most
 * recent is almost always the one they would want shown.
 */

async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

export interface PortfolioSlot {
  typeId: string;
  typeLabel: string;
  /** "90s", "7 min + 3 min Q&A" — the timing the Learn card shows. */
  timing: string;
  description: string;
  prominent: boolean;
  recorded: boolean;
  /** Everything below is null on an empty slot. */
  recordingId: string | null;
  takeCount: number;
  durationSeconds: number | null;
  recordedAt: string | null;
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  downloadUrl: string | null;
  shareState: 'private' | 'pending' | 'published';
  showcaseId: string | null;
  viewCount: number;
  viewLabel: string;
}

export interface Portfolio {
  slots: PortfolioSlot[];
  recordedTypeCount: number;
  totalTypes: number;
  /** The first missing type, for the "Start the next one" link. Null when complete. */
  nextTypeId: string | null;
  reflectionNotes: string | null;
  /**
   * What recording one more type is worth, so an empty slot can say so before a
   * learner commits to doing it.
   *
   * Zero when the rate is unpriced or awards are switched off, and the UI shows
   * no badge at all in that case rather than "0 pts" — the same fail-closed rule
   * `prepPoints` states for an unpriced task.
   */
  perTypeBuilderXp: number;
}

/** "5 min + 2 min Q&A", or "90s" for anything under two minutes. */
function timingLabel(speakingSeconds: number, qaSeconds: number): string {
  const main = speakingSeconds < 120
    ? `${speakingSeconds}s`
    : `${Math.round(speakingSeconds / 60)} min`;
  return qaSeconds > 0 ? `${main} + ${Math.round(qaSeconds / 60)} min Q&A` : main;
}

/**
 * The learner's portfolio for one task.
 *
 * ONE QUERY FOR EVERY TAKE, then grouped in memory. Seven per-type queries would
 * be seven round trips to draw one screen, and the row count here is a handful.
 */
export async function getPortfolio(
  enrollmentId: string,
  projectId: string,
  storyId: string,
): Promise<Portfolio | null> {
  const sequelize = await db();

  const [assignments] = await sequelize.query(
    `SELECT asg.id, asg.template_slug,
            (SELECT a.reflection_notes
               FROM presentation_attempts a
              WHERE a.assignment_id = asg.id AND a.reflection_notes IS NOT NULL
              ORDER BY a.updated_at DESC LIMIT 1) AS reflection_notes
       FROM presentation_assignments asg
      WHERE asg.enrollment_id = :enrollmentId
        AND asg.project_id    = :projectId
        AND asg.story_id      = :storyId
      LIMIT 1`,
    { replacements: { enrollmentId, projectId, storyId } },
  ) as [Array<Record<string, any>>, unknown];

  const assignment = assignments?.[0];
  // Not their task, or no such task. Indistinguishable on purpose.
  if (!assignment) return null;

  const [rows] = await sequelize.query(
    `SELECT r.id                AS recording_id,
            r.presentation_type,
            r.duration_seconds,
            r.created_at,
            s.id                AS showcase_id,
            s.published_at,
            s.withdrawn_at
       FROM presentation_recordings  r
       JOIN presentation_attempts    a ON a.id = r.attempt_id
       LEFT JOIN presentation_showcases s
              ON s.recording_id = r.id AND s.withdrawn_at IS NULL
      WHERE a.assignment_id = :assignmentId
        AND r.ingest_status = 'ingested'
      ORDER BY r.created_at DESC`,
    { replacements: { assignmentId: assignment.id } },
  ) as [Array<Record<string, any>>, unknown];

  const taskType = assignment.template_slug || null;
  // A take with no classification of its own inherits the task's, exactly as the
  // Practice panel resolves it. One rule, so the grid and the chooser agree.
  const effective = (r: Record<string, any>): string | null =>
    r.presentation_type || taskType || null;

  const byType = new Map<string, Array<Record<string, any>>>();
  for (const r of rows || []) {
    const t = effective(r);
    if (!t) continue;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(r);
  }

  const { viewCounts, describeViews } = await import('./recordingViews');
  const { createRecordingTicket } = await import('./recordingTicket');
  const { recordedTypeRate } = await import('./presentationRecordingPoints');
  const counts = await viewCounts((rows || []).map((r) => String(r.recording_id)));
  const rate = await recordedTypeRate();

  const slots: PortfolioSlot[] = PRESENTATION_TEMPLATES.map((t) => {
    const takes = byType.get(t.id) || [];
    // Newest first from the query, so the head is the latest take.
    const latest = takes[0];
    const base = latest
      ? `/api/portal/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(storyId)}/recordings/${encodeURIComponent(String(latest.recording_id))}`
      : null;
    const ticket = latest
      ? encodeURIComponent(createRecordingTicket(String(latest.recording_id), enrollmentId))
      : null;
    const n = latest ? (counts[String(latest.recording_id)] ?? 0) : 0;

    return {
      typeId: t.id,
      typeLabel: t.label,
      timing: timingLabel(Number((t as any).defaultSeconds) || 0, Number((t as any).qaSeconds) || 0),
      description: (t as any).outcome || '',
      prominent: Boolean((t as any).prominent),
      recorded: takes.length > 0,
      recordingId: latest ? String(latest.recording_id) : null,
      takeCount: takes.length,
      durationSeconds: latest?.duration_seconds === null || latest?.duration_seconds === undefined
        ? null
        : Number(latest.duration_seconds),
      recordedAt: latest?.created_at ? new Date(latest.created_at).toISOString() : null,
      playbackUrl: base ? `${base}/file?t=${ticket}` : null,
      thumbnailUrl: base ? `${base}/thumbnail?t=${ticket}` : null,
      downloadUrl: base ? `${base}/download?t=${ticket}` : null,
      shareState: latest?.showcase_id
        ? (latest.published_at ? 'published' : 'pending')
        : 'private',
      showcaseId: latest?.showcase_id ? String(latest.showcase_id) : null,
      viewCount: n,
      viewLabel: describeViews(n),
    };
  });

  const recorded = slots.filter((s) => s.recorded);
  const missing = slots.filter((s) => !s.recorded);

  return {
    slots,
    recordedTypeCount: recorded.length,
    totalTypes: slots.length,
    nextTypeId: missing[0]?.typeId ?? null,
    reflectionNotes: assignment.reflection_notes ?? null,
    perTypeBuilderXp: rate.builder,
  };
}

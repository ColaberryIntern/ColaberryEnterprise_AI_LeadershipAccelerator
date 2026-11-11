/**
 * presentations - PURE. Interns' demo videos (Presentation Studio recordings) as artifacts, and
 * WHEN to move each intern to their next presentation.
 *
 * Ali, 10 Nov 2026: "they have the ability to create demo videos within their project. I want to
 * make sure that functionality of them completing the different presentation types at the correct
 * point ... I want to move them in that direction at the right time, ... those to show up as
 * artifacts of course recognized as a video and allow me to click and open up the video".
 *
 * The platform already defines the presentation ladder (services/presentation):
 *   PREP-1 project_introduction   PREP-2 working_system_demo   PREP-3 ai_visual_presentation
 *   PREP-4 stakeholder_update     PREP-5 final_showcase        PREP-6 Demo Day (live, no video)
 * and the build schedule gives each PREP task a due date (buildSchedule.ts prepTasks). So "the
 * right point" is not guessed here: it is the intern's own PREP due date. The next presentation is
 * the lowest PREP task that is neither verified nor already recorded, and it is asked for once it
 * is due within DUE_SOON_DAYS, or overdue. Earlier than that, nothing is asked.
 */
import { templateById } from '../../presentation';
import { DEMO_DAY_PREP_ID, PREP_TASK_VIDEO_TYPES } from '../../presentation/prepTaskVideoTypes';
import type { ArtifactAsk, ArtifactsView, PrepTask, RecordedVideo } from './types';

export const DUE_SOON_DAYS = 7;
const DAY = 86400000;
export const ADMIN_VIDEO_BASE = 'https://enterprise.colaberry.ai/admin/internship/video';

export const typeLabel = (typeId: string | null | undefined): string => (typeId ? templateById(typeId)?.label ?? typeId.replace(/_/g, ' ') : 'Presentation');
const mmss = (s: number | null | undefined): string => (s === null || s === undefined ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);

/** A take's type: its own classification, else the task's template (the Studio's own rule). */
const typeOf = (v: RecordedVideo): string | null => v.presentation_type || v.template_slug || null;

/** This intern's recorded videos as report artifacts, each opening the admin video viewer. */
export function videoArtifacts(enrollmentId: string, videos: RecordedVideo[]): ArtifactsView['published'] {
  return videos.filter((v) => v.enrollment_id === enrollmentId).map((v) => {
    const label = typeLabel(typeOf(v));
    const len = mmss(v.duration_seconds);
    return {
      id: v.recording_id,
      kind: 'presentation',
      title: `${label}${len ? ` (${len})` : ''}`,
      at: new Date(v.created_at).toISOString(),
      url: `${ADMIN_VIDEO_BASE}/${v.recording_id}`,
      source: 'recording' as const,
      provenance: `Presentation Studio${v.story_id ? `, ${v.story_id}` : ''}, take ${v.attempt_no ?? 1}${v.is_final_take ? ', final take' : ''}`,
      fileType: 'video' as const,
      repoPath: null,
      uploadName: null,
    };
  });
}

export interface PresentationDue {
  storyId: string;
  typeId: string | null;
  label: string;
  title: string;
  dueOn: string;
  /** Days past due; negative = days until due. */
  daysLate: number;
  demoDay: boolean;
}

/** Calendar days between two YYYY-MM-DD dates (b - a). */
const days = (a: string, b: string): number => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
const centralDay = (ms: number): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

/** The presentation this intern should be working toward right now, or null when none is due yet. */
export function presentationDue(enrollmentId: string, tasks: PrepTask[], videos: RecordedVideo[], nowMs: number): PresentationDue | null {
  const today = centralDay(nowMs);
  const mine = tasks.filter((t) => t.enrollment_id === enrollmentId && t.due_on);
  const recorded = new Set(videos.filter((v) => v.enrollment_id === enrollmentId).map(typeOf).filter(Boolean));
  const done = (t: PrepTask): boolean => !!t.verified_at || t.status === 'complete';
  const order = [...PREP_TASK_VIDEO_TYPES.map((x) => x.storyId), DEMO_DAY_PREP_ID];
  for (const storyId of order) {
    const t = mine.find((x) => x.story_id === storyId);
    if (!t || done(t)) continue;
    const typeId = PREP_TASK_VIDEO_TYPES.find((x) => x.storyId === storyId)?.typeId ?? null;
    if (typeId && recorded.has(typeId)) continue; // recorded, just not handed in: not the next one to record
    const dueOn = String(t.due_on).slice(0, 10);
    const daysLate = days(dueOn, today);
    if (daysLate < -DUE_SOON_DAYS) return null; // the next one is not due yet: too early to push
    return { storyId, typeId, label: typeId ? typeLabel(typeId) : 'Demo Day', title: t.title, dueOn, daysLate, demoDay: storyId === DEMO_DAY_PREP_ID };
  }
  return null;
}

/** The ask that moves them to it: a Claude Code prompt built from that type's own talk track. */
export function presentationAsk(firstName: string, projectName: string | null, d: PresentationDue): ArtifactAsk {
  const when = d.daysLate > 0 ? `was due ${d.daysLate} day${d.daysLate === 1 ? '' : 's'} ago (${d.dueOn})` : d.daysLate === 0 ? 'is due today' : `is due in ${-d.daysLate} day${d.daysLate === -1 ? '' : 's'} (${d.dueOn})`;
  if (d.demoDay) {
    return {
      key: 'presentation_demo_day', name: 'Demo Day rehearsal', theme: 'evidence',
      why: `Demo Day (${d.storyId}) ${when}; a rehearsed run-through is what makes the live presentation land.`,
      prompt: `Project: ${projectName ?? 'my internship project'}.\n\nHelp me prepare for Demo Day (${d.storyId}). Read this repo and my recorded presentations, then build ONE self-contained HTML page: a run sheet with the order of what I show, the exact screen for each step, timings, the one-sentence takeaway, and the three questions I am most likely to be asked with my answers. Use status colors and a simple timeline graphic. Export it to PDF (Chrome: Print > Save as PDF, background graphics on) and upload it as an artifact.`,
      nudge: `Hi ${firstName}, Demo Day ${when}. Please do a full rehearsal in the Presentation Studio this week, and paste the prompt below into Claude Code first to build your run sheet.`,
    };
  }
  const tpl = d.typeId ? templateById(d.typeId) : undefined;
  const beats = (tpl?.timedOutline ?? []).map((b) => `- ${b.beat} (${b.seconds}s): ${b.say}`).join('\n');
  const length = tpl?.defaultSeconds ? `${Math.round(tpl.defaultSeconds / 60 * 10) / 10} minutes` : 'the target length';
  return {
    key: `presentation_${d.storyId.toLowerCase().replace('-', '_')}`,
    // A recorded demo is something Ali can open and judge, so it is evidence.
    theme: 'evidence' as const,
    name: `Record your ${d.label}`,
    why: `${d.storyId}, the ${d.label}, ${when}. It is the next presentation in their project plan, and a recorded take is evidence you can watch in under ${length}.`,
    prompt: [
      `Project: ${projectName ?? 'my internship project'}.`,
      '',
      `Help me prepare my ${d.label} (${d.storyId}), which I will record in the Presentation Studio. ${tpl?.objective ?? ''}`.trim(),
      `Target length: ${length}. Follow this talk track:`,
      beats || '- Problem, what I built, how it works, what is next.',
      '',
      'Read this repo first, then build ONE self-contained HTML page: a slide for each beat above, visual first (screenshots, a before/after, one diagram, status colors), with my speaker notes and timing under each slide. Export it to PDF (Chrome: Print > Save as PDF, background graphics on), upload it as an artifact, and then record the take in the Presentation Studio.',
    ].join('\n'),
    nudge: `Hi ${firstName}, your ${d.label} (${d.storyId}) ${when}. Open the Presentation Studio in your project, book a practice room and record a take. Paste the prompt below into Claude Code first to build your talk track and slides.`,
  };
}

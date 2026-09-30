import type InternshipApplication from '../../models/InternshipApplication';
import { activeInternView, type ActiveInternView } from './internshipActivationService';
import { internActivity, type InternActivity } from './internshipActivityService';
import type { ChecklistStepStatus } from './internshipOnboarding';
import { deriveWeek3Handoff, type Week3Handoff } from './internshipWeek3Handoff';

/**
 * The student "My Internship" dashboard payload.
 *
 * Folds what the intern already gets (the active-intern view: checklist, single
 * next action, personal week, meetings, membership) with the activity signals that
 * were admin-only until now (weeks 1-3, project, cert, attendance). Everything is
 * enrollment-keyed and reused from existing services — no signal is recomputed
 * here, so the student dashboard and the manager's Activity view can never
 * disagree.
 *
 * ── ATTENTION, SPLIT BY WHOSE TURN IT IS ───────────────────────────────────
 * The plan's rule: a student must never see "waiting on Colaberry" as their own
 * overdue work. So the attention queue is split by the checklist's own `actor`,
 * which already records who completes each step. Waiting on us is not lateness.
 */
export interface AttentionItem {
  key: string;
  label: string;
  detail: string;
  waiting_on: string | null;
  blocking: boolean;
}

export interface AttentionQueue {
  /** Incomplete steps the STUDENT completes — their real to-do list. */
  your_turn: AttentionItem[];
  /** Incomplete steps COLABERRY completes — shown as "we're on it", never as late. */
  waiting_on_colaberry: AttentionItem[];
}

export interface InternDashboard extends ActiveInternView {
  activity: InternActivity;
  attention: AttentionQueue;
  /** Where the intern is in the Week-3 "your first Colaberry project" handoff, and
   *  whose move it is. Derived from their week and their active project's state. */
  handoff: Week3Handoff;
}

const toItem = (s: ChecklistStepStatus): AttentionItem => ({
  key: s.key,
  label: s.label,
  detail: s.detail,
  waiting_on: s.waiting_on,
  blocking: s.blocking_activation,
});

/**
 * Split the incomplete checklist by who owns each step. Pure, so the your-turn vs
 * waiting-on-us rule is tested without any I/O. Complete steps drop out entirely —
 * the queue is only what still needs doing.
 */
export function deriveAttentionQueue(checklist: readonly ChecklistStepStatus[]): AttentionQueue {
  const incomplete = checklist.filter((s) => !s.complete);
  return {
    your_turn: incomplete.filter((s) => s.actor === 'student').map(toItem),
    waiting_on_colaberry: incomplete.filter((s) => s.actor === 'colaberry').map(toItem),
  };
}

export async function internDashboard(application: InternshipApplication): Promise<InternDashboard> {
  const [view, activity] = await Promise.all([
    activeInternView(application),
    internActivity((application as any).enrollment_id),
  ]);
  return {
    ...view,
    activity,
    attention: deriveAttentionQueue(view.checklist),
    handoff: deriveWeek3Handoff(view.week, activity.project),
  };
}

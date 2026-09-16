import type { MilestoneLens } from '../../../services/onboardingApi';

/**
 * milestoneRows — the checklist behind the Points tab's "Program milestones"
 * tile, as plain data so it can be tested without rendering.
 *
 * Four program milestones (curriculum + three projects, any order) then the
 * certification. Each row says what it is, how far along, and — when not done —
 * the one thing to do next. Projects are listed in the order the student
 * started them; empty project slots up to three read "Start a build".
 */
export type RowState = 'done' | 'progress' | 'todo';

export interface MilestoneRow {
  key: string;
  label: string;
  detail: string;
  state: RowState;
  /** Where the row sends the student when clicked; null when nothing to do. */
  to: string | null;
}

export const PROJECT_SLOTS = 3;

export function milestoneRows(m: MilestoneLens): MilestoneRow[] {
  const rows: MilestoneRow[] = [];

  const c = m.curriculum;
  rows.push({
    key: 'curriculum',
    label: 'Curriculum complete',
    detail: c.complete
      ? `${c.total} of ${c.total} graded cards`
      : c.total > 0
        ? `${c.done} of ${c.total} graded cards${c.incomplete_weeks.length ? ` · short in week${c.incomplete_weeks.length > 1 ? 's' : ''} ${summariseWeeks(c.incomplete_weeks)}` : ''}`
        : 'No graded cards published yet',
    state: c.complete ? 'done' : c.done > 0 ? 'progress' : 'todo',
    to: c.complete ? null : '/portal/classroom',
  });

  const projects = [...m.projects].sort((a, b) => Number(b.complete) - Number(a.complete));
  for (let i = 0; i < PROJECT_SLOTS; i += 1) {
    const p = projects[i];
    if (p) {
      rows.push({
        key: `project:${p.id}`,
        label: `Project ${i + 1} — ${p.name}`,
        detail: `${p.verified} of ${p.total} stories verified`,
        state: p.complete ? 'done' : p.verified > 0 ? 'progress' : 'todo',
        to: p.complete ? null : '/portal/projects',
      });
    } else {
      rows.push({ key: `project:slot${i + 1}`, label: `Project ${i + 1}`, detail: 'Start a build', state: 'todo', to: '/portal/projects' });
    }
  }

  const cert = m.certification;
  rows.push({
    key: 'certification',
    label: 'Certification approved',
    detail: cert.status === 'approved'
      ? (cert.reviewed_by ? `Verified by ${cert.reviewed_by}` : 'Verified by staff')
      : cert.status === 'pending'
        ? 'Uploaded — waiting for staff review'
        : cert.status === 'rejected'
          ? 'Not accepted — upload again in Cert Prep'
          : 'Upload your certificate in Cert Prep',
    state: cert.status === 'approved' ? 'done' : cert.status === 'pending' ? 'progress' : 'todo',
    to: cert.status === 'approved' ? null : '/portal/cert-prep',
  });

  return rows;
}

/** Program milestones held, out of four — the number the tile leads with. */
export function milestonesHeld(m: MilestoneLens): number {
  return (m.curriculum.complete ? 1 : 0) + Math.min(PROJECT_SLOTS, m.projects_complete);
}

/** "9, 10, 11, 12" → "9–12"; "3, 7" → "3 and 7"; longer lists are cut with "…". */
export function summariseWeeks(weeks: number[]): string {
  const w = [...weeks].sort((a, b) => a - b);
  if (w.length === 0) return '';
  const contiguous = w.every((n, i) => i === 0 || n === w[i - 1] + 1);
  if (contiguous && w.length > 2) return `${w[0]}–${w[w.length - 1]}`;
  if (w.length <= 3) return w.join(w.length === 2 ? ' and ' : ', ');
  return `${w.slice(0, 3).join(', ')}…`;
}

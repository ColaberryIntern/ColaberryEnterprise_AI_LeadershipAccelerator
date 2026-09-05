import { getActiveProjectTree } from '../projects/projectReadService';
import { getCertAvailability } from '../certPrep/certAvailabilityService';
import { computeReadiness } from '../certPrep/certReadinessService';

/**
 * classroomProjection — what each owning surface says the student should do next.
 *
 * The Classroom week groups cards into the buckets they already carry. This is
 * the next step: a card in the `build` section should open the project's OWN
 * next story, and a card in `advance` should offer the cert track's OWN next
 * sitting — resolved when the page is requested, not authored into the week
 * months earlier.
 *
 * THE RULE THIS SERVICE EXISTS TO ENFORCE: a card is a projection, never a
 * copy. The moment a card holds its own idea of "your next story", it and the
 * project disagree, and the student believes whichever they saw last.
 *
 * EVERY SURFACE FAILS SOFT AND SEPARATELY. If the project service throws, the
 * build section falls back to the card as authored — which is a real card with
 * a real link, just less specific. It does NOT show a stale or invented next
 * action, and the surface is named in `degraded` so a quiet failure is a
 * countable one. A classroom week must not go blank because one subsystem is
 * having a bad afternoon.
 *
 * Scope note, honestly: this resolves the two surfaces that own DECISION cards
 * and already expose a next-step read — project and cert prep. Community and
 * Rooms own decision cards too, and are not resolved here yet; their cards keep
 * their authored behaviour and nothing about them is faked in the meantime.
 */

export type ProjectionSurface = 'project' | 'cert_prep';

export interface SurfaceNextAction {
  surface: ProjectionSurface;
  /** False when the surface has nothing to offer — with a reason, never a blank. */
  available: boolean;
  /** What to do, in the student's words. */
  headline: string;
  /** The context that makes it specific: which project, which domain. */
  detail: string | null;
  /** Where the card should send them. */
  href: string;
  /** Why there is nothing to do, when available is false. */
  reason?: string;
}

export interface ClassroomProjection {
  project: SurfaceNextAction | null;
  cert_prep: SurfaceNextAction | null;
  /** Surfaces that failed to resolve. Their cards fall back to authored state. */
  degraded: ProjectionSurface[];
  resolved_at: string;
}

/** Task states that mean "still to do". Anything else is not the next thing. */
const OPEN_TASK_STATUSES = new Set(['todo', 'pending', 'in_progress', 'blocked', 'open']);

/**
 * The next thing to build: the first open task in list order, which is the
 * order the project itself presents. Deliberately not "the oldest" or "the
 * highest priority" — the project has already decided the order and this must
 * not second-guess it from outside.
 */
export async function resolveProjectNext(enrollmentId: string): Promise<SurfaceNextAction> {
  const tree = await getActiveProjectTree(enrollmentId);

  if (!tree) {
    return {
      surface: 'project',
      available: false,
      headline: 'No project yet',
      detail: null,
      href: '/portal/projects',
      reason: 'no_active_project',
    };
  }

  const projectName = tree.name || 'your project';

  for (const list of tree.lists ?? []) {
    for (const task of list.tasks ?? []) {
      if (OPEN_TASK_STATUSES.has(String(task.status))) {
        return {
          surface: 'project',
          available: true,
          headline: task.title,
          detail: `${projectName} · ${list.title}`,
          href: `/portal/projects?open=${encodeURIComponent(tree.id)}`,
        };
      }
    }
  }

  return {
    surface: 'project',
    available: false,
    headline: `Nothing open in ${projectName}`,
    detail: null,
    href: `/portal/projects?open=${encodeURIComponent(tree.id)}`,
    reason: 'all_tasks_done',
  };
}

/**
 * The next sitting, and what it is for.
 *
 * The fence answer comes from `getCertAvailability`, which fails CLOSED — so a
 * student before Week 7 gets a dated explanation rather than a locked-looking
 * card, and an error gets the same treatment as "not yet" rather than
 * accidentally opening the lane.
 *
 * When a domain is measurably weakest, the next action names it. Readiness that
 * has not been measured says exactly that: no zero, no invented percentage.
 */
export async function resolveCertPrepNext(enrollmentId: string): Promise<SurfaceNextAction> {
  const availability = await getCertAvailability(enrollmentId);

  if (!availability.available) {
    const week = availability.startWeek;
    return {
      surface: 'cert_prep',
      available: false,
      headline: week ? `Certification preparation opens in Week ${week}` : 'Certification preparation is not open yet',
      detail: 'What you build before then becomes the evidence half of your readiness.',
      href: '/portal/cert-prep',
      reason: availability.reason,
    };
  }

  const readiness = await computeReadiness(enrollmentId);

  if (!readiness || readiness.answered_total === 0) {
    return {
      surface: 'cert_prep',
      available: true,
      headline: 'Take the baseline diagnostic',
      detail: 'Fifteen questions across five domains. Sets your first readiness estimate.',
      href: '/portal/cert-prep',
    };
  }

  // Weakest ANSWERED domain. A domain with no answers is not weak — it is
  // unmeasured, and drilling it on the strength of a number nobody has is the
  // same mistake as rendering it 0%.
  const answered = (readiness.domain_breakdown ?? []).filter((d) => d.answered > 0 && d.knowledge_pct != null);
  const weakest = answered.length
    ? answered.reduce((a, b) => ((a.knowledge_pct ?? 1) <= (b.knowledge_pct ?? 1) ? a : b))
    : null;

  if (weakest) {
    return {
      surface: 'cert_prep',
      available: true,
      headline: `Drill ${weakest.domain_id}`,
      detail: `${Math.round((weakest.knowledge_pct ?? 0) * 100)}% across ${weakest.answered} question${weakest.answered === 1 ? '' : 's'} so far`,
      href: '/portal/cert-prep',
    };
  }

  return {
    surface: 'cert_prep',
    available: true,
    headline: 'Practice across every domain',
    detail: 'Ten questions, mixed.',
    href: '/portal/cert-prep',
  };
}

/**
 * Resolve every surface, independently. One failing surface degrades its own
 * section and nothing else — hence `allSettled` rather than `all`, and hence
 * each resolver being separately exported and separately tested.
 */
export async function getClassroomProjection(enrollmentId: string): Promise<ClassroomProjection> {
  const [project, certPrep] = await Promise.allSettled([
    resolveProjectNext(enrollmentId),
    resolveCertPrepNext(enrollmentId),
  ]);

  const degraded: ProjectionSurface[] = [];
  if (project.status === 'rejected') degraded.push('project');
  if (certPrep.status === 'rejected') degraded.push('cert_prep');

  return {
    project: project.status === 'fulfilled' ? project.value : null,
    cert_prep: certPrep.status === 'fulfilled' ? certPrep.value : null,
    degraded,
    resolved_at: new Date().toISOString(),
  };
}

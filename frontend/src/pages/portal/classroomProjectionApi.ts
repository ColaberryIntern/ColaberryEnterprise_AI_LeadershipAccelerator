import portalApi from '../../utils/portalApi';

/**
 * What each owning surface says the student should do next.
 *
 * Fetched separately from the week's cards on purpose: the cards are cacheable
 * curriculum and this is live per-student state. Folding them together would
 * make the whole feed uncacheable to keep one line current.
 *
 * `degraded` names the surfaces that could not answer. Their sections fall back
 * to the card as authored — a real card with a real link, just less specific.
 * Nothing is invented to fill the gap.
 */

export type ProjectionSurface = 'project' | 'cert_prep';

export interface SurfaceNextAction {
  surface: ProjectionSurface;
  available: boolean;
  headline: string;
  detail: string | null;
  href: string;
  reason?: string;
}

export interface ClassroomProjection {
  project: SurfaceNextAction | null;
  cert_prep: SurfaceNextAction | null;
  degraded: ProjectionSurface[];
  resolved_at: string;
}

/** Which bucket each resolved surface belongs to. */
export const SURFACE_BY_BUCKET: Record<string, ProjectionSurface> = {
  build: 'project',
  advance: 'cert_prep',
};

export async function fetchClassroomProjection(): Promise<ClassroomProjection | null> {
  try {
    const { data } = await portalApi.get<ClassroomProjection>('/api/portal/classroom/projection');
    return data;
  } catch {
    // The week renders without it. A missing projection is a missing hint, not
    // a missing classroom.
    return null;
  }
}

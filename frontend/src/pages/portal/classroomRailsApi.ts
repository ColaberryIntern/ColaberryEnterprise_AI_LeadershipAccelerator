import portalApi from '../../utils/portalApi';

/**
 * Classroom rails — the client half of `/api/portal/classroom/rails`.
 *
 * Mirrors `backend/src/services/classroom/rails/types.ts`. Kept as a hand-written
 * mirror rather than a generated type because the two are reviewed together and
 * a silent shape drift should fail the build here, in the file a reviewer reads,
 * rather than at runtime in a student's week.
 */

export type RailSurface =
  | 'events' | 'project' | 'community' | 'rooms' | 'cert_prep' | 'portfolio' | 'timeline';

export interface RailAction {
  label: string;
  href: string;
  kind: 'primary' | 'quiet';
}

export interface RailTile {
  id: string;
  title: string;
  detail: string | null;
  meta: string | null;
  image_url: string | null;
  glyph: string | null;
  stamp: string | null;
  action: RailAction | null;
  featured?: boolean;
}

export interface Rail {
  surface: RailSurface;
  label: string;
  count_label: string | null;
  href: string;
  tiles: RailTile[];
}

export interface ClassroomRailsResult {
  week: number;
  rails: Rail[];
  degraded: RailSurface[];
}

export async function fetchClassroomRails(week: number): Promise<ClassroomRailsResult | null> {
  try {
    const { data } = await portalApi.get<ClassroomRailsResult>(
      `/api/portal/classroom/rails?week=${encodeURIComponent(String(week))}`,
    );
    return data;
  } catch {
    // The week renders without them. Missing rails are missing rails, not a
    // missing classroom — the same contract the projection fetch already keeps.
    return null;
  }
}

/**
 * Where the rails sit among the week's cards.
 *
 * THE RULE, and it is a product rule rather than an arithmetic one: a rail after
 * roughly every second curriculum card, never two rails back to back, and never
 * a rail before the first card. A student opening their week should see their
 * week — the first thing on the page is always curriculum, and the rails are
 * what they find as they read down it.
 *
 * A week with fewer cards than rails keeps the leftover rails at the end rather
 * than dropping them: in Week 1 there may be three cards and four rails, and the
 * timeline rail is not less useful for arriving last.
 */
export const CARDS_BETWEEN_RAILS = 2;

export function interleaveRails<T>(cards: T[], rails: Rail[]): Array<{ card: T } | { rail: Rail }> {
  const out: Array<{ card: T } | { rail: Rail }> = [];
  let next = 0;

  cards.forEach((card, i) => {
    out.push({ card });
    const boundary = (i + 1) % CARDS_BETWEEN_RAILS === 0;
    const isLastCard = i === cards.length - 1;
    // Never after the final card -- that position belongs to the leftovers below,
    // and dropping a rail in there twice would put two rails back to back.
    if (boundary && !isLastCard && next < rails.length) {
      out.push({ rail: rails[next] });
      next += 1;
    }
  });

  for (; next < rails.length; next += 1) out.push({ rail: rails[next] });

  return out;
}

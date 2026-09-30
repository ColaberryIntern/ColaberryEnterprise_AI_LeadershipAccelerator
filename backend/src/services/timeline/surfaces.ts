/**
 * Surface taxonomy — the "where does this card belong?" axis for Today
 * Timeline v2 (Phase 0). The registry (./typeRegistry.ts) is the source of
 * truth for WHICH surface each type maps to (home_surface); this module adds
 * the shared presentation metadata (label, description, colour marker) and the
 * convenience resolvers the admin + future feed composer use.
 *
 * Colour is a property of the SECTION, not the type — so every type in a
 * section shares one subtle marker automatically once grouped. The palette is
 * intentionally low-saturation: a dot / left-edge accent, never a full-bleed
 * card background. Mirror of this palette for the frontend lives at
 * frontend/src/constants/surfaces.ts (5 rows — keep in sync).
 *
 * The one-way valve: Today aggregates every `today_eligible` card (anchored
 * homes mirror IN); anchored surfaces render only their own cards; ambient
 * (home_surface='today') is Today-ONLY.
 */
import { resolve, allTypes, type SurfaceId, type CardTypeDef } from './typeRegistry';

export type { SurfaceId } from './typeRegistry';

export interface SurfaceDef {
  id: SurfaceId;
  label: string;         // admin/section header label
  description: string;   // one-line explanation of what lives here
  /** Saturated marker colour (dot / left-edge accent). */
  color: string;
  /** Very light tint for an optional pill background. */
  soft: string;
  /** Display order when grouping sections (Today first — it is the aggregator). */
  order: number;
}

/** The five canonical surfaces. Colour = subtle marker, not a full background. */
export const SURFACES: Record<SurfaceId, SurfaceDef> = {
  today: {
    id: 'today',
    label: 'Today',
    description: 'Ambient, Today-only content that rotates for engagement (blog, podcast, testimonials, system rewards).',
    color: '#6d28d9', soft: '#ede9fe', order: 0,
  },
  class: {
    id: 'class',
    label: 'Class',
    description: 'Curriculum-tied learning bound to a week/program. Flows into Today.',
    color: '#2563eb', soft: '#dbeafe', order: 1,
  },
  project: {
    id: 'project',
    label: 'Project',
    description: 'Work tied to the student’s build/project. Flows into Today.',
    color: '#059669', soft: '#d1fae5', order: 2,
  },
  community: {
    id: 'community',
    label: 'Community',
    description: 'Discussion and peer showcase tied to the community. Flows into Today.',
    color: '#db2777', soft: '#fce7f3', order: 3,
  },
  group: {
    id: 'group',
    label: 'Group / Live',
    description: 'Live class events and scheduled group gatherings. Flows into Today.',
    color: '#d97706', soft: '#fef3c7', order: 4,
  },
};

/** Ordered list of surfaces (Today first). */
export const SURFACE_ORDER: SurfaceDef[] = Object.values(SURFACES).sort((a, b) => a.order - b.order);

/** The surface a card type belongs to, or null for an unknown slug. */
export function surfaceOf(slug: string): SurfaceId | null {
  return resolve(slug)?.home_surface ?? null;
}

/** Full presentation def for a type's surface (defaults to Class if unknown). */
export function surfaceDefOf(slug: string): SurfaceDef {
  const id = surfaceOf(slug);
  return id ? SURFACES[id] : SURFACES.class;
}

/** True when the type is Today-only rotating content (blog/podcast/testimonial/system). */
export function isAmbient(slug: string): boolean {
  return resolve(slug)?.feed_mode === 'ambient';
}

/** True when the type may appear in the aggregated Today feed. */
export function isTodayEligible(slug: string): boolean {
  return resolve(slug)?.today_eligible === true;
}

/** Group every registered type by its home surface (Today first). */
export function typesBySurface(): Array<{ surface: SurfaceDef; types: CardTypeDef[] }> {
  return SURFACE_ORDER.map((surface) => ({
    surface,
    types: allTypes().filter((t) => t.home_surface === surface.id),
  }));
}

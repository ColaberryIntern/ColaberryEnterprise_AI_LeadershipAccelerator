/**
 * Surface taxonomy (frontend mirror) — the "where does this card belong?" axis
 * for Today Timeline v2 (Phase 0). Colour is a property of the SECTION so every
 * type in a section shares one subtle marker once grouped.
 *
 * Source of truth for WHICH surface a type maps to is the backend registry
 * (backend/src/services/timeline/typeRegistry.ts), surfaced on each type as
 * `home_surface`. This file only carries the presentation palette + labels —
 * keep the 5 rows in sync with backend/src/services/timeline/surfaces.ts.
 */
export type SurfaceId = 'today' | 'class' | 'project' | 'community' | 'group';

export interface SurfaceDef {
  id: SurfaceId | 'unsectioned';
  label: string;
  description: string;
  color: string; // saturated marker (dot / left-edge accent)
  soft: string;  // light tint for an optional pill background
  order: number;
}

export const SURFACES: Record<SurfaceId, SurfaceDef> = {
  today: {
    id: 'today', label: 'Today',
    description: 'Ambient, Today-only content that rotates for engagement (blog, podcast, testimonials, rewards).',
    color: '#6d28d9', soft: '#ede9fe', order: 0,
  },
  class: {
    id: 'class', label: 'Class',
    description: 'Curriculum-tied learning bound to a week/program. Flows into Today.',
    color: '#2563eb', soft: '#dbeafe', order: 1,
  },
  project: {
    id: 'project', label: 'Project',
    description: 'Work tied to the student’s build/project. Flows into Today.',
    color: '#059669', soft: '#d1fae5', order: 2,
  },
  community: {
    id: 'community', label: 'Community',
    description: 'Discussion and peer showcase tied to the community. Flows into Today.',
    color: '#db2777', soft: '#fce7f3', order: 3,
  },
  group: {
    id: 'group', label: 'Group / Live',
    description: 'Live class events and scheduled group gatherings. Flows into Today.',
    color: '#d97706', soft: '#fef3c7', order: 4,
  },
};

/** Fallback bucket for rows not yet re-seeded with a home_surface. */
export const UNSECTIONED: SurfaceDef = {
  id: 'unsectioned', label: 'Unsectioned',
  description: 'No section assigned yet — will populate after the type registry re-seeds.',
  color: '#94a3b8', soft: '#f1f5f9', order: 99,
};

/** Sections in display order (Today first — it is the aggregator), unsectioned last. */
export const SURFACE_ORDER: SurfaceDef[] = [
  ...Object.values(SURFACES).sort((a, b) => a.order - b.order),
  UNSECTIONED,
];

/** Resolve a home_surface string (possibly null/unknown) to its section def. */
export function surfaceDefFor(id?: string | null): SurfaceDef {
  if (id && (id in SURFACES)) return SURFACES[id as SurfaceId];
  return UNSECTIONED;
}

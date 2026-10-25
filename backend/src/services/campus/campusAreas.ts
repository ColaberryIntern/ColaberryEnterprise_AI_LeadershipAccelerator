/**
 * The campus areas a learner can be "in" (Colaberry Campus C4): exactly the building ids of the
 * frontend catalog (frontend/src/components/campus/campusMap.ts). A backend test reads that file
 * and fails if the two lists drift, so a building added on one side cannot silently be rejected
 * (or accepted) on the other.
 */
export const CAMPUS_AREAS = [
  'lecture', 'library', 'tower', 'studio', 'amphi', 'testing',
  'observatory', 'commons', 'gallery', 'career', 'arcade', 'gate',
  'admissions', // C21 (v6 D3): Maya's building beside the main gate
] as const;

export type CampusArea = (typeof CAMPUS_AREAS)[number];

export function isCampusArea(v: unknown): v is CampusArea {
  return typeof v === 'string' && (CAMPUS_AREAS as readonly string[]).includes(v);
}

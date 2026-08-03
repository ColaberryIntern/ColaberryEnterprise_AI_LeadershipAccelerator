/**
 * architectMindsetQualification — the single, canonical experience-compression
 * qualification string (canonical section 8), factored into its own leaf module.
 *
 * Why its own file: the per-week scenario data files (architectMindsetWeeks/*)
 * need this VALUE at module-init time, while architectMindsetScenario.ts imports
 * those week files to build the registry. Keeping the shared constant in a leaf
 * module (imported by both, importing neither) prevents a circular import in which
 * AM_QUALIFICATION would evaluate to undefined inside the week scenarios.
 */

export const AM_QUALIFICATION =
  'Illustrative and scenario-based. This represents patterns studied, not employment experience earned, and is not a guarantee of competence or job readiness.';

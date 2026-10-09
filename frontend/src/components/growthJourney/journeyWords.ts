import type { StatusRegistry } from '../../services/growthJourneyApi';

/**
 * The programme's own vocabulary, in one place (Phase 6, T614).
 *
 * ── WHY THIS IS SHARED RATHER THAN PER-TAB ──────────────────────────────────
 *
 * `wordsOf` was local to `GrowthJourneyPage.tsx`, where it fed only the page
 * subtitle. T614's five tabs all need the same words in their headings and column
 * labels, and the registry that carries them is deliberately read ONCE at page level
 * rather than four times by four children - so the words come down as a prop and the
 * resolver lives here, used by the page and the tabs alike.
 *
 * ── WHERE THE WORDS ACTUALLY COME FROM ──────────────────────────────────────
 *
 * Not a column and not a settings row: `journey_programs.metadata.terminology`,
 * surfaced only by `GET /status/registry` as `programs[].terminology`. NONE of the
 * nine inspect reads carries it, which is exactly why it has to be threaded.
 *
 * The backend seeds it per programme KIND, not per brand
 * (`services/growthJourney/journeyTerminology.ts`):
 *
 *   learner    -> subject 'learner', relationship 'enrolment',  pipeline 'path'
 *   business   -> subject 'lead',    relationship 'account',    pipeline 'opportunity'
 *   consulting -> subject 'lead',    relationship 'engagement', pipeline 'project'
 *
 * ── THE FALLBACK NAMES NOTHING ──────────────────────────────────────────────
 *
 * `terminologyOf` on the backend returns null rather than a guess when the metadata
 * is absent or malformed, and this mirrors that: the fallback is the neutral triple,
 * never a brand's word. Defaulting to 'learner' would put Colaberry Training's
 * vocabulary on an AI Flotation screen, which is the brand-boundary mistake this
 * whole phase exists to make impossible.
 */
export interface JourneyTerminology {
  readonly subject: string;
  readonly relationship: string;
  readonly pipeline: string;
}

export const NEUTRAL_WORDS: JourneyTerminology = {
  subject: 'subject',
  relationship: 'relationship',
  pipeline: 'pipeline',
};

/** The programme's own words, with a neutral fallback that names nothing brand-specific. */
export function wordsOf(reg: StatusRegistry | null, programId: string): JourneyTerminology {
  return reg?.programs.find((p) => p.id === programId)?.terminology ?? NEUTRAL_WORDS;
}

/**
 * A brand's display name from the registry, or null.
 *
 * The nine inspect reads return `brand_id` as a bare UUID and nothing else, and the
 * registry is the only way to turn one into a name - so an empty state that wants to
 * say which brand it was empty for has to come through here. Returns null rather
 * than the UUID so a caller decides whether showing a raw id is better than showing
 * nothing.
 */
export function brandNameOf(reg: StatusRegistry | null, brandId: string): string | null {
  if (!brandId) return null;
  return reg?.brands.find((b) => b.id === brandId)?.name ?? null;
}

import type { JourneyProgramKind } from '../../models/JourneyProgram';

/**
 * What a programme calls the three things every journey has (Phase 6, T604).
 *
 * §5's brief says a learner journey and a business journey are the same machine
 * with different words: one has learners who enrol and move along a path, the
 * other has leads who become accounts with opportunities. Before this, those
 * words existed only in the lifecycle vocabularies in code, so an admin screen
 * had nothing to read and would have had to hard-code "learner" or "lead" per
 * brand - which is how a CPN screen ends up calling a business lead a learner.
 *
 * Per KIND, not per brand, because the words follow the machine: the two
 * learner brands share them, and a fifth brand of an existing kind inherits
 * them with no edit here. It is DATA, written into `journey_programs.metadata`
 * by the seed (the column §13 designated for exactly this) and never a column,
 * a table or a settings row - an operator changes a word by editing the row,
 * and the seed will not argue (`seedJourneyPrograms.seedTerminology`).
 *
 * ─── WHY ITS OWN MODULE, NOT THE SEED FILE THE PLAN NAMED ───────────────────
 *
 * The plan put this map in `seeds/growthJourney/journeyProgramDefinitions.ts`.
 * Two readers need it - the seed that writes it and the status registry that
 * reads it back - and a controller importing a SEED is backwards: that file
 * pulls in `offerPolicyDefinitions` -> `models/OfferFamily` -> the real
 * `config/database`, so an admin route would boot a Sequelize connection to
 * learn three nouns (the status access suite failed exactly that way before the
 * move). Here the only import is a TYPE, which is erased at runtime, so the
 * vocabulary costs nothing to read from either side.
 */

export interface JourneyTerminology {
  /** The person: what one row of the journey is a row about. */
  readonly subject: string;
  /** The relationship the journey is trying to create or deepen. */
  readonly relationship: string;
  /** The named stages the subject moves along. */
  readonly pipeline: string;
}

export const TERMINOLOGY: Readonly<Record<JourneyProgramKind, JourneyTerminology>> = Object.freeze({
  learner: Object.freeze({ subject: 'learner', relationship: 'enrolment', pipeline: 'path' }),
  business: Object.freeze({ subject: 'lead', relationship: 'account', pipeline: 'opportunity' }),
  consulting: Object.freeze({ subject: 'lead', relationship: 'engagement', pipeline: 'project' }),
});

/** The metadata key the seed writes and the status registry reads. One spelling, one file. */
export const TERMINOLOGY_METADATA_KEY = 'terminology';

/** The terminology a programme's metadata carries, or null - never a guess from its kind. */
export function terminologyOf(metadata: unknown): JourneyTerminology | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[TERMINOLOGY_METADATA_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { subject, relationship, pipeline } = value as Record<string, unknown>;
  if (typeof subject !== 'string' || typeof relationship !== 'string' || typeof pipeline !== 'string') return null;
  return { subject, relationship, pipeline };
}

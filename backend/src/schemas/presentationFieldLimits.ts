/**
 * Field widths for the Presentation Studio, defined ONCE.
 *
 * WHY A CONSTANT AND NOT FOUR LITERALS. `audience` shipped validated at 200 characters
 * and stored in VARCHAR(60). An ordinary learner answer — 84 characters — passed the
 * request schema and then threw at the database as a 500 (production, 2026-10-08).
 * Nothing caught it because the number lived in four places that nobody reads together:
 * the Zod schema, two Sequelize models, and the DDL.
 *
 * Now there is one number. The DDL interpolates it, the models declare it, the request
 * schema enforces it, and `presentationAudienceWidth.contract.test.ts` proves they still
 * agree. A validation boundary wider than its storage is not a loose check — it is an
 * outage behind a 400 that never fires.
 *
 * NO IMPORTS, deliberately: the DDL layer, the model layer and the route layer all
 * depend on this, so it must be a leaf or it creates a cycle.
 */

/**
 * "Who are you presenting to" — free text the learner writes on the Prepare stage.
 *
 * NOT to be confused with `presentation_showcases.audience`, which is a VARCHAR(30)
 * VISIBILITY enum ('private' | 'cohort' | 'community' | …). Two different fields with
 * the same name: one is a sentence, the other is an access level. Widening the showcase
 * one to match this would turn an access control into a free-text field.
 */
export const AUDIENCE_MAX = 200;

/** The learner's "what do you want them to do about it", stored in `checklist_json`. */
export const PURPOSE_MAX = 500;

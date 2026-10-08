/**
 * THE VALIDATOR AND THE COLUMN MUST AGREE ON ONE NUMBER.
 *
 * On 2026-10-08, saving Prepare answers on production returned a 500. The audience
 * field was validated at 200 characters and stored in VARCHAR(60), so an ordinary
 * answer — "Hospital operations leaders and the dispatch staff who route specimen
 * couriers today", 84 characters — passed the schema and then threw at the database.
 * Nothing in CI could see it: the unit tests never used a string that long, and a
 * validation boundary WIDER than its storage produces no error until real text arrives.
 *
 * So this suite derives the width from the SQL and holds everything else to it. Change
 * the column and the schema must follow, or the build fails. Nobody has to remember.
 *
 * The Zod side is checked BEHAVIOURALLY — a string at the limit is accepted and one
 * character past it is rejected — rather than by reading `.max()` off the schema
 * object. An introspection test passes when the schema stops being applied; this one
 * cannot.
 */
import { PRESENTATION_STUDIO_STATEMENTS } from '../ensurePresentationStudioSchema';
import { AUDIENCE_MAX } from '../../schemas/presentationFieldLimits';
import { assignmentPatchSchema } from '../../routes/presentationPortalRoutes';
import PresentationAssignment from '../../models/PresentationAssignment';
import PresentationAttempt from '../../models/PresentationAttempt';

/** The declared width of `audience` in a given table's CREATE body. */
function createdWidth(table: string): number {
  const create = PRESENTATION_STUDIO_STATEMENTS.find(
    (s) => s.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
  );
  expect(create).toBeDefined();
  const m = /audience\s+VARCHAR\((\d+)\)/i.exec(String(create));
  expect(m).not.toBeNull();
  return Number(m![1]);
}

const FREE_TEXT_TABLES = ['presentation_assignments', 'presentation_attempts'];
const ASSIGNMENT_WIDTH = createdWidth('presentation_assignments');

describe('the audience width is one number, in every place that enforces it', () => {
  it('is a real width, not a parse that silently returned zero', () => {
    // Positive control: without this, every assertion below passes against NaN/0.
    expect(ASSIGNMENT_WIDTH).toBeGreaterThan(60);
  });

  it('the DDL width IS the shared constant, not a copy that happens to match today', () => {
    // The statements interpolate AUDIENCE_MAX. Asserting equality here is what makes
    // every other test in this file a check on ONE number rather than on four that
    // currently agree.
    expect(ASSIGNMENT_WIDTH).toBe(AUDIENCE_MAX);
  });

  it('the attempt snapshot is as wide as the assignment it copies', () => {
    // The attempt stores a SNAPSHOT of the assignment's audience. A narrower column
    // here truncates — or throws — on the way in, and the failure surfaces at
    // rehearsal time rather than at save time.
    expect(createdWidth('presentation_attempts')).toBe(ASSIGNMENT_WIDTH);
  });

  it('the ALTER that WIDENS an existing column is present for both tables', () => {
    // ADD COLUMN IF NOT EXISTS is a no-op where the column already exists, so editing
    // its width there does nothing to a database that has already run this module.
    // Only ALTER COLUMN ... TYPE moves an existing column.
    for (const table of ['presentation_assignments', 'presentation_attempts']) {
      const widening = PRESENTATION_STUDIO_STATEMENTS.filter(
        (s) =>
          s.includes(`ALTER TABLE ${table}`) &&
          /ALTER COLUMN\s+audience\s+TYPE\s+VARCHAR\((\d+)\)/i.test(s),
      );
      expect(widening).toHaveLength(1);
      expect(widening[0]).toContain(`VARCHAR(${ASSIGNMENT_WIDTH})`);
    }
  });

  it('every ADD COLUMN for the free-text audience declares the same width', () => {
    const adds = PRESENTATION_STUDIO_STATEMENTS.filter(
      (s) =>
        /ADD COLUMN IF NOT EXISTS\s+audience\s+VARCHAR\(/i.test(s) &&
        FREE_TEXT_TABLES.some((t) => s.includes(`ALTER TABLE ${t}`)),
    );
    expect(adds).toHaveLength(FREE_TEXT_TABLES.length);
    for (const stmt of adds) expect(stmt).toContain(`VARCHAR(${ASSIGNMENT_WIDTH})`);
  });

  /**
   * TWO DIFFERENT FIELDS SHARE THE NAME `audience`, and conflating them would be a
   * security change dressed as a consistency fix. On the assignment it is a sentence
   * the learner types; on a showcase it is the VISIBILITY level — 'private',
   * 'cohort', 'community'. This test exists because the first draft of the one above
   * swept every statement and tried to widen the enum to 200 characters.
   */
  it('leaves the SHOWCASE audience alone — it is a visibility enum, not free text', () => {
    const showcase = PRESENTATION_STUDIO_STATEMENTS.filter(
      (s) => s.includes('presentation_showcases') && /audience/i.test(s),
    );
    expect(showcase.length).toBeGreaterThan(0);
    for (const stmt of showcase) {
      expect(stmt).not.toContain(`VARCHAR(${ASSIGNMENT_WIDTH})`);
      // Still an access level with a safe default, not something a learner writes.
      if (/ADD COLUMN/i.test(stmt)) expect(stmt).toMatch(/DEFAULT 'private'/);
    }
  });

  it('both Sequelize models declare the same width', () => {
    // Sequelize is what actually issues the UPDATE. A model narrower than the column
    // rejects text the database would have taken; wider, and it hands Postgres a
    // string Postgres refuses — which is the 500 this suite exists for.
    for (const model of [PresentationAssignment, PresentationAttempt]) {
      const attr: any = (model as any).getAttributes().audience;
      expect(attr).toBeDefined();
      expect(attr.type.options?.length ?? attr.type._length).toBe(ASSIGNMENT_WIDTH);
    }
  });

  it('the request schema accepts exactly up to the column width', () => {
    const atLimit = 'a'.repeat(ASSIGNMENT_WIDTH);
    expect(assignmentPatchSchema.safeParse({ audience: atLimit }).success).toBe(true);
  });

  it('the request schema REJECTS one character past it, so the 400 fires before Postgres does', () => {
    const tooLong = 'a'.repeat(ASSIGNMENT_WIDTH + 1);
    expect(assignmentPatchSchema.safeParse({ audience: tooLong }).success).toBe(false);
  });

  it('the exact string that caused the production 500 is now accepted', () => {
    // Regression, named. 84 characters: an ordinary answer, not an adversarial one.
    const real = 'Hospital operations leaders and the dispatch staff who route specimen couriers today';
    expect(real.length).toBe(84);
    expect(real.length).toBeLessThanOrEqual(ASSIGNMENT_WIDTH);
    expect(assignmentPatchSchema.safeParse({ audience: real }).success).toBe(true);
  });
});

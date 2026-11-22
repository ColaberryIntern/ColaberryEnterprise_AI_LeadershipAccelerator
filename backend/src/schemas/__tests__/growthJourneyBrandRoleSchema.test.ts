import {
  brandRoleBodySchema,
  brandRoleParamsSchema,
  stripRoleText,
  ROLE_TITLE_MAX,
  ROLE_DESCRIPTION_MAX,
} from '../growthJourneyBrandRoleSchema';

/**
 * The boundary for the one write this build introduces.
 *
 * The cell worth reading twice is "the limit is checked AFTER stripping". Order
 * is the whole difference between a bound on what is stored and a bound on what
 * was typed, and only the first is a guarantee about the row.
 */

describe('stripRoleText', () => {
  it.each([
    // A tag becomes a SPACE, not nothing, so `Enrollment<br>Specialist` cannot
    // collapse into one word. That is why `</script>Enrollment` gains a gap.
    ['<script>alert(1)</script>Enrollment Specialist', 'alert(1) Enrollment Specialist'],
    ['Enrollment<br>Specialist', 'Enrollment Specialist'],
    ['Enrollment <b>Specialist</b>', 'Enrollment Specialist'],
    ['Enrollment < Specialist', 'Enrollment Specialist'],
    ['Enrollment\nSpecialist', 'Enrollment Specialist'],
    ['  Enrollment   Specialist  ', 'Enrollment Specialist'],
    ['Enrollment\u0000Specialist', 'Enrollment Specialist'],
  ])('cleans %j', (raw, expected) => {
    expect(stripRoleText(raw)).toBe(expected);
  });

  it('leaves ordinary punctuation alone', () => {
    // The strip is for markup and control characters, not for prose.
    const text = "Reaches out to new accounts, qualifies what's needed & develops it (end to end).";
    expect(stripRoleText(text)).toBe(text);
  });
});

describe('the body contract', () => {
  it('accepts a role and returns it stripped', () => {
    const parsed = brandRoleBodySchema.parse({
      title: '  Business Development <b>Specialist</b> ',
      description: 'Reaches out to new accounts.',
    });
    expect(parsed.title).toBe('Business Development Specialist');
  });

  it('bounds the length of what is STORED, not of what was typed', () => {
    // 400 characters of markup collapsing to four words. Bounding before the
    // strip would reject this; the bound belongs on the row, so it passes.
    const padded = `${'<span> </span>'.repeat(40)}Enrollment Specialist`;
    expect(padded.length).toBeGreaterThan(ROLE_TITLE_MAX);

    const parsed = brandRoleBodySchema.parse({ title: padded, description: 'x' });
    expect(parsed.title).toBe('Enrollment Specialist');
  });

  it('rejects a title that is still too long after stripping', () => {
    const result = brandRoleBodySchema.safeParse({
      title: 'E'.repeat(ROLE_TITLE_MAX + 1),
      description: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a description that is still too long after stripping', () => {
    const result = brandRoleBodySchema.safeParse({
      title: 'Enrollment Specialist',
      description: 'd'.repeat(ROLE_DESCRIPTION_MAX + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a value that is nothing but markup', () => {
    // Empty after stripping is empty. Storing "" as a role title would render a
    // blank where a name belongs and read as a bug in the page.
    const result = brandRoleBodySchema.safeParse({ title: '<b></b>', description: 'x' });
    expect(result.success).toBe(false);
  });

  it.each([
    [{ description: 'x' }],
    [{ title: 'x' }],
    [{ title: 'x', description: 'x', role: { title: 'smuggled' } }],
    [{ title: 'x', description: 'x', metadata: {} }],
  ])('rejects %j', (body) => {
    // The last two matter most: `metadata` is a JSONB column shared with
    // `terminology`, so an unknown key that got through would be a way to write
    // arbitrary structure into what five tabs read their words from.
    expect(brandRoleBodySchema.safeParse(body).success).toBe(false);
  });
});

describe('the params contract', () => {
  it('requires a uuid brand', () => {
    expect(brandRoleParamsSchema.safeParse({ brand_id: 'colaberry-training' }).success).toBe(false);
    expect(
      brandRoleParamsSchema.safeParse({ brand_id: '10ebfb01-dc51-450d-bbef-a2c10e42efa8' }).success
    ).toBe(true);
  });
});

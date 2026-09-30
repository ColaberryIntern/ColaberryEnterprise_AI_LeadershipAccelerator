import { personPath, refForApi } from '../personLink';

/**
 * Where a person's name links to.
 *
 * The case that matters most is the LAST one: a row with no usable identifier
 * must produce null so PersonLink renders plain text. If this returned a path
 * for those rows, every nameless lead in the table would be a link to a 404.
 */

describe('personPath', () => {
  it('prefers email, lower-cased and encoded', () => {
    expect(personPath({ email: 'Some.Body@Example.com' }))
      .toBe('/admin/people/some.body%40example.com');
  });

  it('prefers email even when a lead id is also present', () => {
    // Email needs no server lookup, so it is the cheaper and more direct key.
    expect(personPath({ email: 'a@b.com', leadId: 42 })).toBe('/admin/people/a%40b.com');
  });

  it('falls back to a lead id', () => {
    expect(personPath({ leadId: 24945 })).toBe('/admin/people/lead%3A24945');
    expect(personPath({ leadId: '938' })).toBe('/admin/people/lead%3A938');
  });

  it('falls back to an enrolment id', () => {
    const uuid = 'c31ea314-6ee0-4469-96d2-d30aac469bdc';
    expect(personPath({ enrollmentId: uuid })).toBe(`/admin/people/enrollment%3A${uuid}`);
  });

  it('skips an unusable email and uses the id instead', () => {
    // Rows really do carry these. Treating them as addresses would build a link
    // to a person who does not exist.
    for (const bad of ['', '   ', 'not-an-email', '@example.com', 'null']) {
      expect(personPath({ email: bad, leadId: 5 })).toBe('/admin/people/lead%3A5');
    }
  });

  describe('returns null when nothing usable is present', () => {
    it.each([
      ['nothing at all', {}],
      ['null email', { email: null }],
      ['empty email', { email: '' }],
      ['null lead id', { leadId: null }],
      ['non-numeric lead id', { leadId: 'abc' }],
      ['malformed enrolment id', { enrollmentId: 'not-a-uuid' }],
      ['all three empty', { email: '', leadId: null, enrollmentId: '' }],
    ])('%s', (_label, ref) => {
      expect(personPath(ref)).toBeNull();
    });
  });
});

describe('refForApi', () => {
  it('decodes what the route gave it', () => {
    expect(refForApi('some.body%40example.com')).toBe('some.body@example.com');
    expect(refForApi('lead%3A24945')).toBe('lead:24945');
  });

  it('returns an empty string for a missing param', () => {
    expect(refForApi(undefined)).toBe('');
  });

  it('passes a malformed escape through rather than throwing in a render', () => {
    expect(refForApi('%E0%A4%A')).toBe('%E0%A4%A');
  });
});

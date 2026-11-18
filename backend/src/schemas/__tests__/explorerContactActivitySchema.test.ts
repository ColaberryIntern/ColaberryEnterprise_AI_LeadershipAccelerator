import {
  contactActivityBodySchema,
  contactActivityRowSchema,
  CONTACT_ACTIVITY_MAX_ROWS,
  GHL_CONTACT_ID_MAX_LENGTH,
} from '../explorerContactActivitySchema';

/**
 * The contract for the Explorer contact-activity push.
 *
 * Each rejection test is paired with the nearest ACCEPTED value, because "this is rejected" is
 * worth nothing on its own: a schema that rejects everything would pass a suite of rejections
 * and silently 400 every nightly push from Cora.
 */

const ok = { ghl_contact_id: 'C8kPq2WvZr1aBcDeFgHi', last_connected_call_at: '2026-11-17T21:04:00Z' };

describe('a well-formed row is accepted', () => {
  it('CONTROL: the canonical row parses, so every rejection below means something', () => {
    expect(contactActivityRowSchema.parse(ok)).toEqual(ok);
  });

  it('accepts a non-UTC offset, which is still unambiguous', () => {
    const r = { ...ok, last_connected_call_at: '2026-11-17T15:04:00-06:00' };
    expect(contactActivityRowSchema.parse(r).last_connected_call_at).toBe('2026-11-17T15:04:00-06:00');
  });

  it('accepts fractional seconds, which GoHighLevel exports do carry', () => {
    const r = { ...ok, last_connected_call_at: '2026-11-17T21:04:00.123Z' };
    expect(() => contactActivityRowSchema.parse(r)).not.toThrow();
  });

  it('trims surrounding whitespace on the contact id rather than matching on a padded value', () => {
    expect(contactActivityRowSchema.parse({ ...ok, ghl_contact_id: '  C8kPq2WvZr1aBcDeFgHi  ' }).ghl_contact_id)
      .toBe('C8kPq2WvZr1aBcDeFgHi');
  });
});

describe('a timestamp without an offset is refused, not assumed to be UTC', () => {
  // This is the whole reason `datetime({ offset: true })` is there. A bare local timestamp read
  // as UTC is wrong by six hours in Central, which is enough to push a contact outside the
  // seven-day suppression window and hand Rose back somebody she called yesterday.
  it.each([
    ['no zone at all', '2026-11-17T21:04:00'],
    ['a date only', '2026-11-17'],
    ['a space instead of T, as psql prints it', '2026-11-17 21:04:00+00'],
    ['epoch millis as a string', '1794954240000'],
    ['free text', 'yesterday afternoon'],
  ])('rejects %s', (_label, value) => {
    expect(() => contactActivityRowSchema.parse({ ...ok, last_connected_call_at: value })).toThrow();
  });

  it('rejects a NUMBER, which is what an un-stringified epoch would arrive as', () => {
    expect(() => contactActivityRowSchema.parse({ ...ok, last_connected_call_at: 1794954240000 })).toThrow();
  });
});

describe('the contact id has real bounds', () => {
  it('rejects an empty id', () => {
    expect(() => contactActivityRowSchema.parse({ ...ok, ghl_contact_id: '' })).toThrow();
  });

  it('rejects whitespace only, which trimming turns into empty', () => {
    expect(() => contactActivityRowSchema.parse({ ...ok, ghl_contact_id: '   ' })).toThrow();
  });

  it(`accepts exactly ${GHL_CONTACT_ID_MAX_LENGTH} characters and rejects one more`, () => {
    const at = 'x'.repeat(GHL_CONTACT_ID_MAX_LENGTH);
    expect(() => contactActivityRowSchema.parse({ ...ok, ghl_contact_id: at })).not.toThrow();
    expect(() => contactActivityRowSchema.parse({ ...ok, ghl_contact_id: at + 'x' })).toThrow();
  });
});

describe('unknown keys are a 400, not a shrug', () => {
  // The failure this prevents: a field rename upstream would otherwise parse as "every row is
  // missing its timestamp", match nothing, and answer 200 with written: 0 - indistinguishable
  // from a day on which Rose connected with nobody.
  it('rejects an extra key on a row', () => {
    expect(() => contactActivityRowSchema.parse({ ...ok, call_outcome: 'connected' })).toThrow();
  });

  it('rejects an extra key on the body', () => {
    expect(() => contactActivityBodySchema.parse({ source: 'ghl-rose-calls', rows: [ok], dry_run: true })).toThrow();
  });

  it('rejects the plausible WRONG field names rather than reading them as absent', () => {
    expect(() => contactActivityRowSchema.parse({ contact_id: 'C1', last_call_at: '2026-11-17T21:04:00Z' })).toThrow();
  });
});

describe('the body', () => {
  it('CONTROL: a minimal valid body parses', () => {
    expect(contactActivityBodySchema.parse({ source: 'ghl-rose-calls', rows: [ok] }).rows).toHaveLength(1);
  });

  it('requires a source, so a written timestamp is always attributable', () => {
    expect(() => contactActivityBodySchema.parse({ rows: [ok] })).toThrow();
    expect(() => contactActivityBodySchema.parse({ source: '', rows: [ok] })).toThrow();
  });

  it('rejects an empty rows array: a push with nothing in it is a caller bug, not a quiet day', () => {
    expect(() => contactActivityBodySchema.parse({ source: 'ghl-rose-calls', rows: [] })).toThrow();
  });

  it(`accepts exactly ${CONTACT_ACTIVITY_MAX_ROWS} rows and rejects one more`, () => {
    const at = Array.from({ length: CONTACT_ACTIVITY_MAX_ROWS }, (_, i) => ({ ...ok, ghl_contact_id: `C${i}` }));
    expect(() => contactActivityBodySchema.parse({ source: 'ghl-rose-calls', rows: at })).not.toThrow();
    expect(() => contactActivityBodySchema.parse({ source: 'ghl-rose-calls', rows: [...at, ok] })).toThrow();
  });

  it('rejects a body that is not an object at all', () => {
    expect(() => contactActivityBodySchema.parse(undefined)).toThrow();
    expect(() => contactActivityBodySchema.parse('rows')).toThrow();
  });

  it('rejects one bad row inside an otherwise good batch, rather than dropping it', () => {
    // Partial acceptance would be the worst of both: Cora would see 200 and never learn that
    // one of its rows was malformed.
    const body = { source: 'ghl-rose-calls', rows: [ok, { ...ok, last_connected_call_at: 'nope' }, ok] };
    expect(() => contactActivityBodySchema.parse(body)).toThrow();
  });
});

describe('the schema is pure', () => {
  it('parses the same value identically a second apart, so no clock is involved', async () => {
    const first = contactActivityRowSchema.parse(ok);
    await new Promise((r) => setTimeout(r, 25));
    expect(contactActivityRowSchema.parse(ok)).toEqual(first);
  });

  it('accepts a timestamp far in the future, because that rule belongs to the service', () => {
    // Deliberate: the schema has no clock. `recordContactActivity` refuses future timestamps,
    // and its own suite proves it. Asserting that here would duplicate the rule in a file that
    // cannot see `now`.
    expect(() => contactActivityRowSchema.parse({ ...ok, last_connected_call_at: '2099-01-01T00:00:00Z' })).not.toThrow();
  });
});

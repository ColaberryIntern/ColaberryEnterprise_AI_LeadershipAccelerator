/**
 * Tests for the CB AI runner idempotency guard. This is what stops the
 * duplicate "first-pass deliverable" pile-ups (LandJet 2026-06-15: 47/37/23
 * dupes) when a runner is re-run with --force or after a state-file reset.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { alreadyDrafted, CB_SYSTEM_ID } = require('../cbDraftIdempotency');

const cbDeliverable = {
  creator: { id: CB_SYSTEM_ID },
  content: '<div><strong>CB System first-pass deliverable</strong></div><div>the draft body</div>',
};
const cbStarting = {
  creator: { id: CB_SYSTEM_ID },
  content: '<div><strong>CB System is starting this task now.</strong></div>',
};
const humanComment = { creator: { id: 17454835 }, content: 'first-pass deliverable looks good, thanks' };

describe('alreadyDrafted', () => {
  it('true when CB has posted a first-pass deliverable', () => {
    expect(alreadyDrafted([cbStarting, cbDeliverable])).toBe(true);
  });

  it('false when CB only posted the "starting" comment (deliverable failed) — allows retry', () => {
    expect(alreadyDrafted([cbStarting])).toBe(false);
  });

  it('false on an empty / undefined / non-array thread', () => {
    expect(alreadyDrafted([])).toBe(false);
    expect(alreadyDrafted(undefined as any)).toBe(false);
    expect(alreadyDrafted(null as any)).toBe(false);
  });

  it('ignores the "first-pass deliverable" phrase from a non-CB author', () => {
    // A human quoting the phrase must NOT count as CB having drafted.
    expect(alreadyDrafted([humanComment])).toBe(false);
  });

  it('is null-safe on malformed comment rows', () => {
    expect(alreadyDrafted([{}, { creator: null }, { creator: { id: CB_SYSTEM_ID } }] as any)).toBe(false);
  });

  it('matches case-insensitively and through HTML tags', () => {
    expect(alreadyDrafted([{ creator: { id: CB_SYSTEM_ID }, content: '<b>CB System FIRST-PASS  Deliverable</b>' }])).toBe(true);
  });

  it('honors a custom CB id', () => {
    expect(alreadyDrafted([{ creator: { id: 999 }, content: 'first-pass deliverable' }], 999)).toBe(true);
    expect(alreadyDrafted([{ creator: { id: 999 }, content: 'first-pass deliverable' }], 111)).toBe(false);
  });
});

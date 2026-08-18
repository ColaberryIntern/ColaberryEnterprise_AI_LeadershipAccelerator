/**
 * The derived scope fields must respect the contract they are written into.
 *
 * `deriveLegacyScope` copies a whole interview answer into `users`,
 * `dataSources` and `done`. Those land in a request whose schema caps them, so
 * an uncapped copy here is how a long answer became a 400 on a field the
 * student never typed into. The full text still travels in `answers`, so
 * clamping the copy loses nothing.
 */
import { deriveLegacyScope } from '../pages/portal/projects/deriveLegacyScope';

const LEGACY_FIELD_MAX = 4_000;
const long = (n: number) => 'a'.repeat(n);

describe('deriveLegacyScope respects the request contract', () => {
  it('clamps a matched answer to the legacy field ceiling', () => {
    const scope = deriveLegacyScope([
      { id: 'q1', question: 'Who will use this?', answer: long(9_000) },
    ]);

    expect(scope.users?.length).toBe(LEGACY_FIELD_MAX);
  });

  it('clamps a borrowed answer too, not only a keyword-matched one', () => {
    // No question mentions users/data/done, so all three fields BORROW.
    const scope = deriveLegacyScope([
      { id: 'q1', question: 'Describe the shape of it.', answer: long(9_000) },
    ]);

    expect(scope.users?.length).toBe(LEGACY_FIELD_MAX);
  });

  it('leaves an answer within the ceiling untouched', () => {
    const answer = 'Boutique clients booking fittings.';
    const scope = deriveLegacyScope([
      { id: 'q1', question: 'Who will use this?', answer },
    ]);

    expect(scope.users).toBe(answer);
  });

  it('still returns nothing when there is nothing to derive', () => {
    const scope = deriveLegacyScope([]);

    expect(scope).toEqual({});
  });
});

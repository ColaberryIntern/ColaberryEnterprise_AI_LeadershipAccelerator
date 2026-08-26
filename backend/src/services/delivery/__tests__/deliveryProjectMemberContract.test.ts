import DeliveryProjectMember from '../../../models/DeliveryProjectMember';

/**
 * The membership contract the client sign-in path depends on.
 *
 * ## Why this file exists
 *
 * `deliveryClientAuthRoutes.findExistingClientMemberships` shipped reading `m.role` when
 * the column is `delivery_role`. The read returned `undefined` for every membership,
 * `isClientSideRole(undefined)` rejected them all, and `decideClientSignIn` therefore saw
 * zero memberships — so **nobody could sign in**. A valid Google account with a genuine
 * membership got the same generic refusal as a stranger, which is exactly the failure the
 * uniform refusal message makes hard to notice from the outside.
 *
 * Three layers missed it, and it is worth being precise about why, because the same blind
 * spot applies to every model read in this subsystem:
 *
 *   - **TypeScript** could not help: the row comes from `require('../models')` and is
 *     typed `any` at the call site, so `m.role` is a legal expression.
 *   - **The unit tests** could not help: they construct membership objects by hand, so
 *     they asserted against the shape the test author assumed, never the model's.
 *   - **The seed script** made the same mistake and *did* fail — but only because
 *     `delivery_role` is NOT NULL. Sequelize silently drops unknown keys passed to
 *     `defaults`, so the wrong name surfaced as a constraint violation rather than a typo.
 *     On a nullable column it would have written a null role and looked like success.
 *
 * So this asserts against the **model definition itself** rather than a fixture, and needs
 * no database.
 */

describe('DeliveryProjectMember attribute contract', () => {
  const attributeNames = Object.keys(DeliveryProjectMember.getAttributes());

  it('names the role column `delivery_role`', () => {
    expect(attributeNames).toContain('delivery_role');
  });

  it('has NO attribute called `role`', () => {
    // The negative half is the one that matters. Without it, adding a `role` alias later
    // would let this suite pass while the two names drifted apart in production.
    expect(attributeNames).not.toContain('role');
  });

  it('requires a delivery_role, so a membership cannot exist without one', () => {
    expect(DeliveryProjectMember.getAttributes().delivery_role.allowNull).toBe(false);
  });

  it('exposes the exact fields the sign-in path reads from a row', () => {
    // The real regression guard: this mirrors what `findExistingClientMemberships`
    // touches. Reading a field absent from the model yields `undefined` and, in that code
    // path, silently DENIES ACCESS rather than throwing — so the mapping must be pinned,
    // not assumed.
    for (const field of ['delivery_project_id', 'platform_identity_id', 'delivery_role']) {
      expect(attributeNames).toContain(field);
    }
  });

  it('keeps the uniqueness key aligned with the role column name', () => {
    // The unique index is declared on `delivery_role` too. If someone renames the column
    // and misses the index, re-granting a role stops being idempotent and starts creating
    // duplicate rows, which makes revocation ambiguous.
    const options = (DeliveryProjectMember as unknown as { options: { indexes?: Array<{ fields?: string[] }> } })
      .options;
    const uniqueIndex = (options.indexes ?? []).find((i) => i.fields?.includes('platform_identity_id')
      && i.fields?.includes('delivery_project_id'));
    expect(uniqueIndex?.fields).toContain('delivery_role');
  });
});

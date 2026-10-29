import { resolveOwnerGrant } from '../ownerGrant';

/**
 * M3 — the owner grant is idempotent. This is the concrete test tied to the Kes-owner grant itself
 * (distinct from mgmtRoleConstraintParity, which is source-vs-source and stays green regardless of
 * any grant). It proves a second run writes nothing, which is what makes the grant script safe to
 * re-run.
 */
describe('resolveOwnerGrant', () => {
  it('upgrades a non-owner role to owner', () => {
    expect(resolveOwnerGrant('admin')).toEqual({ shouldWrite: true, from: 'admin', to: 'owner' });
  });

  it('upgrades a null / undefined / blank current role to owner', () => {
    expect(resolveOwnerGrant(null)).toEqual({ shouldWrite: true, from: null, to: 'owner' });
    expect(resolveOwnerGrant(undefined)).toEqual({ shouldWrite: true, from: null, to: 'owner' });
    expect(resolveOwnerGrant('')).toEqual({ shouldWrite: true, from: '', to: 'owner' });
  });

  it('is a NO-OP when the row is already owner (idempotent re-run)', () => {
    expect(resolveOwnerGrant('owner')).toEqual({ shouldWrite: false, from: 'owner', to: 'owner' });
  });

  it('running twice settles: the result of a first grant makes the second a no-op', () => {
    const first = resolveOwnerGrant('admin');
    expect(first.shouldWrite).toBe(true);
    const second = resolveOwnerGrant(first.to); // role is now 'owner'
    expect(second.shouldWrite).toBe(false);
  });
});

import { isUniqueViolation } from '../uniqueViolation';

/**
 * T226 — the one detector for "the idempotency key already exists". A verifier's
 * mutation that dropped the pg `23505` branch survived because nothing tested it;
 * the engine's `create` path always yields the Sequelize class, but raw queries
 * and other drivers surface the pg code, and the branch is there for them.
 */
describe('isUniqueViolation', () => {
  it('recognises the Sequelize class by name', () => {
    expect(isUniqueViolation(Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError' }))).toBe(true);
  });

  it('recognises pg 23505 on `parent` and on `original`', () => {
    expect(isUniqueViolation(Object.assign(new Error('dup'), { parent: { code: '23505' } }))).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error('dup'), { original: { code: '23505' } }))).toBe(true);
  });

  it('does not mistake other failures for a unique violation', () => {
    expect(isUniqueViolation(new Error('connection reset'))).toBe(false);
    expect(isUniqueViolation(Object.assign(new Error('fk'), { parent: { code: '23503' } }))).toBe(false);
    expect(isUniqueViolation(Object.assign(new Error('x'), { name: 'SequelizeValidationError' }))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });
});

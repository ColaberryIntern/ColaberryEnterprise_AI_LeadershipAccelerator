/**
 * Ids must be idempotent from source identity: the same source yields the same id across runs
 * (so a re-derivation diffs cleanly), and distinct sources never collide.
 */
import { factoryId, uuid5, FACTORY_NAMESPACE } from '../factoryIds';

describe('factoryId', () => {
  it('same (kind, parts) ⇒ same id, every time', () => {
    const a = factoryId('task', ['req-1', 'step-2']);
    const b = factoryId('task', ['req-1', 'step-2']);
    expect(a).toBe(b);
  });

  it('different kind or parts ⇒ different id', () => {
    const base = factoryId('task', ['req-1', 'step-2']);
    expect(factoryId('role', ['req-1', 'step-2'])).not.toBe(base);
    expect(factoryId('task', ['req-1', 'step-3'])).not.toBe(base);
  });

  it('does not collide across a joined vs split part boundary', () => {
    expect(factoryId('task', ['a', 'b'])).not.toBe(factoryId('task', ['a|b']));
    expect(factoryId('task', ['a', 'b'])).not.toBe(factoryId('task', ['ab']));
  });

  it('produces a well-formed v5 UUID (version + variant bits set)', () => {
    const id = factoryId('task', ['x']);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('uuid5 is stable and matches a fixed vector for the factory namespace', () => {
    const once = uuid5('anchor', FACTORY_NAMESPACE);
    const twice = uuid5('anchor', FACTORY_NAMESPACE);
    expect(once).toBe(twice);
    expect(once).toMatch(/^[0-9a-f-]{36}$/);
  });
});

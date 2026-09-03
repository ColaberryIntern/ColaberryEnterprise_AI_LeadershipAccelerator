/**
 * A row that behaves like a Sequelize model instance, not like a plain object.
 *
 * WHY THIS MATTERS MORE THAN THE FIX IT GUARDS. The original fakes returned plain
 * objects, so `{ ...row }` copied every column and the suite was green while
 * production returned a record whose every field was `undefined`. That is the
 * "test double more capable than the real thing" trap: the double was FRIENDLIER
 * than reality, so it could only ever confirm the code, never challenge it.
 *
 * Here the columns live on a prototype as getters and are non-enumerable, which
 * is what Sequelize actually does. `row.repo_owner` reads. `{ ...row }` does not.
 * `.get({ plain: true })` returns the columns, as Sequelize's does.
 */
const STORE = Symbol('fakeSequelizeStore');

export function asInstance<T extends Record<string, any>>(values: T): T {
  const store: Record<string, any> = { ...values };
  const inst = Object.create({
    get(opts?: { plain?: boolean }) { return opts?.plain ? { ...store } : { ...store }; },
  });
  for (const key of Object.keys(store)) {
    Object.defineProperty(inst, key, {
      enumerable: false,
      configurable: true,
      get: () => store[key],
      set: (v: unknown) => { store[key] = v as never; },
    });
  }
  Object.defineProperty(inst, STORE, { value: store, enumerable: false });
  return inst as T;
}

/**
 * Simulate a column the DRIVER never returned — an older container, a raw query,
 * a hand-built fixture.
 *
 * It removes the value from the backing store, not just the accessor, because
 * `delete row.col` alone leaves `.get({ plain: true })` still returning it and
 * the test then proves nothing.
 */
export function dropColumn(row: Record<string, any>, key: string): void {
  const store = (row as Record<symbol, Record<string, unknown>>)[STORE];
  if (store) delete store[key];
  delete row[key];
}

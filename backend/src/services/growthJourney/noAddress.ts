/**
 * The no-address rule, as one function (Phase 4 T402/T404).
 *
 * The contract's standing check: a handoff evidence packet, a ledger payload
 * or an outcome's metadata that carries an `@` fails the phase. Applied at the
 * writers rather than hoped about — the outcome recorder refuses before its
 * create, the handoff writer refuses before its create — and shared here so
 * the two cannot drift.
 */

/** The first path at which a string value contains `@`, or null when none does. */
export function findAddressLikeValue(value: unknown, path = 'value'): string | null {
  if (typeof value === 'string') return value.includes('@') ? path : null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = findAddressLikeValue(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const hit = findAddressLikeValue(v, `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

export class AddressInPayloadError extends Error {
  readonly error_class = 'ContractViolation';
  constructor(readonly path: string, what: string) {
    super(`${what} carries an address-like value at ${path}`);
    this.name = 'AddressInPayloadError';
  }
}

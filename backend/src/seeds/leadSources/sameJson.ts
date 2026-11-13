/**
 * Order-blind JSON equality for the lead-source seed.
 *
 * WHY: Postgres JSONB does not keep key order (it stores keys shortest-first), so a field_map read
 * back from `form_definitions` never `JSON.stringify`s the same as the seed's literal. The seed
 * compared exactly that way, so EVERY re-run decided the map had changed and superseded each form
 * with an identical new version (seen on prod 2026-11-13: hire-refactored v1 -> v2, same map).
 * Arrays keep their order: `required_fields` order is data.
 */
const canonical = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]));
  }
  return v;
};

export const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

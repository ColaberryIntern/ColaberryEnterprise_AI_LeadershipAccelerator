/**
 * One field, scrubbed to the bar the journey tree sets. A LEAF: no imports at all.
 *
 * ── WHY IT MOVED HERE (MR3) ────────────────────────────────────────────────
 *
 * It lived in `buildReadiness.ts`, which value-imports the model barrel and `sequelize`. That was
 * fine while the readiness reader was its only consumer. `describeDecision.ts` is a pure
 * renderer and needs the same scrub, and importing it from `buildReadiness` would have dragged
 * the whole model graph into a function that touches no database - making the renderer
 * untestable without mocks and its "pure" claim untrue.
 *
 * Duplicating the scrub was the other option and the worse one: two copies of a redaction rule
 * drift, and the one that drifts is the one that leaks. `buildReadiness` re-exports both symbols,
 * so every existing importer is unchanged.
 *
 * ── THE RULE, AND WHY IT IS NOT THE OBVIOUS ONE ────────────────────────────
 *
 * An `@` anywhere replaces the WHOLE value. `redactForLogs` is the wrong tool and an earlier
 * version of the CLI used it: its email pattern captures the `@` as part of the domain group, so
 * `someone@example.com` becomes `s***@example.com` - masked local part, `@` intact. The bar this
 * phase sets is that an `@` in a served JSON response fails the phase, so the only honest rule is
 * to drop the value.
 *
 * And the scrub happens PER FIELD, never over a serialised document: running a redactor across a
 * JSON envelope mangles roughly one UUID in fifty.
 */

/**
 * The cap on a reason or a next_move.
 *
 * The longest AUTHORED reason renders at about 171 characters, so the headroom is real but thin -
 * an earlier version of this comment said "nothing authored here comes close", which overstated
 * 29 characters of slack. The readiness suite pins it: if a future reason grows past the cap, the
 * cell fails rather than the reason being silently truncated.
 */
export const FIELD_CAP = 200;

export function scrubField(t: string): string {
  if (t.includes('@')) return 'redacted - the value carried an address';
  return t.length > FIELD_CAP ? `${t.slice(0, FIELD_CAP)}...` : t;
}

/**
 * bpInheritedContext — calm helper that surfaces a BP-section's
 * inherited operational context as a single section-header sentence
 * above the BP list, so unbuilt BPs read as "part of an area that
 * matters" rather than flat inventory.
 *
 * Operational Priority Topology Recovery Sprint, 2026-05-16 — original
 * per-BP variant.
 *
 * Semantic Coherence + Operational Wayfinding Sprint, 2026-05-16 —
 * collapsed to a single section-header phrasing. In a large expanded
 * domain (e.g. 14 BPs), the per-BP form was repeating the same sentence
 * 14 times in immediate vertical sequence — shifting from anchor to
 * boilerplate. The section-header form preserves inheritance
 * understanding without the visual repetition.
 *
 * Observational tone only. Returns null when there is nothing
 * meaningful to say (no downstream, missing label) — honest silence,
 * no "supports 0 downstream" filler.
 */

export function inheritedDomainContextSentence(
  domainLabel: string,
  downstreamCount: number,
): string | null {
  if (!domainLabel) return null;
  if (downstreamCount <= 0) return null;
  const noun = downstreamCount === 1 ? 'area' : 'areas';
  return `Each BP below sits inside ${domainLabel} — supports ${downstreamCount} downstream ${noun}.`;
}

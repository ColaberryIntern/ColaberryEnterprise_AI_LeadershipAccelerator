/**
 * bpInheritedContext — calm helper that surfaces a BP's inherited
 * domain-level operational context inside each BP row, so even unbuilt
 * BPs read as "part of an area that matters" rather than flat inventory.
 *
 * Operational Priority Topology Recovery Sprint, 2026-05-16.
 *
 * Background: in the prior sprint, each BP row in an expanded domain
 * rendered as a single horizontal line — name, count, builtness word,
 * chevron. The eye drops from the domain header (which mentions
 * downstream relationships) into a flat list that loses operational
 * weight. This helper produces a one-line italic sub-sentence that
 * travels with each BP row, inheriting the domain's downstream count.
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
  return `In ${domainLabel} — supports ${downstreamCount} downstream ${noun}.`;
}

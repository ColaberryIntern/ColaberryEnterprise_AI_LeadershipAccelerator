/**
 * levelJourneyIndex — which node of the level journey is "You are here".
 *
 * Pure so it can be tested without rendering. The journey shows the four free
 * rungs by exact name and the two build bands ("AI Builder", "AI Architect") as
 * single nodes, but the server names a promoted learner by their RUNG ("AI
 * Builder III", "Senior AI Architect"). An exact-name match therefore failed for
 * every promoted learner and fell back to the points rung, planting "You are
 * here" on AI Enabled II for someone who was an AI Builder. Build nodes are
 * matched by prefix instead.
 */
export interface JourneyNode { name: string; min: number | null; kind: 'free' | 'build'; }

export function journeyIndexFor(nodes: JourneyNode[], points: number, currentName?: string | null): number {
  const name = (currentName || '').trim();
  if (name) {
    const exact = nodes.findIndex((n) => n.name === name);
    if (exact >= 0) return exact;
    // "Senior AI Architect" belongs to the AI Architect node; "AI Builder III" to
    // AI Builder. Check the higher band first so "Senior AI Architect" never
    // matches a Builder node by accident, and require the band name as a whole
    // word so "AI Builder" cannot match "AI Builders" copy that may appear later.
    const build = nodes
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => n.kind === 'build')
      .reverse()
      .find(({ n }) => new RegExp(`(^|\\s)${n.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(name));
    if (build) return build.i;
  }
  const pts = Number.isFinite(points) ? points : 0;
  let idx = 0;
  nodes.forEach((n, i) => { if (n.min != null && pts >= n.min) idx = i; });
  return idx;
}

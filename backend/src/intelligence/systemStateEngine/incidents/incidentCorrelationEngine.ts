/**
 * incidentCorrelationEngine — pure helpers that group related incidents.
 *
 * Two incidents are correlated when:
 *   - same `type` AND
 *   - share at least one affected route AND
 *   - opened within `correlation_window_min` of each other
 *
 * Returns ID groups so the dashboard can collapse storms into single rows.
 *
 * Phase 9 §2.
 */

export interface IncidentForCorrelation {
  readonly id: string;
  readonly type: string;
  readonly affected_routes: ReadonlyArray<string>;
  readonly opened_at: Date;
  readonly severity: 'info' | 'warning' | 'error';
}

export interface CorrelationCluster {
  readonly cluster_id: string;
  readonly incident_ids: ReadonlyArray<string>;
  readonly type: string;
  readonly routes: ReadonlyArray<string>;
  readonly first_opened_at: Date;
  readonly last_opened_at: Date;
  readonly highest_severity: 'info' | 'warning' | 'error';
}

export function correlateIncidents(
  incidents: ReadonlyArray<IncidentForCorrelation>,
  correlation_window_min: number = 30,
): CorrelationCluster[] {
  const sevRank: Record<string, number> = { info: 0, warning: 1, error: 2 };
  // Sort by opened_at ascending
  const sorted = [...incidents].sort((a, b) => a.opened_at.getTime() - b.opened_at.getTime());

  // Each cluster: type → list of (route set, time range, members)
  const clusters: Array<{
    type: string;
    routes: Set<string>;
    first: Date;
    last: Date;
    highest: 'info' | 'warning' | 'error';
    members: string[];
  }> = [];

  for (const inc of sorted) {
    const windowMs = correlation_window_min * 60_000;
    // Find an existing cluster of the same type whose route set overlaps
    // and whose `last` is within the window.
    const c = clusters.find(c =>
      c.type === inc.type &&
      Math.abs(inc.opened_at.getTime() - c.last.getTime()) <= windowMs &&
      inc.affected_routes.some(r => c.routes.has(r)),
    );
    if (c) {
      c.members.push(inc.id);
      for (const r of inc.affected_routes) c.routes.add(r);
      if (inc.opened_at > c.last) c.last = inc.opened_at;
      if (inc.opened_at < c.first) c.first = inc.opened_at;
      if (sevRank[inc.severity] > sevRank[c.highest]) c.highest = inc.severity;
    } else {
      clusters.push({
        type: inc.type,
        routes: new Set(inc.affected_routes),
        first: inc.opened_at,
        last: inc.opened_at,
        highest: inc.severity,
        members: [inc.id],
      });
    }
  }

  return clusters.map((c, i): CorrelationCluster => ({
    cluster_id: `cluster_${c.type}_${i + 1}`,
    incident_ids: c.members,
    type: c.type,
    routes: Array.from(c.routes),
    first_opened_at: c.first,
    last_opened_at: c.last,
    highest_severity: c.highest,
  }));
}

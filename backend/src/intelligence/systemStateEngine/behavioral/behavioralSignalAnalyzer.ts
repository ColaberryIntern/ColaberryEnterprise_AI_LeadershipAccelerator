/**
 * behavioralSignalAnalyzer — derive friction signals from a stream of
 * behavioral events.
 *
 * Pure: takes events in, returns aggregates per route. No DB.
 *
 * Phase 6 §6.
 */

export type BehavioralEventKind =
  | 'click' | 'rage_click' | 'click_hesitation' | 'repeated_click'
  | 'nav_enter' | 'nav_exit' | 'nav_loop'
  | 'form_submit' | 'form_retry' | 'form_abandon'
  | 'scroll_abandon' | 'dead_end_exit' | 'action_confusion';

export interface BehavioralEvent {
  readonly route: string;
  readonly kind: BehavioralEventKind;
  readonly session_id: string;
  readonly observed_at: string | Date;
  readonly target_selector?: string | null;
  readonly duration_ms?: number | null;
}

export interface RouteBehavioralReport {
  readonly route: string;
  readonly session_count: number;
  readonly total_events: number;
  readonly rage_clicks: number;
  readonly hesitations: number;
  readonly nav_loops: number;
  readonly form_retries: number;
  readonly form_abandons: number;
  readonly dead_end_exits: number;
  readonly scroll_abandons: number;
  /** % sessions ending without a form_submit. */
  readonly abandonment_rate: number;
  /** 0-100 friction signal — higher = worse. */
  readonly friction_pressure: number;
}

export interface BehavioralAggregateReport {
  readonly per_route: ReadonlyArray<RouteBehavioralReport>;
  readonly worst_route: string | null;
  readonly project_friction_pressure: number;
}

export function analyzeBehavioralSignals(events: ReadonlyArray<BehavioralEvent>): BehavioralAggregateReport {
  const byRoute = new Map<string, BehavioralEvent[]>();
  for (const e of events) {
    const arr = byRoute.get(e.route) || [];
    arr.push(e);
    byRoute.set(e.route, arr);
  }

  const reports: RouteBehavioralReport[] = [];
  for (const [route, list] of byRoute) {
    const sessions = new Set<string>();
    const sessionsWithSubmit = new Set<string>();
    let rage = 0, hesitations = 0, navLoops = 0, formRetries = 0, formAbandons = 0, deadEndExits = 0, scrollAbandons = 0;
    for (const e of list) {
      sessions.add(e.session_id);
      if (e.kind === 'rage_click') rage++;
      else if (e.kind === 'click_hesitation' || e.kind === 'repeated_click') hesitations++;
      else if (e.kind === 'nav_loop') navLoops++;
      else if (e.kind === 'form_submit') sessionsWithSubmit.add(e.session_id);
      else if (e.kind === 'form_retry') formRetries++;
      else if (e.kind === 'form_abandon') formAbandons++;
      else if (e.kind === 'dead_end_exit') deadEndExits++;
      else if (e.kind === 'scroll_abandon') scrollAbandons++;
    }
    const abandonmentRate = sessions.size > 0
      ? Math.round((1 - sessionsWithSubmit.size / sessions.size) * 100)
      : 0;

    // Friction pressure: weighted sum, clamped to 100.
    const pressure = Math.min(100,
      rage * 8 +
      hesitations * 3 +
      navLoops * 6 +
      formRetries * 5 +
      formAbandons * 7 +
      deadEndExits * 4 +
      scrollAbandons * 2,
    );

    reports.push({
      route,
      session_count: sessions.size,
      total_events: list.length,
      rage_clicks: rage,
      hesitations,
      nav_loops: navLoops,
      form_retries: formRetries,
      form_abandons: formAbandons,
      dead_end_exits: deadEndExits,
      scroll_abandons: scrollAbandons,
      abandonment_rate: abandonmentRate,
      friction_pressure: pressure,
    });
  }

  // Sort by friction descending so the worst route surfaces first.
  reports.sort((a, b) => b.friction_pressure - a.friction_pressure);

  const worst = reports.length > 0 ? reports[0] : null;
  const project_friction_pressure = reports.length > 0
    ? Math.round(reports.reduce((s, r) => s + r.friction_pressure, 0) / reports.length)
    : 0;

  return {
    per_route: reports,
    worst_route: worst?.route ?? null,
    project_friction_pressure,
  };
}

/**
 * userFlowIntelligence — analyze nav_enter/nav_exit events to detect drop-off
 * points, navigation loops, and inefficient paths.
 *
 * Pure: takes events in, returns flow report. No DB.
 *
 * Phase 6 §7.
 */
import type { BehavioralEvent } from './behavioralSignalAnalyzer';

export interface FlowEdge {
  readonly from: string;
  readonly to: string;
  readonly count: number;
}

export interface DropOffPoint {
  readonly route: string;
  /** Sessions that entered but had no nav_exit + no form_submit. */
  readonly count: number;
  /** Drop-off ratio: 0-1. */
  readonly ratio: number;
}

export interface UserFlowReport {
  readonly edges: ReadonlyArray<FlowEdge>;
  readonly drop_off_points: ReadonlyArray<DropOffPoint>;
  /** Routes that appear in nav_loop events. */
  readonly loop_routes: ReadonlyArray<{ route: string; loop_count: number }>;
  /** Workflow completion rate (0-1) — sessions with form_submit / total sessions. */
  readonly completion_rate: number;
  /** Friction-zone routes: ranked by per-route negative-event count. */
  readonly friction_zones: ReadonlyArray<{ route: string; friction_events: number }>;
}

export function analyzeUserFlow(events: ReadonlyArray<BehavioralEvent>): UserFlowReport {
  // Edges: build (from, to) pairs from session-ordered nav events.
  const sessionPaths = new Map<string, Array<{ route: string; ts: number; kind: string }>>();
  for (const e of events) {
    const arr = sessionPaths.get(e.session_id) || [];
    arr.push({ route: e.route, ts: new Date(e.observed_at).getTime(), kind: e.kind });
    sessionPaths.set(e.session_id, arr);
  }

  const edgeCounts = new Map<string, number>();
  const sessionsByRoute = new Map<string, Set<string>>();
  const exitsByRoute = new Map<string, Set<string>>();
  const submitsByRoute = new Map<string, Set<string>>();
  const friction = new Map<string, number>();
  let totalSessions = 0;
  let sessionsWithSubmit = 0;

  for (const [sessionId, path] of sessionPaths) {
    totalSessions++;
    path.sort((a, b) => a.ts - b.ts);
    let lastNav: string | null = null;
    let sawSubmit = false;
    for (const e of path) {
      if (e.kind === 'nav_enter') {
        const set = sessionsByRoute.get(e.route) || new Set<string>();
        set.add(sessionId);
        sessionsByRoute.set(e.route, set);
        if (lastNav && lastNav !== e.route) {
          const key = `${lastNav}→${e.route}`;
          edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
        }
        lastNav = e.route;
      } else if (e.kind === 'nav_exit') {
        const set = exitsByRoute.get(e.route) || new Set<string>();
        set.add(sessionId);
        exitsByRoute.set(e.route, set);
      } else if (e.kind === 'form_submit') {
        sawSubmit = true;
        const set = submitsByRoute.get(e.route) || new Set<string>();
        set.add(sessionId);
        submitsByRoute.set(e.route, set);
      } else if (
        e.kind === 'rage_click' ||
        e.kind === 'form_abandon' ||
        e.kind === 'form_retry' ||
        e.kind === 'dead_end_exit' ||
        e.kind === 'scroll_abandon'
      ) {
        friction.set(e.route, (friction.get(e.route) || 0) + 1);
      }
    }
    if (sawSubmit) sessionsWithSubmit++;
  }

  const edges: FlowEdge[] = Array.from(edgeCounts.entries()).map(([k, count]) => {
    const [from, to] = k.split('→');
    return { from, to, count };
  }).sort((a, b) => b.count - a.count);

  const drop_off_points: DropOffPoint[] = Array.from(sessionsByRoute.entries()).map(([route, sessions]) => {
    const exited = exitsByRoute.get(route)?.size ?? 0;
    const submitted = submitsByRoute.get(route)?.size ?? 0;
    const dropoffSessions = sessions.size - submitted - exited;
    const count = Math.max(0, dropoffSessions);
    const ratio = sessions.size > 0 ? count / sessions.size : 0;
    return { route, count, ratio: Math.round(ratio * 100) / 100 };
  })
    .filter(d => d.count > 0)
    .sort((a, b) => b.count - a.count);

  const loopMap = new Map<string, number>();
  for (const e of events) {
    if (e.kind === 'nav_loop') loopMap.set(e.route, (loopMap.get(e.route) || 0) + 1);
  }
  const loop_routes = Array.from(loopMap.entries())
    .map(([route, loop_count]) => ({ route, loop_count }))
    .sort((a, b) => b.loop_count - a.loop_count);

  const friction_zones = Array.from(friction.entries())
    .map(([route, friction_events]) => ({ route, friction_events }))
    .sort((a, b) => b.friction_events - a.friction_events);

  const completion_rate = totalSessions > 0 ? sessionsWithSubmit / totalSessions : 0;

  return {
    edges,
    drop_off_points,
    loop_routes,
    completion_rate: Math.round(completion_rate * 100) / 100,
    friction_zones,
  };
}

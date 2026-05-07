/**
 * continuousRouteObserver — schedule periodic vision captures + DOM
 * snapshots for a project's tracked routes.
 *
 * V1 emits cognitive events on each tick; the actual capture happens through
 * the existing capture pipeline (which itself fails-soft when Puppeteer is
 * absent). The observer is the orchestrator — it doesn't capture itself.
 *
 * Phase 8 §4.
 */
import { publishCognitiveEvent } from './cognitiveEventBus';

export interface ObserverConfig {
  readonly project_id: string;
  readonly routes: ReadonlyArray<string>;
  readonly viewports: ReadonlyArray<'desktop' | 'tablet' | 'mobile'>;
  readonly preview_origin: string;        // e.g., "http://localhost:3000"
  readonly output_dir: string;
  readonly cookie_string?: string | null;
}

const projectConfigs = new Map<string, ObserverConfig>();

export function registerProjectForObservation(config: ObserverConfig): void {
  projectConfigs.set(config.project_id, config);
}

export function unregisterProjectFromObservation(projectId: string): void {
  projectConfigs.delete(projectId);
}

export function listObservedProjects(): ReadonlyArray<string> {
  return Array.from(projectConfigs.keys());
}

/**
 * Heartbeat handler that runs once per tick per observed project. Emits a
 * cognitive event tagged with the planned routes + viewports so subscribers
 * can choose to actually trigger captures (we don't want every tick to fire
 * a real GPT-4o call).
 */
export async function observeProjectTick(projectId: string, tickNumber: number): Promise<void> {
  const config = projectConfigs.get(projectId);
  if (!config) return;

  // Throttle: only act every 10th tick by default (10 minutes if base
  // interval is 60s). Avoids GPT-4o + Puppeteer storms.
  if (tickNumber % 10 !== 0) return;

  publishCognitiveEvent({
    kind: 'awareness.heartbeat',
    project_id: projectId,
    severity: 'info',
    payload: {
      observer: 'continuousRouteObserver',
      planned_routes: config.routes,
      planned_viewports: config.viewports,
      tick: tickNumber,
    },
  });

  // Best-effort: invoke the capture pipeline once per route per tick. If
  // Puppeteer isn't installed, captureRouteAcrossViewports returns failure
  // outcomes immediately — no harm.
  try {
    const { captureRouteAcrossViewports } = await import('../capture/routeSnapshotScheduler');
    for (const route of config.routes) {
      const url = `${config.preview_origin.replace(/\/$/, '')}${route}`;
      await captureRouteAcrossViewports({
        url,
        viewports: config.viewports,
        output_dir: config.output_dir,
        cookie_string: config.cookie_string,
      });
    }
  } catch (err: any) {
    console.warn('[continuousRouteObserver] capture invocation failed:', err?.message);
  }
}

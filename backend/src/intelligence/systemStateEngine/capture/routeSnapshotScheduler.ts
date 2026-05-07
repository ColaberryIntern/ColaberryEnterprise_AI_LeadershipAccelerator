/**
 * routeSnapshotScheduler — orchestrates capture of a route across viewports
 * and stores the results as DOMSnapshot rows (when DOM is also captured).
 *
 * Foundation only: this V1 wraps the capture provider and records screenshot
 * paths against existing snapshots. Full scheduler (cron-driven captures
 * for every route in the project) is a Phase 8 polish item.
 *
 * Phase 7 §3.
 */
import { capture, type CaptureOutcome } from './screenshotCaptureService';
import { selectViewports, type ViewportLabel } from './viewportVariantGenerator';

export interface MultiViewportCaptureInput {
  readonly url: string;
  readonly viewports: ReadonlyArray<ViewportLabel>;
  readonly output_dir: string;
  readonly cookie_string?: string | null;
}

export interface MultiViewportCaptureOutcome {
  readonly captures: ReadonlyArray<CaptureOutcome>;
  readonly success_count: number;
  readonly failure_count: number;
}

export async function captureRouteAcrossViewports(input: MultiViewportCaptureInput): Promise<MultiViewportCaptureOutcome> {
  const specs = selectViewports(input.viewports);
  const results: CaptureOutcome[] = [];
  for (const spec of specs) {
    const r = await capture({
      url: input.url,
      viewport: spec,
      output_dir: input.output_dir,
      cookie_string: input.cookie_string,
    });
    results.push(r);
  }
  const success = results.filter(r => r.ok).length;
  return {
    captures: results,
    success_count: success,
    failure_count: results.length - success,
  };
}

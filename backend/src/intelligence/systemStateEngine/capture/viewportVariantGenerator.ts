/**
 * viewportVariantGenerator — canonical viewport definitions for multi-viewport
 * capture. Pure.
 *
 * Phase 7 §3.
 */

export type ViewportLabel = 'desktop' | 'tablet' | 'mobile';

export interface ViewportSpec {
  readonly label: ViewportLabel;
  readonly width: number;
  readonly height: number;
  readonly device_scale_factor: number;
  readonly is_mobile: boolean;
  readonly user_agent?: string;
}

export const STANDARD_VIEWPORTS: ReadonlyArray<ViewportSpec> = Object.freeze([
  Object.freeze({ label: 'desktop' as const, width: 1280, height: 800, device_scale_factor: 1, is_mobile: false }),
  Object.freeze({ label: 'tablet' as const, width: 834, height: 1112, device_scale_factor: 2, is_mobile: true,
    user_agent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1' }),
  Object.freeze({ label: 'mobile' as const, width: 390, height: 844, device_scale_factor: 3, is_mobile: true,
    user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1' }),
]);

export function getViewportSpec(label: ViewportLabel): ViewportSpec {
  const found = STANDARD_VIEWPORTS.find(v => v.label === label);
  if (!found) throw new Error(`Unknown viewport label: ${label}`);
  return found;
}

/** Subset selection helper. */
export function selectViewports(labels: ReadonlyArray<ViewportLabel>): ReadonlyArray<ViewportSpec> {
  return labels.map(getViewportSpec);
}

/**
 * scanSpeedSignals — lightweight editorial metadata for the collapsed
 * domain row.
 *
 * Executive Signal Layering Sprint, 2026-05-15.
 *
 * The classifier already computes completion + downstream counts. They
 * were rendered only inside the expanded view, so the operator had to
 * click each row to see them. This file surfaces them as a calm
 * editorial metadata line in the row header — two items max, dot-
 * separated, muted, no bold numbers, no colored percentages.
 *
 * Hard rules — asserted by the unit tests:
 *   - Every builder returns null when there is no signal, so the strip
 *     either renders a real item or stays silent. No "0%" filler.
 *   - No KPI vocabulary anywhere: never "score", "rating", "metric", "KPI".
 *   - No imperatives.
 *
 * Two items by design — the strip should read at scan speed, not as
 * a row of badges. Anything more becomes a dashboard.
 */
import type { DomainBucket } from './bpDomainClassifier';

/** "47% complete" or null when no requirements are extracted yet. */
export function completionLabel(bucket: DomainBucket): string | null {
  if (bucket.totalRequirements <= 0) return null; // honest silence
  return `${bucket.completionPercent}% complete`;
}

/**
 * "supports 3 downstream areas" / "supports 1 downstream area" — uses
 * the same vocabulary as the forward-looking leverage note and the
 * OperatorFocusCard's "supports the broadest operational surface" line.
 */
export function downstreamLabel(bucket: DomainBucket): string | null {
  const n = bucket.downstreamCount;
  if (n <= 0) return null;
  return `supports ${n} downstream area${n === 1 ? '' : 's'}`;
}

/**
 * The actual strip — at most two items, in priority order:
 * completion first (progress), downstream second (leverage). The strip
 * is rendered only when this array is non-empty.
 */
export function metadataItems(bucket: DomainBucket): string[] {
  const items: string[] = [];
  const c = completionLabel(bucket);
  if (c) items.push(c);
  const d = downstreamLabel(bucket);
  if (d) items.push(d);
  return items;
}

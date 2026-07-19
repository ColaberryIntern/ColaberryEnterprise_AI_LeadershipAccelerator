/**
 * todayFeedPlan — the PURE core of the Today Timeline v2 engagement engine.
 * No I/O, no randomness, no DB imports (the AmbientProviderSlug import is
 * type-only and erased at compile), so it is trivially unit-testable and
 * deterministic. The composer (todayFeedComposer.ts) is the I/O shell that fills
 * the slots this planner lays out.
 */
import type { AmbientProviderSlug } from './ambientPool';

export type TodayItemKind = 'anchored' | 'ambient';
export interface PlannedSlot { kind: TodayItemKind; provider?: AmbientProviderSlug; }

/**
 * Decide the kind (and ambient provider) for the next `count` feed slots.
 * Cadence = anchored items between ambient injections; providers round-robin and
 * never repeat back-to-back when more than one is available. When anchored is
 * exhausted the remainder is pure ambient (bottomless). `anchoredPlaced` /
 * `ambientPlaced` carry cadence + round-robin continuity across pages.
 */
export function planSlots(opts: {
  count: number;
  anchoredAvailable: number;
  providers: AmbientProviderSlug[];
  cadence: number;
  anchoredPlaced: number;
  ambientPlaced: number;
}): { slots: PlannedSlot[]; anchoredUsed: number; ambientUsed: number } {
  const cad = Math.max(1, Math.floor(opts.cadence));
  const providers = opts.providers;
  let anchoredRem = Math.max(0, opts.anchoredAvailable);
  let sinceAmbient = ((opts.anchoredPlaced % cad) + cad) % cad;
  let providerIdx = Math.max(0, opts.ambientPlaced);
  const slots: PlannedSlot[] = [];
  let anchoredUsed = 0;
  let ambientUsed = 0;
  let lastProvider: AmbientProviderSlug | undefined;

  for (let i = 0; i < opts.count; i++) {
    const wantAnchored = anchoredRem > 0 && sinceAmbient < cad;
    let kind: TodayItemKind;
    if (wantAnchored) kind = 'anchored';
    else if (providers.length > 0) kind = 'ambient';
    else if (anchoredRem > 0) kind = 'anchored';   // no ambient providers → keep placing anchored
    else break;                                     // nothing left to place

    if (kind === 'anchored') {
      slots.push({ kind: 'anchored' });
      anchoredRem--; anchoredUsed++; sinceAmbient++;
    } else {
      let provider = providers[providerIdx % providers.length];
      if (providers.length > 1 && provider === lastProvider) {
        providerIdx++;
        provider = providers[providerIdx % providers.length];
      }
      slots.push({ kind: 'ambient', provider });
      lastProvider = provider;
      providerIdx++; ambientUsed++; sinceAmbient = 0;
    }
  }
  return { slots, anchoredUsed, ambientUsed };
}

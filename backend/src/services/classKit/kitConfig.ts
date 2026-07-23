/**
 * kitConfig.ts — the instructor-adjustable overrides that modulate a Class Kit
 * spec build. Pure (no DB/I/O) — the DB read/write lives in
 * sessionKitConfigService.ts, which is the only thing that imports this into a
 * live_sessions column. buildKitSpec/kitSpecDaySlides apply it deterministically,
 * so the same (content, config) pair always renders the same deck.
 *
 * Design: every customizable category follows the same contract — a toggle to
 * turn it off, and either a cap (`max`) or a `overrides` array that, when set,
 * FULLY REPLACES the authored defaults for that category. There is no partial
 * patch/merge of individual authored items — "null = use my defaults, set =
 * here's your full replacement" is one mental model applied everywhere, which
 * keeps both the UI and this module simple.
 */
import { StoryBeat } from '../../data/classSessionPlan';
import { EvidenceClaim } from '../../data/classTeachContent';

export interface StoryBeatOverride extends StoryBeat {
  /** Which run-of-show segment to insert after (e.g. 'business-problem',
   * 'architecture', 'welcome') — the same segment ids used in the authored
   * `storyBeats` maps in classSessionPlan.ts. */
  segment: string;
}

export interface KitConfig {
  storyBeats: {
    enabled: boolean;
    /** Cap on total story-beat slides in the deck. null = no cap (show all). */
    max: number | null;
    /** Full replacement set. null = use the authored defaults for this day. */
    overrides: StoryBeatOverride[] | null;
  };
  /** Live Decision Theater — full-screen poll treatment. When false, theater-
   * flagged interactions render as the normal compact inline poll instead. */
  theaterEnabled: boolean;
  /** Build Bay "you should see" / "stop when" rows. When false, prompts still
   * show (label + copy box + rescue), just without the extra detail rows. */
  buildBayDetail: boolean;
  /** Full replacement for the readiness report's source/evidence ledger. Does
   * NOT change the small footer already baked into individual teach slides —
   * only the readiness report's aggregate list, which is the "what am I
   * teaching as fact" review surface. null = use the authored defaults. */
  evidenceOverrides: EvidenceClaim[] | null;
}

export const DEFAULT_KIT_CONFIG: KitConfig = {
  storyBeats: { enabled: true, max: null, overrides: null },
  theaterEnabled: true,
  buildBayDetail: true,
  evidenceOverrides: null,
};

/** Merge a possibly-partial/possibly-null saved config over the defaults —
 * every field is independently optional, so an old/short-saved config never
 * crashes a render; missing pieces just fall back to the default. */
export function mergeKitConfig(saved: unknown): KitConfig {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<KitConfig>;
  const sb = (s.storyBeats && typeof s.storyBeats === 'object' ? s.storyBeats : {}) as Partial<KitConfig['storyBeats']>;
  return {
    storyBeats: {
      enabled: typeof sb.enabled === 'boolean' ? sb.enabled : DEFAULT_KIT_CONFIG.storyBeats.enabled,
      max: typeof sb.max === 'number' ? sb.max : DEFAULT_KIT_CONFIG.storyBeats.max,
      overrides: Array.isArray(sb.overrides) ? sb.overrides : DEFAULT_KIT_CONFIG.storyBeats.overrides,
    },
    theaterEnabled: typeof s.theaterEnabled === 'boolean' ? s.theaterEnabled : DEFAULT_KIT_CONFIG.theaterEnabled,
    buildBayDetail: typeof s.buildBayDetail === 'boolean' ? s.buildBayDetail : DEFAULT_KIT_CONFIG.buildBayDetail,
    evidenceOverrides: Array.isArray(s.evidenceOverrides) ? s.evidenceOverrides : DEFAULT_KIT_CONFIG.evidenceOverrides,
  };
}

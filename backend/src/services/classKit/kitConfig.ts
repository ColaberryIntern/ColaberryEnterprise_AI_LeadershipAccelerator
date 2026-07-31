/**
 * kitConfig.ts — the instructor-adjustable overrides that modulate a Class Kit
 * spec build. Pure (no DB/I/O) — the DB read/write lives in
 * sessionKitConfigService.ts, which is the only thing that imports this into a
 * live_sessions column. buildKitSpec/kitSpecDaySlides apply it deterministically,
 * so the same (content, config) pair always renders the same deck.
 *
 * Design: every customizable category follows the same contract — a toggle to
 * turn it off, and either a cap (`max`) or an `overrides` array that, when set,
 * FULLY REPLACES the authored defaults for that category. There is no partial
 * patch/merge of individual authored items — "null = use my defaults, set =
 * here's your full replacement" is one mental model applied everywhere, which
 * keeps both the UI and this module simple.
 */
import { StoryBeat, ClassPrompt, Interaction } from '../../data/classSessionPlan';
import { EvidenceClaim, TeachSlide } from '../../data/classTeachContent';

export interface StoryBeatOverride extends StoryBeat {
  /** Which run-of-show segment to insert after (e.g. 'business-problem',
   * 'architecture', 'welcome') — the same segment ids used in the authored
   * `storyBeats` maps in classSessionPlan.ts. */
  segment: string;
}

/** A single interaction "slot" — one of the three fixed poll/trivia moments
 * every class carries (Monday's design-choice poll, Monday's knowledge-check
 * trivia, Thursday's warm-up trivia). enabled:false removes that slide
 * entirely; override replaces the question/options/reveal wholesale. */
export interface InteractionSlot {
  enabled: boolean;
  override: Interaction | null;
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

  /** Deep teaching slides ("Lessons") — the multi-slide substance spliced into
   * each run-of-show segment (body/bullets/code/script/diagram). enabled:false
   * hides every teach slide for this session; max caps how many show, in
   * authored order; overrides fully replaces the authored/generated set for
   * whichever day this session is (a session is always either Architecture
   * Day or Build Day, never both, so no separate day tag is needed). null
   * overrides = use classTeachContent.ts's hand-authored/fan-out-generated
   * defaults for this week+day. */
  teach: {
    enabled: boolean;
    max: number | null;
    overrides: TeachSlide[] | null;
  };

  /** Copy-ready Claude Code prompts ("Claude Code examples") shown in the
   * guided-build FALLBACK path — i.e. weeks that do NOT yet have deep
   * teaching content authored for guided-build (most weeks besides Week 1 /
   * Orientation). For a week WITH deep teach content, its prompts live inside
   * `teach` overrides instead (each teach slide's own `code` field) — this
   * category has no effect there; the Customize UI surfaces that distinction
   * so it's never a silent no-op. */
  prompts: {
    enabled: boolean;
    max: number | null;
    overrides: ClassPrompt[] | null;
  };

  /** The three fixed interaction slots every class can carry ("survey
   * questions"): Monday's design-choice poll (asked once, revealed once —
   * the same question both times), Monday's knowledge-check trivia, and
   * Thursday's warm-up trivia. */
  interactions: {
    mondayPoll: InteractionSlot;
    mondayTrivia: InteractionSlot;
    thursdayTrivia: InteractionSlot;
  };
}

const DEFAULT_INTERACTION_SLOT: InteractionSlot = { enabled: true, override: null };

export const DEFAULT_KIT_CONFIG: KitConfig = {
  storyBeats: { enabled: true, max: null, overrides: null },
  theaterEnabled: true,
  buildBayDetail: true,
  evidenceOverrides: null,
  teach: { enabled: true, max: null, overrides: null },
  prompts: { enabled: true, max: null, overrides: null },
  interactions: {
    mondayPoll: { ...DEFAULT_INTERACTION_SLOT },
    mondayTrivia: { ...DEFAULT_INTERACTION_SLOT },
    thursdayTrivia: { ...DEFAULT_INTERACTION_SLOT },
  },
};

function mergeCountAndOverride<T>(
  saved: unknown,
  fallback: { enabled: boolean; max: number | null; overrides: T[] | null },
): { enabled: boolean; max: number | null; overrides: T[] | null } {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<{ enabled: boolean; max: number | null; overrides: T[] | null }>;
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : fallback.enabled,
    max: typeof s.max === 'number' ? s.max : fallback.max,
    overrides: Array.isArray(s.overrides) ? s.overrides : fallback.overrides,
  };
}

function mergeInteractionSlot(saved: unknown, fallback: InteractionSlot): InteractionSlot {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<InteractionSlot>;
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : fallback.enabled,
    override: s.override && typeof s.override === 'object' ? (s.override as Interaction) : fallback.override,
  };
}

/** Merge a possibly-partial/possibly-null saved config over the defaults —
 * every field is independently optional, so an old/short-saved config never
 * crashes a render; missing pieces just fall back to the default. */
export function mergeKitConfig(saved: unknown): KitConfig {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<KitConfig>;
  const sb = (s.storyBeats && typeof s.storyBeats === 'object' ? s.storyBeats : {}) as Partial<KitConfig['storyBeats']>;
  const si = (s.interactions && typeof s.interactions === 'object' ? s.interactions : {}) as Partial<KitConfig['interactions']>;
  return {
    storyBeats: {
      enabled: typeof sb.enabled === 'boolean' ? sb.enabled : DEFAULT_KIT_CONFIG.storyBeats.enabled,
      max: typeof sb.max === 'number' ? sb.max : DEFAULT_KIT_CONFIG.storyBeats.max,
      overrides: Array.isArray(sb.overrides) ? sb.overrides : DEFAULT_KIT_CONFIG.storyBeats.overrides,
    },
    theaterEnabled: typeof s.theaterEnabled === 'boolean' ? s.theaterEnabled : DEFAULT_KIT_CONFIG.theaterEnabled,
    buildBayDetail: typeof s.buildBayDetail === 'boolean' ? s.buildBayDetail : DEFAULT_KIT_CONFIG.buildBayDetail,
    evidenceOverrides: Array.isArray(s.evidenceOverrides) ? s.evidenceOverrides : DEFAULT_KIT_CONFIG.evidenceOverrides,
    teach: mergeCountAndOverride(s.teach, DEFAULT_KIT_CONFIG.teach),
    prompts: mergeCountAndOverride(s.prompts, DEFAULT_KIT_CONFIG.prompts),
    interactions: {
      mondayPoll: mergeInteractionSlot(si.mondayPoll, DEFAULT_KIT_CONFIG.interactions.mondayPoll),
      mondayTrivia: mergeInteractionSlot(si.mondayTrivia, DEFAULT_KIT_CONFIG.interactions.mondayTrivia),
      thursdayTrivia: mergeInteractionSlot(si.thursdayTrivia, DEFAULT_KIT_CONFIG.interactions.thursdayTrivia),
    },
  };
}

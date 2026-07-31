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

/** One survey question ("interaction") placed at a specific run-of-show
 * segment. Generalizes what used to be 3 fixed named slots (Monday poll,
 * Monday trivia, Thursday trivia) into an arbitrary, segment-taggable list —
 * an instructor can add a 4th/5th/Nth question and place it anywhere, the
 * same way `StoryBeatOverride` already works for story beats. `eyebrow`/
 * `title` carry the slide's framing text (e.g. "🔮 Predict" vs "🧭 Architecture
 * challenge") since a generic list-driven renderer can't infer that from the
 * segment alone the way the old hardcoded call sites could. */
export interface InteractionPlacement extends Interaction {
  segment: string;
  eyebrow?: string;
  title?: string;
  /** Guidance shown in the instructor's presenter rail for this specific
   * question (e.g. "do not reveal yet — it pays off later" vs "now reveal").
   * Falls back to a generic tip if omitted. */
  presenterTip?: string;
}

export interface CountAndOverride<T> {
  enabled: boolean;
  /** Cap on how many of this category's slides show, in authored/list order.
   * null = no cap (show all). */
  max: number | null;
  /** Full replacement set. null = use the authored defaults. */
  overrides: T[] | null;
}

export interface KitConfig {
  storyBeats: CountAndOverride<StoryBeatOverride>;
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
  teach: CountAndOverride<TeachSlide>;

  /** Copy-ready Claude Code prompts ("Claude Code examples") shown in the
   * guided-build FALLBACK path — i.e. weeks that do NOT yet have deep
   * teaching content authored for guided-build (most weeks besides Week 1 /
   * Orientation). For a week WITH deep teach content, its prompts live inside
   * `teach` overrides instead (each teach slide's own `code` field) — this
   * category has no effect there; the Customize UI surfaces that distinction
   * so it's never a silent no-op. */
  prompts: CountAndOverride<ClassPrompt>;

  /** Survey questions (polls + trivia) — an arbitrary, segment-taggable list.
   * enabled:false removes every question; max caps the total shown; overrides
   * fully replaces the authored defaults (which recreate the 3 questions this
   * class always carried — Monday's predict-then-reveal poll and knowledge
   * check, Thursday's warm-up trivia — as ordinary list entries, so nothing
   * changes visually until an instructor actually adds/edits/removes one). */
  interactions: CountAndOverride<InteractionPlacement>;
}

export const DEFAULT_KIT_CONFIG: KitConfig = {
  storyBeats: { enabled: true, max: null, overrides: null },
  theaterEnabled: true,
  buildBayDetail: true,
  evidenceOverrides: null,
  teach: { enabled: true, max: null, overrides: null },
  prompts: { enabled: true, max: null, overrides: null },
  interactions: { enabled: true, max: null, overrides: null },
};

function mergeCountAndOverride<T>(saved: unknown, fallback: CountAndOverride<T>): CountAndOverride<T> {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<CountAndOverride<T>>;
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : fallback.enabled,
    max: typeof s.max === 'number' ? s.max : fallback.max,
    overrides: Array.isArray(s.overrides) ? s.overrides : fallback.overrides,
  };
}

/** Merge a possibly-partial/possibly-null saved config over the defaults —
 * every field is independently optional, so an old/short-saved config never
 * crashes a render; missing pieces just fall back to the default. */
export function mergeKitConfig(saved: unknown): KitConfig {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<KitConfig>;
  return {
    storyBeats: mergeCountAndOverride(s.storyBeats, DEFAULT_KIT_CONFIG.storyBeats),
    theaterEnabled: typeof s.theaterEnabled === 'boolean' ? s.theaterEnabled : DEFAULT_KIT_CONFIG.theaterEnabled,
    buildBayDetail: typeof s.buildBayDetail === 'boolean' ? s.buildBayDetail : DEFAULT_KIT_CONFIG.buildBayDetail,
    evidenceOverrides: Array.isArray(s.evidenceOverrides) ? s.evidenceOverrides : DEFAULT_KIT_CONFIG.evidenceOverrides,
    teach: mergeCountAndOverride(s.teach, DEFAULT_KIT_CONFIG.teach),
    prompts: mergeCountAndOverride(s.prompts, DEFAULT_KIT_CONFIG.prompts),
    // Backward-compat: a config saved under the old 3-named-slot shape
    // ({ mondayPoll: {...}, mondayTrivia: {...}, thursdayTrivia: {...} })
    // has no `enabled`/`max`/`overrides` fields at all, so it falls through
    // cleanly to the new list defaults rather than crashing or resurrecting
    // the old shape — exactly the discipline this function already existed
    // to guarantee for every other category.
    interactions: mergeCountAndOverride(s.interactions, DEFAULT_KIT_CONFIG.interactions),
  };
}

/**
 * Shared types for the Customize (KitConfig) modal. Mirrors the backend shapes
 * in backend/src/services/classKit/kitConfig.ts + kitConfigDefaults.ts —
 * frontend and backend types are duplicated rather than shared across the
 * package boundary, matching the existing convention in this codebase.
 */

export const TONES = ['cherry', 'berry', 'amber', 'leaf', 'violet'] as const;
export type Tone = typeof TONES[number];
export const SOURCE_TYPES = ['official-doc', 'research', 'company-report', 'interview', 'internal-verified', 'secondary-reporting'] as const;

export const SEGMENT_OPTIONS: { group: string; options: { value: string; label: string }[] }[] = [
  {
    group: 'Orientation', options: [
      { value: 'welcome', label: 'Welcome' },
      { value: 'big-picture', label: 'Big picture (Ali)' },
      { value: 'platform', label: 'Platform (Taiwo)' },
      { value: 'setup', label: 'Setup (Swati)' },
    ],
  },
  {
    group: 'Architecture Day (Monday)', options: [
      { value: 'cold-open', label: 'Cold open' },
      { value: 'checkin', label: 'Check-in / prediction' },
      { value: 'business-problem', label: 'Business problem' },
      { value: 'architecture', label: 'Architecture' },
      { value: 'deconstruct', label: 'Deconstruct example' },
      { value: 'micro-build', label: 'Micro-build' },
      { value: 'challenge', label: 'Architecture challenge' },
      { value: 'trivia', label: 'Knowledge check' },
      { value: 'trailer', label: 'Thursday trailer' },
    ],
  },
  {
    group: 'Build Day (Thursday)', options: [
      { value: 'result-preview', label: 'Result preview' },
      { value: 'readiness', label: 'Readiness check' },
      { value: 'build-map', label: 'Build map' },
      { value: 'guided-build', label: 'Guided build' },
      { value: 'failure', label: 'Failure injection' },
      { value: 'demos', label: 'Student demos' },
      { value: 'broadcast', label: 'Builder Broadcast' },
      { value: 'cta', label: 'Prove it / assignment' },
    ],
  },
];

/** `body`/`punch` are genuinely optional on the wire — authored defaults
 * (`KitConfigDefaults.storyBeats`, spread straight from the backend's
 * `StoryBeat` source data) and AI-rewritten items alike can omit them, and
 * JSON drops any key whose value is `undefined`. Every read of these fields
 * must fall back explicitly (`?? ''`), the same discipline `InteractionPlacement`
 * already follows below. */
export interface StoryBeatOverride {
  segment: string; icon: string; eyebrow: string; title: string; body?: string; punch?: string; tone: Tone;
}
export interface EvidenceOverride {
  claim: string; publisher: string; sourceTitle: string; publicationDate: string; sourceType: string; note: string;
}
/** `body`/`bullets`/`code`/`script` are genuinely optional on the wire — see
 * the `StoryBeatOverride` comment above; the same gap applies here (real
 * authored `TeachSlide` content and AI-rewritten slides both omit fields
 * freely). Every read must fall back explicitly, never assume presence. */
export interface TeachSlideOverride {
  segment: string; eyebrow: string; title: string; body?: string; bullets?: string[]; code?: { label: string; code: string } | null; script?: string;
}
/** All fields but `label`/`prompt` are genuinely optional on the wire — see
 * the `StoryBeatOverride` comment above. */
export interface PromptOverride {
  label: string; prompt: string; pasteWhere?: string; ccMode?: string; expectedResult?: string; stopCondition?: string; rescue?: string;
}
/** One survey question, placed at a specific run-of-show segment — an
 * arbitrary, segment-taggable list (mirrors StoryBeatOverride's own
 * segment-tagging), not a fixed set of named slots. Dragging a question card
 * to a different lane in the Timeline Builder (a later phase) is exactly
 * changing this `segment` field. */
export interface InteractionPlacement {
  segment: string;
  kind: 'poll' | 'trivia' | 'prediction';
  q: string;
  options: string[];
  /** All of these are genuinely optional on the wire — authored defaults
   * spread straight from a hand-authored `Interaction` often omit `theater`
   * entirely (only polls set it), and JSON drops any key whose value is
   * `undefined`. Every read of these fields in this panel must fall back
   * explicitly (never assume presence), the same way the backend's own
   * `InteractionPlacement` type declares them optional. */
  eyebrow?: string;
  title?: string;
  answer?: number | null;
  reveal?: string;
  theater?: boolean;
  presenterTip?: string;
}
export interface CountAndOverride<T> {
  enabled: boolean; max: number | null; overrides: T[] | null;
}

/** Read-only timeline landmarks (Phase 4/5) — never editable, never part of
 * KitConfig. Mirrors backend/src/services/classKit/kitConfigDefaults.ts's
 * CheckpointLandmark/BreakLandmark. */
export interface CheckpointLandmark { n: number; label: string; detail: string; segment: string }
export interface BreakLandmark { segment: string; startMin: number; endMin: number; label: string }
/** One run-of-show lane for the Timeline Builder — scaled to this session's
 * actual duration, in show order. Mirrors kitConfigDefaults.ts's TimelineSegment. */
export interface TimelineSegment { id: string; label: string; startMin: number; endMin: number; mode: string }

/** A single fixed moment (not a list) — enabled:false removes it entirely;
 * override replaces its content wholesale. */
export interface Slot<T> {
  enabled: boolean; override: T | null;
}
export interface OpeningCopy { title: string; body: string }
export interface HookCopy { headline: string; caption: string }

export interface KitConfig {
  storyBeats: CountAndOverride<StoryBeatOverride>;
  theaterEnabled: boolean;
  buildBayDetail: boolean;
  evidenceOverrides: EvidenceOverride[] | null;
  teach: CountAndOverride<TeachSlideOverride>;
  prompts: CountAndOverride<PromptOverride>;
  interactions: CountAndOverride<InteractionPlacement>;
  opening: {
    coldOpen: Slot<OpeningCopy>;
    hook: Slot<HookCopy>;
    resultPreview: Slot<OpeningCopy>;
  };
}

/** Read-only authored-default content, so the UI can show what is actually
 * running today instead of a "using defaults" placeholder. */
export interface KitConfigDefaults {
  dayKind: 'orientation' | 'architecture' | 'build';
  week: number | null;
  teach: TeachSlideOverride[];
  prompts: PromptOverride[];
  interactions: InteractionPlacement[];
  storyBeats: StoryBeatOverride[];
  evidence: EvidenceOverride[];
  opening: { coldOpen: OpeningCopy | null; hook: HookCopy | null; resultPreview: OpeningCopy | null };
  checkpoints: CheckpointLandmark[];
  breakSegment: BreakLandmark | null;
  segments: TimelineSegment[];
}

export const blankBeat = (): StoryBeatOverride => ({ segment: 'business-problem', icon: '💡', eyebrow: '', title: '', body: '', punch: '', tone: 'berry' });
export const blankEvidence = (): EvidenceOverride => ({ claim: '', publisher: '', sourceTitle: '', publicationDate: '', sourceType: 'research', note: '' });
export const blankTeach = (): TeachSlideOverride => ({ segment: 'guided-build', eyebrow: '', title: '', body: '', bullets: [], code: null, script: '' });
export const blankPrompt = (): PromptOverride => ({ label: '', prompt: '', pasteWhere: 'Claude Code', ccMode: 'Plan Mode', expectedResult: '', stopCondition: '', rescue: '' });
export const blankInteraction = (segment: string, kind: InteractionPlacement['kind'] = 'trivia'): InteractionPlacement => ({
  segment, kind, eyebrow: '🗳️ Survey', title: 'Quick check', q: '', options: ['', ''],
  answer: kind === 'trivia' ? 0 : null, reveal: '', theater: true, presenterTip: '',
});

/** What "Write my own" seeds the editable list from: a copy of the real
 * authored defaults when any exist (so editing starts from real content,
 * not a blank template — the whole point of Phase 3's unification), else
 * one blank item so the editor isn't empty with nothing to click into. */
export function seedOverrides<T>(defaults: T[], blank: () => T): T[] {
  return defaults.length ? defaults.map((d) => ({ ...d })) : [blank()];
}

export type CategoryKey = 'timeline' | 'storyBeats' | 'teach' | 'prompts' | 'interactions' | 'opening' | 'evidence';

/** What the Timeline Builder (Phase 5) drags/reorders: the UNCAPPED resolved
 * list for a segment-taggable category (enabled:false → empty; overrides ??
 * defaults). Deliberately does NOT apply `max` here — capping is display-only
 * (a "won't render at this count" badge) in the timeline, never applied to
 * the array that a drag writes back, so dragging a beyond-cap item can never
 * silently truncate real content out of `overrides`. */
export function resolveTimelineList<T>(cfg: CountAndOverride<T>, defaults: T[]): T[] {
  if (!cfg.enabled) return [];
  return cfg.overrides ?? defaults;
}

/** Pure drag-drop reducer shared by every Timeline Builder track: removes the
 * dragged item, then reinserts it either right before the "over" item's
 * current position (dropped on/near a card — this covers both same-segment
 * reorder and cross-segment moves-to-a-specific-spot), or after the last
 * item currently in the target segment (dropped on a lane's empty area).
 * `overId`/`activeId` are `card::<index>` for a card or `lane::<segmentId>`
 * for a lane's own droppable background — see TimelineBuilderPanel.tsx. */
export function moveItemOnDrop<T>(
  items: T[], activeIndex: number, overIdRaw: string,
  getSegment: (item: T) => string, setSegment: (item: T, segment: string) => T,
): T[] {
  const activeItem = items[activeIndex];
  if (!activeItem) return items;
  const rest = items.filter((_, i) => i !== activeIndex);

  let toSegment: string;
  let insertAt: number;
  if (overIdRaw.startsWith('lane::')) {
    toSegment = overIdRaw.slice('lane::'.length);
    let lastIdxInSegment = -1;
    rest.forEach((it, i) => { if (getSegment(it) === toSegment) lastIdxInSegment = i; });
    insertAt = lastIdxInSegment === -1 ? rest.length : lastIdxInSegment + 1;
  } else if (overIdRaw.startsWith('card::')) {
    const overIndex = Number(overIdRaw.slice('card::'.length));
    const overItem = items[overIndex];
    if (!overItem || overIndex === activeIndex) return items;
    toSegment = getSegment(overItem);
    insertAt = rest.indexOf(overItem);
    if (insertAt === -1) insertAt = rest.length;
  } else {
    return items;
  }

  const movedItem = setSegment(activeItem, toSegment);
  return [...rest.slice(0, insertAt), movedItem, ...rest.slice(insertAt)];
}

/** Which array indices are beyond a category's `max` cap — for the Timeline
 * Builder's "over cap" badge. Teach/Prompts/Interactions cap by slicing the
 * raw resolved array directly (`kitSpecDaySlides.ts`'s `resolveTeachSlides`/
 * `resolveInteractions`: `list.slice(0, max)`), so raw array position IS the
 * real cap order for them. Story Beats is the one exception: the backend
 * (`applyKitConfig`) caps by counting story-beat SLIDES in chronological
 * run-of-show order (across every segment, in show order), not by the raw
 * override-array order — so this needs its own chronological-order pass,
 * or the badge would flag the wrong item as the one that won't render. */
export function chronologicalOverCapIndices<T>(
  items: T[], getSegment: (item: T) => string, segments: { id: string; startMin: number }[], max: number | null,
): Set<number> {
  if (max == null) return new Set();
  const startMinBySegment = new Map(segments.map((s) => [s.id, s.startMin]));
  const chronological = items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (startMinBySegment.get(getSegment(a.it)) ?? 0) - (startMinBySegment.get(getSegment(b.it)) ?? 0));
  const overCap = new Set<number>();
  chronological.forEach((x, pos) => { if (pos >= max) overCap.add(x.i); });
  return overCap;
}

/** Category status, used to render the left-rail badge — one shared mental
 * model across every count+override category. */
export type CategoryStatus = 'off' | 'custom' | 'capped' | 'default';

export function statusForCountAndOverride(cfg: CountAndOverride<unknown>): CategoryStatus {
  if (!cfg.enabled) return 'off';
  if (cfg.overrides != null) return 'custom';
  if (cfg.max != null) return 'capped';
  return 'default';
}

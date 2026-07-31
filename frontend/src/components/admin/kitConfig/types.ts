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

export interface StoryBeatOverride {
  segment: string; icon: string; eyebrow: string; title: string; body: string; punch: string; tone: Tone;
}
export interface EvidenceOverride {
  claim: string; publisher: string; sourceTitle: string; publicationDate: string; sourceType: string; note: string;
}
export interface TeachSlideOverride {
  segment: string; eyebrow: string; title: string; body: string; bullets: string[]; code: { label: string; code: string } | null; script: string;
}
export interface PromptOverride {
  label: string; prompt: string; pasteWhere: string; ccMode: string; expectedResult: string; stopCondition: string; rescue: string;
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
}

export const blankBeat = (): StoryBeatOverride => ({ segment: 'business-problem', icon: '💡', eyebrow: '', title: '', body: '', punch: '', tone: 'berry' });
export const blankEvidence = (): EvidenceOverride => ({ claim: '', publisher: '', sourceTitle: '', publicationDate: '', sourceType: 'research', note: '' });
export const blankTeach = (): TeachSlideOverride => ({ segment: 'guided-build', eyebrow: '', title: '', body: '', bullets: [], code: null, script: '' });
export const blankPrompt = (): PromptOverride => ({ label: '', prompt: '', pasteWhere: 'Claude Code', ccMode: 'Plan Mode', expectedResult: '', stopCondition: '', rescue: '' });
export const blankInteraction = (segment: string, kind: InteractionPlacement['kind'] = 'trivia'): InteractionPlacement => ({
  segment, kind, eyebrow: '🗳️ Survey', title: 'Quick check', q: '', options: ['', ''],
  answer: kind === 'trivia' ? 0 : null, reveal: '', theater: false, presenterTip: '',
});

/** What "Write my own" seeds the editable list from: a copy of the real
 * authored defaults when any exist (so editing starts from real content,
 * not a blank template — the whole point of Phase 3's unification), else
 * one blank item so the editor isn't empty with nothing to click into. */
export function seedOverrides<T>(defaults: T[], blank: () => T): T[] {
  return defaults.length ? defaults.map((d) => ({ ...d })) : [blank()];
}

export type CategoryKey = 'storyBeats' | 'teach' | 'prompts' | 'interactions' | 'opening' | 'evidence';

/** Category status, used to render the left-rail badge — one shared mental
 * model across every count+override category. */
export type CategoryStatus = 'off' | 'custom' | 'capped' | 'default';

export function statusForCountAndOverride(cfg: CountAndOverride<unknown>): CategoryStatus {
  if (!cfg.enabled) return 'off';
  if (cfg.overrides != null) return 'custom';
  if (cfg.max != null) return 'capped';
  return 'default';
}

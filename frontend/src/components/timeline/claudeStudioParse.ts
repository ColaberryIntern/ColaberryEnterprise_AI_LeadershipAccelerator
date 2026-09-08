/**
 * claudeStudioParse — pure parser for the Claude Studio `body_html` contract.
 *
 * The backend (`backend/src/seeds/claudeStudioFormat.ts`) renders each studio to
 * self-contained HTML carrying data attributes; this reads them back so
 * `ClaudeStudioRender` can drive native controls (stage checkboxes, real Copy
 * buttons, a submission form) instead of an inert iframe.
 *
 * Kept pure and DOM-parser-based — no React, no network — so it is unit-testable
 * and so a malformed or hand-edited body degrades to `null` rather than throwing.
 * The caller then falls back to rendering the HTML as-is, which is a visible
 * downgrade rather than a blank card.
 */

export type StageKey = 'explore' | 'organize' | 'create' | 'prove';

export const STAGE_ORDER: StageKey[] = ['explore', 'organize', 'create', 'prove'];

export const STAGE_LABELS: Record<StageKey, string> = {
  explore: 'Explore in Claude',
  organize: 'Organize in a Project',
  create: 'Create an Artifact',
  prove: 'Prove and Publish',
};

export interface ParsedStage {
  key: StageKey;
  title: string;
  minutes: number;
  instruction: string;
  steps: string[];
}

export interface ParsedPrompt {
  kind: 'starter' | 'improve' | 'followup';
  label: string;
  why: string;
  text: string;
}

export interface ParsedBlock {
  /** The `data-block` name: project | artifact | trust | deliverables | reflection | rubric */
  name: string;
  heading: string | null;
  items: string[];
  /** Inner HTML, for blocks (rubric) whose shape is richer than a list. */
  html: string;
}

export interface ParsedStudio {
  chatUrl: string;
  projectsUrl: string;
  certActive: boolean;
  careerAsset: string | null;
  weekTheme: string | null;
  intro: string | null;
  scenario: string | null;
  role: string | null;
  objectives: string[];
  stages: ParsedStage[];
  prompts: ParsedPrompt[];
  blocks: Record<string, ParsedBlock>;
  /** Reflection self-checks, from `<li data-check>`. */
  checks: string[];
  /** The substantive free-response prompt, from `<p data-free-response>`. */
  freeResponse: string | null;
}

const DEFAULT_CHAT = 'https://claude.ai/new';
const DEFAULT_PROJECTS = 'https://claude.ai/projects';

const text = (el: Element | null | undefined): string => (el?.textContent || '').trim();

const listItems = (root: Element | null, selector = 'li'): string[] =>
  root ? Array.from(root.querySelectorAll(selector)).map((n) => text(n)).filter(Boolean) : [];

/**
 * Only http(s) links are allowed through to a launch button. A body_html that
 * has been hand-edited to carry a `javascript:` or `data:` URL must not become a
 * clickable control — fall back to the known-good default instead.
 */
function safeUrl(raw: string | null, fallback: string): string {
  const v = (raw || '').trim();
  if (!v) return fallback;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : fallback;
  } catch {
    return fallback;
  }
}

function isStageKey(v: string): v is StageKey {
  return (STAGE_ORDER as string[]).includes(v);
}

/**
 * Parse Claude Studio `body_html`. Returns null when the body does not carry the
 * contract (no `[data-claude-studio]` root, or no stages), which tells the
 * caller to render the raw HTML instead.
 */
export function parseClaudeStudio(html: string): ParsedStudio | null {
  if (!html || html.indexOf('data-claude-studio') === -1) return null;

  let root: Element | null = null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    root = doc.querySelector('[data-claude-studio]');
  } catch {
    return null;
  }
  if (!root) return null;

  const stages: ParsedStage[] = Array.from(root.querySelectorAll('.cs-stage[data-stage]'))
    .map((el) => {
      const key = (el.getAttribute('data-stage') || '').trim();
      if (!isStageKey(key)) return null;
      const minutes = Number(el.getAttribute('data-min'));
      return {
        key,
        title: (el.getAttribute('data-title') || '').trim() || STAGE_LABELS[key],
        minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 0,
        instruction: text(el.querySelector('.cs-inst')),
        steps: listItems(el.querySelector('.cs-steps')),
      } as ParsedStage;
    })
    .filter((s): s is ParsedStage => !!s)
    // Order by the canonical stage sequence, not by document order, so a
    // reordered body still walks the student through the loop correctly.
    .sort((a, b) => STAGE_ORDER.indexOf(a.key) - STAGE_ORDER.indexOf(b.key));

  if (!stages.length) return null;

  const prompts: ParsedPrompt[] = Array.from(root.querySelectorAll('.cs-prompt[data-prompt]'))
    .map((el) => {
      const kindRaw = (el.getAttribute('data-prompt') || 'starter').trim();
      const kind = (['starter', 'improve', 'followup'].includes(kindRaw) ? kindRaw : 'followup') as ParsedPrompt['kind'];
      return {
        kind,
        label: (el.getAttribute('data-label') || '').trim() || 'Prompt',
        why: (el.getAttribute('data-why') || '').trim() || text(el.querySelector('.cs-why')),
        // textContent, not innerHTML: the prompt goes to the clipboard as plain
        // text and must arrive in Claude exactly as authored.
        text: (el.querySelector('pre')?.textContent || '').trim(),
      };
    })
    .filter((p) => !!p.text);

  const blocks: Record<string, ParsedBlock> = {};
  Array.from(root.querySelectorAll('[data-block]')).forEach((el) => {
    const name = (el.getAttribute('data-block') || '').trim();
    if (!name) return;
    blocks[name] = {
      name,
      heading: text(el.querySelector('h4')) || null,
      items: listItems(el, 'ul > li, ol > li'),
      html: el.innerHTML,
    };
  });

  const scenarioEl = root.querySelector('.cs-scenario');
  const roleEl = scenarioEl?.querySelector('.cs-role');
  // The role lives inside the scenario node, so strip it before reading the
  // scenario text or the two run together.
  let scenario: string | null = null;
  if (scenarioEl) {
    const clone = scenarioEl.cloneNode(true) as Element;
    clone.querySelector('.cs-role')?.remove();
    scenario = text(clone) || null;
  }

  // The intro is the first bare <p> that is not part of another structure.
  const introEl = Array.from(root.children).find(
    (n) => n.tagName.toLowerCase() === 'p' && !n.classList.contains('cs-note'),
  );

  return {
    chatUrl: safeUrl(root.getAttribute('data-chat-url'), DEFAULT_CHAT),
    projectsUrl: safeUrl(root.getAttribute('data-projects-url'), DEFAULT_PROJECTS),
    certActive: root.getAttribute('data-cert-active') === '1',
    careerAsset: (root.getAttribute('data-career-asset') || '').trim() || null,
    weekTheme: (root.getAttribute('data-week-theme') || '').trim() || null,
    intro: text(introEl) || null,
    scenario,
    role: text(roleEl).replace(/^Your role:\s*/i, '') || null,
    objectives: listItems(root.querySelector('.cs-obj')),
    stages,
    prompts,
    blocks,
    checks: Array.from(root.querySelectorAll('li[data-check]')).map((n) => text(n)).filter(Boolean),
    freeResponse: text(root.querySelector('[data-free-response]')) || null,
  };
}

/** Draft storage key for a card's in-progress studio work. */
export const draftKey = (cardId: string) => `claude-studio:draft:${cardId}`;

export interface StudioDraft {
  stages: StageKey[];
  checks: number[];
  artifactUrl: string;
  projectProofUrl: string;
  reflection: string;
  aiDisclosure: string;
}

export const EMPTY_DRAFT: StudioDraft = {
  stages: [], checks: [], artifactUrl: '', projectProofUrl: '', reflection: '', aiDisclosure: '',
};

/** Read a saved draft. Never throws — a corrupt or blocked store yields an empty draft. */
export function loadDraft(cardId: string): StudioDraft {
  try {
    const raw = window.localStorage.getItem(draftKey(cardId));
    if (!raw) return { ...EMPTY_DRAFT };
    const parsed = JSON.parse(raw) as Partial<StudioDraft>;
    return {
      stages: Array.isArray(parsed.stages) ? parsed.stages.filter(isStageKey) : [],
      checks: Array.isArray(parsed.checks) ? parsed.checks.map(Number).filter((n) => Number.isFinite(n)) : [],
      artifactUrl: typeof parsed.artifactUrl === 'string' ? parsed.artifactUrl : '',
      projectProofUrl: typeof parsed.projectProofUrl === 'string' ? parsed.projectProofUrl : '',
      reflection: typeof parsed.reflection === 'string' ? parsed.reflection : '',
      aiDisclosure: typeof parsed.aiDisclosure === 'string' ? parsed.aiDisclosure : '',
    };
  } catch {
    return { ...EMPTY_DRAFT };
  }
}

/** Persist a draft. Never throws — a full or blocked store must not break the page. */
export function saveDraft(cardId: string, draft: StudioDraft): void {
  try { window.localStorage.setItem(draftKey(cardId), JSON.stringify(draft)); } catch { /* private mode / quota */ }
}

/** Clear a draft once the studio is submitted. Never throws. */
export function clearDraft(cardId: string): void {
  try { window.localStorage.removeItem(draftKey(cardId)); } catch { /* private mode */ }
}

/**
 * Style gate for Cora/Cory reply copy (BC #10109319420, "de-AI-ify" ask).
 *
 * Pure, deterministic, no LLM call — same pattern as skoolQualityGateAgent.ts.
 * Scores generated reply text against the concrete, mechanically-checkable
 * AI tells the ticket listed (banned phrases, markdown leakage, emoji
 * bullets, stacked exclamation points, buzzwords, missing persona sign-off).
 *
 * Deliberately NOT implemented here: "rule of three" lists, "restating the
 * question before answering," and "too-clean grammar." Those need semantic/
 * human judgment — a regex-based detector for them would false-positive on
 * ordinary correct answers (e.g. "Monday, Wednesday, and Friday" is a real
 * schedule, not an AI tell) far more than it would catch anything real.
 */
import type { CoraPersona } from './coraPersonaRouter';
import { PERSONA_PROFILES } from './coraPersonaRouter';

export const STYLE_GATE_PASS_THRESHOLD = 70;

export interface StyleGateResult {
  score: number;
  violations: string[];
}

const BANNED_PHRASES = [
  'i hope this message finds you well',
  'i hope this email finds you well',
  'i wanted to reach out',
  'just wanted to follow up',
  "don't hesitate to",
  'do not hesitate to',
  "it's important to note that",
  'it is important to note that',
  "let's dive in",
  "let's delve into",
  "whether you're",
  'whether you are',
];

const BUZZWORDS = [
  'leverage', 'utilize', 'streamline', 'unlock', 'elevate',
  'empower', 'seamless', 'robust', 'cutting-edge', 'game-changer',
];

/** "feel free to" is common enough in genuine human replies that it only gets a soft penalty on its own. */
const SOFT_PHRASES = ['feel free to'];

function countMatches(body: string, needles: string[]): string[] {
  const lower = body.toLowerCase();
  return needles.filter((needle) => lower.includes(needle));
}

/**
 * Scores 100 -> 0, one deterministic check per known AI tell. Pure so every
 * branch is unit-testable without touching OpenAI.
 */
export function scoreCoraReplyStyle(body: string, persona: CoraPersona = 'cora'): StyleGateResult {
  const violations: string[] = [];
  let score = 100;

  // --- Formatting tells ---
  if (body.includes('—')) {
    violations.push('Contains an em dash');
    score -= 10;
  }
  if (/\*\*[^*]+\*\*/.test(body)) {
    violations.push('Literal markdown bold (**text**) leaking into plain-text email');
    score -= 15;
  }
  if (/\*\*[^*]+:\*\*/.test(body)) {
    violations.push('Bold lead-in + colon bullet pattern ("**Key Benefit:** ...") — reads as ChatGPT-generated');
    score -= 15;
  }
  const emojiBulletPattern = /^[\s]*[\u{1F300}-\u{1FAFF}☀-➿]/mu;
  if (emojiBulletPattern.test(body)) {
    violations.push('Emoji used as a bullet/list marker');
    score -= 15;
  }
  const listMarkerLines = body.match(/^\s*(\d+[.)]|[a-z][.)])\s+/gim) || [];
  if (listMarkerLines.length >= 2) {
    violations.push('Numbered/lettered list used for content that likely does not need one');
    score -= 10;
  }

  // --- Phrasing tells ---
  const bannedHits = countMatches(body, BANNED_PHRASES);
  for (const hit of bannedHits) {
    violations.push(`Contains generic AI-sounding phrase: "${hit}"`);
    score -= 20;
  }
  const matchedBuzzwords = BUZZWORDS.filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(body));
  if (matchedBuzzwords.length > 0) {
    violations.push(`Contains corporate buzzword(s): ${matchedBuzzwords.join(', ')}`);
    score -= Math.min(25, 10 + (matchedBuzzwords.length - 1) * 5);
  }
  const softHits = countMatches(body, SOFT_PHRASES);
  for (const hit of softHits) {
    violations.push(`Contains soft AI-sounding phrase: "${hit}"`);
    score -= 8;
  }

  // --- Tone/structure tells ---
  if (/!{2,}/.test(body) || (body.match(/!/g) || []).length > 2) {
    violations.push('Stacked or excessive exclamation points');
    score -= 15;
  }
  const sentences = body.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  if (sentences.length >= 4) {
    const wordCounts = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
    const mean = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
    const variance = wordCounts.reduce((a, b) => a + (b - mean) ** 2, 0) / wordCounts.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;
    if (coefficientOfVariation < 0.15) {
      violations.push('Uniform, rhythmic sentence length throughout (no variance) — mail-merge look');
      score -= 10;
    }
  }
  const signOff = PERSONA_PROFILES[persona]?.signOff;
  if (signOff) {
    const tail = body.slice(-150);
    if (!tail.toLowerCase().includes(signOff.toLowerCase())) {
      violations.push(`Missing "${signOff}" sign-off near the end of the reply`);
      score -= 10;
    }
  }

  return { score: Math.max(0, Math.min(100, score)), violations };
}

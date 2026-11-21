/**
 * AI thumbnail prompts (CH4.3), built from the five style families reverse-engineered from
 * Colaberry's own event images (docs/communications-hub/reference/THUMBNAIL_STYLE_PROMPTS.md).
 *
 * The model draws; code owns every fact. Each [SLOT] in a family is filled here from the event
 * record and the organizer's headline, so the date, time, cadence and names in the picture are the
 * event's own. A guard refuses organizer text that would put a price word, a link or a QR code into
 * the image. Pricing words are not even named in these prompts (only "no pricing words"), which also
 * keeps them clear of the repo's TWC banned-word scan.
 */
import { BANNED_COPY_RULES, ruleRegex } from '../../content/bannedCopyRule';

export type StyleFamily = 'A_dark_tech' | 'B_staged_headshot' | 'C_open_house' | 'D_weekly_live' | 'E_infographic';
export const STYLE_FAMILIES: StyleFamily[] = ['A_dark_tech', 'B_staged_headshot', 'C_open_house', 'D_weekly_live', 'E_infographic'];

export const STYLE_LABEL: Record<StyleFamily, string> = {
  A_dark_tech: 'Dark tech poster', B_staged_headshot: 'Presenter portrait', C_open_house: 'Team photo overlay',
  D_weekly_live: 'Video-style thumbnail', E_infographic: 'Infographic poster',
};

/** Families that need at least one picture of a person to work from. */
export const NEEDS_PHOTO: Record<StyleFamily, boolean> = {
  A_dark_tech: false, B_staged_headshot: true, C_open_house: false, D_weekly_live: true, E_infographic: false,
};

export interface PromptSlots {
  headline: string;
  supporting: string | null;
  cadence: string | null; // "EVERY TUESDAY", or null for a one-off
  when: string; // "TUE, DEC 1 \u00B7 6:00 PM CST" or "6:00 PM CST" for a series
  hosts: string[]; // "Aleem - Design"
  platform: string; // "Live on Zoom" / "Online"
  aspect: string; // "wide 16:9 banner" etc.
  photoCount: number;
  artNote?: string | null; // CH4.4 "Ask for a change": a short look instruction, guarded like the rest
}

export class PromptGuardError extends Error {}

/**
 * Fold the tricks a word match misses into plain ASCII before matching: compatibility forms (full-width
 * letters), accents (fr\u00E9\u00E9), Cyrillic and Greek look-alikes, zero-width characters.
 */
const CONFUSABLE: Record<string, string> = {
  '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p', '\u0441': 'c', '\u0445': 'x', '\u0456': 'i', '\u0455': 's', '\u0442': 't', '\u0433': 'r',
  '\u0410': 'A', '\u0415': 'E', '\u041E': 'O', '\u0420': 'P', '\u0421': 'C', '\u0425': 'X', '\u0406': 'I', '\u0405': 'S', '\u0422': 'T', '\u0413': 'R',
  '\u03B5': 'e', '\u03BF': 'o', '\u03C1': 'p', '\u0395': 'E', '\u039F': 'O', '\u03A1': 'P',
};
export function foldText(raw: string): string {
  return [...raw.normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '')]
    .map((ch) => CONFUSABLE[ch] ?? ch).join('')
    .normalize('NFD').replace(/[\u0300-\u036F]/g, '');
}

/** Runs of single letters spelled apart ("F R E E", "f.r.e.e", "Q R") joined back into one word. */
function rejoinSpelledOut(text: string): string[] {
  return (text.match(/(?:\b[a-z0-9]\b[\W_]*){2,}/gi) ?? []).map((run) => run.replace(/[^a-z0-9]/gi, ''));
}

const CHECKS: Array<[(folded: string, rejoined: string[]) => boolean, string]> = [
  // The canonical TWC rule (services/content/bannedCopyRule.ts), never a private copy of it.
  [(f, r) => BANNED_COPY_RULES.some((rule) => [f, ...r].some((t) => ruleRegex(rule).test(t))), 'a word the TWC rules do not allow on Colaberry promotions'],
  [(f) => /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|org|net|edu|gov|io|ai|us|ly|co|in|me|tv|app|dev|gg|link|page|info|biz)\b|\b[a-z0-9-]+\.[a-z]{2,}\/\S/i.test(f), 'a link'],
  [(f, r) => /\bqr\b|qr\s?code/i.test(f) || r.some((t) => /^qr/i.test(t)), 'a QR code'],
  [(f) => /[$\u20AC\u00A3\u00A5\u20B9]\s?\d|\d\s?[$\u20AC\u00A3\u00A5\u20B9]/.test(f), 'a price'],
];

/** Refuse organizer text that would put a forbidden thing into the picture. */
export function guardSlots(s: PromptSlots): void {
  for (const value of [s.headline, s.supporting ?? '', ...s.hosts, s.artNote ?? '']) {
    const folded = foldText(value);
    const rejoined = rejoinSpelledOut(folded);
    for (const [hit, what] of CHECKS) {
      if (hit(folded, rejoined)) throw new PromptGuardError(`The text "${value}" contains ${what}. Change it and generate again.`);
    }
  }
}

/**
 * Organizer text is placed inside double quotes in the prompt. A double quote or a line break in it
 * would end the quoted text and let the rest read as an instruction to the model, so both are
 * neutralised before the prompt is built.
 */
// Built from escaped strings: a raw U+2028 / U+2029 inside a regex literal is a syntax error.
const QUOTES = new RegExp('["\\u201C\\u201D]', 'g');
const BREAKS = new RegExp('[\\r\\n\\t\\u2028\\u2029]+', 'g');
export function quoteSafe(value: string): string {
  return value.replace(QUOTES, "'").replace(BREAKS, ' ').trim();
}

function safeSlots(s: PromptSlots): PromptSlots {
  return { ...s, headline: quoteSafe(s.headline), supporting: s.supporting === null ? null : quoteSafe(s.supporting), hosts: s.hosts.map(quoteSafe), artNote: s.artNote ? quoteSafe(s.artNote) : null };
}

const RULES = [
  'Render every quoted text exactly as written, character for character (keep the colon in clock times), and nothing else as text.',
  // Added after the first real generation (2026-11-20) ran text against the left edge.
  'Keep all text and logos well inside the frame, at least 6% away from every edge.',
  'No QR codes, no pricing words or prices, no web addresses, no invented names, no fake attendee lists or video-call grids.',
  'Colaberry brand colors: cherry red, berry blue, leaf green, white and near-black. Polished, high contrast, legible at small sizes.',
].join(' ');

/** The organizer's requested change, placed BEFORE the rules so the rules still win. */
const noteLine = (n: string | null | undefined): string => (n ? `Requested change to the look: "${n}".` : '');
const keepFaces = (n: number): string => (n > 0 ? `Keep the face, hair and identity of every person in the ${n} attached photo${n > 1 ? 's' : ''} exactly the same.` : '');
const hostLine = (h: string[]): string => (h.length ? `Name cards for: ${h.map((x) => `"${x}"`).join(', ')}.` : '');

const FAMILY: Record<StyleFamily, (s: PromptSlots) => string> = {
  A_dark_tech: (s) => [
    `Create a ${s.aspect} event banner for a Colaberry session called "${s.headline}".`,
    'Dark navy background with faint glowing circuit and neural-network line art.',
    `Left half: pill badges ${s.cadence ? `"${s.cadence}" with a calendar icon and ` : ''}"${s.when}" with a clock icon; a huge heavy condensed sans-serif headline "${s.headline}", the first word in cherry red, the rest in white${s.supporting ? `; a subhead "${s.supporting}"` : ''}.`,
    s.photoCount ? `Right half: one tall slanted panel per attached person, each cut out waist-up with a thin glowing edge. ${hostLine(s.hosts)}` : 'Right half: a large abstract glowing brain-and-circuit illustration.',
    `Bottom strip: "${s.platform}" and an angled cherry-red call-to-action block "Join us ${s.cadence ? s.cadence.toLowerCase() : 'live'}".`,
    'Small "colaberry" wordmark top-left.', keepFaces(s.photoCount),
  ].join(' '),
  B_staged_headshot: (s) => [
    keepFaces(s.photoCount),
    'Re-stage the person as a professional portrait at a warm wooden desk in a modern, softly lit office, smiling at the camera, hands clasped.',
    'Desk props: an open silver laptop, a small potted plant, a notebook with a pen. Shallow depth of field, cinematic lighting, photorealistic.',
    `Leave the left 45% open and slightly darker. On the left, in heavy white condensed sans-serif: "${s.headline}"${s.supporting ? `, and below it in berry blue: "${s.supporting}"` : ''}, and a small line "${s.when}".`,
    `A ${s.aspect}.`,
  ].join(' '),
  C_open_house: (s) => [
    `A ${s.aspect}. Photoreal background: a diverse team of five or six engineers in a glass-walled modern office, one at a whiteboard of architecture diagrams, two at a large monitor showing code, one coaching, one on a laptop in the foreground.`,
    'Dark navy-teal overlay, heaviest on the left so text reads cleanly.',
    `Left-aligned text: white "colaberry" wordmark top-left; a cherry-red rounded pill "REGISTER"; a leaf-green monospace eyebrow "${s.when}"; a huge white bold headline "${s.headline}"${s.supporting ? `; a line "${s.supporting}"` : ''}; at the bottom a leaf-green globe icon and "${s.platform}".`,
    keepFaces(s.photoCount),
  ].join(' '),
  D_weekly_live: (s) => [
    `A ${s.aspect} video-style thumbnail from the attached photo of the host. Fade the left half into flat dark navy.`,
    `Left text: small coral caps "${s.cadence ?? 'LIVE'}"; large white bold "${s.headline}"${s.supporting ? `; a line "${s.supporting}"` : ''}; a small line "${s.when}". A small "colaberry" tag bottom-right.`,
    keepFaces(s.photoCount),
  ].join(' '),
  E_infographic: (s) => [
    `A ${s.aspect} infographic poster, white background with navy and gold accents.`,
    `Header "${s.headline}" in heavy navy caps${s.supporting ? `, tagline "${s.supporting}"` : ''}, and "${s.when}".`,
    // Icon-only cards: the model must not write card titles of its own (every word in the image comes from code).
    'Glossy 3D props that fit the topic, and three or four simple icon cards with icons only and no words on them. Footer: "Hosted by Colaberry".',
  ].join(' '),
};

export function buildPrompt(family: StyleFamily, slots: PromptSlots): string {
  guardSlots(slots);
  const safe = safeSlots(slots);
  return `${FAMILY[family](safe)} ${noteLine(safe.artNote)} ${RULES}`.replace(/\s+/g, ' ').trim();
}

/**
 * ART-ONLY prompts (the default since 2026-11-20). Three real generations showed the model cannot be
 * trusted with text: twice it ran words off the left edge (even when told to keep a 6% margin) and
 * once it printed "6.00 PM" for "6:00 PM". So by default the model draws the scene with NO text at all
 * and keeps the left side calm, and code lays the exact text over it (templateRender.renderOverlay).
 * Each scene is the family's look from THUMBNAIL_STYLE_PROMPTS.md with every text instruction removed.
 */
const ART: Record<StyleFamily, (s: PromptSlots) => string> = {
  A_dark_tech: (s) => [
    'Dark navy background with faint glowing circuit and neural-network line art, cherry-red and leaf-green accent glows.',
    s.photoCount ? 'Right half: one tall slanted panel per attached person, each cut out waist-up with a thin glowing neon edge.' : 'Right half: a large abstract glowing brain-and-circuit illustration.',
  ].join(' '),
  B_staged_headshot: () => 'Re-stage the person as a professional portrait at a warm wooden desk in a modern, softly lit office, smiling at the camera, hands clasped, an open silver laptop and a small plant on the desk; shallow depth of field, cinematic lighting, photorealistic. Place the person in the right half.',
  C_open_house: () => 'Photoreal: a diverse team of five or six engineers in a glass-walled modern office, one at a whiteboard of architecture diagrams, two at a large monitor showing code, one coaching; a dark navy-teal overlay, heaviest on the left.',
  D_weekly_live: () => 'A cinematic video-style frame of the host from the attached photo, placed in the right half, the left half fading into flat dark navy.',
  E_infographic: () => 'Glossy 3D props in navy and gold that fit a learning event (charts, a shield, a piggy bank, a graduation cap) arranged in the right half, on a clean white background with soft gold light.',
};

const ART_RULES = [
  'Draw NO text of any kind: no letters, words, numbers, logos, badges, signs, captions or labels anywhere in the image.',
  'Keep the left 45% of the frame calm, dark and uncluttered (empty space for text added later); no important detail there.',
  'No QR codes, no screens with readable writing, no fake video-call grids.',
  'Colaberry brand colors: cherry red, berry blue, leaf green, white and near-black. Polished and high contrast.',
].join(' ');

/** The art-only prompt for a family. The organizer's text never goes to the model in this mode, but it is still guarded. */
export function buildArtPrompt(family: StyleFamily, slots: PromptSlots): string {
  guardSlots(slots);
  const safe = safeSlots(slots);
  return `A ${slots.aspect}. ${ART[family](safe)} ${noteLine(safe.artNote)} ${keepFaces(slots.photoCount)} ${ART_RULES}`.replace(/\s+/g, ' ').trim();
}

/** Which theme the code-drawn text uses over each family's art (dark scenes get light text). */
export const OVERLAY_THEME: Record<StyleFamily, 'berry_night' | 'clean_white'> = {
  A_dark_tech: 'berry_night', B_staged_headshot: 'berry_night', C_open_house: 'berry_night', D_weekly_live: 'berry_night', E_infographic: 'clean_white',
};

/** 'overlay' (default): the model draws art, code draws text. 'model': the model draws everything (the reverse-engineered originals). */
export const TEXT_MODE = (): 'overlay' | 'model' => (process.env.COMMS_HUB_AI_TEXT_MODE?.trim() === 'model' ? 'model' : 'overlay');

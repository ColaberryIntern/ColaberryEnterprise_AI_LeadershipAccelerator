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
  when: string; // "TUE, DEC 1 · 6:00 PM CST" or "6:00 PM CST" for a series
  hosts: string[]; // "Aleem - Design"
  platform: string; // "Live on Zoom" / "Online"
  aspect: string; // "wide 16:9 banner" etc.
  photoCount: number;
}

export class PromptGuardError extends Error {}

const BANNED_IN_SLOTS: Array<[RegExp, string]> = [
  // Letters may be spaced or punctuated apart ("F R E E", "f.r.e.e") to dodge a plain word match.
  [/\bf[\W_]*r[\W_]*e[\W_]*e\b/i, 'a pricing word the TWC rules do not allow on Colaberry promotions'],
  [/https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|org|net|io|ai|us|ly|co)\b/i, 'a link'],
  [/\bqr\b/i, 'a QR code'],
  [/[$€£]\s?\d/, 'a price'],
];

/** Refuse organizer text that would put a forbidden thing into the picture. */
export function guardSlots(s: PromptSlots): void {
  for (const value of [s.headline, s.supporting ?? '', ...s.hosts]) {
    for (const [rx, what] of BANNED_IN_SLOTS) {
      if (rx.test(value)) throw new PromptGuardError(`The text "${value}" contains ${what}. Change it and generate again.`);
    }
  }
}

const RULES = [
  'Render every quoted text exactly as written, character for character (keep the colon in clock times), and nothing else as text.',
  // Added after the first real generation (2026-11-20) ran text against the left edge.
  'Keep all text and logos well inside the frame, at least 6% away from every edge.',
  'No QR codes, no pricing words or prices, no web addresses, no invented names, no fake attendee lists or video-call grids.',
  'Colaberry brand colors: cherry red, berry blue, leaf green, white and near-black. Polished, high contrast, legible at small sizes.',
].join(' ');

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
    'Glossy 3D props that fit the topic, and three or four simple icon cards. Footer: "Hosted by Colaberry".',
  ].join(' '),
};

export function buildPrompt(family: StyleFamily, slots: PromptSlots): string {
  guardSlots(slots);
  return `${FAMILY[family](slots)} ${RULES}`.replace(/\s+/g, ' ').trim();
}

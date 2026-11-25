/**
 * The one content check every Weekly Live generator runs before it saves (Basecamp WL2.3, Ali's
 * standing rules). Pure: it returns every violation with its field path instead of stopping at the
 * first, so a panel can show them all at once. A generator that gets any violation back refuses to
 * save (WL1 recap, WL3 topics, WL4 session kit, WL6 content plan).
 *
 * Each field is tagged with where it will appear, because some rules depend on it:
 *   onScreen  text burned into a graphic, thumbnail or slide (no statistics at all)
 *   voiceover what is said out loud (a sourced statistic is allowed)
 *   caption   social captions and titles (public)
 *   post      LinkedIn and community posts (public)
 *   email     a 1:1 email to the person themselves (not public: their own name is fine)
 *   asset     an image or file reference (checked for logos)
 *
 * Rules:
 *   zero_price      free, $0, no cost, no charge, zero cost, anywhere (TWC exposure, CLM-027)
 *   partnership     wording that implies a partnership with Anthropic
 *   anthropic_logo  an Anthropic or Claude logo, in words or as an asset
 *   on_screen_stat  a percent, an "N in N", a number of 10 or more, or a money amount in onScreen
 *   attendee_data   an attendee's name or email in a public field (onScreen, voiceover, caption, post)
 *   earnings_claim  a salary or earnings claim that is not an approved Claim Registry wording
 *   dash            an em or en dash (house style)
 */
export type FieldKind = 'onScreen' | 'voiceover' | 'caption' | 'post' | 'email' | 'asset';
export type LintRule = 'zero_price' | 'partnership' | 'anthropic_logo' | 'on_screen_stat' | 'attendee_data' | 'earnings_claim' | 'dash';

export interface TaggedField { path: string; kind: FieldKind; text: string | null | undefined; }
export interface LintViolation { field: string; rule: LintRule; match: string; }
export interface LintContext {
  /** Attendees of the class: display names and emails, from session_guests. */
  attendees?: { name?: string | null; email?: string | null }[];
  /** Approved public wordings from the Claim Registry that may carry an earnings figure. */
  approvedClaims?: string[];
}

const PUBLIC_KINDS: ReadonlySet<FieldKind> = new Set<FieldKind>(['onScreen', 'voiceover', 'caption', 'post']);

const ZERO_PRICE = /\b(free|no[\s-]cost|no[\s-]charge|zero[\s-]cost)\b|\$\s?0(?![\d.,])/i;
const PARTNERSHIP = /\b(anthropic|claude)\s+(partner|partnership|certified partner|official partner)\b|\bin partnership with (anthropic|claude)\b|\bpowered by anthropic\b|\b(partnered|partnering) with anthropic\b/i;
const LOGO_WORDS = /\b(anthropic|claude)\b[^.\n]{0,30}\blogo\b|\blogo\b[^.\n]{0,30}\b(anthropic|claude)\b/i;
const LOGO_ASSET = /(anthropic|claude)[^/\s]*\.(png|jpe?g|svg|webp|gif)\b|\/(anthropic|claude)[-_]?(logo|mark|brand)/i;
const STAT = /\d+(\.\d+)?\s?%|\bpercent\b|\b\d+\s+(in|out of)\s+\d+\b|\$\s?\d|\b\d{1,3}(,\d{3})+\b|\b\d+(\.\d+)?\s?(k|m|bn|x)\b|\b[1-9]\d+\b/i;
const EARNINGS = /\bsalar(y|ies)\b|\bsix[\s-]figures?\b|\b(earn|earns|earned|earning|make|makes|paid)\s+(up to\s+|over\s+|more than\s+)?\$\s?\d|\$\s?\d[\d,.]*\s?k?\s*(\/|per|a)\s*(year|yr|hour|hr|month)\b/i;
const DASH = /[–—]/;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function attendeeMatch(text: string, ctx: LintContext): string | null {
  for (const a of ctx.attendees || []) {
    const email = String(a.email || '').trim();
    if (email && text.toLowerCase().includes(email.toLowerCase())) return email;
    const name = String(a.name || '').trim().replace(/\s+/g, ' ');
    if (name.length < 3) continue;
    // A full name matches in any case; a single-word name only as a capitalized word, so "Ana" the
    // attendee is caught but "banana" and "an analysis" are not.
    const re = name.includes(' ') ? new RegExp(`\\b${escapeRe(name)}\\b`, 'i') : new RegExp(`\\b${escapeRe(name)}\\b`);
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

export function lintField(f: TaggedField, ctx: LintContext = {}): LintViolation[] {
  const s = String(f.text ?? '');
  if (!s) return [];
  const out: LintViolation[] = [];
  const add = (rule: LintRule, m: RegExpMatchArray | string | null) => { if (m) out.push({ field: f.path, rule, match: typeof m === 'string' ? m : m[0] }); };
  add('zero_price', s.match(ZERO_PRICE));
  add('partnership', s.match(PARTNERSHIP));
  add('anthropic_logo', s.match(f.kind === 'asset' ? LOGO_ASSET : LOGO_WORDS));
  if (f.kind === 'onScreen') add('on_screen_stat', s.match(STAT));
  if (PUBLIC_KINDS.has(f.kind)) add('attendee_data', attendeeMatch(s, ctx));
  const e = s.match(EARNINGS);
  if (e && !(ctx.approvedClaims || []).some((c) => c && s.includes(c))) add('earnings_claim', e);
  if (f.kind !== 'asset') add('dash', s.match(DASH));
  return out;
}

export function lintFields(fields: TaggedField[], ctx: LintContext = {}): LintViolation[] {
  return fields.flatMap((f) => lintField(f, ctx));
}

/**
 * Flatten an object into tagged fields with dotted paths. kindOf decides each leaf's kind from its
 * path (e.g. paths under "thumbnail" are onScreen); the default kind applies otherwise.
 */
export function tagObject(obj: unknown, kindOf: (path: string) => FieldKind | null, prefix = ''): TaggedField[] {
  if (typeof obj === 'string') { const kind = kindOf(prefix || 'value'); return kind ? [{ path: prefix || 'value', kind, text: obj }] : []; }
  if (Array.isArray(obj)) return obj.flatMap((v, i) => tagObject(v, kindOf, `${prefix}[${i}]`));
  if (obj && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => tagObject(v, kindOf, prefix ? `${prefix}.${k}` : k));
  }
  return [];
}

/** Lint every string in an object as one kind (the recap: every field is a 1:1 email). */
export function lintObjectAs(obj: unknown, kind: FieldKind, ctx: LintContext = {}): LintViolation[] {
  return lintFields(tagObject(obj, () => kind), ctx);
}

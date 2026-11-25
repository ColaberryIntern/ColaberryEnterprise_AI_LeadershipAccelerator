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
 *   attendee_data   an attendee's email, full name, or any name part of 3+ letters (any case, whole
 *                   word) in a public field (onScreen, voiceover, caption, post); a name part that is
 *                   an everyday word ("will", "grace") only counts inside the full name
 *   (onScreen "Week 12", "Ep 2", "Session 10" are labels, not statistics)
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
const PARTNERSHIP = /\b(anthropic|claude)\s+(partner|partnership|certified partner|official partner)\b|\bin partnership with (anthropic|claude)\b|\bpowered by anthropic\b|\b(partnered|partnering) with anthropic\b|\bpartners? (of|with) anthropic\b|\b(endorsed|certified|approved|sponsored|accredited) by anthropic\b|\banthropic[\s-](certified|endorsed|approved|accredited|sponsored)\b/i;
const LOGO_WORDS = /\b(anthropic|claude)\b[^.\n]{0,30}\blogo\b|\blogo\b[^.\n]{0,30}\b(anthropic|claude)\b/i;
const LOGO_ASSET = /(anthropic|claude)[^/\s]*\.(png|jpe?g|svg|webp|gif)\b|\/(anthropic|claude)[-_]?(logo|mark|brand)/i;
const STAT = /\d+(\.\d+)?\s?%|\bpercent\b|\b\d+\s+(in|out of)\s+\d+\b|\$\s?\d|\b\d{1,3}(,\d{3})+\b|\b\d+(\.\d+)?\s?(k|m|bn|x)\b|\b[1-9]\d+\b/i;
const EARNINGS = /\bsalar(y|ies)\b|\b(six|seven|[67])[\s-]figures?\b|\b(earn|earns|earned|earning|make|makes|made|paid|pay|pays|paying)\s+(you\s+)?(up to\s+|over\s+|more than\s+)?\$\s?\d|\$\s?\d[\d,.]*\s?k?\s*(\/|per|a)\s*(year|yr|hour|hr|month)\b/i;
const DASH = /[–—]/;
/** A sequence label ("Week 12", "Ep 2", "Session 3") on a graphic is a name, not a statistic. */
const SEQUENCE_LABEL = /\b(week|wk|ep|episode|session|part|day|step|module|lesson)\s+\d{1,2}\b/gi;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Everyday words that are also first names. A name part on this list only counts as part of the
 * attendee's full name, so an attendee called Will does not block every sentence with "will" in it.
 */
const COMMON_WORD_NAMES: ReadonlySet<string> = new Set([
  'will', 'may', 'june', 'april', 'august', 'grace', 'hope', 'joy', 'faith', 'mark', 'bill', 'rose', 'dawn',
  'chase', 'art', 'max', 'sunny', 'summer', 'autumn', 'winter', 'rich', 'drew', 'pat', 'sue', 'jack', 'don',
  'guy', 'gene', 'ray', 'rob', 'neil', 'jean', 'pierce', 'frank', 'king', 'young', 'long', 'white', 'brown',
  'green', 'black', 'gray', 'grey', 'lee', 'hall', 'wood', 'hill', 'love', 'star', 'river', 'sky', 'dash',
]);

function attendeeMatch(text: string, ctx: LintContext): string | null {
  const word = (s: string) => new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRe(s)})(?=$|[^\\p{L}\\p{N}])`, 'iu');
  for (const a of ctx.attendees || []) {
    const email = String(a.email || '').trim();
    if (email && text.toLowerCase().includes(email.toLowerCase())) return email;
    const name = String(a.name || '').trim().replace(/\s+/g, ' ');
    if (!name) continue;
    // The full name, then each part of 3 or more letters (first or last name alone), in any case,
    // as a whole word: attendee "Ana Ruiz" is caught by "ana" but "banana" and "an analysis" are not.
    const parts = name.split(' ').filter((p) => p.length >= 3 && !COMMON_WORD_NAMES.has(p.toLowerCase()));
    for (const candidate of name.includes(' ') ? [name, ...parts] : parts) {
      const m = text.match(word(candidate));
      if (m) return m[2];
    }
  }
  return null;
}

/** Remove every approved Claim Registry wording, so only the rest of the text is checked for earnings. */
function withoutApproved(text: string, approved: string[] | undefined): string {
  return (approved || []).filter(Boolean).reduce((s, c) => s.split(c).join(' '), text);
}

export function lintField(f: TaggedField, ctx: LintContext = {}): LintViolation[] {
  const s = String(f.text ?? '');
  if (!s) return [];
  const out: LintViolation[] = [];
  const add = (rule: LintRule, m: RegExpMatchArray | string | null) => { if (m) out.push({ field: f.path, rule, match: typeof m === 'string' ? m : m[0] }); };
  add('zero_price', s.match(ZERO_PRICE));
  add('partnership', s.match(PARTNERSHIP));
  add('anthropic_logo', s.match(f.kind === 'asset' ? LOGO_ASSET : LOGO_WORDS));
  if (f.kind === 'onScreen') add('on_screen_stat', s.replace(SEQUENCE_LABEL, ' ').match(STAT));
  if (PUBLIC_KINDS.has(f.kind)) add('attendee_data', attendeeMatch(s, ctx));
  add('earnings_claim', withoutApproved(s, ctx.approvedClaims).match(EARNINGS));
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

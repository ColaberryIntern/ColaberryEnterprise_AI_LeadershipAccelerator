/**
 * OH1o: the brain's rules, as data (Ali, 2026-11-18: "where will the rules for the brain be stored,
 * what will that look like and how do I program it").
 *
 * ONE setting, `maya_brain_rules` (system_settings, JSON), edited in the Explorer Growth Brain tab.
 * Null or missing = the code defaults, which are exactly what shipped before it existed:
 *
 *   explorerVoice      how Maya sounds to an Explorer (EXPLORER_MAYA_VOICE). Editable.
 *                      The HARD RULES (never sell, never the banned word, links, never invent) are
 *                      appended after it in code and cannot be edited from the page.
 *   neverSay           extra phrases a draft may not contain. ADDITIVE ONLY: the code's banned-copy
 *                      list and sales-push list always apply; this can add to them, never remove.
 *   rotation           which shelves an Explorer email may be built on, in rotation order, each on/off.
 *   brainPickMinHours  one Explorer email per person every N hours. Floor 24, whole days only.
 *   weekAhead          the Monday "plan your week" email (week_ahead shelf) on/off.
 *   openHouseHold      LOCKED ON. Explorer Growth always holds anyone in a live Open House countdown.
 *
 * Reading never fails: bad data falls back to the default for THAT field and the problem is
 * reported. Saving is strict: any problem refuses the whole save.
 */
import type { BrainPiece } from '../openHouseBrain';
import { BANNED } from '../openHouseCountdown';
import { EXPLORER_MAYA_VOICE, NURTURE_ROTATION } from './explorerBrainPick';

export const BRAIN_RULES_SETTING = 'maya_brain_rules';

/**
 * Where a brand's own rules live.
 *
 * ─── A SUFFIXED KEY, NOT A NEW TABLE ────────────────────────────────────────
 *
 * Maya's role changes by brand - an Enrollment Specialist on Colaberry Training,
 * a Business Development Specialist on Colaberry Enterprise - and her voice,
 * never-say list, shelf rotation and cadence are what actually carry that. Until
 * now they were ONE setting shared by everyone, so the per-brand role shipped in
 * `brand-setup` was display copy sitting on top of one global personality.
 *
 * A new table would be a schema change, which this repo puts behind an
 * escalation. A suffixed key in the settings store the rules already live in is
 * a row, not a migration: reversible by deleting it, and invisible to anything
 * that does not ask for it.
 *
 * ─── THE PROPERTY THAT MAKES THIS SAFE TO SHIP ──────────────────────────────
 *
 * `loadBrainRules()` with no brand reads exactly the key it always read. A brand
 * with no row of its own falls back to the global one. So with no brand rows
 * set - which is every brand on the day this ships - **behaviour is identical to
 * before, byte for byte**. Per-brand rules begin to matter only when somebody
 * saves one, and the first save affects only that brand.
 *
 * That is deliberate: this change touches the path that decides what Maya says,
 * and a change there should do nothing until it is asked to.
 */
export function brainRulesKeyFor(brandId: string | null | undefined): string {
  return brandId ? `${BRAIN_RULES_SETTING}:${brandId}` : BRAIN_RULES_SETTING;
}

/**
 * Which rules a reader actually got.
 *
 * `brand` - this brand has its own set.
 * `global` - it has none, so the shared set applied.
 * `default` - nothing is stored anywhere, or the store could not be read, so the
 *   built-in defaults applied. Distinct from `global` because "nobody has ever
 *   set these" and "the saved set is in force" are different facts, and an
 *   operator told the wrong one will edit the wrong thing.
 */
export type BrainRulesSource = 'brand' | 'global' | 'default';

export interface LoadedBrainRules {
  rules: MayaBrainRules;
  problems: string[];
  stored: boolean;
  source: BrainRulesSource;
  /** Echoed back so a caller cannot mistake whose rules these are. */
  brand_id: string | null;
}

/** The shelves an Explorer email can rotate across (their_progress and week_ahead are chosen by rule, not rotation). */
export const ROTATABLE_SHELVES: readonly BrainPiece[] = [
  'builder_spotlight', 'build_prompt', 'ai_fact', 'community_pulse', 'live_event',
];

export const MIN_PICK_HOURS = 24;
export const MAX_PICK_HOURS = 24 * 30;
const MAX_NEVER_SAY = 50;

export interface ShelfRule { piece: BrainPiece; enabled: boolean }

export interface MayaBrainRules {
  explorerVoice: string;
  neverSay: string[];
  rotation: ShelfRule[];
  brainPickMinHours: number;
  weekAhead: boolean;
  /** Always true. Present so the page can show it, locked. */
  openHouseHold: true;
}

export const DEFAULT_BRAIN_RULES: MayaBrainRules = Object.freeze({
  explorerVoice: EXPLORER_MAYA_VOICE,
  neverSay: [],
  rotation: NURTURE_ROTATION.map((piece) => ({ piece, enabled: true })),
  brainPickMinHours: 72,
  weekAhead: true,
  openHouseHold: true,
}) as MayaBrainRules;

function voiceProblems(v: unknown): string[] {
  if (typeof v !== 'string') return ['the voice must be text'];
  const t = v.trim();
  const out: string[] = [];
  if (t.length < 80) out.push('the voice is too short (at least 80 characters)');
  if (t.length > 6000) out.push('the voice is too long (at most 6000 characters)');
  if (!/^you are maya\b/i.test(t)) out.push('the voice must start with "You are Maya"');
  // Read at call time, never at module load: this module sits on the scheduler's import graph.
  const noCost = (BANNED || []).filter(([, label]) => label === 'a no-cost claim');
  for (const [re] of noCost) if (re.test(t)) out.push('the voice may not use the banned word');
  return out;
}

function cleanPhrases(v: unknown): { phrases: string[]; problems: string[] } {
  if (!Array.isArray(v)) return { phrases: [], problems: ['never-say must be a list of phrases'] };
  const problems: string[] = [];
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const raw of v) {
    if (typeof raw !== 'string') { problems.push('every never-say phrase must be text'); continue; }
    const p = raw.trim().replace(/\s+/g, ' ');
    if (p.length < 2 || p.length > 60) { problems.push(`"${p.slice(0, 30)}" must be 2 to 60 characters`); continue; }
    const k = p.toLowerCase();
    if (!seen.has(k)) { seen.add(k); phrases.push(p); }
  }
  if (phrases.length > MAX_NEVER_SAY) problems.push(`at most ${MAX_NEVER_SAY} never-say phrases`);
  return { phrases: phrases.slice(0, MAX_NEVER_SAY), problems };
}

function cleanRotation(v: unknown): { rotation: ShelfRule[]; problems: string[] } {
  if (!Array.isArray(v)) return { rotation: [], problems: ['the rotation must be a list of shelves'] };
  const problems: string[] = [];
  const out: ShelfRule[] = [];
  for (const r of v) {
    const piece = (r as any)?.piece;
    if (!ROTATABLE_SHELVES.includes(piece)) { problems.push(`"${String(piece)}" is not a shelf Explorer emails rotate across`); continue; }
    if (out.some((x) => x.piece === piece)) { problems.push(`"${piece}" is listed twice`); continue; }
    out.push({ piece, enabled: (r as any)?.enabled !== false });
  }
  // A shelf left out of the list is kept, switched off, so the page always shows every shelf.
  for (const piece of ROTATABLE_SHELVES) if (!out.some((x) => x.piece === piece)) out.push({ piece, enabled: false });
  if (!out.some((x) => x.enabled)) problems.push('at least one shelf must be on');
  return { rotation: out, problems };
}

function hoursProblems(v: unknown): string[] {
  const n = Number(v);
  if (!Number.isInteger(n)) return ['the cadence must be a whole number of hours'];
  if (n < MIN_PICK_HOURS) return [`the cadence cannot go below ${MIN_PICK_HOURS} hours (the 24-hour rule)`];
  if (n > MAX_PICK_HOURS) return [`the cadence cannot go above ${MAX_PICK_HOURS} hours`];
  if (n % 24 !== 0) return ['the cadence must be whole days (24, 48, 72 ...): decisions are made once a day'];
  return [];
}

/**
 * Every problem with a proposed rule set; empty means it may be saved. Strict: the save route
 * refuses on any problem.
 */
export function validateBrainRules(input: unknown): string[] {
  const r = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const problems = [
    ...voiceProblems(r.explorerVoice),
    ...cleanPhrases(r.neverSay ?? []).problems,
    ...cleanRotation(r.rotation).problems,
    ...hoursProblems(r.brainPickMinHours),
  ];
  if (typeof r.weekAhead !== 'boolean') problems.push('the week-ahead switch must be on or off');
  if (r.openHouseHold !== undefined && r.openHouseHold !== true) problems.push('the Open House hold cannot be turned off');
  return problems;
}

/**
 * Stored value -> the rules in force. Never throws: each field that is missing or bad falls back to
 * its default, and the reason is returned so the page can show it.
 */
export function resolveBrainRules(stored: unknown): { rules: MayaBrainRules; problems: string[] } {
  if (stored == null || stored === '') return { rules: { ...DEFAULT_BRAIN_RULES, rotation: DEFAULT_BRAIN_RULES.rotation.map((x) => ({ ...x })) }, problems: [] };
  let raw: unknown = stored;
  if (typeof stored === 'string') {
    try { raw = JSON.parse(stored); } catch { return { rules: resolveBrainRules(null).rules, problems: ['the stored rules are not readable; using the defaults'] }; }
  }
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = resolveBrainRules(null).rules;
  const problems: string[] = [];
  const pick = <T>(name: string, issues: string[], value: T, fallback: T): T => {
    if (issues.length) { problems.push(`${name}: ${issues.join('; ')} (using the default)`); return fallback; }
    return value;
  };
  const phrases = cleanPhrases(r.neverSay ?? []);
  const rot = cleanRotation(r.rotation ?? d.rotation);
  return {
    rules: {
      explorerVoice: pick('voice', voiceProblems(r.explorerVoice ?? d.explorerVoice), String(r.explorerVoice ?? d.explorerVoice).trim(), d.explorerVoice),
      neverSay: pick('never-say', phrases.problems, phrases.phrases, d.neverSay),
      rotation: pick('rotation', rot.problems, rot.rotation, d.rotation),
      brainPickMinHours: pick('cadence', hoursProblems(r.brainPickMinHours ?? d.brainPickMinHours), Number(r.brainPickMinHours ?? d.brainPickMinHours), d.brainPickMinHours),
      weekAhead: typeof r.weekAhead === 'boolean' ? r.weekAhead : d.weekAhead,
      openHouseHold: true,
    },
    problems,
  };
}

/** The enabled shelves, in rotation order: what explorerBrainPick rotates across. */
export function enabledRotation(rules: MayaBrainRules): BrainPiece[] {
  return rules.rotation.filter((s) => s.enabled).map((s) => s.piece);
}

/** Every never-say phrase this draft contains (case-insensitive, whole words where the phrase starts/ends with one). */
export function neverSayIssues(text: string, phrases: readonly string[]): string[] {
  const plain = String(text || '').replace(/<[^>]+>/g, ' ');
  const out: string[] = [];
  for (const p of phrases) {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^A-Za-z0-9])${esc}($|[^A-Za-z0-9])`, 'i');
    if (re.test(plain)) out.push(`never-say: "${p}"`);
  }
  return out;
}

export interface BrainRulesDeps {
  getSetting: (key: string) => Promise<unknown>;
  setSetting: (key: string, value: unknown, adminId?: string) => Promise<void>;
}

function defaultDeps(): BrainRulesDeps {
  return {
    getSetting: async (key) => (await import('../settingsService')).getSetting(key),
    setSetting: async (key, value, adminId) => (await import('../settingsService')).setSetting(key, value, adminId),
  };
}

/**
 * The rules in force, for a brand or globally.
 *
 * An unreadable setting is the defaults (which are today's behavior), and says so.
 *
 * Called with no brand it reads exactly the key it always read, so every existing
 * caller keeps its current behavior without being edited. Called with a brand it
 * prefers that brand's own set and falls back to the global one, reporting which
 * it used rather than leaving the caller to guess.
 *
 * The fallback is a read of a SECOND key, not a merge. Half a brand's voice and
 * half another's would be a personality nobody chose, and no operator could
 * predict what Maya would say.
 */
export async function loadBrainRules(
  brandId: string | null = null,
  deps: BrainRulesDeps = defaultDeps()
): Promise<LoadedBrainRules> {
  try {
    if (brandId) {
      const own = await deps.getSetting(brainRulesKeyFor(brandId));
      // `!= null` on purpose: a saved set is an object, and a brand that saved
      // one must not fall through to the global set just because some field is
      // falsy.
      if (own != null) {
        return { ...resolveBrainRules(own), stored: true, source: 'brand', brand_id: brandId };
      }
    }
    const stored = await deps.getSetting(BRAIN_RULES_SETTING);
    return {
      ...resolveBrainRules(stored),
      stored: stored != null,
      source: stored != null ? 'global' : 'default',
      brand_id: brandId,
    };
  } catch (err: any) {
    return {
      rules: resolveBrainRules(null).rules,
      problems: [`the rules could not be read (${err?.message ?? 'error'}); using the defaults`],
      stored: false,
      source: 'default',
      brand_id: brandId,
    };
  }
}

export class BrainRulesError extends Error {
  constructor(public problems: string[]) { super('The brain rules were not saved'); }
}

/**
 * Save a rule set, for one brand or globally.
 *
 * Strict: throws BrainRulesError with every problem, and writes nothing, on any
 * problem.
 *
 * With a brand it writes ONLY that brand's key. It never touches the global set,
 * and it never writes the other brands' keys, so saving Colaberry Enterprise's
 * voice cannot change what Maya says to a Colaberry Training learner. That
 * isolation is the whole point of the change and is asserted directly in the
 * tests rather than inferred from the key name.
 */
export async function saveBrainRules(
  input: unknown,
  adminId: string,
  brandId: string | null = null,
  deps: BrainRulesDeps = defaultDeps()
): Promise<MayaBrainRules> {
  const problems = validateBrainRules(input);
  if (problems.length) throw new BrainRulesError(problems);
  const { rules } = resolveBrainRules(input);
  await deps.setSetting(brainRulesKeyFor(brandId), rules, adminId);
  return rules;
}

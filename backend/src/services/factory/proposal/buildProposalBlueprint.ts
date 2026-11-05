/**
 * buildProposalBlueprint — the PURE core of the Proposal Studio's P2 "blueprint from the stored ZIP". It reads the
 * solicitation's extracted per-file text and produces the quoted, cited rulebook (ProposalBlueprint): Section M
 * scoring, Section L submission mechanics, required forms (the Texas rules engine + any forms the solicitation
 * names), addenda to acknowledge, and elimination-risk requirements.
 *
 * It REUSES the shipped deterministic detectors (detectEvaluationCriteria, detectRfpComplianceRules, isEliminationRisk,
 * classifyDocuments) and adds the new Section-L detectors, then enforces the NEVER-FABRICATE rail: every extracted
 * RULE must literally quote the source (verifyBlueprintRules, mirroring verifyQuotes' normalize-and-match), or it is
 * dropped and counted. The AI does none of this — the blueprint is fully deterministic.
 *
 * PURE + TOTAL: no I/O, never throws; `now` is injected so it is deterministic in tests. The reanalyze route
 * (routes/admin) assembles the input from the stored bundle extraction + the qualification and persists the result.
 */
import { detectEvaluationCriteria } from './evaluationCriteria';
import { detectRfpComplianceRules } from './rfpComplianceRules';
import { isEliminationRisk } from './eliminationRisk';
import { classifyDocuments, FULL_SCAN_ROLES } from './documentClassifier';
import { normalizeForMatch } from './verifyQuotes';
import { detectSectionLRules } from './sectionLDetectors';
import { texasFormsRules, type TexasFormsInput } from './texasFormsRules';
import type { BlueprintRule, ProposalBlueprint, RequiredForm, TexasBuyerType, Jurisdiction, StateFormsStatus } from './proposalBlueprintTypes';

export interface BlueprintSourceFile { name: string; text: string; }

export interface BuildBlueprintInput {
  /** The per-file extracted text of the stored solicitation bundle. */
  files: BlueprintSourceFile[];
  /** The established requirements, for elimination-risk surfacing (statement + optional section). */
  requirements?: Array<{ statement?: string | null; text?: string | null; section?: string | null }>;
  /** The qualification's key dates (the authoritative deadline lives here, not in a second store). */
  keyDates?: Array<{ date?: string | null; text?: string | null }>;
  /** Buyer facts for the Texas forms engine (buyerType may also be inferred from the text when omitted). */
  buyer?: Partial<TexasFormsInput>;
}

export interface BuildBlueprintOpts { now?: Date; }

/** A solicitation-form naming probe: when the text literally names a Texas form, we attach the quote and upgrade the
 *  engine's disposition to `required`. Keyed to the form keys texasFormsRules emits. */
const FORM_NAME_PROBES: Array<{ key: string; re: RegExp }> = [
  { key: 'hsp', re: /\bHUB\s+subcontracting\s+plan\b|\bhistorically\s+underutilized\s+business\b/i },
  { key: 'execution_of_offer', re: /\bexecution\s+of\s+offer\b/i },
  { key: 'form_1295', re: /\bform\s+1295\b|\bcertificate\s+of\s+interested\s+parties\b/i },
  { key: 'ciq', re: /\bconflict\s+of\s+interest\s+questionnaire\b|\bCIQ\b/i },
  { key: 'tx_ramp', re: /\bTX-?RAMP\b/i },
  { key: 'no_boycott_israel_808', re: /\bboycott\s+israel\b/i },
  { key: 'no_boycott_energy_809', re: /\bboycott\s+energy\b/i },
  { key: 'no_discrimination_firearms_2274', re: /\bfirearm\s+entit|\bdiscriminate\s+against\s+(?:a\s+)?firearm/i },
];

/** The 50 states + DC, for jurisdiction detection. */
const US_STATE_NAMES: string[] = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas',
  'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
  'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming',
];
const US_STATE_ABBR: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
/** Texas-specific acronyms that identify the jurisdiction even when the word "Texas" is absent. */
const TEXAS_ACRONYMS = /\b(?:HHSC|TDLR|TxDOT|TX-?RAMP|Texas\s+Ethics\s+Commission|ESBD)\b/i;

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function jurQuote(text: string, index: number, len: number): string {
  const start = Math.max(0, index - 20);
  return String(text).slice(start, index + len + 30).replace(/\s+/g, ' ').trim();
}

/**
 * Detect the buyer's US state (jurisdiction) from the solicitation text. Precise over broad: prefers an explicit
 * "State of <State>", then a Texas-specific acronym, then the EARLIEST full state name in document order, then an
 * address-style 2-letter abbreviation. Returns `{ state:null }` when nothing clearly matches. Pure + total.
 */
export function detectJurisdiction(text: string): Jurisdiction {
  const t = String(text ?? '');
  if (!t.trim()) return { state: null, quote: null };
  // Strong: explicit "State of <State>".
  for (const name of US_STATE_NAMES) {
    const m = new RegExp(`\\bState of ${escapeRe(name)}\\b`, 'i').exec(t);
    if (m) return { state: name, quote: jurQuote(t, m.index, m[0].length) };
  }
  // Strong: a Texas-specific acronym resolves to Texas even without the word "Texas".
  const txa = TEXAS_ACRONYMS.exec(t);
  if (txa) return { state: 'Texas', quote: jurQuote(t, txa.index, txa[0].length) };
  // Medium: the earliest full state name occurring in the text (document order, not list order).
  let best: { name: string; index: number } | null = null;
  for (const name of US_STATE_NAMES) {
    const m = new RegExp(`\\b${escapeRe(name)}\\b`, 'i').exec(t); // case-insensitive so an all-caps "TEXAS"/"UTAH" header is not missed (a Texas false-negative would wrongly drop required Texas forms)
    if (m && (best === null || m.index < best.index)) best = { name, index: m.index };
  }
  if (best) return { state: best.name, quote: jurQuote(t, best.index, best.name.length) };
  // Weak: an address-style 2-letter abbreviation, e.g. ", UT 84043".
  const addr = /,\s*([A-Z]{2})\b(?=\s+\d{5}(?:-\d{4})?|\s*(?:\n|$)|\s+\d)/.exec(t);
  if (addr && US_STATE_ABBR[addr[1]]) return { state: US_STATE_ABBR[addr[1]], quote: jurQuote(t, addr.index, addr[0].length) };
  return { state: null, quote: null };
}

/** Light buyer-type inference from the solicitation text, used only when the caller does not supply one. Precise
 *  over broad; returns null when nothing clearly matches (which keeps the Texas engine at `needs_input`).
 *  JURISDICTION-AWARE: a "university"/"local government" buyer is a *Texas* buyer class only when the jurisdiction is
 *  Texas; off-jurisdiction it is `other` (out of the Texas forms engine's scope), so a Utah city never pulls a
 *  Texas CIQ. `state_agency` cues are already Texas-specific. */
export function detectBuyerType(text: string, jurisdiction?: Jurisdiction | null): TexasBuyerType | null {
  const isTexas = (jurisdiction ?? detectJurisdiction(text)).state === 'Texas';
  if (/\b(?:state\s+of\s+texas|texas\s+(?:department|commission|agency|health\s+and\s+human|workforce)|HHSC|TDLR|\bDIR\b)\b/i.test(text)) return 'state_agency';
  if (/\b(?:university|college|\bUT\s+system\b|texas\s+a&m|institution\s+of\s+higher\s+education)\b/i.test(text)) return isTexas ? 'university' : 'other';
  if (/\b(?:county|city\s+of|municipal|school\s+district|\bISD\b|town\s+of|village\s+of)\b/i.test(text)) return isTexas ? 'local_government' : 'other';
  return null;
}

/**
 * Keep only the rules whose `quote` is literally present in SOME source file (never-fabricate), and count the drops.
 * Pure. Exported so the drop path is unit-testable directly with a hand-made fabricated-quote rule.
 */
export function verifyBlueprintRules(rules: BlueprintRule[], files: BlueprintSourceFile[]): { kept: BlueprintRule[]; droppedCount: number } {
  const norms = (Array.isArray(files) ? files : []).map((f) => normalizeForMatch(f?.text ?? ''));
  const kept: BlueprintRule[] = [];
  let droppedCount = 0;
  for (const r of Array.isArray(rules) ? rules : []) {
    const q = normalizeForMatch(r?.quote ?? '');
    if (q.length > 0 && norms.some((n) => n.includes(q))) kept.push(r);
    else droppedCount += 1;
  }
  return { kept, droppedCount };
}

/** Find a short literal snippet naming a form, for attaching a quote to an engine-derived form. */
function findNameQuote(files: BlueprintSourceFile[], re: RegExp): { quote: string; sourceFile: string } | null {
  for (const f of files) {
    const m = re.exec(f.text ?? '');
    if (m) {
      const start = Math.max(0, m.index - 40);
      const quote = String(f.text).slice(start, m.index + m[0].length + 60).replace(/\s+/g, ' ').trim();
      return { quote, sourceFile: f.name };
    }
  }
  return null;
}

export function buildProposalBlueprint(input: BuildBlueprintInput, opts?: BuildBlueprintOpts): ProposalBlueprint {
  const now = opts?.now ?? new Date();
  const files = (input?.files ?? []).filter((f) => f && typeof f.name === 'string' && typeof f.text === 'string');
  const classified = classifyDocuments(files);
  const roleByName = new Map(classified.map((c) => [c.name, c.role]));
  // Files whose body we scan for rules: the solicitation body + addenda + unknown references (not W-9/pricing forms).
  const scanFiles = files.filter((f) => FULL_SCAN_ROLES.has(roleByName.get(f.name) ?? 'reference'));
  const allText = files.map((f) => f.text).join('\n\n');

  // ── Section L rules (per file, so sourceFile is right) + submission-mechanics compliance rules. ──
  const ruleCandidates: BlueprintRule[] = [];
  for (const f of scanFiles) ruleCandidates.push(...detectSectionLRules(f.text, f.name));
  for (const f of scanFiles) {
    for (const c of detectRfpComplianceRules(f.text)) {
      const sev = c.kind === 'validity_period' ? 'info' : 'fatal';
      const value = c.kind === 'validity_period' && c.days ? String(c.days) : 'required';
      ruleCandidates.push({ key: c.kind, value, quote: c.quote, sourceFile: f.name, severity: sev });
    }
  }
  const { kept: rules, droppedCount } = verifyBlueprintRules(ruleCandidates, files);

  // ── Addenda to acknowledge: one per addendum file (file-presence based; not run through the text-quote rail). ──
  const addenda: BlueprintRule[] = classified
    .filter((c) => c.role === 'addendum')
    .map((c) => ({ key: 'acknowledge_addendum', value: c.name, quote: c.name, sourceFile: c.name, severity: 'curable' as const }));

  // ── Section M scoring: first solicitation file that yields a scoring read. ──
  let scoring: ProposalBlueprint['scoring'] = { basis: null, basisQuote: null, totalPoints: null, factors: [] };
  for (const f of scanFiles) {
    const ec = detectEvaluationCriteria(f.text);
    if (ec) { scoring = ec; break; }
  }

  // ── Elimination-risk requirements. ──
  const eliminationRisks = (input?.requirements ?? [])
    .map((r) => ({ statement: String(r?.statement ?? r?.text ?? '').trim(), section: r?.section ?? null }))
    .filter((r) => r.statement && isEliminationRisk({ text: r.statement, section: r.section }))
    .map((r) => ({ statement: r.statement, quote: r.statement, sourceFile: 'requirements' }));

  // ── Jurisdiction + buyer type + Texas forms engine, merged with forms the solicitation literally names. ──
  // The forms engine is Texas-only. Run it with a real Texas buyer type ONLY when the jurisdiction is Texas (or the
  // caller explicitly asserts a Texas buyer class). Off-jurisdiction we pass `other`, so NO Texas form is asserted
  // (the Saratoga-Springs-UT bug), and we record why so the UI can say "No state forms rules loaded for <State>".
  const jurisdiction: Jurisdiction = detectJurisdiction(allText);
  const explicitBuyer = input?.buyer?.buyerType;
  const isTexas = jurisdiction.state === 'Texas' || (explicitBuyer !== undefined && explicitBuyer !== 'other');
  const buyerType: TexasBuyerType = isTexas ? (explicitBuyer ?? detectBuyerType(allText, jurisdiction) ?? 'other') : 'other';
  const forms: RequiredForm[] = texasFormsRules({ ...(input?.buyer ?? {}), buyerType });
  const stateFormsStatus: StateFormsStatus = isTexas
    ? { state: 'Texas', loaded: true, note: null }
    : { state: jurisdiction.state, loaded: false, note: `No state forms rules loaded for ${jurisdiction.state ?? 'this jurisdiction'}. Forms named in the solicitation are listed below.` };
  for (const probe of FORM_NAME_PROBES) {
    const hit = findNameQuote(files, probe.re);
    if (!hit) continue;
    const form = forms.find((f) => f.key === probe.key);
    if (!form) continue;
    form.quote = hit.quote;
    form.sourceFile = hit.sourceFile;
    // The solicitation NAMING a form makes it required (overriding a needs_input/not_required inference), unless the
    // engine already placed it at award (timing is a stronger, statute-driven fact).
    if (form.disposition === 'needs_input' || form.disposition === 'not_required') {
      form.disposition = 'required';
      form.triggerReason = `${form.triggerReason} Named in the solicitation.`;
    }
  }

  return {
    rules,
    forms,
    scoring,
    addenda,
    eliminationRisks,
    buyerType,
    jurisdiction,
    stateFormsStatus,
    droppedRuleCount: droppedCount,
    sourceFiles: files.map((f) => f.name),
    generatedAt: now.toISOString(),
  };
}

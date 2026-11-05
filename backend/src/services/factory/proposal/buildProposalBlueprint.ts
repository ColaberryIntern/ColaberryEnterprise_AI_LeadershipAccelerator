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
import type { BlueprintRule, ProposalBlueprint, RequiredForm, TexasBuyerType } from './proposalBlueprintTypes';

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

/** Light buyer-type inference from the solicitation text, used only when the caller does not supply one. Precise
 *  over broad; returns null when nothing clearly matches (which keeps the Texas engine at `needs_input`). */
export function detectBuyerType(text: string): TexasBuyerType | null {
  if (/\b(?:state\s+of\s+texas|texas\s+(?:department|commission|agency|health\s+and\s+human|workforce)|HHSC|TDLR|\bDIR\b)\b/i.test(text)) return 'state_agency';
  if (/\b(?:university|college|\bUT\s+system\b|texas\s+a&m|institution\s+of\s+higher\s+education)\b/i.test(text)) return 'university';
  if (/\b(?:county|city\s+of|municipal|school\s+district|\bISD\b|town\s+of|village\s+of)\b/i.test(text)) return 'local_government';
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

  // ── Buyer type + Texas forms engine, merged with forms the solicitation literally names. ──
  const buyerType: TexasBuyerType | null = input?.buyer?.buyerType ?? detectBuyerType(allText);
  const forms: RequiredForm[] = texasFormsRules({ ...(input?.buyer ?? {}), buyerType: buyerType ?? 'other' });
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
    droppedRuleCount: droppedCount,
    sourceFiles: files.map((f) => f.name),
    generatedAt: now.toISOString(),
  };
}

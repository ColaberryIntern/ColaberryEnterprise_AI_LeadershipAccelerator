/**
 * capeResumeClaimExtraction — pure, DB-free functions that turn the LLM's raw
 * `skill_claims` output (resumeIngestService.ts's extended extraction prompt)
 * into sanitized, validated, scored claims ready for
 * capeResumeClaimService.persistResumeSkillClaims() (design doc §5, §15).
 *
 * Nothing in this file touches Sequelize/the DB — it exists so the scoring
 * math and PII-stripping logic are unit-testable without mocking a model, and
 * so capeResumeClaimService.ts stays focused on persistence only (CLAUDE.md
 * "One responsibility per module").
 */
import { resumeSkillClaimSchema, RawSkillClaimInput } from '../../schemas/capeSchema';
import type { EvidenceKind } from '../../models/ResumeSkillClaim';

export type RawSkillClaim = RawSkillClaimInput;

export interface ScoredClaim {
  skill_id: string;
  subskills: string[];
  evidence_text: string | null;
  evidence_kind: EvidenceKind;
  recency_years: number | null;
  ownership: string | null;
  scope: string | null;
  confidence: number;
  credit_weight: number;
  source_count: number;
}

// §5 "keyword-in-skills-list vs used-in-a-job-bullet vs built/owned vs
// measurable-outcome vs production vs led-architecture-decisions" — ascending
// base credit per tier. Placement-only scale (0-100, same numeric range as
// the verified bands for display consistency, but this table is NEVER used to
// write student_skill_evidence).
const BASE_CREDIT_BY_EVIDENCE_KIND: Record<string, number> = {
  keyword_list: 8,
  job_bullet: 18,
  built_owned: 35,
  measurable_outcome: 45,
  production: 50,
  led_architecture_decisions: 60,
};

const REPETITION_BONUS_PER_EXTRA_CLAIM = 3;
const REPETITION_BONUS_CAP = 15;
const CREDIT_CAP = 100;

/** Defense-in-depth PII stripping (§15) — the extraction prompt already asks
 * the model not to include names/emails/phones/employer names, but untrusted
 * model output is validated/sanitized again before storage, never trusted on
 * instruction alone. Truncates to keep stored evidence_text short and
 * display-only (never fed into scoring itself — scoring reads only the
 * structured fields). */
export function sanitizeEvidenceText(text: string | null | undefined): string | null {
  if (!text) return null;
  let s = String(text);
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[redacted]'); // emails
  s = s.replace(/(\+?\d[\d\s().-]{7,}\d)/g, '[redacted]'); // phone-like digit runs
  s = s.trim().slice(0, 300);
  return s || null;
}

/** Zod-validates each raw claim; silently drops invalid entries (best-effort,
 * mirrors resumeIngestService.parseExtractionJson's tolerance of a
 * partially-malformed LLM response — one bad claim never fails the whole
 * extraction). Returns only claims whose skill_id is one of the 10 canonical
 * ids (enforced by the schema's enum). */
export function validateSkillClaims(raw: unknown): RawSkillClaim[] {
  if (!Array.isArray(raw)) return [];
  const out: RawSkillClaim[] = [];
  for (const item of raw) {
    const parsed = resumeSkillClaimSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Recency decay: recent evidence counts more than an old, unreinforced
 * mention (§5 "recent, repeated evidence earns more than a single old
 * mention"). Missing/0 recency_years is treated as current (full weight). */
function recencyMultiplier(recencyYears: number | null | undefined): number {
  const y = recencyYears ?? 0;
  if (y <= 2) return 1;
  if (y <= 5) return 0.85;
  return 0.6;
}

/** Base placement credit for one raw claim, before merge/repetition bonus. */
export function scoreClaim(claim: RawSkillClaim): number {
  const base = BASE_CREDIT_BY_EVIDENCE_KIND[claim.evidence_kind] ?? 0;
  const credit = base * claim.confidence * recencyMultiplier(claim.recency_years);
  return Math.min(CREDIT_CAP, Math.round(credit * 100) / 100);
}

/**
 * Merges multiple raw claims for the SAME skill_id into ONE scored claim
 * (design doc §13's idempotency-key grain is one key per (resume_version,
 * skill_id), not per evidence bullet — Assumption 2, execution-contract.md).
 * The strongest single claim sets the floor; each additional supporting
 * claim adds a small, capped repetition bonus. Deterministic and pure:
 * calling this twice on the same input array yields byte-identical output.
 */
export function mergeClaims(claims: RawSkillClaim[]): Map<string, ScoredClaim> {
  const bySkill = new Map<string, RawSkillClaim[]>();
  for (const c of claims) {
    const list = bySkill.get(c.skill_id) ?? [];
    list.push(c);
    bySkill.set(c.skill_id, list);
  }

  const result = new Map<string, ScoredClaim>();
  for (const [skillId, group] of bySkill.entries()) {
    let strongest = group[0];
    let strongestScore = scoreClaim(strongest);
    for (const c of group.slice(1)) {
      const s = scoreClaim(c);
      if (s > strongestScore) { strongest = c; strongestScore = s; }
    }
    const repetitionBonus = Math.min(REPETITION_BONUS_CAP, (group.length - 1) * REPETITION_BONUS_PER_EXTRA_CLAIM);
    const creditWeight = Math.min(CREDIT_CAP, Math.round((strongestScore + repetitionBonus) * 100) / 100);

    const subskills = Array.from(new Set(group.flatMap((c) => c.subskills ?? []))).slice(0, 10);

    result.set(skillId, {
      skill_id: skillId,
      subskills,
      evidence_text: sanitizeEvidenceText(strongest.evidence_text),
      evidence_kind: strongest.evidence_kind,
      recency_years: strongest.recency_years ?? null,
      ownership: strongest.ownership ?? null,
      scope: strongest.scope ?? null,
      confidence: strongest.confidence,
      credit_weight: creditWeight,
      source_count: group.length,
    });
  }
  return result;
}

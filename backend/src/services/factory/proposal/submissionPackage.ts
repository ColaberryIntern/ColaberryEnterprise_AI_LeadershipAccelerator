/**
 * submissionPackage — the PURE logic behind the submission package + reusable outcome (P5). No DB, no I/O (only a
 * deterministic sha256 of content for the manifest). It computes readiness, assembles the downloadable package
 * files + manifest, and builds the private reusable candidates — all deterministic and non-fabricating.
 */
import { createHash } from 'crypto';
import type { ResponseSlot } from './responseSlots';
import type { ZipEntry } from '../../sbp/zipArchive';

export interface SubmissionReadiness {
  ready: boolean;
  /** Human-reasoned blocking reasons; empty ⇒ ready. */
  blocking: string[];
  /** Advisory, NON-blocking flags the operator should resolve but which do not gate export — e.g. a dollar amount
   *  in a non-cost response (`pricing_leak:<ids>`), which is usually a non-responsive mistake but can be legitimate.
   *  A false positive must never prevent a real submission, so these are warnings, not blockers. Empty when none. */
  warnings: string[];
}

// A currency amount: "$2,000,000", "$75,000.00", or "75000 dollars/USD". Used to catch a price that leaked into a
// NON-cost response (gov proposals keep price in a separate cost volume; a figure in the technical narrative is a
// classic non-responsive mistake).
const CURRENCY_RE = /\$\s?\d[\d,]*(?:\.\d{2})?|\b\d[\d,]{2,}(?:\.\d{2})?\s*(?:usd|dollars)\b/i;

/** PURE: the ids of any NON-price response whose authored content contains a currency amount — but only when a
 *  price/cost response exists (i.e. a separate cost volume IS expected). No price volume ⇒ a figure is not a leak. */
function detectPricingLeak(rows: ResponseSlot[]): string[] {
  const hasPriceVolume = rows.some((s) => s.bucket === 'price');
  if (!hasPriceVolume) return [];
  return rows
    .filter((s) => s.bucket !== 'price' && typeof s.content === 'string' && CURRENCY_RE.test(s.content))
    .map((s) => s.requirementId);
}

/**
 * Readiness is the finalization gate: a proposal is ready to export/submit ONLY when there is at least one
 * response slot, EVERY slot is `approved`, the ZIP coverage is sufficient, and no requirement is blocking. This is
 * the "draft ≠ sent / exported ≠ submitted" honesty — you cannot package a proposal whose answers are not signed
 * off. A material amendment (which flips affected responses back to revision_required) therefore drops the whole
 * proposal out of "ready" automatically.
 */
export function evaluateSubmissionReadiness(slots: ResponseSlot[], coverageSufficient: boolean, canApproveBid: boolean): SubmissionReadiness {
  const rows = Array.isArray(slots) ? slots : [];
  const blocking: string[] = [];
  if (rows.length === 0) blocking.push('no_response_slots');
  const unapproved = rows.filter((s) => s.status !== 'approved').map((s) => s.requirementId);
  if (unapproved.length) blocking.push(`responses_not_approved:${unapproved.join(',')}`);
  // P5: a FILLER placeholder (a Draft-with-AI gap resolved with a filler, or a slot marked filler) can never ship.
  // This is an EXPLICIT reason on top of the not-approved check, and is enforced at BOTH submission/export and
  // submission/package - no UI can bypass it, because both routes re-run this on the live slots.
  const filler = rows.filter((s) => s.status === 'filler'
    || (Array.isArray(s.gaps) && s.gaps.some((g) => g && g.resolution === 'filler'))).map((s) => s.requirementId);
  if (filler.length) blocking.push(`responses_filler:${filler.join(',')}`);
  if (!coverageSufficient) blocking.push('coverage_insufficient');
  if (!canApproveBid) blocking.push('requirements_blocking');
  // Advisory pre-flight (never gates `ready`): a dollar amount in a non-cost response is usually a non-responsive
  // leak, but can be legitimate — so it warns, it does not block.
  const warnings: string[] = [];
  const leak = detectPricingLeak(rows);
  if (leak.length) warnings.push(`pricing_leak:${leak.join(',')}`);
  return { ready: blocking.length === 0, blocking, warnings };
}

export interface SubmissionManifestItem {
  requirementId: string;
  status: string;
  contentSha256: string;
  figures: { commit: string; ref: string }[];
}
export interface SubmissionManifest {
  exportedAt: string;
  projectName: string;
  responseCount: number;
  items: SubmissionManifestItem[];
}

/** The manifest of an exported package: every response, a sha256 of its content, and its commit-bound figures. */
export function buildSubmissionManifest(projectName: string, slots: ResponseSlot[], exportedAt: string): SubmissionManifest {
  const rows = Array.isArray(slots) ? slots : [];
  const items: SubmissionManifestItem[] = rows.map((s) => ({
    requirementId: s.requirementId,
    status: s.status,
    contentSha256: createHash('sha256').update(String(s.content ?? ''), 'utf8').digest('hex'),
    figures: (Array.isArray(s.figures) ? s.figures : []).map((f) => ({ commit: f.commit, ref: f.ref })),
  }));
  return { exportedAt, projectName, responseCount: items.length, items };
}

/** A filesystem-safe slug for a requirement id used in a package file path. */
function safeReqId(requirementId: string): string {
  return String(requirementId).replace(/[^\w.\-]/g, '_').slice(0, 80) || 'requirement';
}

/**
 * The REAL downloadable files of the package: a manifest.json, a README, and one Markdown file per response (its
 * content + a figures list citing the commit each figure is bound to). Returns ZipEntry[] for createZip. PURE:
 * reflects exactly the responses passed in; it invents no content.
 */
export function buildPackageFiles(manifest: SubmissionManifest, slots: ResponseSlot[]): ZipEntry[] {
  const rows = Array.isArray(slots) ? slots : [];
  const entries: ZipEntry[] = [{ path: 'manifest.json', content: JSON.stringify(manifest, null, 2) }];
  const readme = [
    `# Proposal package — ${manifest.projectName}`,
    '',
    `Exported ${manifest.exportedAt}. ${manifest.responseCount} response${manifest.responseCount === 1 ? '' : 's'}.`,
    '',
    'This package was ASSEMBLED, not submitted. Submitting it to the buyer portal and recording the receipt is a',
    'manual step; exporting here does not submit anything externally.',
    '',
    '## Responses',
    ...rows.map((s) => `- ${s.requirementId} (${s.status})`),
  ].join('\n');
  entries.push({ path: 'README.md', content: readme });
  for (const s of rows) {
    const figs = (Array.isArray(s.figures) ? s.figures : []);
    const body = [
      `# Response — ${s.requirementId}`,
      '',
      `Requirement: ${s.statement}`,
      s.sourceRef ? `Cited source: ${s.sourceRef}` : '',
      `Status: ${s.status}`,
      '',
      '## Response',
      String(s.content ?? '').trim() || '(no content authored)',
      ...(figs.length ? ['', '## Figures', ...figs.map((f) => `- ${f.caption || f.ref} (commit ${f.commit})`)] : []),
    ].filter((l) => l !== '').join('\n');
    entries.push({ path: `responses/RESPONSE-${safeReqId(s.requirementId)}.md`, content: body });
  }
  return entries;
}

export interface OutcomeCandidates {
  caseStudyCandidate: {
    status: 'candidate';
    visibility: 'private';
    published: false;
    title: string;
    outcome: string;
    summary: string;
    note: string | null;
    requirementCount: number;
    approvedResponseCount: number;
    generatedAt: string;
  };
  serviceCapabilityCandidate: {
    state: 'suggested';
    name: string;
    rationale: string;
    fromOutcome: string;
    generatedAt: string;
  };
}

/**
 * Build the PRIVATE reusable candidates from a recorded outcome — for BOTH won and lost (a lost bid still built a
 * real solution, which is a reusable capability). DETERMINISTIC + NON-FABRICATING: the summary states only the
 * recorded outcome and the counts from the responses; it invents no metrics, no win rationale, no client quote.
 * Born `candidate` / `suggested` / `published: false` — a human promotes it; this never publishes anything.
 */
export function buildOutcomeCandidates(projectName: string, outcome: string, note: string | null, slots: ResponseSlot[], generatedAt: string): OutcomeCandidates {
  const rows = Array.isArray(slots) ? slots : [];
  const approved = rows.filter((s) => s.status === 'approved').length;
  const outcomeLabel = outcome === 'won' ? 'won' : outcome === 'lost' ? 'lost' : outcome;
  return {
    caseStudyCandidate: {
      status: 'candidate',
      visibility: 'private',
      published: false,
      title: `${projectName} — ${outcomeLabel}`,
      outcome,
      summary: `A government pursuit recorded as ${outcomeLabel}. ${rows.length} requirement${rows.length === 1 ? '' : 's'}, ${approved} response${approved === 1 ? '' : 's'} approved. A private draft for review — no metrics or claims are asserted until a person confirms them.`,
      note: note && note.trim() ? note.trim() : null,
      requirementCount: rows.length,
      approvedResponseCount: approved,
      generatedAt,
    },
    serviceCapabilityCandidate: {
      state: 'suggested',
      name: `Capability from: ${projectName}`,
      rationale: `Suggested from a gov pursuit recorded as ${outcomeLabel}. Review and confirm before adding to the service catalog.`,
      fromOutcome: outcome,
      generatedAt,
    },
  };
}

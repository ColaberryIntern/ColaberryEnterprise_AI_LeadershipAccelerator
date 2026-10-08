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
  if (!coverageSufficient) blocking.push('coverage_insufficient');
  if (!canApproveBid) blocking.push('requirements_blocking');
  return { ready: blocking.length === 0, blocking };
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

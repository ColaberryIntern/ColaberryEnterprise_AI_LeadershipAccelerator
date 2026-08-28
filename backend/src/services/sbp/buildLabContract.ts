/**
 * buildLabContract — the invariants every Build Artifact(s) Lab must hold, and a
 * pure checker for them.
 *
 * ## Why this exists
 *
 * The labs live in the database as `authored` timeline cards, not in this repo, so
 * nothing in CI can fail when one drifts. That was survivable while a lab was five
 * interchangeable document prompts. It stopped being survivable once the labs
 * started naming SPECIFIC repo paths that another system reads.
 *
 * Week 5's lab tells a student to create `mcp-server/`. `capabilityInventory`
 * declares `MCP_SERVER` with `evidence: ['mcp-server/']`. Those two facts have to
 * agree, and NOTHING enforces it: an editor who renames the folder in the lab
 * copy breaks the portfolio's ability to find that student's work, silently, with
 * no error anywhere. The student does everything right and their capability reads
 * as missing.
 *
 * This module states the invariants once, as data, and checks a lab against them
 * without a database. `scripts/auditBuildLabs.ts` runs it against production; the
 * unit tests run the same checker against fixtures in CI. Both ask the same
 * questions, which is the point — an ops check and a test that disagree are worse
 * than neither.
 *
 * PURE. No I/O, no clock, no model imports.
 */
import { CAPABILITIES } from './capabilityInventory';

/** One thing that is wrong with a lab. */
export interface LabViolation {
  week: number;
  rule: string;
  detail: string;
}

export interface LabInput {
  week: number;
  /** `metadata.content.body_html` exactly as stored. */
  bodyHtml: string;
  /** `metadata.source` — set means a seed owns the row and a DB edit will revert. */
  source?: string | null;
  /** `metadata.authored` */
  authored?: boolean;
}

/**
 * Week 11 is the one lab that is CORRECTLY still five documents.
 *
 * Its blueprint deliverable genuinely is a packaged architecture document for the
 * Expo — diagrams, ADRs, a scorecard. Converting it to "build the thing" would be
 * pattern-matching, not judgement, and would break a week that works. Recorded
 * here as a named exception rather than left as a gap the next reader has to
 * rediscover and re-argue.
 */
export const DOCUMENT_WEEKS: readonly number[] = [11];

/** Every week that should carry a step-based lab. */
export const STEP_WEEKS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12];

const stepCount = (html: string): number => (html.match(/<h4>\s*Step\s+\d+/gi) || []).length;

/** `artifacts/week-05/` for week 5. The zero pad is not cosmetic — the reader globs on it. */
export function weekArtifactPath(week: number): string {
  return `artifacts/week-${String(week).padStart(2, '0')}/`;
}

/**
 * Which capability evidence paths a given week's lab is expected to mention.
 *
 * Derived from `capabilityInventory` rather than restated, so adding a capability
 * automatically extends the contract instead of silently escaping it.
 *
 * Composites are excluded: `CAPSTONE` is derived from the others and names no path
 * of its own, so demanding one of week 12 would be demanding a fiction.
 */
export function expectedEvidenceFor(week: number): string[] {
  return CAPABILITIES
    .filter((c) => c.shape !== 'composite' && c.weeks.includes(week))
    .flatMap((c) => c.evidence);
}

/**
 * Check one lab. Returns every violation rather than the first, because an editor
 * fixing these wants the whole list, not a game of whack-a-mole.
 */
export function checkLab(lab: LabInput): LabViolation[] {
  const out: LabViolation[] = [];
  const v = (rule: string, detail: string) => out.push({ week: lab.week, rule, detail });
  const html = lab.bodyHtml || '';

  // A seeded card is re-asserted on every backend boot, so a DB edit to it is
  // temporary. Catching this is the difference between a fix that holds and one
  // that vanishes on the next deploy.
  if (lab.source) v('not_seeded', `metadata.source = "${lab.source}" — a seed owns this row and a DB edit will revert on boot`);

  // The old five-document labs told students to save into their Downloads folder,
  // which is how the work ended up detached from the project it belonged to.
  const downloads = (html.match(/Downloads folder/gi) || []).length;
  if (downloads > 0) v('no_downloads_folder', `${downloads} prompt(s) still save to the Downloads folder instead of the repo`);

  if (DOCUMENT_WEEKS.includes(lab.week)) {
    // Nothing further to assert. This week is documents ON PURPOSE and the rest
    // of the contract does not apply to it.
    return out;
  }

  const steps = stepCount(html);
  if (steps === 0) {
    v('has_steps', 'no "Step N" headings — this is still the old pick-one-of-five shape');
    return out;  // every remaining rule assumes a step lab; reporting them would be noise
  }
  if (steps < 5) v('enough_steps', `only ${steps} steps — the rebuilt labs run 7`);

  // The last step of every rebuilt lab commits a recording to the week's folder,
  // and the capability inventory looks for run evidence at exactly that path.
  const artifactPath = weekArtifactPath(lab.week);
  if (!html.includes(artifactPath)) {
    v('commits_to_week_folder', `never mentions ${artifactPath} — the recording has nowhere to land and run evidence will never be found`);
  }

  // THE IMPORTANT ONE. If the lab tells a student to build `mcp-server/` and the
  // inventory looks for `mcp-server/`, they agree. Rename either and a student who
  // did everything right reads as having built nothing.
  for (const evidence of expectedEvidenceFor(lab.week)) {
    if (!html.includes(evidence)) {
      v('evidence_path_agrees', `capabilityInventory expects "${evidence}" for this week, but the lab never tells the student to create it`);
    }
  }

  return out;
}

/** Check a whole curriculum. Weeks absent from the input are themselves a violation. */
export function checkCurriculum(labs: LabInput[]): LabViolation[] {
  const out: LabViolation[] = [];
  const byWeek = new Map(labs.map((l) => [l.week, l]));

  for (const week of [...STEP_WEEKS, ...DOCUMENT_WEEKS].sort((a, b) => a - b)) {
    const lab = byWeek.get(week);
    if (!lab) {
      out.push({ week, rule: 'lab_exists', detail: 'no build lab for this week at all' });
      continue;
    }
    out.push(...checkLab(lab));
  }
  return out;
}

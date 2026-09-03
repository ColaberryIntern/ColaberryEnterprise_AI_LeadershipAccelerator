/**
 * portfolioOverview - the "About" paragraph and the stat tiles on the resume-format
 * portfolio, composed DETERMINISTICALLY from facts the platform already holds.
 *
 * WHY NO LLM HERE. The Career Studio's composer has been deterministic since it shipped,
 * for one reason: a generated sentence about somebody's career can invent a seniority, a
 * metric or a title, and this page is read by people deciding whether to hire them. Every
 * clause below is a template over a value that came from a row. If the value is absent the
 * clause is dropped, never guessed. That also keeps the read path free of a network call
 * on a page a stranger loads.
 *
 * WHY THE STAT TILES ARE ALLOWED, when `evidence_count` was refused before. The number
 * previously refused came from `student_skill_evidence`, where all 8,895 rows are
 * `source='timeline'` - content opened, one row per band - so it measured attendance while
 * claiming proof. `evidence_records` is a different table with different semantics.
 * Audited on production 2026-09-03: 546 rows across five source types, and NOT ONE of
 * them is a consumption event.
 *
 *     deliverable        166    github_commit  116    prompt_lab  94
 *     implementation      88    instructor_review 82
 *
 * A submitted deliverable, a commit, and an instructor's review are all things the learner
 * did. That is defensible next to their name; "opened a page" was not.
 */

import type { ResumeExperience } from '../resumeHistory';

/** The tiles across the top of the overview. A null field renders no tile at all. */
export interface PortfolioStats {
  /** Whole years from the earliest stated role to today. */
  years_experience: number | null;
  /** Files committed in the repositories the platform can see. */
  files_committed: number | null;
  /** Capabilities present in their repo. */
  capabilities: number | null;
  /** Rows in `evidence_records` - deliverables, commits, reviews. Never consumption. */
  evidence_records: number | null;
}

export interface OverviewInput {
  fullName: string;
  /** Their current job title, as they wrote it. */
  headline?: string | null;
  /** Their current employer, if the resume stated one. */
  company?: string | null;
  experience: ResumeExperience[];
  /** The capstone project's name, from the published record. */
  projectName?: string | null;
  /** What the project does, in the learner's own words. */
  projectDescriptor?: string | null;
  capabilityCount: number;
  filesCommitted?: number | null;
  evidenceRecords?: number | null;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2020-09" -> "September 2020"; "2020" -> "2020"; anything else -> null. */
function longDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(value);
  if (!m) return null;
  if (!m[2]) return m[1];
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return m[1];
  return `${MONTH_NAMES[idx]} ${m[1]}`;
}

/** The year an experience entry started, or null. */
function startYear(item: ResumeExperience): number | null {
  const m = /^(\d{4})/.exec(item.start || '');
  return m ? Number(m[1]) : null;
}

/**
 * Whole years of stated experience, or null.
 *
 * Measured from the EARLIEST start date on the resume to today, which is how a resume
 * means the phrase. Returns null rather than 0 when no role carries a date: a tile
 * reading "0 years" beside a career is worse than no tile.
 */
export function yearsOfExperience(
  experience: ResumeExperience[],
  now: Date = new Date(),
): number | null {
  const years = (experience || []).map(startYear).filter((y): y is number => y !== null);
  if (!years.length) return null;
  const earliest = Math.min(...years);
  const span = now.getUTCFullYear() - earliest;
  if (span < 0 || span > 70) return null;
  return span < 1 ? 1 : span;
}

/** The tiles, with anything unknown left as null so it renders nothing. */
export function composeStats(input: OverviewInput, now: Date = new Date()): PortfolioStats {
  const positive = (n: unknown): number | null =>
    (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : null);
  return {
    years_experience: yearsOfExperience(input.experience || [], now),
    files_committed: positive(input.filesCommitted),
    capabilities: positive(input.capabilityCount),
    evidence_records: positive(input.evidenceRecords),
  };
}

/**
 * A descriptor short enough to be a sentence, or null.
 *
 * WHY THIS GUARD EXISTS. `capstone_records.content_json->system->descriptor` is not a
 * one-line summary despite the name - it is the WHOLE deliverable document. Verified on
 * production 2026-09-03, where this composer published its opening lines verbatim into
 * the About block: "# Enterprise AI Strategy - Executive Deliverable

**Organization:**
 * ...". A reader would have seen literal hashes and asterisks on a public portfolio.
 *
 * So a descriptor is accepted ONLY if it looks like prose somebody wrote to be read in
 * place: one line, no markdown syntax, and short. Anything else is dropped rather than
 * truncated, because the first 200 characters of a document is still a document.
 */
function shortProse(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t || t.length > 240) return null;
  // Any whitespace that is not a plain space means a line break or a tab, and
  // that means a document rather than a sentence.
  if (/[^\S ]/.test(t)) return null;
  if (/^[#>*\-|]|[*_`#|]{2,}|\|\s*-{3,}/.test(t)) return null;
  return t;
}

/** First name only, for the second sentence. Falls back to the whole name. */
function firstName(fullName: string): string {
  const t = (fullName || '').trim();
  if (!t) return 'They';
  return t.split(/\s+/)[0];
}

/**
 * The About paragraphs, as a list. Empty when there is genuinely nothing to say.
 *
 * Each sentence is emitted ONLY if the facts it needs are present, so a sparse profile
 * gets a short honest paragraph rather than a padded one with gaps papered over.
 * Deliberately makes no claim about quality, seniority or impact - it states what
 * happened and where the reader can check it.
 */
export function composeAbout(input: OverviewInput): string[] {
  const paras: string[] = [];
  const name = (input.fullName || '').trim() || 'This learner';
  const current = (input.experience || [])[0];

  // Sentence 1: where they work now, and since when.
  const bits: string[] = [];
  const role = input.headline || current?.title || null;
  const employer = input.company || current?.company || null;
  const since = longDate(current?.start);
  if (role && employer && since && !current?.end) {
    bits.push(`${name} has worked in ${role} at ${employer} since ${since}.`);
  } else if (role && employer) {
    bits.push(`${name} works in ${role} at ${employer}.`);
  } else if (role) {
    bits.push(`${name} works in ${role}.`);
  }

  // Sentence 2: what they built here, and how big it actually is.
  if (input.projectName) {
    const who = bits.length ? firstName(name) : name;
    const scale = typeof input.filesCommitted === 'number' && input.filesCommitted > 0
      ? `, a ${input.filesCommitted} file repository`
      : '';
    bits.push(`During the accelerator ${who} built ${input.projectName}${scale}.`);
  }
  if (bits.length) paras.push(bits.join(' '));

  // Second paragraph: what a reader can verify, and the standing invariant of this page.
  const second: string[] = [];
  const descriptor = shortProse(input.projectDescriptor);
  if (descriptor) second.push(descriptor);
  if (input.capabilityCount > 0) {
    second.push(
      `${input.capabilityCount} ${input.capabilityCount === 1 ? 'capability is' : 'capabilities are'} `
      + 'visible in the repository. Every skill listed on this page points at something committed.',
    );
  }
  if (second.length) paras.push(second.join(' '));

  return paras;
}

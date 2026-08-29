/**
 * capstoneRecordCompiler — real data becomes a Capstone Record. PURE.
 *
 * No I/O, no clock, no randomness. Same inputs in, byte-identical record out,
 * so re-compiling an unchanged student produces an identical snapshot and the
 * publish step can skip writing. The reasons are the same ones that govern
 * artifactRepoFiles: a clock in here makes every sync a fresh version, and a
 * version history that grows while nothing changed is noise that hides the
 * changes that matter.
 *
 * ── WHAT THIS WILL NOT DO ───────────────────────────────────────────────────
 *
 * IT INVENTS NOTHING. Every field is either present in the inputs or null.
 * There is no generated headline, no summarised descriptor, no inferred skill.
 * That is a deliberate departure from how portfolio builders usually work, and
 * it is the whole reason this one can be trusted: a reader who finds one
 * embellished claim reasonably discounts every other claim on the page, and a
 * student defending this at the Expo has to be able to source every line.
 *
 * Where a fact is missing the record says so by omission — an absent demo, an
 * unmeasured hours figure, a competency with no evidence — and `recordGaps`
 * turns those absences into a reason the share action is not offered yet.
 *
 * ── CONSENT IS PER POST ─────────────────────────────────────────────────────
 *
 * The community posts were written for a closed cohort. Lifting them onto a
 * public page is a different audience and a different consent, so a post
 * appears only when its own `shared` flag is set. Default is off, and the
 * week-1 answer in particular is often candid about frustration at work.
 */
import {
  CapstoneRecord,
  RecordArtifact,
  RecordCapability,
  RecordCompetency,
  RecordPost,
} from './capstoneRecordContract';

/** Week to ritual name. Matches services/runtime/communityRituals.ts. */
export const RITUAL_NAMES: Record<number, string> = {
  1: 'Roll Call', 2: 'Skill Drop', 3: 'Show & Tell', 4: 'Steal This Prompt',
  5: 'Cohort Wins', 6: 'Unblock Me', 7: 'Meet My Team', 8: 'Never Again',
  9: 'War Story', 10: 'Hot Take', 11: 'Teach One Thing', 12: 'Architect Manifesto',
};

// ── inputs, each mirroring one real table ───────────────────────────────────

export interface CompilerInputs {
  enrollment: { full_name?: string | null; cohort_name?: string | null };
  project: {
    name?: string | null;
    descriptor?: string | null;
    repo_url?: string | null;
    demo_url?: string | null;
    hours_reclaimed?: number | null;
    architecture_mermaid?: string | null;
  } | null;
  artifacts: Array<{
    week?: number | null;
    title?: string | null;
    filename?: string | null;
    path?: string | null;
    commit_sha?: string | null;
    project_label?: string | null;
    built_on_sample?: boolean;
    verification?: string | null;
  }>;
  competencies: Array<{ domain_id?: string | null; label?: string | null; evidence_count?: number }>;
  /**
   * Already MERGED by the caller. The compiler does not ratchet, because ratcheting
   * needs prior state and this function must stay pure.
   */
  capabilities?: Array<{
    id?: string | null;
    label?: string | null;
    present?: boolean;
    count?: number;
    proven?: boolean;
    onSample?: boolean;
  }>;
  posts: Array<{
    week?: number | null;
    headline?: string | null;
    body?: string | null;
    shared?: boolean;
  }>;
  certification?: string | null;
}

const clean = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t.length ? t : null;
};

/**
 * The headline is taken from their week-12 manifesto, never generated. If they
 * have not written one, the record carries no headline rather than a plausible
 * invention.
 */
function deriveHeadline(posts: CompilerInputs['posts']): string | null {
  const manifesto = posts.find((p) => p.week === 12);
  return clean(manifesto?.headline);
}

function compileArtifacts(rows: CompilerInputs['artifacts']): RecordArtifact[] {
  const out: RecordArtifact[] = [];
  for (const r of rows) {
    const filename = clean(r.filename);
    const path = clean(r.path);
    // Without a path there is nothing to link and nothing to show. Skipping is
    // correct here: a row that cannot point at a file is not evidence.
    if (!filename || !path) continue;
    out.push({
      week: typeof r.week === 'number' && r.week > 0 ? r.week : 0,
      title: clean(r.title) ?? filename,
      filename,
      path,
      commit_sha: clean(r.commit_sha),
      built_on: r.built_on_sample ? 'Sample project' : (clean(r.project_label) ?? 'Own project'),
      is_sample: r.built_on_sample === true,
      verification: clean(r.verification),
    });
  }
  return out.sort((a, b) => (a.week - b.week) || a.path.localeCompare(b.path));
}

/**
 * A competency with no evidence is omitted entirely rather than shown at zero.
 * A row reading "Governance — 0" invites the reader to wonder what went wrong,
 * when the truthful statement is simply that this student has not demonstrated
 * it yet.
 */
function compileCompetencies(rows: CompilerInputs['competencies']): RecordCompetency[] {
  return rows
    .filter((c) => (c.evidence_count ?? 0) > 0 && clean(c.domain_id))
    .map((c) => ({
      domain: clean(c.domain_id)!,
      label: clean(c.label) ?? clean(c.domain_id)!,
      evidence_count: c.evidence_count ?? 0,
    }))
    .sort((a, b) => (b.evidence_count - a.evidence_count) || a.domain.localeCompare(b.domain));
}

/**
 * What they built in their own repo.
 *
 * `present` is the gate, not `count`. A single module is `present` with `count: 1`, and
 * requiring a count above zero would drop every non-collection capability.
 *
 * `proven` and `on_sample` are emitted ONLY when true. An absent flag reads as absent
 * rather than as a denial, and `proven: false` printed beside a service would read as a
 * failed demo rather than one that simply has not happened yet.
 */
function compileCapabilities(rows: CompilerInputs['capabilities']): RecordCapability[] {
  if (!Array.isArray(rows)) return [];
  return rows
    // `c &&` first: a null entry in the array must degrade to a shorter band, not a
    // throw that takes the whole record compile down with it.
    .filter((c) => c && typeof c === 'object' && c.present === true && clean(c.id))
    .map((c) => ({
      id: clean(c.id)!,
      label: clean(c.label) ?? clean(c.id)!,
      count: typeof c.count === 'number' && c.count > 0 ? Math.floor(c.count) : 1,
      ...(c.proven === true ? { proven: true } : {}),
      ...(c.onSample === true ? { on_sample: true } : {}),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function compilePosts(rows: CompilerInputs['posts']): RecordPost[] {
  return rows
    .filter((p) => p.shared === true && typeof p.week === 'number' && clean(p.headline))
    .map((p) => ({
      week: p.week as number,
      ritual: RITUAL_NAMES[p.week as number] ?? 'Community',
      headline: clean(p.headline)!,
      body: clean(p.body),
      shared: true,
    }))
    .sort((a, b) => a.week - b.week);
}

/**
 * The bookend: week 1's answer opens the record, week 12's closes it.
 *
 * Read from the SHARED posts only — a student who kept week 1 private has not
 * consented to it opening a public page, and taking it anyway because it makes
 * a better page would be exactly the wrong trade.
 */
function compileBookend(posts: RecordPost[]): { opening: string | null; closing: string | null } {
  return {
    opening: posts.find((p) => p.week === 1)?.body ?? posts.find((p) => p.week === 1)?.headline ?? null,
    closing: posts.find((p) => p.week === 12)?.body ?? posts.find((p) => p.week === 12)?.headline ?? null,
  };
}

export function compileCapstoneRecord(inputs: CompilerInputs): CapstoneRecord {
  const posts = compilePosts(inputs.posts);

  return {
    schema_version: 1,
    identity: {
      full_name: clean(inputs.enrollment.full_name) ?? 'Architect',
      headline: deriveHeadline(inputs.posts),
      cohort_name: clean(inputs.enrollment.cohort_name),
      repo_url: clean(inputs.project?.repo_url),
      demo_url: clean(inputs.project?.demo_url),
      certification: clean(inputs.certification),
    },
    system: {
      project_name: clean(inputs.project?.name),
      descriptor: clean(inputs.project?.descriptor),
      architecture_mermaid: clean(inputs.project?.architecture_mermaid),
      hours_reclaimed:
        typeof inputs.project?.hours_reclaimed === 'number' ? inputs.project.hours_reclaimed : null,
    },
    artifacts: compileArtifacts(inputs.artifacts),
    competencies: compileCompetencies(inputs.competencies),
    // Omitted entirely when empty, so a student with no connected repo gets no heading
    // rather than an empty one. An empty band reads as failure; an absent band reads as
    // "not this part of the story".
    ...(compileCapabilities(inputs.capabilities).length
      ? { capabilities: compileCapabilities(inputs.capabilities) }
      : {}),
    posts,
    bookend: compileBookend(posts),
  };
}

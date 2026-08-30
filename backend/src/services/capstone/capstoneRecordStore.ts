/**
 * capstoneRecordStore — gather a student's real rows, compile, and store.
 *
 * The compiler (capstoneRecordCompiler) is pure and already tested from
 * literals. This is the I/O shell around it: it reads, it writes, and it owns
 * the one decision the compiler cannot make — whether anything actually changed.
 *
 * ── AN UNCHANGED RECORD MUST NOT MAKE A VERSION ─────────────────────────────
 *
 * `compileCapstoneRecord` is deterministic and clock-free, so re-compiling a
 * student who has done nothing produces byte-identical output. This compares
 * that output against what is stored and returns `unchanged` rather than
 * inserting a duplicate version row.
 *
 * It is the same rule the artifact sync learned the hard way: determinism buys
 * nothing unless something persists the result and compares against it. There,
 * a missing comparison meant a fresh commit on every upload, forever. Here it
 * would mean a version history that grows on every page view and buries the
 * versions that represent real work.
 *
 * ── IT NEVER PUBLISHES ──────────────────────────────────────────────────────
 *
 * Compiling is not sharing. This writes `content_json` and leaves `status` and
 * `visibility` exactly as it found them, so a record can be kept current for its
 * owner without ever becoming a link. Publishing is a separate, deliberate act
 * by the student, gated on `isShareable`.
 */
import { compileCapstoneRecord, CompilerInputs } from './capstoneRecordCompiler';
import { CapstoneRecord as RecordShape, recordGaps } from './capstoneRecordContract';
import { buildCapstoneSlug, resolveUniqueSlug } from './capstoneSlug';
// Type-only: erased at compile time, so it does not undo the dynamic-import pattern
// this file uses to keep model loading lazy.
import type { Inventory } from '../sbp/capabilityInventory';

export type CompileOutcome = 'created' | 'updated' | 'unchanged' | 'no_project';

/**
 * Serialise with keys sorted recursively, so two records are compared by
 * CONTENT rather than by key order.
 *
 * ── WHY A PLAIN JSON.stringify IS WRONG HERE ────────────────────────────────
 *
 * `content_json` is a JSONB column, and JSONB does not preserve key insertion
 * order — Postgres normalises it (by key length, then bytewise). So a record
 * read back from the database has a different key order than the one the
 * compiler just built, even when every value is identical:
 *
 *   stored: posts,system,bookend,identity,artifacts,competencies,schema_version
 *   fresh:  schema_version,identity,system,artifacts,competencies,posts,bookend
 *
 * `JSON.stringify(a) === JSON.stringify(b)` is therefore false ALWAYS, and the
 * unchanged-check it guards never fires once. Measured in production before
 * this fix: two consecutive compiles of a student who had done nothing in
 * between produced versions 1 and 2 with byte-identical content — confirmed
 * identical by comparing their md5 in Postgres, where both sides get the same
 * normalisation. Left alone, every compile appends a version forever and buries
 * the versions that represent real work, which is the precise outcome the
 * comparison was written to prevent.
 *
 * Arrays are NOT reordered. JSONB preserves array order, and the record's arrays
 * are meaningful sequences — artifacts run in week order, posts in week order.
 * Sorting them would hide a real reordering as "unchanged".
 */
export function canonicalJson(value: unknown): string {
  const normalise = (v: any): any => {
    if (Array.isArray(v)) return v.map(normalise);
    if (v && typeof v === 'object') {
      return Object.keys(v).sort().reduce((acc: any, k) => { acc[k] = normalise(v[k]); return acc; }, {});
    }
    return v;
  };
  return JSON.stringify(normalise(value));
}

export interface CompileResult {
  outcome: CompileOutcome;
  slug: string | null;
  version: number | null;
  /** Why this is not shareable yet. Empty means it is. */
  gaps: string[];
}

function log(event: string, outcome: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'capstone-record', event, outcome, ...ctx,
  }));
}

/**
 * Read every band's source rows for one project.
 *
 * Exported so the gathering can be inspected independently of the write. Each
 * band degrades to empty rather than throwing: a student with no competencies
 * yet still has a project and artifacts worth compiling, and one missing band
 * must not cost them the whole record.
 */
export interface GatheredInputs {
  inputs: CompilerInputs;
  /** Carried out of the gather so the writer does not re-query for it. */
  enrollmentId: string;
}

export async function gatherInputs(projectId: string): Promise<GatheredInputs | null> {
  const { default: Project } = await import('../../models/Project');
  const project: any = await Project.findByPk(projectId);
  if (!project) return null;

  const { default: Enrollment } = await import('../../models/Enrollment');
  const enrollment: any = await Enrollment.findByPk(project.enrollment_id).catch(() => null);

  const { resolveProjectRepo } = await import('../projectRepoResolver');
  const pointer = await resolveProjectRepo(projectId, project.github_repo_url).catch(() => null);

  // ── What they built in their own repo ────────────────────────────────────
  //
  // THE RATCHET LIVES HERE, not in the compiler, which must stay pure. `mergeInventory`
  // never lowers a count and never un-sets `present`, so a failed repo read or a student
  // refactoring a folder cannot erase credit for work they did.
  //
  // The prior state it ratchets against is THE LAST COMPILED RECORD. Nothing else
  // persists an Inventory today, so without this the merge would always see `null` and
  // a single unreadable tree would silently strip the band on the next compile -- the
  // exact outcome the ratchet exists to prevent.
  // Loaded BEFORE the capability block, because the sample/own join below needs it.
  // Whether a capability was built against the provided sample is artifact evidence,
  // not repository evidence -- a file tree cannot say whose inbox it was pointed at.
  const { default: PortfolioArtifact } = await import('../../models/PortfolioArtifact');
  const artifactRows: any[] = await PortfolioArtifact
    .findAll({ where: { enrollment_id: project.enrollment_id, kind: 'build_artifact' } })
    .catch(() => []);

  const { readCapabilitiesFromRepo } = await import('../sbp/capabilityRepoReader');
  const { mergeInventory, capabilityById } = await import('../sbp/capabilityInventory');
  const { sampleFlagReader } = await import('./capabilitySampleFlags');

  const { default: CapstoneRecordModel } = await import('../../models/CapstoneRecord');
  const priorRecord: any = await CapstoneRecordModel
    .findOne({ where: { project_id: projectId } })
    .catch(() => null);

  const priorBand: any[] = Array.isArray(priorRecord?.content_json?.capabilities)
    ? priorRecord.content_json.capabilities
    : [];
  // Rehydrate the stored band into an Inventory so the merge has something to hold.
  // `on_sample` is the record's spelling; `onSample` is the inventory's.
  const stored: Inventory | null = priorBand.length
    ? {
      enrollmentId: project.enrollment_id,
      entries: priorBand.map((c: any) => ({
        id: c.id,
        present: true,
        count: typeof c.count === 'number' ? c.count : 1,
        ...(c.proven === true ? { proven: true } : {}),
        ...(c.on_sample === true ? { onSample: true } : {}),
      })),
    }
    : null;

  const observed = await readCapabilitiesFromRepo(project.enrollment_id);

  // Decorated BEFORE the merge, not after. `mergeInventory` honours an explicit `false`
  // as "rebuilt on the real project, and it never goes back", which is how a student
  // sheds the caveat by redoing the work -- applying it afterwards would bypass that.
  // An `undefined` flag is left alone, so silence never clears a disclosure.
  const sampleFlag = sampleFlagReader(artifactRows.map((row) => row.content || {}));
  const observedWithSample: Inventory = {
    ...observed,
    entries: observed.entries.map((e) => {
      const flag = sampleFlag(e.id);
      return flag === undefined ? e : { ...e, onSample: flag };
    }),
  };

  const inventory = mergeInventory(stored, observedWithSample);

  const inputs: CompilerInputs = {
    enrollment: {
      full_name: enrollment?.full_name ?? null,
      cohort_name: null,
    },
    project: {
      name: project.name ?? null,
      descriptor: project.executive_summary ?? null,
      // The project's own stated goal, in one line. Not a summary of the descriptor --
      // summarising would be inventing, and this compiler invents nothing.
      what_it_does: project.automation_goal ?? null,
      repo_url: pointer?.url ?? null,
      demo_url: project.portfolio_url ?? null,
      hours_reclaimed: null,
      architecture_mermaid: null,
    },
    artifacts: artifactRows.map((row) => {
      const c = row.content || {};
      return {
        week: typeof c.week === 'number' ? c.week : null,
        title: row.title ?? null,
        filename: c.filename ?? null,
        // The repo path the artifact sync writes to. Null until it has synced,
        // which is the honest state — the compiler drops rows it cannot link.
        path: c.repo_path ?? null,
        commit_sha: c.commit_sha ?? null,
        project_label: c.project_label ?? null,
        built_on_sample: c.built_on_sample === true,
        verification: null,
      };
    }),
    // Read in parallel below; both degrade to [] rather than throwing, so one
    // unreadable band costs that band and not the whole record.
    competencies: [],
    // Labels come from the capability definitions, not from the repo: the reader
    // observes paths, and a human-readable name is not something a file tree carries.
    capabilities: inventory.entries.map((e) => ({
      id: e.id,
      label: capabilityById(e.id)?.label ?? e.id,
      present: e.present,
      count: e.count,
      proven: e.proven,
      onSample: e.onSample,
    })),
    posts: [],
    certification: null,
  };

  const enrollmentId = String(project.enrollment_id);
  const { readCompetencies, readSharedPosts } = await import('./capstoneReaders');
  const [competencies, posts] = await Promise.all([
    readCompetencies(enrollmentId),
    readSharedPosts(enrollmentId),
  ]);
  inputs.competencies = competencies;
  inputs.posts = posts;

  return { inputs, enrollmentId };
}

/**
 * Compile and store. Returns `unchanged` when nothing moved.
 *
 * Never throws for "this student has no project" — that is day one, not an error.
 */
export async function compileAndStore(projectId: string): Promise<CompileResult> {
  const gathered = await gatherInputs(projectId);
  if (!gathered) return { outcome: 'no_project', slug: null, version: null, gaps: [] };

  const compiled: RecordShape = compileCapstoneRecord(gathered.inputs);
  const gaps = recordGaps(compiled);

  const { default: CapstoneRecord, CapstoneRecordVersion } = await import('../../models/CapstoneRecord');
  const existing: any = await CapstoneRecord.findOne({ where: { project_id: projectId } });

  if (existing) {
    // Whole-record comparison rather than a field-by-field diff: the compiler's
    // own determinism is what makes this reliable, and a structural comparison
    // would quietly ignore a field added later. Canonical, not raw — see
    // canonicalJson: the stored side is JSONB, whose key order Postgres has
    // already rewritten, so a raw stringify compares key order and never matches.
    if (canonicalJson(existing.content_json) === canonicalJson(compiled)) {
      return { outcome: 'unchanged', slug: existing.slug, version: existing.version, gaps };
    }
    const nextVersion = (existing.version ?? 1) + 1;
    await existing.update({ content_json: compiled, version: nextVersion, updated_at: new Date() });
    await CapstoneRecordVersion.create({ record_id: existing.id, version: nextVersion, content_json: compiled })
      .catch(() => { /* the unique index means a racing duplicate is already stored */ });
    log('capstone_record_updated', 'success', { project_id: projectId, version: nextVersion, gaps: gaps.length });
    return { outcome: 'updated', slug: existing.slug, version: nextVersion, gaps };
  }

  const taken: any[] = await CapstoneRecord.findAll({ attributes: ['slug'] }).catch(() => []);
  const slug = resolveUniqueSlug(
    buildCapstoneSlug(compiled.identity.full_name, compiled.system.project_name),
    taken.map((r: any) => r.slug),
  );

  const created: any = await CapstoneRecord.create({
    project_id: projectId,
    enrollment_id: gathered.enrollmentId,
    slug,
    // Deliberately NOT published. Compiling keeps a record current for its
    // owner; sharing is a separate act the student takes.
    status: 'draft',
    visibility: 'unlisted',
    content_json: compiled,
    version: 1,
  } as any);

  await CapstoneRecordVersion.create({ record_id: created.id, version: 1, content_json: compiled })
    .catch(() => { /* see above */ });

  log('capstone_record_created', 'success', { project_id: projectId, slug, gaps: gaps.length });
  return { outcome: 'created', slug, version: 1, gaps };
}

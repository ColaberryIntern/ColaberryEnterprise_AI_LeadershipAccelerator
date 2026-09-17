/**
 * publishCaseStudyVariants — write one record's per-surface story variants and
 * republish ONLY the surfaces named. The committed form of the scripts that
 * shipped the CORA pilot (storytelling rollout, 2026-09-17).
 *
 *   node dist/scripts/publishCaseStudyVariants.js <slug-or-id> <variants.json> --surfaces training,enterprise [--apply]
 *   node dist/scripts/publishCaseStudyVariants.js <slug-or-id> --remove enterprise [--apply]
 *   (from src: npx ts-node -T src/scripts/publishCaseStudyVariants.ts ...)
 *
 * WHY NOT applyHumanOverride. That path republishes EVERY live surface of the
 * record. A story is rolled out one surface at a time and reviewed on one
 * surface while the others stay pinned, so this composes the same services
 * without its republish loop:
 *
 *   1. read the latest APPROVED snapshot and the record; STOP unless every
 *      surface named is publishable and the record carries the consent its
 *      variants rely on (a named contributor in a variant needs the record's
 *      builder mode `named` and consent `true`; this script never writes either);
 *   2. merge the file's entries over the existing `surfaceVariants` map (a
 *      surface not in the file keeps its variant verbatim; `--remove` deletes
 *      one surface's variant instead), as ONE override of `surfaceVariants`;
 *   3. run the publish gate for every publishable surface over the composed
 *      content, and diff the projection of every surface NOT named against the
 *      current content (must be empty), and print each named surface's current
 *      `published_snapshot_id` (the rollback);
 *   4. with --apply: persist (draft, human_edit), approve, publish each named
 *      surface. Without it: nothing is written.
 *
 * Rollback: `approveSnapshot(previous id)` then `publishCaseStudy(surface,
 * previous id)` where the gate accepts the previous content; where it no
 * longer does (the record's identity changed since), run this script with
 * `--remove <surface>` to return that surface to the canonical words.
 */
import * as fs from 'fs';
import { PUBLISHABLE_SURFACE_KEYS } from '../types/caseStudy';
import type { CaseStudySnapshotContent, CaseStudySurfaceKey, CaseStudySurfaceVariant } from '../types/caseStudy';
import { sequelize } from '../config/database';
import { approveSnapshot } from '../services/caseStudy/caseStudyAdminReview';
import { publishCaseStudy } from '../services/caseStudy/caseStudyPublicationService';
import { applyOverrides } from '../services/caseStudy/caseStudySnapshotOverrides';
import { persistCaseStudySnapshot } from '../services/caseStudy/caseStudySnapshotStore';
import { evaluateCaseStudyPublishGate } from '../services/caseStudy/caseStudyPublishGate';
import type { CaseStudyPublishRecord } from '../services/caseStudy/caseStudyPublishGate';
import { projectPublicDetail } from '../services/caseStudy/caseStudyPublicProjection';
import { formatStoryReview, reviewCaseStudyStory } from '../services/caseStudy/caseStudyStoryReview';
import { hashCanonical } from '../utils/canonicalHash';

const ACTOR = process.env.CASE_STUDY_ACTOR || 'ali@colaberry.com';

interface Args {
  target: string;
  file: string | null;
  surfaces: CaseStudySurfaceKey[];
  remove: CaseStudySurfaceKey | null;
  apply: boolean;
  note: string;
}

function parseArgs(argv: readonly string[]): Args {
  const positional = argv.filter((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--') || argv[i - 1] === '--apply'));
  const flag = (name: string): string | null => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
  const target = positional[0];
  if (!target) throw new Error('usage: publishCaseStudyVariants <slug-or-id> <variants.json> --surfaces a,b [--apply] | <slug-or-id> --remove <surface> [--apply]');
  const remove = flag('--remove') as CaseStudySurfaceKey | null;
  const file = remove ? null : positional[1] ?? null;
  const surfaces = (remove ? [remove] : (flag('--surfaces') ?? '').split(',').map((s) => s.trim()).filter(Boolean)) as CaseStudySurfaceKey[];
  if (!remove && !file) throw new Error('a variants.json file is required unless --remove is given');
  if (surfaces.length === 0) throw new Error('--surfaces a,b (or --remove <surface>) is required');
  for (const s of surfaces) if (!(PUBLISHABLE_SURFACE_KEYS as readonly string[]).includes(s)) throw new Error(`not a publishable surface: ${s}`);
  return { target, file, surfaces, remove, apply: argv.includes('--apply'), note: flag('--note') ?? 'Story variants (publishCaseStudyVariants)' };
}

interface SnapshotRow { id: string; version: number; content: CaseStudySnapshotContent; provenance: Record<string, unknown> | null; source_commit_map: Record<string, unknown> | null }
interface RecordRow { id: string; slug: string; status: string; builder_identity_mode: string; builder_naming_consent: boolean; organization_identity_mode: string; organization_naming_consent: boolean; organization_display_name: string | null }
interface PublicationRow { surface_key: string; status: string; published_snapshot_id: string | null }

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [recs] = await sequelize.query(
    'select id, slug, status, builder_identity_mode, builder_naming_consent, organization_identity_mode, organization_naming_consent, organization_display_name from case_studies where slug = :t or id::text = :t',
    { replacements: { t: args.target } },
  );
  const rec = (recs as RecordRow[])[0];
  if (!rec) throw new Error(`no record ${args.target}`);
  const [snaps] = await sequelize.query(
    'select id, version, content, provenance, source_commit_map from case_study_snapshots where case_study_id = :id and status = \'approved\' order by version desc limit 1',
    { replacements: { id: rec.id } },
  );
  const snap = (snaps as SnapshotRow[])[0];
  if (!snap) throw new Error(`no approved snapshot for ${rec.slug}`);
  const [pubs] = await sequelize.query(
    'select surface_key, status, published_snapshot_id from case_study_publications where case_study_id = :id order by surface_key',
    { replacements: { id: rec.id } },
  );
  const publications = pubs as PublicationRow[];
  console.log(`${rec.slug}: approved v${snap.version} (${snap.id}); record ${rec.status}, builder ${rec.builder_identity_mode}, consent ${rec.builder_naming_consent}`);
  console.log('publications:', JSON.stringify(publications.map((p) => [p.surface_key, p.status, p.published_snapshot_id?.slice(0, 8)])));
  for (const s of args.surfaces) {
    const row = publications.find((p) => p.surface_key === s);
    console.log(`rollback for ${s}: ${row ? `${row.status}, snapshot ${row.published_snapshot_id}` : 'no publication row (a first publish)'}`);
  }

  // 2. The composed map.
  const existing = { ...(snap.content.surfaceVariants ?? {}) } as Record<string, CaseStudySurfaceVariant>;
  if (args.remove) {
    if (!existing[args.remove]) throw new Error(`no variant for ${args.remove} to remove`);
    delete existing[args.remove];
  } else {
    const incoming = JSON.parse(fs.readFileSync(args.file as string, 'utf8')) as Record<string, CaseStudySurfaceVariant>;
    for (const s of args.surfaces) {
      if (!incoming[s]) throw new Error(`${args.file} carries no entry for ${s}`);
      const named = (incoming[s].contributors ?? []).some((c) => c.displayMode === 'named');
      if (named && !(rec.builder_identity_mode === 'named' && rec.builder_naming_consent === true)) {
        throw new Error(`STOP: the ${s} variant names a contributor but the record does not carry builder consent; this script never writes consent`);
      }
      existing[s] = incoming[s];
    }
  }
  const recordedAt = new Date().toISOString();
  const application = applyOverrides(snap.content, [
    { path: 'surfaceVariants', value: existing, actor: ACTOR, recordedAt, note: args.note },
  ]);
  if (application.ignored.length) throw new Error(`overrides ignored: ${JSON.stringify(application.ignored)}`);
  const composed = application.content;

  // 3. Gate, diffs, review.
  const record: CaseStudyPublishRecord = {
    id: rec.id, status: rec.status,
    builderIdentityMode: rec.builder_identity_mode, builderNamingConsent: rec.builder_naming_consent,
    organizationIdentityMode: rec.organization_identity_mode, organizationNamingConsent: rec.organization_naming_consent,
    organizationDisplayName: rec.organization_display_name,
  } as unknown as CaseStudyPublishRecord;
  const snapshotForGate = { id: 'composed', version: snap.version + 1, status: 'approved', approvedBy: ACTOR, approvedAt: recordedAt, content: composed, provenance: { ...(snap.provenance ?? {}), ...application.entries } };
  let clean = true;
  for (const surfaceKey of PUBLISHABLE_SURFACE_KEYS) {
    const d = evaluateCaseStudyPublishGate({ surfaceKey, caseStudy: record, snapshot: snapshotForGate as never });
    const named = args.surfaces.includes(surfaceKey);
    if (!d.allowed && named) clean = false;
    console.log(`gate ${surfaceKey}${named ? ' (named)' : ''}: ${d.allowed ? 'CLEAN' : 'BLOCKED ' + JSON.stringify(d.blockers.map((b) => [b.code, b.field]))}`);
  }
  const publication = { featured: false, publishedAt: recordedAt, updatedAt: recordedAt, titleOverride: null, summaryOverride: null };
  for (const surfaceKey of PUBLISHABLE_SURFACE_KEYS) {
    if (args.surfaces.includes(surfaceKey)) continue;
    const before = projectPublicDetail({ surfaceKey, slug: rec.slug, content: snap.content, publication, canonicalBaseUrl: 'https://enterprise.colaberry.ai' }) as unknown as Record<string, unknown>;
    const after = projectPublicDetail({ surfaceKey, slug: rec.slug, content: composed, publication, canonicalBaseUrl: 'https://enterprise.colaberry.ai' }) as unknown as Record<string, unknown>;
    const diff = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]));
    console.log(`${surfaceKey} (not named) projection would differ in: ${JSON.stringify(diff)}`);
    if (diff.length) clean = false;
  }
  for (const surfaceKey of args.surfaces) console.log(formatStoryReview(reviewCaseStudyStory(composed, surfaceKey)));
  if (!clean) { console.log('STOP: a named surface is blocked or an unnamed surface would change. Nothing written.'); process.exit(2); }
  if (!args.apply) { console.log('DRY RUN. Nothing written.'); process.exit(0); }

  // 4. Persist, approve, publish the named surfaces.
  const sourceCommitMap = (snap.source_commit_map ?? {}) as Record<string, string>;
  const provenance = { ...(snap.provenance ?? {}), ...application.entries };
  const contentHash = hashCanonical({ content: composed, sourceCommitMap });
  const persisted = await persistCaseStudySnapshot({
    caseStudyId: rec.id, status: 'draft',
    draft: { content: composed, provenance, sourceCommitMap, contentHash, generatedAt: recordedAt, generatedBy: 'human_edit', appliedOverrides: application.applied, ignoredOverrides: application.ignored } as never,
  });
  console.log(`snapshot: ${persisted.outcome} v${persisted.version} (${persisted.snapshotId})`);
  const approved = await approveSnapshot({ caseStudyId: rec.id, snapshotId: persisted.snapshotId, actor: ACTOR });
  console.log('approved:', JSON.stringify(approved).slice(0, 160));
  for (const surfaceKey of args.surfaces) {
    const published = await publishCaseStudy({ caseStudyId: rec.id, surfaceKey, snapshotId: persisted.snapshotId, actor: ACTOR });
    console.log(`published ${surfaceKey}:`, JSON.stringify(published).slice(0, 240));
  }
  const [after] = await sequelize.query(
    'select surface_key, status, published_snapshot_id from case_study_publications where case_study_id = :id order by surface_key',
    { replacements: { id: rec.id } },
  );
  console.log('publications after:', JSON.stringify((after as PublicationRow[]).map((p) => [p.surface_key, p.status, p.published_snapshot_id?.slice(0, 8)])));
}

main().then(() => process.exit(0)).catch((e: unknown) => {
  const err = e as { error_class?: string; name?: string; message?: string; details?: unknown };
  console.error('FAILED:', err.error_class ?? err.name, err.message, err.details ? JSON.stringify(err.details).slice(0, 600) : '');
  process.exit(1);
});

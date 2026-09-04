import CertTrack from '../../models/CertTrack';
import CertDomain from '../../models/CertDomain';
import {
  CertBlueprint,
  CCAR_FOUNDATIONS_BLUEPRINT,
  CERT_BLUEPRINTS,
  totalWeight,
} from '../../data/certBlueprints/ccarFoundations';

/**
 * certBlueprintService — writes a transcribed exam blueprint into cert_tracks /
 * cert_domains, and reads it back for scoring and the UI.
 *
 * Seeding is idempotent and keyed on (track_id, version), so boot or a redeploy
 * re-running it is a no-op. A blueprint REVISION is a new version row, never an
 * edit of the old one: readiness snapshots and attempts record the version they
 * were computed under, and rewriting a version in place would retroactively
 * restate scores students have already been shown.
 *
 * The seed refuses a blueprint whose weights do not total 100. That is a
 * transcription error, and silently seeding it would skew every domain score
 * afterwards in a way nobody would notice — better to fail loudly at boot.
 */

/** Result of a seed run, so a caller can log what actually changed. */
export interface BlueprintSeedResult {
  track_id: string;
  blueprint_version: string;
  track_created: boolean;
  domains_created: number;
  domains_updated: number;
}

export class BlueprintIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlueprintIntegrityError';
  }
}

/**
 * Fail-loud validation run before anything is written.
 *
 * Order matters: STRUCTURAL problems are reported before arithmetic ones. An empty
 * blueprint's weights necessarily total 0, and a blueprint with a duplicated
 * domain necessarily mis-totals too — reporting either as "weights total 0,
 * expected 100" points whoever is debugging at the wrong line entirely. Check the
 * shape first, then the sum.
 */
export function assertBlueprintIntegrity(blueprint: CertBlueprint): void {
  if (blueprint.domains.length === 0) {
    throw new BlueprintIntegrityError(`${blueprint.track_id} has no domains`);
  }

  const ids = blueprint.domains.map((d) => d.domain_id);
  if (new Set(ids).size !== ids.length) {
    throw new BlueprintIntegrityError(`${blueprint.track_id} has duplicate domain ids`);
  }

  const total = totalWeight(blueprint);
  if (total !== 100) {
    throw new BlueprintIntegrityError(
      `${blueprint.track_id} domain weights total ${total}, expected 100 — likely a transcription error`,
    );
  }
}

/**
 * Create-or-update the track and its domains for one blueprint version.
 *
 * The track row is matched on (track_id, version). Marking it current demotes any
 * other version of the same track first, because the schema allows exactly one
 * row per track with is_current.
 */
export async function seedBlueprint(
  blueprint: CertBlueprint = CCAR_FOUNDATIONS_BLUEPRINT,
  opts: { makeCurrent?: boolean } = {},
): Promise<BlueprintSeedResult> {
  assertBlueprintIntegrity(blueprint);
  const makeCurrent = opts.makeCurrent !== false;

  const [track, trackCreated] = await CertTrack.findOrCreate({
    where: { track_id: blueprint.track_id, version: 1 },
    defaults: {
      track_id: blueprint.track_id,
      version: 1,
      display_name: blueprint.display_name,
      issuer: blueprint.issuer,
      blueprint_version: blueprint.blueprint_version,
      blueprint_source: blueprint.blueprint_source,
      source_note: blueprint.source_note,
      exam_item_count: blueprint.exam_item_count,
      exam_duration_minutes: blueprint.exam_duration_minutes,
      scaled_score_min: blueprint.scaled_score_min,
      scaled_score_max: blueprint.scaled_score_max,
      passing_scaled_score: blueprint.passing_scaled_score,
      is_current: makeCurrent,
      is_active: true,
    },
  });

  if (!trackCreated) {
    // Refresh the facts in case the guide was re-transcribed under the same
    // version — but never touch availability_start_week, which is an operational
    // setting the programme owns, not something the exam guide dictates.
    track.display_name = blueprint.display_name;
    track.issuer = blueprint.issuer;
    track.blueprint_version = blueprint.blueprint_version;
    track.blueprint_source = blueprint.blueprint_source;
    track.source_note = blueprint.source_note;
    track.exam_item_count = blueprint.exam_item_count;
    track.exam_duration_minutes = blueprint.exam_duration_minutes;
    track.scaled_score_min = blueprint.scaled_score_min;
    track.scaled_score_max = blueprint.scaled_score_max;
    track.passing_scaled_score = blueprint.passing_scaled_score;
    if (makeCurrent) track.is_current = true;
    await track.save();
  }

  let created = 0;
  let updated = 0;
  for (const domain of blueprint.domains) {
    const [row, wasCreated] = await CertDomain.findOrCreate({
      where: {
        track_id: blueprint.track_id,
        blueprint_version: blueprint.blueprint_version,
        domain_id: domain.domain_id,
      },
      defaults: {
        track_id: blueprint.track_id,
        blueprint_version: blueprint.blueprint_version,
        domain_id: domain.domain_id,
        label: domain.label,
        weight_pct: domain.weight_pct,
        weight_source: blueprint.blueprint_source,
        display_order: domain.display_order,
        objectives: domain.objectives,
        is_active: true,
      },
    });
    if (wasCreated) {
      created += 1;
    } else {
      row.label = domain.label;
      row.weight_pct = domain.weight_pct;
      row.weight_source = blueprint.blueprint_source;
      row.display_order = domain.display_order;
      row.objectives = domain.objectives;
      row.is_active = true;
      await row.save();
      updated += 1;
    }
  }

  return {
    track_id: blueprint.track_id,
    blueprint_version: blueprint.blueprint_version,
    track_created: trackCreated,
    domains_created: created,
    domains_updated: updated,
  };
}

/** Seed every blueprint this build knows about. Safe to call at boot. */
export async function seedAllBlueprints(): Promise<BlueprintSeedResult[]> {
  const results: BlueprintSeedResult[] = [];
  for (const blueprint of Object.values(CERT_BLUEPRINTS)) {
    results.push(await seedBlueprint(blueprint));
  }
  return results;
}

/**
 * Read the current track and its domains, ordered for display.
 *
 * Returns null when nothing is seeded rather than falling back to the in-code
 * constant: the database is the source of truth at runtime, and quietly serving a
 * constant would hide a failed seed until a student saw wrong domain scores.
 */
export async function getCurrentBlueprint(trackId?: string): Promise<{
  track: CertTrack;
  domains: CertDomain[];
} | null> {
  const track = await CertTrack.findOne({
    where: { is_current: true, is_active: true, ...(trackId ? { track_id: trackId } : {}) },
    order: [['updated_at', 'DESC']],
  });
  if (!track) return null;

  const domains = await CertDomain.findAll({
    where: {
      track_id: track.track_id,
      blueprint_version: track.blueprint_version,
      is_active: true,
    },
    order: [['display_order', 'ASC']],
  });
  return { track, domains };
}

/**
 * True when every domain of the current blueprint carries an official weight.
 * Readiness uses this to decide whether it may present an exam-weighted score at
 * all, or must fall back to describing coverage — see CertReadinessSnapshot.
 */
export function weightsAreUsable(domains: Pick<CertDomain, 'weight_pct'>[]): boolean {
  if (domains.length === 0) return false;
  return domains.every((d) => d.weight_pct !== null && d.weight_pct !== undefined);
}

import { sequelize } from '../../config/database';
import type { ObservationRow, Skipped } from './observationAdapters';

/**
 * Career Prep v27, CP1.4: the ONE writer every scorer uses. prep_observations is append-only and
 * UNIQUE (source_ref, skill_key), so writing the same record twice inserts nothing the second time
 * (ON CONFLICT DO NOTHING). Returns how many rows were new.
 *
 * Failure: a database error propagates (the caller decides whether to retry); a skipped record is
 * logged here with error_class ValidationError so a bad source never disappears silently.
 */
const BATCH = 200;

export async function writeObservations(rows: readonly ObservationRow[]): Promise<number> {
  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH) total += await writeBatch(rows.slice(i, i + BATCH));
  return total;
}

async function writeBatch(rows: readonly ObservationRow[]): Promise<number> {
  if (!rows.length) return 0;
  const values: string[] = [];
  const replacements: Record<string, unknown> = {};
  rows.forEach((r, i) => {
    values.push(`(:e${i}, :k${i}, :v${i}, :s${i}, :r${i}, :t${i})`);
    Object.assign(replacements, { [`e${i}`]: r.enrollmentId, [`k${i}`]: r.skill, [`v${i}`]: r.value, [`s${i}`]: r.source, [`r${i}`]: r.sourceRef, [`t${i}`]: r.observedAt });
  });
  const [inserted] = await sequelize.query(
    `INSERT INTO prep_observations (enrollment_id, skill_key, value, source, source_ref, observed_at)
     VALUES ${values.join(', ')}
     ON CONFLICT (source_ref, skill_key) DO NOTHING
     RETURNING id`,
    { replacements },
  );
  return (inserted as unknown[]).length;
}

export function logSkipped(s: Skipped): void {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'career_prep_observation_skipped',
    outcome: 'partial', error_class: 'ValidationError', context: { source_ref: s.sourceRef, reason: s.reason },
  }));
}

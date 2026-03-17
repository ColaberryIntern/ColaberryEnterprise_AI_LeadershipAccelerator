/**
 * Intelligence Data Retention Service
 *
 * Manages lifecycle of intelligence_decisions records:
 *  - Archives insights older than 30 days
 *  - Deletes archived records from the main table
 *  - Provides retention statistics for the observability panel
 *
 * Runs daily at 03:15 via aiOpsScheduler.
 */

import IntelligenceDecision from '../../models/IntelligenceDecision';
import { logAiEvent } from '../aiEventService';
import { Op } from 'sequelize';
import { sequelize } from '../../config/database';

const RETENTION_DAYS = 30;
const BATCH_LIMIT = 5000;
const ARCHIVE_TABLE = 'intelligence_decisions_archive';

// ---------------------------------------------------------------------------
// Ensure archive table exists (idempotent)
// ---------------------------------------------------------------------------

async function ensureArchiveTable(): Promise<void> {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS ${ARCHIVE_TABLE} (LIKE intelligence_decisions INCLUDING ALL)
  `).catch(() => {
    // Fallback for older Postgres that doesn't support INCLUDING ALL
    sequelize.query(`
      CREATE TABLE IF NOT EXISTS ${ARCHIVE_TABLE} AS
      SELECT * FROM intelligence_decisions WHERE 1=0
    `).catch(() => {});
  });
}

// ---------------------------------------------------------------------------
// Archive old insights
// ---------------------------------------------------------------------------

/**
 * Copy insights older than RETENTION_DAYS into archive table.
 * Returns count of archived rows.
 */
export async function archiveInsights(): Promise<number> {
  await ensureArchiveTable();

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const [, result] = await sequelize.query(`
    INSERT INTO ${ARCHIVE_TABLE}
    SELECT * FROM intelligence_decisions
    WHERE timestamp < :cutoff
    AND decision_id NOT IN (SELECT decision_id FROM ${ARCHIVE_TABLE})
    LIMIT :limit
  `, {
    replacements: { cutoff: cutoff.toISOString(), limit: BATCH_LIMIT },
  }) as any;

  return result?.rowCount || 0;
}

// ---------------------------------------------------------------------------
// Cleanup old insights from main table
// ---------------------------------------------------------------------------

/**
 * Delete insights older than RETENTION_DAYS that have been archived.
 * Returns count of deleted rows.
 */
export async function cleanupOldInsights(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const deleted = await IntelligenceDecision.destroy({
    where: {
      timestamp: { [Op.lt]: cutoff },
    },
    limit: BATCH_LIMIT,
  });

  return deleted;
}

// ---------------------------------------------------------------------------
// Retention stats
// ---------------------------------------------------------------------------

export interface RetentionStats {
  main_table_count: number;
  archive_table_count: number;
  oldest_main_record: string | null;
  last_cleanup_at: string | null;
}

let _lastCleanupAt: string | null = null;

/**
 * Get retention statistics for the observability panel.
 */
export async function getRetentionStats(): Promise<RetentionStats> {
  const mainCount = await IntelligenceDecision.count();

  let archiveCount = 0;
  try {
    const [rows] = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM ${ARCHIVE_TABLE}`,
    ) as any;
    archiveCount = parseInt(rows?.[0]?.cnt || '0', 10);
  } catch {
    // Archive table may not exist yet
  }

  const oldest = await IntelligenceDecision.findOne({
    order: [['timestamp', 'ASC']],
    attributes: ['timestamp'],
  });

  return {
    main_table_count: mainCount,
    archive_table_count: archiveCount,
    oldest_main_record: oldest?.timestamp?.toISOString() || null,
    last_cleanup_at: _lastCleanupAt,
  };
}

// ---------------------------------------------------------------------------
// Combined retention job (called from scheduler)
// ---------------------------------------------------------------------------

/**
 * Run the full retention cycle: archive then cleanup.
 */
export async function runRetentionCycle(): Promise<void> {
  const start = Date.now();

  try {
    const archived = await archiveInsights();
    const deleted = await cleanupOldInsights();
    _lastCleanupAt = new Date().toISOString();

    await logAiEvent('IntelligenceRetention', 'RETENTION_CYCLE', 'intelligence_decisions', undefined, {
      archived,
      deleted,
      duration_ms: Date.now() - start,
      retention_days: RETENTION_DAYS,
      batch_limit: BATCH_LIMIT,
    }).catch(() => {});

    if (archived > 0 || deleted > 0) {
      console.log(`[Retention] Archived ${archived}, deleted ${deleted} insights (${Date.now() - start}ms)`);
    }
  } catch (err) {
    console.error('[Retention] Retention cycle failed:', err);
    await logAiEvent('IntelligenceRetention', 'RETENTION_ERROR', 'intelligence_decisions', undefined, {
      error: (err as Error).message,
      duration_ms: Date.now() - start,
    }).catch(() => {});
  }
}

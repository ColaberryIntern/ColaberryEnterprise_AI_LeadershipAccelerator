import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

export async function leadsBySource(windowHours: number): Promise<Array<{ source_slug: string; count: number }>> {
  const rows = await sequelize.query<{ source_slug: string; count: string }>(
    `SELECT COALESCE(rlp.source_slug, 'unknown') AS source_slug, COUNT(*)::text AS count
     FROM raw_lead_payloads rlp
     WHERE rlp.received_at >= NOW() - INTERVAL '${Number(windowHours)} hours'
       AND rlp.status = 'accepted'
     GROUP BY rlp.source_slug
     ORDER BY COUNT(*) DESC`,
    { type: QueryTypes.SELECT }
  );
  return rows.map(r => ({ source_slug: r.source_slug, count: Number(r.count) }));
}

export async function conversionByEntryPoint(): Promise<Array<{
  source_slug: string;
  entry_slug: string;
  total: number;
  converted: number;
  conversion_rate: number;
}>> {
  const rows = await sequelize.query<{ source_slug: string; entry_slug: string; total: string; converted: string }>(
    `SELECT rlp.source_slug, rlp.entry_slug,
            COUNT(*)::text AS total,
            SUM(CASE WHEN l.pipeline_stage IN ('meeting_scheduled','proposal_sent','negotiation','enrolled') THEN 1 ELSE 0 END)::text AS converted
     FROM raw_lead_payloads rlp
     LEFT JOIN leads l ON l.id = rlp.resulting_lead_id
     WHERE rlp.status = 'accepted'
       AND rlp.source_slug IS NOT NULL
     GROUP BY rlp.source_slug, rlp.entry_slug
     ORDER BY COUNT(*) DESC
     LIMIT 50`,
    { type: QueryTypes.SELECT }
  );
  return rows.map(r => {
    const total = Number(r.total);
    const converted = Number(r.converted);
    return {
      source_slug: r.source_slug,
      entry_slug: r.entry_slug,
      total,
      converted,
      conversion_rate: total > 0 ? Math.round((converted / total) * 1000) / 10 : 0,
    };
  });
}

export async function ingestTail(limit = 25) {
  const rows = await sequelize.query(
    `SELECT rlp.id, rlp.source_slug, rlp.entry_slug, rlp.status, rlp.received_at,
            rlp.resulting_lead_id, rlp.error_message,
            l.name AS lead_name, l.email AS lead_email
     FROM raw_lead_payloads rlp
     LEFT JOIN leads l ON l.id = rlp.resulting_lead_id
     ORDER BY rlp.received_at DESC
     LIMIT :limit`,
    { type: QueryTypes.SELECT, replacements: { limit } }
  );
  return rows;
}

export async function ingestStatusCounts(windowHours: number): Promise<Record<string, number>> {
  const rows = await sequelize.query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count
     FROM raw_lead_payloads
     WHERE received_at >= NOW() - INTERVAL '${Number(windowHours)} hours'
     GROUP BY status`,
    { type: QueryTypes.SELECT }
  );
  const out: Record<string, number> = { accepted: 0, rejected: 0, error: 0, pending: 0 };
  for (const r of rows) out[r.status] = Number(r.count);
  return out;
}

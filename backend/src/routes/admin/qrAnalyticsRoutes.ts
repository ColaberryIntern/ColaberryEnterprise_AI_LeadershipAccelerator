// Admin endpoints for QR scan analytics.
//   GET /api/admin/qr-codes          - list all QR codes with rollup counts
//   GET /api/admin/qr-codes/:slug    - single QR detail + recent scans
// Behind requireAdmin.

import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { sequelize } from '../../config/database';
import { QueryTypes } from 'sequelize';

const router = Router();

interface QrCodeRollupRow {
  id: string;
  slug: string;
  label: string;
  destination_url: string;
  active: boolean;
  created_at: string;
  total_scans: number;
  scans_24h: number;
  scans_7d: number;
  scans_30d: number;
  last_scanned_at: string | null;
}

router.get('/api/admin/qr-codes', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await sequelize.query<QrCodeRollupRow>(
      `SELECT
         q.id, q.slug, q.label, q.destination_url, q.active, q.created_at,
         COUNT(e.id)::int AS total_scans,
         COUNT(e.id) FILTER (WHERE e.scanned_at > NOW() - INTERVAL '24 hours')::int AS scans_24h,
         COUNT(e.id) FILTER (WHERE e.scanned_at > NOW() - INTERVAL '7 days')::int AS scans_7d,
         COUNT(e.id) FILTER (WHERE e.scanned_at > NOW() - INTERVAL '30 days')::int AS scans_30d,
         MAX(e.scanned_at) AS last_scanned_at
       FROM qr_codes q
       LEFT JOIN qr_scan_events e ON e.qr_code_id = q.id
       GROUP BY q.id
       ORDER BY q.created_at DESC`,
      { type: QueryTypes.SELECT }
    );
    res.json({ qr_codes: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/qr-codes/:slug', requireAdmin, async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug;
    const codeRows = await sequelize.query(
      `SELECT id, slug, label, destination_url, active, created_at FROM qr_codes WHERE slug = :slug LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: { slug } }
    );
    if (codeRows.length === 0) return res.status(404).json({ error: 'not found' });
    const code: any = codeRows[0];

    const recentRows = await sequelize.query(
      `SELECT scanned_at, user_agent, ip_hash, referrer, geo_country
       FROM qr_scan_events WHERE qr_code_id = :id ORDER BY scanned_at DESC LIMIT 200`,
      { type: QueryTypes.SELECT, replacements: { id: code.id } }
    );

    const summaryRows = await sequelize.query<{ total: number; scans_24h: number; scans_7d: number; scans_30d: number; unique_ips: number }>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE scanned_at > NOW() - INTERVAL '24 hours')::int AS scans_24h,
         COUNT(*) FILTER (WHERE scanned_at > NOW() - INTERVAL '7 days')::int AS scans_7d,
         COUNT(*) FILTER (WHERE scanned_at > NOW() - INTERVAL '30 days')::int AS scans_30d,
         COUNT(DISTINCT ip_hash)::int AS unique_ips
       FROM qr_scan_events WHERE qr_code_id = :id`,
      { type: QueryTypes.SELECT, replacements: { id: code.id } }
    );

    return res.json({ qr_code: code, summary: summaryRows[0] || {}, recent: recentRows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;

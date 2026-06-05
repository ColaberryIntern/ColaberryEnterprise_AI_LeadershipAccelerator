// Public QR redirect endpoint. GET /qr/:slug looks up the destination URL
// in qr_codes, logs the scan to qr_scan_events, and 302 redirects.
//
// Logging is fire-and-forget so a DB hiccup never blocks the redirect.
// IP is SHA-256 hashed before storage (we want unique-scanner counts +
// geo without keeping raw IPs).

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { sequelize } from '../config/database';
import { QueryTypes } from 'sequelize';

const router = Router();

interface QrCodeRow {
  id: string;
  destination_url: string;
  active: boolean;
}

router.get('/qr/:slug', async (req: Request, res: Response) => {
  const slug = String(req.params.slug || '').slice(0, 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(404).send('Not Found');

  try {
    const rows = await sequelize.query<QrCodeRow>(
      `SELECT id, destination_url, active FROM qr_codes WHERE slug = :slug LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: { slug } }
    );
    if (rows.length === 0) return res.status(404).send('Not Found');
    const code = rows[0];
    if (!code.active) return res.status(410).send('Gone');

    const ip = ((req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()) || req.ip || '';
    const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex') : null;
    const userAgent = (req.headers['user-agent'] as string | undefined) || null;
    const referrer = (req.headers.referer || req.headers.referrer || null) as string | null;

    sequelize.query(
      `INSERT INTO qr_scan_events (qr_code_id, user_agent, ip_hash, referrer)
       VALUES (:qrCodeId, :userAgent, :ipHash, :referrer)`,
      {
        type: QueryTypes.INSERT,
        replacements: { qrCodeId: code.id, userAgent, ipHash, referrer },
      }
    ).catch((err: Error) => {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'qr-redirect',
        event: 'scan_log_failed',
        outcome: 'failure',
        error_class: err.constructor.name,
        context: { slug, message: err.message },
      }));
    });

    return res.redirect(302, code.destination_url);
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'qr-redirect',
      event: 'lookup_failed',
      outcome: 'failure',
      error_class: err?.constructor?.name || 'Error',
      context: { slug, message: err?.message },
    }));
    return res.status(500).send('Internal Error');
  }
});

export default router;

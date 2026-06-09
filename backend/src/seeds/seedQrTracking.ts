// Idempotent: creates qr_codes + qr_scan_events tables if not present
// and seeds the first QR row for the RE Magazine July 2026 Directory ad.
//
// Run via: ts-node backend/src/seeds/seedQrTracking.ts (or via the
// existing seed harness if there is one). Safe to run repeatedly.

import { sequelize } from '../config/database';
import { QueryTypes } from 'sequelize';

const RE_MAGAZINE_SLUG = 're-magazine-2026-07';
const RE_MAGAZINE_DEST = 'https://enterprise.colaberry.ai/utility-ai?utm_source=re-magazine&utm_medium=qr&utm_campaign=2026-07-directory';
const RE_MAGAZINE_LABEL = 'RE Magazine July 2026 Directory ad - M4 V12 (NRECA half-page horizontal)';

export async function seedQrTracking(): Promise<void> {
  await sequelize.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS qr_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(100) UNIQUE NOT NULL,
      destination_url TEXT NOT NULL,
      label TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS qr_scan_events (
      id BIGSERIAL PRIMARY KEY,
      qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
      scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_agent TEXT,
      ip_hash CHAR(64),
      referrer TEXT,
      geo_country VARCHAR(2)
    );
  `);

  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_qr_scan_events_qr_code_id ON qr_scan_events(qr_code_id);`);
  await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_qr_scan_events_scanned_at ON qr_scan_events(scanned_at);`);

  // Upsert the RE Magazine row by slug.
  await sequelize.query(
    `INSERT INTO qr_codes (slug, destination_url, label, active)
     VALUES (:slug, :dest, :label, true)
     ON CONFLICT (slug) DO UPDATE SET
       destination_url = EXCLUDED.destination_url,
       label = EXCLUDED.label,
       updated_at = NOW();`,
    { type: QueryTypes.INSERT, replacements: { slug: RE_MAGAZINE_SLUG, dest: RE_MAGAZINE_DEST, label: RE_MAGAZINE_LABEL } }
  );
}

if (require.main === module) {
  seedQrTracking()
    .then(() => { console.log('qr_codes + qr_scan_events ready; RE Magazine row seeded'); process.exit(0); })
    .catch((err) => { console.error('seed failed:', err); process.exit(1); });
}

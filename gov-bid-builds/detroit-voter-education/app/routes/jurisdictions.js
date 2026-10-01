const express = require('express');
const pool = require('../db');
const { resolveZip } = require('../services/jurisdictionResolver');

const router = express.Router();
const ZIP_RE = /^\d{5}$/;

router.get('/:zipCode', async (req, res) => {
  const { zipCode } = req.params;

  if (!ZIP_RE.test(zipCode)) {
    return res.status(400).json({ error: 'ZIP code must be 5 digits' });
  }

  let client;
  try {
    client = await pool.connect();
    // Return cached result if still fresh
    const cached = await client.query(
      `SELECT city, county, state_name, state_abbr, congressional_district, resolved_at
       FROM jurisdictions
       WHERE zip_code = $1 AND expires_at > NOW()`,
      [zipCode],
    );

    if (cached.rows.length > 0) {
      const row = cached.rows[0];
      await client.query(
        `INSERT INTO audit_log (session_id, action, metadata)
         VALUES (NULL, 'JURISDICTION_RESOLVED', $1)`,
        [JSON.stringify({ zip_code: zipCode, source: 'cache' })],
      );
      return res.json({
        zipCode,
        local: { city: row.city, county: row.county },
        state: { name: row.state_name, abbreviation: row.state_abbr },
        federal: { congressionalDistrict: row.congressional_district },
        resolvedAt: row.resolved_at,
        source: 'cache',
      });
    }

    // Resolve via external APIs
    const resolved = await resolveZip(zipCode);

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO jurisdictions (zip_code, city, county, state_name, state_abbr, congressional_district, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (zip_code) DO UPDATE
         SET city = $2, county = $3, state_name = $4, state_abbr = $5,
             congressional_district = $6, raw = $7,
             resolved_at = NOW(), expires_at = NOW() + INTERVAL '24 hours'`,
      [
        zipCode,
        resolved.city,
        resolved.county,
        resolved.stateName,
        resolved.stateAbbr,
        resolved.congressionalDistrict,
        JSON.stringify(resolved.raw),
      ],
    );
    await client.query(
      `INSERT INTO audit_log (session_id, action, metadata)
       VALUES (NULL, 'JURISDICTION_RESOLVED', $1)`,
      [JSON.stringify({ zip_code: zipCode, source: resolved.source })],
    );
    await client.query('COMMIT');

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'detroit-voter-education',
      event: 'jurisdiction_resolved',
      zip_code: zipCode,
      source: resolved.source,
      outcome: 'success',
    }));

    return res.json({
      zipCode,
      local: { city: resolved.city, county: resolved.county },
      state: { name: resolved.stateName, abbreviation: resolved.stateAbbr },
      federal: { congressionalDistrict: resolved.congressionalDistrict },
      resolvedAt: new Date().toISOString(),
      source: resolved.source,
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});

    if (err.code === 'ZIP_NOT_FOUND') {
      return res.status(404).json({ error: 'ZIP code not found' });
    }

    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'detroit-voter-education',
      event: 'jurisdiction_resolve_failed',
      zip_code: zipCode,
      error_class: err.constructor.name,
      error: err.message,
    }));
    return res.status(500).json({ error: 'Failed to resolve jurisdiction' });
  } finally {
    client?.release();
  }
});

module.exports = router;

#!/usr/bin/env node
/**
 * cb-control.js — the CB System kill switch, shared between the host-cron
 * dispatcher and the admin dashboard.
 *
 * Single source of truth is the Postgres `system_settings` table (the same
 * audited store the admin Settings page uses), so the dashboard and the
 * dispatcher always agree:
 *   - cb_dispatcher_enabled   (jsonb boolean)  — the master on/off switch
 *   - cb_dispatcher_last_trip (jsonb object)   — { at, reason } of the last auto-trip
 *
 * The dispatcher READS the flag at the top of every tick and WRITES it to false
 * when it auto-trips (runaway reply rate, or a degraded posting identity). The
 * dashboard reads + writes the same rows via the backend (settingsService).
 *
 * FAIL-SAFE: a tick must never flood just because the DB was briefly
 * unreachable. Every successful read is mirrored to a local cache file. On a DB
 * read error we fall back to the last cached value (if fresh); if there is no
 * usable cache we report DISABLED (fail-closed). "Enabled" is only ever returned
 * when we positively confirmed it.
 *
 * Assumes Postgres 13+ (gen_random_uuid() is core; no pgcrypto extension needed).
 * The id column has no DB default (Sequelize generates UUIDv4 app-side), so the
 * upsert supplies one explicitly.
 */
const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const CACHE_PATH = path.resolve(REPO, 'tmp/ops-engine/cb-control.cache');

const ENABLED_KEY = 'cb_dispatcher_enabled';
const TRIP_KEY = 'cb_dispatcher_last_trip';

const CACHE_MAX_AGE_MS = 24 * 3600 * 1000; // a cached value older than this is not trusted
const QUERY_TIMEOUT_MS = 8000;             // never let a DB hang eat the tick budget

let _sql = null;
function db() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL/POSTGRES_URL not set');
  _sql = new Sequelize(url, {
    logging: false,
    dialect: 'postgres',
    pool: { max: 1, min: 0, idle: 2000 },
    dialectOptions: { statement_timeout: QUERY_TIMEOUT_MS },
  });
  return _sql;
}

/** Close the connection so the short-lived cron process can exit cleanly. */
async function close() {
  try { if (_sql) await _sql.close(); } catch { /* ignore */ }
  _sql = null;
}

function readCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch { return null; }
}
function writeCache(enabled) {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify({ enabled: !!enabled, at: new Date().toISOString() }));
  } catch { /* cache is best-effort */ }
}

/**
 * Is the dispatcher allowed to post right now?
 * @returns {Promise<{enabled: boolean, source: 'db'|'cache'|'default', error?: string}>}
 */
async function isEnabled() {
  try {
    const rows = await db().query(
      'SELECT value FROM system_settings WHERE key = :k',
      { replacements: { k: ENABLED_KEY }, type: Sequelize.QueryTypes.SELECT },
    );
    // No row => disabled, matching the backend DEFAULTS (fail-safe by default).
    const v = rows.length ? rows[0].value : false;
    const enabled = v === true || v === 'true';
    writeCache(enabled);
    return { enabled, source: 'db' };
  } catch (e) {
    const cached = readCache();
    if (cached && Date.now() - new Date(cached.at).getTime() < CACHE_MAX_AGE_MS) {
      return { enabled: !!cached.enabled, source: 'cache', error: e.message };
    }
    // No usable cache: never post when we cannot confirm the switch.
    return { enabled: false, source: 'default', error: e.message };
  }
}

/**
 * Flip the kill switch OFF and record why. Best-effort and never throws — the
 * caller is mid-tick and must keep its own failure path. The local cache is set
 * first so even a failed DB write leaves the next tick fail-closed.
 * @returns {Promise<boolean>} true if the DB write landed
 */
async function disable(reason) {
  writeCache(false);
  try {
    await db().query(
      `INSERT INTO system_settings (id, key, value, created_at, updated_at)
       VALUES (gen_random_uuid(), :k, 'false'::jsonb, now(), now())
       ON CONFLICT (key) DO UPDATE SET value = 'false'::jsonb, updated_at = now()`,
      { replacements: { k: ENABLED_KEY } },
    );
    const trip = JSON.stringify({ at: new Date().toISOString(), reason: String(reason || 'unspecified') });
    await db().query(
      `INSERT INTO system_settings (id, key, value, created_at, updated_at)
       VALUES (gen_random_uuid(), :k, CAST(:v AS jsonb), now(), now())
       ON CONFLICT (key) DO UPDATE SET value = CAST(:v AS jsonb), updated_at = now()`,
      { replacements: { k: TRIP_KEY, v: trip } },
    );
    return true;
  } catch {
    return false; // caller logs; cache already set to false so safety holds
  }
}

module.exports = { isEnabled, disable, close, ENABLED_KEY, TRIP_KEY };

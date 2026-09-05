/**
 * Static contract test for ensureCertPrepSchema — asserts the SQL statement array
 * declares the 8 Cert Prep tables and the constraints the service layer relies on
 * for idempotency and answer protection, WITHOUT requiring a live database (same
 * convention as ensureCapeSchema.test.ts). sequelize.query is mocked so importing
 * the module never attempts a real connection.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn().mockResolvedValue([]) } }));

import { sequelize } from '../../config/database';
import { ensureCertPrepSchema } from '../ensureCertPrepSchema';

const mockQuery = sequelize.query as unknown as jest.Mock;

const statementsFrom = () => mockQuery.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureCertPrepSchema', () => {
  it('happy path: issues CREATE TABLE IF NOT EXISTS for all 8 Cert Prep tables', async () => {
    await ensureCertPrepSchema();
    const statements = statementsFrom();

    [
      'cert_tracks',
      'cert_domains',
      'cert_questions',
      'cert_question_revisions',
      'cert_sessions',
      'cert_responses',
      'cert_readiness_snapshots',
      'cert_evidence_mappings',
    ].forEach((table) => {
      expect(
        statements.some((s) => new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`).test(s)),
      ).toBe(true);
    });
  });

  it('boundary: declares the idempotency constraints the write paths depend on', async () => {
    await ensureCertPrepSchema();
    const statements = statementsFrom();

    // a retried session start must resolve to the existing session
    expect(statements.some((s) =>
      /UNIQUE INDEX.*cert_sessions \(idempotency_key\) WHERE idempotency_key IS NOT NULL/.test(s))).toBe(true);
    // a duplicate answer submit must not double-record
    expect(statements.some((s) =>
      /UNIQUE INDEX.*cert_responses \(session_id, question_key\)/.test(s))).toBe(true);
    // One evidence mapping per (enrollment, OBJECTIVE, source). This assertion
    // used to name domain_id, and it passed while the defect it describes was
    // live: a card evidencing D4.1, D4.2 and D4.3 wrote one row and the other
    // two silently no-opped, because the index could not tell them apart.
    // Readiness counts distinct objectives, so the under-count was invisible.
    expect(statements.some((s) =>
      /UNIQUE INDEX.*cert_evidence_mappings \(enrollment_id, objective_id, source_type, source_id\)/.test(s))).toBe(true);
    // and the domain-grained index is dropped, or the old constraint keeps
    // refusing the second and third objective on an existing database
    expect(statements.some((s) => /DROP INDEX IF EXISTS idx_cert_evmap_unique$/.test(s))).toBe(true);
    // question identity + one row per revision
    expect(statements.some((s) => /UNIQUE INDEX.*cert_questions \(question_key\)/.test(s))).toBe(true);
    expect(statements.some((s) =>
      /UNIQUE INDEX.*cert_question_revisions \(question_key, revision\)/.test(s))).toBe(true);
    // one current version per track
    expect(statements.some((s) => /UNIQUE INDEX.*cert_tracks \(track_id\) WHERE is_current/.test(s))).toBe(true);
  });

  it('unverified blueprint facts stay nullable — no guessed weight is cemented into the schema', async () => {
    await ensureCertPrepSchema();
    const domains = statementsFrom().find((s) => /CREATE TABLE IF NOT EXISTS cert_domains\b/.test(s))!;

    // weight_pct must be declared, but never NOT NULL and never with a DEFAULT:
    // Anthropic's official weights have not been read yet (community sources only).
    expect(domains).toMatch(/weight_pct NUMERIC\(5,2\)\s*,/);
    expect(domains).not.toMatch(/weight_pct[^,]*NOT NULL/);
    expect(domains).not.toMatch(/weight_pct[^,]*DEFAULT/);
    expect(domains).toMatch(/weight_source VARCHAR\(20\) NOT NULL DEFAULT 'unverified'/);

    const tracks = statementsFrom().find((s) => /CREATE TABLE IF NOT EXISTS cert_tracks\b/.test(s))!;
    expect(tracks).toMatch(/blueprint_source VARCHAR\(20\) NOT NULL DEFAULT 'unverified'/);
    expect(tracks).not.toMatch(/passing_scaled_score[^,]*NOT NULL/);
    expect(tracks).not.toMatch(/exam_item_count[^,]*NOT NULL/);
  });

  it('the Week 7 fence is a server-side column, not a hard-coded constant', async () => {
    await ensureCertPrepSchema();
    const tracks = statementsFrom().find((s) => /CREATE TABLE IF NOT EXISTS cert_tracks\b/.test(s))!;
    expect(tracks).toMatch(/availability_start_week INTEGER NOT NULL DEFAULT 7/);
  });

  it('answer data is confined to cert_question_revisions', async () => {
    await ensureCertPrepSchema();
    const statements = statementsFrom();
    const revisions = statements.find((s) => /CREATE TABLE IF NOT EXISTS cert_question_revisions\b/.test(s))!;
    expect(revisions).toMatch(/correct_keys JSONB/);

    // no other created table may carry the answer key
    const otherTables = statements.filter((s) =>
      /CREATE TABLE IF NOT EXISTS/.test(s) && !/cert_question_revisions/.test(s));
    expect(otherTables.some((s) => /correct_keys/.test(s))).toBe(false);
  });

  it('idempotency: a statement failure (partial DB state) does not stop the remaining statements', async () => {
    mockQuery.mockRejectedValueOnce(new Error('already exists')).mockResolvedValue([]);
    await expect(ensureCertPrepSchema()).resolves.toBeUndefined();
    expect(mockQuery.mock.calls.length).toBeGreaterThan(20);
  });

  it('does not touch any existing progression, assessment or points table', async () => {
    await ensureCertPrepSchema();
    const touchesExisting = statementsFrom().some((s) =>
      /\b(assessment_attempts|diagnostic_attempts|week_item_visibility|timeline_card_progress|student_points_events|evidence_records|xp_events|points_config)\b/.test(s) &&
      !/REFERENCES/.test(s));
    expect(touchesExisting).toBe(false);
  });
});

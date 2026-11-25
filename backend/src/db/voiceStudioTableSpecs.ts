/**
 * Voice AI Studio table specs (VS1.4): the SINGLE source for both the boot DDL
 * (ensureVoiceStudioSchema.ts) and the Sequelize models (models/voice/voiceStudioModels.ts),
 * so a model column and a database column cannot drift apart.
 *
 * Mapping to existing models (directive: reuse before adding):
 *  - communication_logs stays the cross-channel record; voice_calls.communication_log_id links to it.
 *  - voice_dial_log (voiceDialGuard) stores raw phone numbers and has no status/lease, so it cannot
 *    be an atomic reservation table; voice_dial_reservations replaces it for the gateway and stores
 *    only a destination HASH. voice_dial_log stays for legacy reads until VS5.4.
 *  - CallContactLog / InternshipInterviewSession keep their legacy provider ids; voice_calls carries
 *    legacy_call_id so history stays joinable.
 *
 * Rules: additive only, every table tenant-scoped, no secrets in JSON config, raw audio never stored
 * (artifacts are storage references), call-scoped tables cascade from voice_calls so a retention
 * delete removes everything about a call in one statement.
 */
import { DataTypes } from 'sequelize';

export interface ColumnSpec {
  name: string;
  sql: string;
  type: unknown;
  allowNull: boolean;
}
export interface TableSpec {
  table: string;
  model: string;
  columns: ColumnSpec[];
  /** Table constraints appended inside CREATE TABLE (FKs, checks, uniques). */
  constraints: string[];
  /** Index statements run after CREATE TABLE. */
  indexes: string[];
}

const c = (name: string, sql: string, type: unknown): ColumnSpec => ({ name, sql, type, allowNull: !/NOT NULL|PRIMARY KEY/.test(sql) });
const id = () => c('id', 'UUID PRIMARY KEY DEFAULT gen_random_uuid()', DataTypes.UUID);
const tenant = () => c('tenant_id', 'UUID NOT NULL', DataTypes.UUID);
const created = () => c('created_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()', DataTypes.DATE);
const updated = () => c('updated_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()', DataTypes.DATE);
const callFk = (t: string) => `CONSTRAINT ${t}_call_fk FOREIGN KEY (call_id) REFERENCES voice_calls(id) ON DELETE CASCADE`;

export const VOICE_TABLE_SPECS: TableSpec[] = [
  {
    table: 'voice_agent_profiles', model: 'VoiceAgentProfile',
    columns: [id(), tenant(), c('brand_slug', 'VARCHAR(100) NOT NULL', DataTypes.STRING(100)), c('agent_key', 'VARCHAR(150) NOT NULL', DataTypes.STRING(150)),
      c('name', 'VARCHAR(200) NOT NULL', DataTypes.STRING(200)), c('direction', "VARCHAR(10) NOT NULL DEFAULT 'outbound'", DataTypes.STRING(10)),
      c('default_number_id', 'UUID', DataTypes.UUID), c('active_version_id', 'UUID', DataTypes.UUID),
      c('status', "VARCHAR(20) NOT NULL DEFAULT 'draft'", DataTypes.STRING(20)), created(), updated()],
    constraints: ["CONSTRAINT voice_agent_profiles_direction_chk CHECK (direction IN ('outbound','inbound','both'))",
      "CONSTRAINT voice_agent_profiles_status_chk CHECK (status IN ('draft','active','retired'))"],
    indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS voice_agent_profiles_key_uq ON voice_agent_profiles (tenant_id, agent_key, direction)'],
  },
  {
    table: 'voice_agent_versions', model: 'VoiceAgentVersion',
    columns: [id(), tenant(), c('profile_id', 'UUID NOT NULL', DataTypes.UUID), c('version', 'INTEGER NOT NULL', DataTypes.INTEGER),
      c('content_hash', 'VARCHAR(64) NOT NULL', DataTypes.STRING(64)), c('prompt', 'TEXT NOT NULL', DataTypes.TEXT),
      c('first_message', 'TEXT', DataTypes.TEXT), c('disclosure', 'TEXT NOT NULL', DataTypes.TEXT),
      c('kb_refs', "JSONB NOT NULL DEFAULT '[]'::jsonb", DataTypes.JSONB), c('tool_permissions', "JSONB NOT NULL DEFAULT '[]'::jsonb", DataTypes.JSONB),
      c('engine', 'VARCHAR(30) NOT NULL', DataTypes.STRING(30)), c('engine_config', "JSONB NOT NULL DEFAULT '{}'::jsonb", DataTypes.JSONB),
      c('voice_id', 'VARCHAR(200)', DataTypes.STRING(200)), c('language', "VARCHAR(20) NOT NULL DEFAULT 'en-US'", DataTypes.STRING(20)),
      c('safety_policy', "JSONB NOT NULL DEFAULT '{}'::jsonb", DataTypes.JSONB), c('max_call_seconds', 'INTEGER NOT NULL DEFAULT 180', DataTypes.INTEGER),
      c('author', 'VARCHAR(255) NOT NULL', DataTypes.STRING(255)), c('approved_by', 'VARCHAR(255)', DataTypes.STRING(255)),
      c('approved_at', 'TIMESTAMPTZ', DataTypes.DATE), c('status', "VARCHAR(20) NOT NULL DEFAULT 'draft'", DataTypes.STRING(20)), created()],
    constraints: ['CONSTRAINT voice_agent_versions_profile_fk FOREIGN KEY (profile_id) REFERENCES voice_agent_profiles(id)',
      "CONSTRAINT voice_agent_versions_status_chk CHECK (status IN ('draft','approved','published','retired'))",
      'CONSTRAINT voice_agent_versions_max_call_chk CHECK (max_call_seconds BETWEEN 10 AND 3600)'],
    indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS voice_agent_versions_version_uq ON voice_agent_versions (profile_id, version)',
      'CREATE UNIQUE INDEX IF NOT EXISTS voice_agent_versions_hash_uq ON voice_agent_versions (profile_id, content_hash)'],
  },
  {
    table: 'voice_numbers', model: 'VoiceNumber',
    columns: [id(), tenant(), c('provider', 'VARCHAR(30) NOT NULL', DataTypes.STRING(30)), c('provider_number_id', 'VARCHAR(100) NOT NULL', DataTypes.STRING(100)),
      c('number_ref', 'VARCHAR(100) NOT NULL', DataTypes.STRING(100)),
      // Restricted column: read only by the carrier adapter at dispatch time; never logged or returned by an API.
      c('e164_restricted', 'VARCHAR(20) NOT NULL', DataTypes.STRING(20)),
      c('capabilities', "JSONB NOT NULL DEFAULT '{}'::jsonb", DataTypes.JSONB), c('ownership', "VARCHAR(20) NOT NULL DEFAULT 'owned'", DataTypes.STRING(20)),
      c('verified_caller_id', 'BOOLEAN NOT NULL DEFAULT FALSE', DataTypes.BOOLEAN), c('brand_slug', 'VARCHAR(100)', DataTypes.STRING(100)),
      c('routing_policy', "JSONB NOT NULL DEFAULT '{}'::jsonb", DataTypes.JSONB), c('status', "VARCHAR(20) NOT NULL DEFAULT 'inactive'", DataTypes.STRING(20)), created(), updated()],
    constraints: ["CONSTRAINT voice_numbers_ownership_chk CHECK (ownership IN ('owned','vendor','porting'))"],
    indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS voice_numbers_provider_uq ON voice_numbers (provider, provider_number_id)',
      'CREATE UNIQUE INDEX IF NOT EXISTS voice_numbers_ref_uq ON voice_numbers (tenant_id, number_ref)'],
  },
  {
    table: 'voice_routes', model: 'VoiceRoute',
    columns: [id(), tenant(), c('brand_slug', 'VARCHAR(100) NOT NULL', DataTypes.STRING(100)), c('path_key', 'VARCHAR(100) NOT NULL', DataTypes.STRING(100)),
      c('call_type', 'VARCHAR(50) NOT NULL', DataTypes.STRING(50)), c('engine', "VARCHAR(30) NOT NULL DEFAULT 'synthflow_legacy'", DataTypes.STRING(30)),
      c('profile_id', 'UUID', DataTypes.UUID), c('version_id', 'UUID', DataTypes.UUID),
      c('mode', "VARCHAR(20) NOT NULL DEFAULT 'legacy'", DataTypes.STRING(20)), c('canary_percent', 'INTEGER NOT NULL DEFAULT 0', DataTypes.INTEGER),
      c('fallback', "JSONB NOT NULL DEFAULT '{}'::jsonb", DataTypes.JSONB), c('approved_by', 'VARCHAR(255)', DataTypes.STRING(255)),
      c('approved_at', 'TIMESTAMPTZ', DataTypes.DATE), created(), updated()],
    constraints: ["CONSTRAINT voice_routes_mode_chk CHECK (mode IN ('legacy','shadow','test','canary','live','disabled'))",
      'CONSTRAINT voice_routes_canary_chk CHECK (canary_percent BETWEEN 0 AND 100)'],
    indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS voice_routes_path_uq ON voice_routes (tenant_id, path_key)'],
  },
  {
    table: 'voice_calls', model: 'VoiceCall',
    columns: [id(), tenant(), c('route_id', 'UUID', DataTypes.UUID), c('profile_version_id', 'UUID', DataTypes.UUID),
      c('direction', "VARCHAR(10) NOT NULL DEFAULT 'outbound'", DataTypes.STRING(10)), c('engine', 'VARCHAR(30) NOT NULL', DataTypes.STRING(30)),
      c('idempotency_key', 'VARCHAR(200) NOT NULL', DataTypes.STRING(200)), c('recipient_ref', 'VARCHAR(200) NOT NULL', DataTypes.STRING(200)),
      c('consent_ref', 'VARCHAR(200)', DataTypes.STRING(200)), c('purpose', 'VARCHAR(200) NOT NULL', DataTypes.STRING(200)),
      c('lead_id', 'INTEGER', DataTypes.INTEGER), c('communication_log_id', 'UUID', DataTypes.UUID),
      c('provider_call_id', 'VARCHAR(100)', DataTypes.STRING(100)), c('legacy_call_id', 'VARCHAR(100)', DataTypes.STRING(100)),
      c('state', "VARCHAR(30) NOT NULL DEFAULT 'requested'", DataTypes.STRING(30)), c('state_reason', 'VARCHAR(200)', DataTypes.STRING(200)),
      c('error_class', 'VARCHAR(100)', DataTypes.STRING(100)), c('carrier_answered', 'BOOLEAN NOT NULL DEFAULT FALSE', DataTypes.BOOLEAN),
      c('human_answered', 'BOOLEAN NOT NULL DEFAULT FALSE', DataTypes.BOOLEAN), c('session_succeeded', 'BOOLEAN NOT NULL DEFAULT FALSE', DataTypes.BOOLEAN),
      c('test_mode', 'BOOLEAN NOT NULL DEFAULT FALSE', DataTypes.BOOLEAN), c('answered_at', 'TIMESTAMPTZ', DataTypes.DATE),
      c('ended_at', 'TIMESTAMPTZ', DataTypes.DATE), c('duration_seconds', 'INTEGER', DataTypes.INTEGER),
      c('cost_usd', 'NUMERIC(10,4)', DataTypes.DECIMAL(10, 4)), c('retention_until', 'TIMESTAMPTZ', DataTypes.DATE), created(), updated()],
    constraints: ["CONSTRAINT voice_calls_state_chk CHECK (state IN ('requested','blocked','reserved','dispatching','queued','ringing','answered','session_active','completed','busy','no_answer','failed','canceled','dispatch_unknown'))"],
    indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS voice_calls_idem_uq ON voice_calls (tenant_id, idempotency_key)',
      'CREATE UNIQUE INDEX IF NOT EXISTS voice_calls_provider_uq ON voice_calls (engine, provider_call_id) WHERE provider_call_id IS NOT NULL',
      'CREATE INDEX IF NOT EXISTS voice_calls_tenant_time_idx ON voice_calls (tenant_id, created_at)',
      'CREATE INDEX IF NOT EXISTS voice_calls_route_state_idx ON voice_calls (route_id, state)',
      'CREATE INDEX IF NOT EXISTS voice_calls_lead_time_idx ON voice_calls (lead_id, created_at)',
      'CREATE INDEX IF NOT EXISTS voice_calls_consent_idx ON voice_calls (consent_ref)',
      'CREATE INDEX IF NOT EXISTS voice_calls_retention_idx ON voice_calls (retention_until)'],
  },
  {
    table: 'voice_call_events', model: 'VoiceCallEvent',
    columns: [id(), tenant(), c('call_id', 'UUID NOT NULL', DataTypes.UUID), c('seq', 'BIGINT GENERATED ALWAYS AS IDENTITY', DataTypes.BIGINT),
      c('event_key', 'VARCHAR(300) NOT NULL', DataTypes.STRING(300)), c('source', 'VARCHAR(20) NOT NULL', DataTypes.STRING(20)),
      c('state', 'VARCHAR(30) NOT NULL', DataTypes.STRING(30)), c('occurred_at', 'TIMESTAMPTZ NOT NULL', DataTypes.DATE),
      c('ingested_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()', DataTypes.DATE), c('payload_ref', 'VARCHAR(300)', DataTypes.STRING(300))],
    constraints: [callFk('voice_call_events')],
    indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS voice_call_events_key_uq ON voice_call_events (call_id, event_key)',
      'CREATE INDEX IF NOT EXISTS voice_call_events_call_seq_idx ON voice_call_events (call_id, seq)'],
  },
  {
    table: 'voice_dial_reservations', model: 'VoiceDialReservation',
    columns: [id(), tenant(), c('call_id', 'UUID', DataTypes.UUID), c('idempotency_key', 'VARCHAR(200) NOT NULL', DataTypes.STRING(200)),
      // SHA-256 of the normalized destination: caps are counted per destination without storing the number.
      c('destination_hash', 'VARCHAR(64) NOT NULL', DataTypes.STRING(64)), c('route_id', 'UUID', DataTypes.UUID),
      c('purpose', 'VARCHAR(200) NOT NULL', DataTypes.STRING(200)), c('status', "VARCHAR(20) NOT NULL DEFAULT 'held'", DataTypes.STRING(20)),
      c('lease_expires_at', 'TIMESTAMPTZ NOT NULL', DataTypes.DATE), c('reconciled_at', 'TIMESTAMPTZ', DataTypes.DATE), created(), updated()],
    constraints: ["CONSTRAINT voice_dial_reservations_status_chk CHECK (status IN ('held','dispatching','accepted','released','ambiguous','expired'))"],
    indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS voice_dial_reservations_idem_uq ON voice_dial_reservations (tenant_id, idempotency_key)',
      'CREATE INDEX IF NOT EXISTS voice_dial_reservations_dest_time_idx ON voice_dial_reservations (destination_hash, created_at)',
      'CREATE INDEX IF NOT EXISTS voice_dial_reservations_status_lease_idx ON voice_dial_reservations (status, lease_expires_at)'],
  },
  {
    table: 'voice_turns', model: 'VoiceTurn',
    columns: [id(), tenant(), c('call_id', 'UUID NOT NULL', DataTypes.UUID), c('turn_index', 'INTEGER NOT NULL', DataTypes.INTEGER),
      c('speaker', 'VARCHAR(10) NOT NULL', DataTypes.STRING(10)), c('started_at', 'TIMESTAMPTZ NOT NULL', DataTypes.DATE),
      c('ended_at', 'TIMESTAMPTZ', DataTypes.DATE), c('first_audio_latency_ms', 'INTEGER', DataTypes.INTEGER),
      c('interrupted', 'BOOLEAN NOT NULL DEFAULT FALSE', DataTypes.BOOLEAN), c('transcript_ref', 'VARCHAR(300)', DataTypes.STRING(300))],
    constraints: [callFk('voice_turns'), "CONSTRAINT voice_turns_speaker_chk CHECK (speaker IN ('caller','agent','system'))"],
    indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS voice_turns_idx_uq ON voice_turns (call_id, turn_index)'],
  },
  {
    table: 'voice_tool_runs', model: 'VoiceToolRun',
    columns: [id(), tenant(), c('call_id', 'UUID NOT NULL', DataTypes.UUID), c('turn_index', 'INTEGER', DataTypes.INTEGER),
      c('tool_name', 'VARCHAR(100) NOT NULL', DataTypes.STRING(100)), c('idempotency_key', 'VARCHAR(200) NOT NULL', DataTypes.STRING(200)),
      c('auth_decision', 'VARCHAR(20) NOT NULL', DataTypes.STRING(20)), c('args_redacted', "JSONB NOT NULL DEFAULT '{}'::jsonb", DataTypes.JSONB),
      c('result_summary', 'TEXT', DataTypes.TEXT), c('status', "VARCHAR(20) NOT NULL DEFAULT 'pending'", DataTypes.STRING(20)),
      c('started_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()', DataTypes.DATE), c('ended_at', 'TIMESTAMPTZ', DataTypes.DATE)],
    constraints: [callFk('voice_tool_runs'), "CONSTRAINT voice_tool_runs_auth_chk CHECK (auth_decision IN ('allowed','denied','approval_required'))"],
    indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS voice_tool_runs_idem_uq ON voice_tool_runs (call_id, idempotency_key)'],
  },
  {
    table: 'voice_artifacts', model: 'VoiceArtifact',
    columns: [id(), tenant(), c('call_id', 'UUID NOT NULL', DataTypes.UUID), c('kind', 'VARCHAR(20) NOT NULL', DataTypes.STRING(20)),
      c('storage_ref', 'VARCHAR(500) NOT NULL', DataTypes.STRING(500)), c('retention_until', 'TIMESTAMPTZ', DataTypes.DATE),
      c('deleted_at', 'TIMESTAMPTZ', DataTypes.DATE), created()],
    constraints: [callFk('voice_artifacts'), "CONSTRAINT voice_artifacts_kind_chk CHECK (kind IN ('transcript','recording','summary'))"],
    indexes: ['CREATE INDEX IF NOT EXISTS voice_artifacts_retention_idx ON voice_artifacts (retention_until)'],
  },
  {
    table: 'voice_evaluation_runs', model: 'VoiceEvaluationRun',
    columns: [id(), tenant(), c('profile_version_id', 'UUID', DataTypes.UUID), c('engine', 'VARCHAR(30) NOT NULL', DataTypes.STRING(30)),
      c('scenario_set', 'VARCHAR(100) NOT NULL', DataTypes.STRING(100)), c('environment', 'VARCHAR(20) NOT NULL', DataTypes.STRING(20)),
      c('scores', "JSONB NOT NULL DEFAULT '{}'::jsonb", DataTypes.JSONB), c('verdict', 'VARCHAR(20) NOT NULL', DataTypes.STRING(20)),
      c('evidence_ref', 'VARCHAR(300)', DataTypes.STRING(300)), created()],
    constraints: [],
    indexes: ['CREATE INDEX IF NOT EXISTS voice_evaluation_runs_tenant_time_idx ON voice_evaluation_runs (tenant_id, created_at)'],
  },
  {
    table: 'voice_test_cases', model: 'VoiceTestCase',
    columns: [id(), tenant(), c('scenario_key', 'VARCHAR(100) NOT NULL', DataTypes.STRING(100)), c('description', 'TEXT NOT NULL', DataTypes.TEXT),
      c('expected', "JSONB NOT NULL DEFAULT '{}'::jsonb", DataTypes.JSONB), created()],
    constraints: [],
    indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS voice_test_cases_key_uq ON voice_test_cases (tenant_id, scenario_key)'],
  },
  {
    table: 'voice_usage', model: 'VoiceUsage',
    columns: [id(), tenant(), c('call_id', 'UUID', DataTypes.UUID), c('provider', 'VARCHAR(30) NOT NULL', DataTypes.STRING(30)),
      c('unit', 'VARCHAR(30) NOT NULL', DataTypes.STRING(30)), c('quantity', 'NUMERIC(14,4) NOT NULL', DataTypes.DECIMAL(14, 4)),
      c('unit_price_usd', 'NUMERIC(12,6)', DataTypes.DECIMAL(12, 6)), c('rate_card_version', 'VARCHAR(50)', DataTypes.STRING(50)),
      c('measured', 'BOOLEAN NOT NULL DEFAULT FALSE', DataTypes.BOOLEAN), created()],
    constraints: [callFk('voice_usage')],
    indexes: ['CREATE INDEX IF NOT EXISTS voice_usage_call_idx ON voice_usage (call_id)',
      'CREATE INDEX IF NOT EXISTS voice_usage_tenant_time_idx ON voice_usage (tenant_id, created_at)'],
  },
  {
    // VS2.1: single-use enforcement for signed correlation tokens (TwiML fetch, WebSocket session).
    // A replayed token hits the unique nonce and is refused. Holds no phone number and no secret.
    table: 'voice_token_uses', model: 'VoiceTokenUse',
    columns: [id(), tenant(), c('call_id', 'UUID NOT NULL', DataTypes.UUID), c('purpose', 'VARCHAR(20) NOT NULL', DataTypes.STRING(20)),
      c('nonce', 'VARCHAR(64) NOT NULL', DataTypes.STRING(64)), c('consumed_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()', DataTypes.DATE)],
    constraints: [callFk('voice_token_uses')],
    indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS voice_token_uses_nonce_uq ON voice_token_uses (purpose, nonce)'],
  },
];

/** CREATE TABLE ... IF NOT EXISTS for one spec (columns, then table constraints). */
export function createTableSql(t: TableSpec): string {
  const body = [...t.columns.map((col) => `${col.name} ${col.sql}`), ...t.constraints].join(',\n  ');
  return `CREATE TABLE IF NOT EXISTS ${t.table} (\n  ${body}\n)`;
}

/** Every statement, in dependency order (profiles before versions, calls before call-scoped tables). */
export function voiceStudioStatements(): string[] {
  return VOICE_TABLE_SPECS.flatMap((t) => [createTableSql(t), ...t.indexes]);
}

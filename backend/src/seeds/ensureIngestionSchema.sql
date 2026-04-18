CREATE TABLE IF NOT EXISTS lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  api_key_hash VARCHAR(255),
  hmac_secret VARCHAR(255),
  hmac_secret_prev VARCHAR(255),
  rate_limit INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS entry_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES lead_sources(id) ON DELETE CASCADE,
  slug VARCHAR(100) NOT NULL,
  name VARCHAR(255),
  page VARCHAR(500),
  form_name VARCHAR(255),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  UNIQUE (source_id, slug)
);
CREATE TABLE IF NOT EXISTS form_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_point_id UUID NOT NULL REFERENCES entry_points(id) ON DELETE CASCADE,
  field_map JSONB NOT NULL DEFAULT '{}'::jsonb,
  required_fields JSONB NOT NULL DEFAULT '["email"]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  continue_on_match BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS raw_lead_payloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_slug VARCHAR(100),
  entry_slug VARCHAR(100),
  headers JSONB,
  body JSONB,
  remote_ip VARCHAR(64),
  received_at TIMESTAMPTZ DEFAULT NOW(),
  resulting_lead_id INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT
);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS entry_point_id UUID;
CREATE INDEX IF NOT EXISTS idx_lead_sources_active ON lead_sources (is_active);
CREATE INDEX IF NOT EXISTS idx_entry_points_active ON entry_points (is_active);
CREATE INDEX IF NOT EXISTS idx_form_defs_entry_active ON form_definitions (entry_point_id, is_active);
CREATE INDEX IF NOT EXISTS idx_routing_rules_active_priority ON routing_rules (is_active, priority);
CREATE INDEX IF NOT EXISTS idx_raw_payloads_received_at ON raw_lead_payloads (received_at);
CREATE INDEX IF NOT EXISTS idx_raw_payloads_status ON raw_lead_payloads (status);
CREATE INDEX IF NOT EXISTS idx_raw_payloads_source_entry ON raw_lead_payloads (source_slug, entry_slug);
CREATE INDEX IF NOT EXISTS idx_raw_payloads_lead ON raw_lead_payloads (resulting_lead_id);

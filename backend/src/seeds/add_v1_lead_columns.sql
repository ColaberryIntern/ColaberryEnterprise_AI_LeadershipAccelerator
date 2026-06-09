-- Migration: add columns for POST /api/v1/leads (enterprise CRM ingest)
-- Run on prod: docker exec -i accelerator-db psql -U accelerator accelerator_prod < backend/src/seeds/add_v1_lead_columns.sql
-- Idempotent (IF NOT EXISTS / IF NOT EXISTS on index).

ALTER TABLE leads ADD COLUMN IF NOT EXISTS strapi_lead_id VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS strapi_attribution JSONB;

-- Partial unique index: (strapi_lead_id, source) where strapi_lead_id IS NOT NULL.
-- Enforces idempotency at the DB level — duplicate POSTs from training.colaberry.com
-- with the same Strapi row ID will never produce a second Lead row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_strapi_lead_id_source
  ON leads (strapi_lead_id, source)
  WHERE strapi_lead_id IS NOT NULL;

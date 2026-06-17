-- Migration: Add Stripe fields to enrollments + create enrollment_leads table
-- Created: 2026-06-16
-- Session: CC-20260616-s7r1
-- Run against: CCPP Postgres (accelerator DB) via: ssh root@95.216.199.47 then docker exec
-- Apply: psql -U accelerator -d accelerator < /path/to/this/file
-- Idempotent: all statements are wrapped in IF NOT EXISTS / conditional guards

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add Stripe columns to enrollments
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS stripe_session_id        VARCHAR(255)  NULL,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255)  NULL,
  ADD COLUMN IF NOT EXISTS stripe_charge_id         VARCHAR(255)  NULL,
  ADD COLUMN IF NOT EXISTS intensives               VARCHAR(500)  NULL,
  ADD COLUMN IF NOT EXISTS industry_track           VARCHAR(100)  NULL,
  ADD COLUMN IF NOT EXISTS referral_channel         VARCHAR(50)   NULL,
  ADD COLUMN IF NOT EXISTS amount_paid              DECIMAL(10,2) NULL,
  ADD COLUMN IF NOT EXISTS enrolled_at              TIMESTAMPTZ   NULL;

-- Unique constraints for Stripe ID idempotency
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_enrollments_stripe_session_id') THEN
    ALTER TABLE enrollments ADD CONSTRAINT uq_enrollments_stripe_session_id UNIQUE (stripe_session_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_enrollments_stripe_payment_intent_id') THEN
    ALTER TABLE enrollments ADD CONSTRAINT uq_enrollments_stripe_payment_intent_id UNIQUE (stripe_payment_intent_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Create enrollment_leads (funnel tracking pre-payment)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS enrollment_leads (
  id               UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name             VARCHAR(255)  NOT NULL,
  email            VARCHAR(255)  NOT NULL,
  phone            VARCHAR(50)   NULL,
  referral_channel VARCHAR(50)   NULL,
  status           VARCHAR(20)   NOT NULL DEFAULT 'prospect'
                     CHECK (status IN ('prospect', 'sales_contact', 'enrolled', 'churned')),
  lost_reason      VARCHAR(20)   NULL
                     CHECK (lost_reason IN ('price', 'time', 'prereqs', 'timing')),
  enrollment_id    UUID          NULL REFERENCES enrollments(id) ON DELETE SET NULL,
  notes            TEXT          NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_enrollment_leads_email') THEN
    ALTER TABLE enrollment_leads ADD CONSTRAINT uq_enrollment_leads_email UNIQUE (email);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_enrollment_leads_status   ON enrollment_leads (status);
CREATE INDEX IF NOT EXISTS idx_enrollment_leads_channel  ON enrollment_leads (referral_channel);

COMMIT;

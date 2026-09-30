-- Fix for the 2026-07-14 Cora mail-loop incident (BC #10095332194). Idempotency
-- key so Cora's auto-reply is reserved-then-sent per thread — a second attempt
-- at the same thread_key is a no-op, not a duplicate send.
BEGIN;

CREATE TABLE IF NOT EXISTS cora_reply_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_key VARCHAR(255) NOT NULL,
  email_id UUID NOT NULL,
  replied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cora_reply_logs_thread_key UNIQUE (thread_key)
);

COMMIT;

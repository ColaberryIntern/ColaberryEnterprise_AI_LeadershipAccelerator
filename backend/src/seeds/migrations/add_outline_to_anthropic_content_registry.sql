-- Migration: add outline column to anthropic_content_registry
-- Run: docker exec accelerator-backend psql $DATABASE_URL -f /app/src/seeds/migrations/add_outline_to_anthropic_content_registry.sql
-- Idempotent: DO block guards against re-adding an existing column.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'anthropic_content_registry'
      AND column_name = 'outline'
  ) THEN
    ALTER TABLE anthropic_content_registry
      ADD COLUMN outline TEXT NULL;
  END IF;
END
$$;

-- Add vector columns for semantic search
-- These are managed by Python (pgvector), not Sequelize

ALTER TABLE entity_summaries
  ADD COLUMN IF NOT EXISTS summary_embedding vector(1536);

ALTER TABLE qa_history
  ADD COLUMN IF NOT EXISTS question_embedding vector(1536);

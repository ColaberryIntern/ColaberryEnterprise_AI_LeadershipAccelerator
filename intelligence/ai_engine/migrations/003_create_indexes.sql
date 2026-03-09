-- Create vector indexes for similarity search
-- Using ivfflat for approximate nearest neighbor queries

CREATE INDEX IF NOT EXISTS idx_entity_summaries_embedding
  ON entity_summaries
  USING ivfflat (summary_embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_qa_history_embedding
  ON qa_history
  USING ivfflat (question_embedding vector_cosine_ops)
  WITH (lists = 100);

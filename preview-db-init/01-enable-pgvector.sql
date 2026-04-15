-- Preview DB init: enable pgvector.
-- Runs once, on first boot of the preview postgres container (when initdb
-- populates the data directory). Required because the backend sync creates
-- tables with `vector(1536)` columns for the intelligence_memory table.
CREATE EXTENSION IF NOT EXISTS vector;

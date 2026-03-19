"""Vector search functions using pgvector."""

import logging
from typing import Any

import psycopg2
import psycopg2.extras

from .embedding_service import EmbeddingService

logger = logging.getLogger(__name__)


class VectorService:
    """Semantic search using pgvector cosine similarity."""

    def __init__(self, database_url: str, embedding_service: EmbeddingService):
        self.database_url = database_url
        self.embedder = embedding_service

    def _connect(self):
        return psycopg2.connect(self.database_url)

    def similar_entities(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        """Find entities similar to a text query."""
        embedding = self.embedder.embed_single(query)
        if not embedding:
            return []

        conn = self._connect()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, entity_id, entity_name, entity_type, summary_text,
                           1 - (summary_embedding <=> %s::vector) AS similarity
                    FROM entity_summaries
                    WHERE summary_embedding IS NOT NULL
                    ORDER BY summary_embedding <=> %s::vector
                    LIMIT %s;
                """, (str(embedding), str(embedding), limit))
                return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def similar_questions(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        """Find previously asked similar questions."""
        embedding = self.embedder.embed_single(query)
        if not embedding:
            return []

        conn = self._connect()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, question, answer, intent,
                           1 - (question_embedding <=> %s::vector) AS similarity
                    FROM qa_history
                    WHERE question_embedding IS NOT NULL
                    ORDER BY question_embedding <=> %s::vector
                    LIMIT %s;
                """, (str(embedding), str(embedding), limit))
                return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def similar_memories(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        """Find similar intelligence memories."""
        embedding = self.embedder.embed_single(query)
        if not embedding:
            return []

        conn = self._connect()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, category, content, metadata, created_at,
                           1 - (embedding <=> %s::vector) AS similarity
                    FROM intelligence_memory
                    WHERE embedding IS NOT NULL
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s;
                """, (str(embedding), str(embedding), limit))
                return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def semantic_search(self, query: str, limit: int = 10) -> dict[str, list]:
        """Combined search across entities, questions, and memories."""
        entities = self.similar_entities(query, limit)
        questions = self.similar_questions(query, min(limit, 5))
        memories = self.similar_memories(query, min(limit, 5))
        return {"entities": entities, "past_questions": questions, "memories": memories}

    def entity_similarity_network(self, entity_ids: list[str], threshold: float = 0.7) -> list[dict]:
        """Build a similarity network between entities."""
        conn = self._connect()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                edges = []
                for i, eid in enumerate(entity_ids):
                    cur.execute("""
                        SELECT a.entity_id AS source, b.entity_id AS target,
                               1 - (a.summary_embedding <=> b.summary_embedding) AS similarity
                        FROM entity_summaries a, entity_summaries b
                        WHERE a.entity_id = %s
                          AND b.entity_id != a.entity_id
                          AND a.summary_embedding IS NOT NULL
                          AND b.summary_embedding IS NOT NULL
                          AND 1 - (a.summary_embedding <=> b.summary_embedding) >= %s
                        ORDER BY similarity DESC
                        LIMIT 10;
                    """, (eid, threshold))
                    edges.extend([dict(r) for r in cur.fetchall()])
                return edges
        finally:
            conn.close()

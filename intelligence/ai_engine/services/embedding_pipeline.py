"""Batch embedding pipeline for text columns and entity summaries."""

import json
import logging
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras

from .embedding_service import EmbeddingService

logger = logging.getLogger(__name__)


class EmbeddingPipeline:
    """Batch-embeds text columns and entity summaries into pgvector."""

    def __init__(self, database_url: str, embedding_service: EmbeddingService):
        self.database_url = database_url
        self.embedder = embedding_service

    def run(self, dictionary_path: str = "intelligence/data_dictionary.json") -> dict[str, int]:
        """Run the full embedding pipeline."""
        path = Path(dictionary_path)
        if not path.exists():
            logger.warning("No data dictionary found at %s", path)
            return {"summaries_embedded": 0, "qa_embedded": 0}

        with open(path) as f:
            dictionary = json.load(f)

        summaries_count = self._embed_entity_summaries(dictionary)
        qa_count = self._embed_qa_history()

        return {"summaries_embedded": summaries_count, "qa_embedded": qa_count}

    def _embed_entity_summaries(self, dictionary: dict[str, Any]) -> int:
        """Generate and embed entity summaries."""
        conn = psycopg2.connect(self.database_url)
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                # Find un-embedded summaries
                cur.execute("""
                    SELECT id, summary_text
                    FROM entity_summaries
                    WHERE summary_embedding IS NULL
                      AND summary_text IS NOT NULL
                    LIMIT 500;
                """)
                rows = cur.fetchall()

                if not rows:
                    return 0

                texts = [r["summary_text"] for r in rows]
                embeddings = self.embedder.embed_texts(texts)

                for row, embedding in zip(rows, embeddings):
                    if embedding:
                        cur.execute(
                            "UPDATE entity_summaries SET summary_embedding = %s WHERE id = %s",
                            (str(embedding), row["id"]),
                        )

                conn.commit()
                logger.info("Embedded %d entity summaries", len(rows))
                return len(rows)
        finally:
            conn.close()

    def _embed_qa_history(self) -> int:
        """Embed recent Q&A questions."""
        conn = psycopg2.connect(self.database_url)
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, question
                    FROM qa_history
                    WHERE question_embedding IS NULL
                      AND question IS NOT NULL
                    LIMIT 500;
                """)
                rows = cur.fetchall()

                if not rows:
                    return 0

                texts = [r["question"] for r in rows]
                embeddings = self.embedder.embed_texts(texts)

                for row, embedding in zip(rows, embeddings):
                    if embedding:
                        cur.execute(
                            "UPDATE qa_history SET question_embedding = %s WHERE id = %s",
                            (str(embedding), row["id"]),
                        )

                conn.commit()
                logger.info("Embedded %d QA questions", len(rows))
                return len(rows)
        finally:
            conn.close()

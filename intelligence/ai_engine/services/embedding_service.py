"""OpenAI embedding wrapper with batching and retry."""

import logging
import time
from typing import Any

import openai

logger = logging.getLogger(__name__)

BATCH_SIZE = 100
MAX_RETRIES = 3
RETRY_DELAY = 2.0


class EmbeddingService:
    """Wraps OpenAI embedding API with batching and retry logic."""

    def __init__(self, api_key: str, model: str = "text-embedding-3-small", dimensions: int = 1536):
        self.client = openai.OpenAI(api_key=api_key)
        self.model = model
        self.dimensions = dimensions

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of texts, batching if needed."""
        all_embeddings: list[list[float]] = []

        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i : i + BATCH_SIZE]
            embeddings = self._embed_batch(batch)
            all_embeddings.extend(embeddings)

        return all_embeddings

    def embed_single(self, text: str) -> list[float]:
        """Embed a single text."""
        result = self._embed_batch([text])
        return result[0] if result else []

    def _embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch with retry logic."""
        for attempt in range(MAX_RETRIES):
            try:
                response = self.client.embeddings.create(
                    model=self.model,
                    input=texts,
                    dimensions=self.dimensions,
                )
                return [item.embedding for item in response.data]
            except openai.RateLimitError:
                wait = RETRY_DELAY * (2 ** attempt)
                logger.warning("Rate limited, waiting %.1fs (attempt %d/%d)", wait, attempt + 1, MAX_RETRIES)
                time.sleep(wait)
            except openai.APIError as e:
                logger.error("OpenAI API error: %s", e)
                if attempt == MAX_RETRIES - 1:
                    raise
                time.sleep(RETRY_DELAY)

        return [[] for _ in texts]

"""Text clustering using TF-IDF + HDBSCAN."""

import logging
from typing import Any

import numpy as np
import pandas as pd
import psycopg2
import psycopg2.extras
from sklearn.feature_extraction.text import TfidfVectorizer

from .base_model import BaseMLModel

logger = logging.getLogger(__name__)


class TextClusterer(BaseMLModel):
    """Clusters text columns using TF-IDF and HDBSCAN."""

    @property
    def name(self) -> str:
        return "text_clusterer"

    def can_run(self, data_dictionary: dict[str, Any]) -> bool:
        return bool(data_dictionary.get("text_columns"))

    def run(
        self,
        data_dictionary: dict[str, Any],
        database_url: str,
        table: str | None = None,
        column: str | None = None,
    ) -> dict[str, Any]:
        text_cols = data_dictionary.get("text_columns", [])
        if not text_cols:
            return {"clusters": [], "error": "No text columns found"}

        if not table or not column:
            table = text_cols[0]["table"]
            column = text_cols[0]["column"]

        conn = psycopg2.connect(database_url)
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(f'''
                    SELECT "{column}" AS text_val
                    FROM "{table}"
                    WHERE "{column}" IS NOT NULL AND LENGTH("{column}") > 10
                    LIMIT 5000
                ''')
                rows = cur.fetchall()
        finally:
            conn.close()

        if len(rows) < 10:
            return {"clusters": [], "error": "Not enough text data"}

        texts = [r["text_val"] for r in rows]

        vectorizer = TfidfVectorizer(max_features=1000, stop_words="english")
        tfidf_matrix = vectorizer.fit_transform(texts)

        try:
            import hdbscan

            clusterer = hdbscan.HDBSCAN(min_cluster_size=5, min_samples=3)
            labels = clusterer.fit_predict(tfidf_matrix.toarray())
        except ImportError:
            logger.warning("HDBSCAN not installed, using KMeans fallback")
            from sklearn.cluster import KMeans
            n_clusters = min(10, len(texts) // 5)
            kmeans = KMeans(n_clusters=max(2, n_clusters), random_state=42, n_init=10)
            labels = kmeans.fit_predict(tfidf_matrix.toarray())

        clusters = {}
        for i, label in enumerate(labels):
            label_str = str(label)
            if label_str not in clusters:
                clusters[label_str] = {"texts": [], "count": 0}
            if clusters[label_str]["count"] < 5:
                clusters[label_str]["texts"].append(texts[i][:200])
            clusters[label_str]["count"] += 1

        # Get top terms per cluster
        feature_names = vectorizer.get_feature_names_out()
        cluster_summaries = []
        for label_str, info in sorted(clusters.items(), key=lambda x: x[1]["count"], reverse=True):
            if label_str == "-1":
                continue
            mask = np.array(labels) == int(label_str)
            if mask.sum() == 0:
                continue
            mean_tfidf = tfidf_matrix[mask].mean(axis=0).A1
            top_indices = mean_tfidf.argsort()[-5:][::-1]
            top_terms = [feature_names[i] for i in top_indices]
            cluster_summaries.append({
                "cluster_id": int(label_str),
                "count": info["count"],
                "top_terms": top_terms,
                "sample_texts": info["texts"][:3],
            })

        noise_count = sum(1 for l in labels if l == -1)

        return {
            "clusters": cluster_summaries,
            "total_texts": len(texts),
            "cluster_count": len(cluster_summaries),
            "noise_count": noise_count,
            "table": table,
            "column": column,
        }

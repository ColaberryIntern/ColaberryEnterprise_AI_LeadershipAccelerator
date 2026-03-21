"""Weighted composite risk scoring."""

import logging
from typing import Any

import numpy as np
import pandas as pd
import psycopg2
import psycopg2.extras

from .base_model import BaseMLModel

logger = logging.getLogger(__name__)

DEFAULT_WEIGHTS = {
    "anomaly_score": 0.3,
    "missing_data_rate": 0.2,
    "trend_deviation": 0.25,
    "volatility": 0.25,
}


class RiskScorer(BaseMLModel):
    """Computes composite risk scores for entities."""

    @property
    def name(self) -> str:
        return "risk_scorer"

    def can_run(self, data_dictionary: dict[str, Any]) -> bool:
        return bool(data_dictionary.get("hub_entity")) and bool(data_dictionary.get("numeric_columns"))

    def run(
        self,
        data_dictionary: dict[str, Any],
        database_url: str,
        weights: dict[str, float] | None = None,
    ) -> dict[str, Any]:
        hub = data_dictionary.get("hub_entity")
        if not hub:
            return {"scores": [], "error": "No hub entity"}

        weights = weights or DEFAULT_WEIGHTS
        hub_info = data_dictionary["tables"].get(hub, {})
        numeric_cols = [
            c["column"] for c in data_dictionary.get("numeric_columns", [])
            if c["table"] == hub
        ]

        pk_col = None
        name_col = None
        for col_name, col_info in hub_info.get("columns", {}).items():
            if col_info.get("is_primary_key"):
                pk_col = col_name
            if col_info.get("semantic_type") == "name" and not name_col:
                name_col = col_name

        if not pk_col or not numeric_cols:
            return {"scores": [], "error": "Insufficient columns for risk scoring"}

        select_cols = [f'"{pk_col}"']
        if name_col:
            select_cols.append(f'"{name_col}"')
        select_cols.extend(f'"{c}"' for c in numeric_cols)

        conn = psycopg2.connect(database_url)
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(f'SELECT {", ".join(select_cols)} FROM "{hub}" LIMIT 10000')
                rows = cur.fetchall()
        finally:
            conn.close()

        if len(rows) < 5:
            return {"scores": [], "error": "Not enough data"}

        df = pd.DataFrame(rows)
        # Clean formatted strings like '26.2M', '1.5K', '$500' before casting
        feature_df = df[numeric_cols].fillna(0).apply(pd.to_numeric, errors="coerce").fillna(0)

        # Compute component scores (0-100)
        components = {}

        # Missing data rate
        null_rates = df[numeric_cols].isnull().mean(axis=1)
        components["missing_data_rate"] = (null_rates * 100).values

        # Volatility (coefficient of variation per row across numeric cols)
        row_std = feature_df.std(axis=1)
        row_mean = feature_df.mean(axis=1).replace(0, 1)
        cv = (row_std / row_mean).clip(0, 10)
        components["volatility"] = self._normalize_0_100(cv.values)

        # Trend deviation (distance from column means)
        col_means = feature_df.mean()
        col_stds = feature_df.std().replace(0, 1)
        z_scores = ((feature_df - col_means) / col_stds).abs().mean(axis=1)
        components["trend_deviation"] = self._normalize_0_100(z_scores.values)

        # Anomaly score placeholder (would come from anomaly detector)
        components["anomaly_score"] = components["trend_deviation"] * 0.5

        # Weighted composite
        total_weight = sum(weights.get(k, 0) for k in components)
        if total_weight == 0:
            total_weight = 1

        composite = np.zeros(len(df))
        for component_name, values in components.items():
            w = weights.get(component_name, 0)
            composite += values * (w / total_weight)

        scores = []
        for i in range(len(df)):
            entry = {
                "entity_id": str(df[pk_col].iloc[i]),
                "risk_score": round(float(composite[i]), 2),
                "risk_level": self._risk_level(composite[i]),
            }
            if name_col and name_col in df.columns:
                entry["entity_name"] = str(df[name_col].iloc[i])
            for comp_name, comp_values in components.items():
                entry[f"component_{comp_name}"] = round(float(comp_values[i]), 2)
            scores.append(entry)

        scores.sort(key=lambda x: x["risk_score"], reverse=True)

        return {
            "scores": scores[:100],
            "total_entities": len(df),
            "high_risk_count": sum(1 for s in scores if s["risk_level"] == "high"),
            "medium_risk_count": sum(1 for s in scores if s["risk_level"] == "medium"),
            "low_risk_count": sum(1 for s in scores if s["risk_level"] == "low"),
            "weights": weights,
        }

    @staticmethod
    def _normalize_0_100(values: np.ndarray) -> np.ndarray:
        vmin, vmax = values.min(), values.max()
        if vmax == vmin:
            return np.zeros_like(values)
        return ((values - vmin) / (vmax - vmin)) * 100

    @staticmethod
    def _risk_level(score: float) -> str:
        if score >= 70:
            return "high"
        if score >= 40:
            return "medium"
        return "low"

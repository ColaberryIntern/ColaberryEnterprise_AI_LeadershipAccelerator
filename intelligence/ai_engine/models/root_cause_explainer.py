"""Root cause analysis using XGBoost + SHAP."""

import logging
from typing import Any

import numpy as np
import pandas as pd
import psycopg2
import psycopg2.extras

from .base_model import BaseMLModel

logger = logging.getLogger(__name__)


class RootCauseExplainer(BaseMLModel):
    """Explains metric drivers using XGBoost feature importance + SHAP values."""

    @property
    def name(self) -> str:
        return "root_cause_explainer"

    def can_run(self, data_dictionary: dict[str, Any]) -> bool:
        return len(data_dictionary.get("numeric_columns", [])) >= 2

    def run(
        self,
        data_dictionary: dict[str, Any],
        database_url: str,
        target_table: str | None = None,
        target_column: str | None = None,
    ) -> dict[str, Any]:
        hub = data_dictionary.get("hub_entity")
        numeric_cols = data_dictionary.get("numeric_columns", [])

        if not hub or len(numeric_cols) < 2:
            return {"features": [], "error": "Not enough numeric data for root cause analysis"}

        hub_numerics = [c for c in numeric_cols if c["table"] == hub]
        if len(hub_numerics) < 2:
            return {"features": [], "error": "Hub entity needs at least 2 numeric columns"}

        target_col = target_column or hub_numerics[0]["column"]
        feature_cols = [c["column"] for c in hub_numerics if c["column"] != target_col]

        if not feature_cols:
            return {"features": [], "error": "No feature columns available"}

        all_cols = [f'"{target_col}"'] + [f'"{c}"' for c in feature_cols]
        conn = psycopg2.connect(database_url)
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                sql = f'SELECT {", ".join(all_cols)} FROM "{hub}" LIMIT 10000'
                cur.execute(sql)
                rows = cur.fetchall()
        finally:
            conn.close()

        if len(rows) < 20:
            return {"features": [], "error": "Not enough data rows"}

        df = pd.DataFrame(rows).fillna(0)
        y = df[target_col].astype(float)
        X = df[feature_cols].astype(float)

        try:
            import xgboost as xgb
            import shap

            model = xgb.XGBRegressor(n_estimators=100, max_depth=4, random_state=42)
            model.fit(X, y)

            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(X)

            mean_shap = np.abs(shap_values).mean(axis=0)
            feature_importance = []
            for i, col in enumerate(feature_cols):
                feature_importance.append({
                    "feature": col,
                    "importance": round(float(mean_shap[i]), 4),
                    "direction": "positive" if np.mean(shap_values[:, i]) > 0 else "negative",
                })

            feature_importance.sort(key=lambda x: x["importance"], reverse=True)

            return {
                "features": feature_importance[:20],
                "target": target_col,
                "table": hub,
                "r2_score": round(float(model.score(X, y)), 4),
                "data_points": len(df),
            }
        except ImportError:
            logger.warning("XGBoost/SHAP not installed")
            return {"features": [], "error": "XGBoost or SHAP not installed"}

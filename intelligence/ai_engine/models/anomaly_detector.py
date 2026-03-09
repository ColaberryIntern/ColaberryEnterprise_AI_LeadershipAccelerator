"""Anomaly detection using Isolation Forest on entity performance features."""

import logging
from typing import Any

import numpy as np
import pandas as pd
import psycopg2
import psycopg2.extras
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from .base_model import BaseMLModel

logger = logging.getLogger(__name__)


class AnomalyDetector(BaseMLModel):
    """Detects anomalous entities using Isolation Forest."""

    @property
    def name(self) -> str:
        return "anomaly_detector"

    def can_run(self, data_dictionary: dict[str, Any]) -> bool:
        return bool(data_dictionary.get("numeric_columns")) and bool(data_dictionary.get("hub_entity"))

    def run(self, data_dictionary: dict[str, Any], database_url: str) -> dict[str, Any]:
        hub = data_dictionary.get("hub_entity")
        if not hub:
            return {"anomalies": [], "error": "No hub entity found"}

        numeric_cols = [
            c for c in data_dictionary.get("numeric_columns", [])
            if c["table"] == hub
        ]
        if not numeric_cols:
            return {"anomalies": [], "error": "No numeric columns in hub entity"}

        col_names = [c["column"] for c in numeric_cols]
        hub_info = data_dictionary["tables"].get(hub, {})
        pk_col = None
        name_col = None
        for col_name, col_info in hub_info.get("columns", {}).items():
            if col_info.get("is_primary_key"):
                pk_col = col_name
            if col_info.get("semantic_type") == "name" and not name_col:
                name_col = col_name

        if not pk_col:
            return {"anomalies": [], "error": "No primary key in hub entity"}

        select_cols = [f'"{pk_col}"']
        if name_col:
            select_cols.append(f'"{name_col}"')
        select_cols.extend(f'"{c}"' for c in col_names)

        conn = psycopg2.connect(database_url)
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                sql = f'SELECT {", ".join(select_cols)} FROM "{hub}" LIMIT 10000'
                cur.execute(sql)
                rows = cur.fetchall()
        finally:
            conn.close()

        if len(rows) < 10:
            return {"anomalies": [], "error": "Not enough data"}

        df = pd.DataFrame(rows)
        feature_df = df[col_names].fillna(0)

        scaler = StandardScaler()
        scaled = scaler.fit_transform(feature_df)

        model = IsolationForest(contamination=0.1, random_state=42, n_estimators=100)
        predictions = model.fit_predict(scaled)
        scores = model.decision_function(scaled)

        anomalies = []
        for i, (pred, score) in enumerate(zip(predictions, scores)):
            if pred == -1:
                entry = {
                    "entity_id": str(df[pk_col].iloc[i]),
                    "anomaly_score": round(float(-score), 4),
                }
                if name_col and name_col in df.columns:
                    entry["entity_name"] = str(df[name_col].iloc[i])
                for col in col_names:
                    entry[col] = float(df[col].iloc[i]) if pd.notna(df[col].iloc[i]) else None
                anomalies.append(entry)

        anomalies.sort(key=lambda x: x["anomaly_score"], reverse=True)

        return {
            "anomalies": anomalies[:50],
            "total_entities": len(rows),
            "anomaly_count": len(anomalies),
            "contamination_rate": round(len(anomalies) / len(rows), 4),
        }

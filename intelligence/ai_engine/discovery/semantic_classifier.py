"""Semantic type detection - classifies columns by meaning using name heuristics + data patterns."""

from typing import Any


SEMANTIC_TYPES: dict[str, dict[str, list[str]]] = {
    "currency": {
        "keywords": [
            "revenue", "amount", "price", "cost", "fee", "salary", "total",
            "spend", "income", "profit", "mrr", "arpu", "ltv", "budget",
        ]
    },
    "percentage": {
        "keywords": [
            "pct", "percent", "rate", "ratio", "conversion", "growth",
            "churn", "retention", "open_rate", "reply_rate", "click_rate",
        ]
    },
    "count": {
        "keywords": [
            "count", "total", "num_", "number_of", "qty", "quantity",
            "units", "run_count", "error_count", "lead_count",
        ]
    },
    "score": {
        "keywords": [
            "score", "rating", "rank", "index", "health", "risk",
            "sentiment", "confidence", "health_score",
        ]
    },
    "date": {
        "keywords": [
            "date", "created_at", "updated_at", "timestamp", "time",
            "_at", "_on", "last_run_at", "scheduled_for",
        ]
    },
    "id": {
        "keywords": ["_id", "uuid", "pk", "key"],
    },
    "name": {
        "keywords": ["name", "title", "label", "agent_name", "campaign_name"],
    },
    "description": {
        "keywords": [
            "description", "notes", "comment", "text", "body",
            "content", "summary", "detail", "reason", "error_message",
        ]
    },
    "category": {
        "keywords": [
            "type", "category", "status", "level", "tier", "class",
            "group", "kind", "severity", "agent_type",
        ]
    },
    "geo_lat": {
        "keywords": ["lat", "latitude"],
    },
    "geo_lng": {
        "keywords": ["lng", "lon", "longitude"],
    },
    "email": {
        "keywords": ["email", "mail"],
    },
    "phone": {
        "keywords": ["phone", "tel", "mobile"],
    },
    "boolean": {
        "keywords": ["is_", "has_", "can_", "enabled", "active", "flag", "resolved"],
    },
    "url": {
        "keywords": ["url", "link", "href", "website"],
    },
}


class SemanticClassifier:
    """Classifies columns by semantic meaning using name heuristics + data patterns."""

    def classify_all(
        self,
        columns: dict[str, list[dict]],
        profiles: dict[str, dict],
    ) -> dict[str, dict[str, str]]:
        result: dict[str, dict[str, str]] = {}
        for table_name, table_cols in columns.items():
            result[table_name] = {}
            table_profile = profiles.get(table_name, {}).get("columns", {})
            for col_info in table_cols:
                col_name = col_info["column_name"]
                data_type = col_info["data_type"]
                col_profile = table_profile.get(col_name, {})
                result[table_name][col_name] = self.classify(col_name, data_type, col_profile)
        return result

    def classify(self, column_name: str, data_type: str, profile: dict[str, Any]) -> str:
        col_lower = column_name.lower()

        # Check data type first for unambiguous types
        if data_type in ("boolean",):
            return "boolean"
        if data_type in ("timestamp without time zone", "timestamp with time zone", "date"):
            return "date"
        if data_type == "uuid":
            return "id"

        # Check column name against keyword lists (order matters - more specific first)
        for sem_type, config in SEMANTIC_TYPES.items():
            for keyword in config["keywords"]:
                if keyword in col_lower:
                    return sem_type

        # Check profile patterns
        if profile.get("is_unique") and data_type in ("integer", "bigint"):
            return "id"

        # Fallback by data type
        if data_type in ("integer", "bigint", "smallint"):
            return "count"
        if data_type in ("numeric", "real", "double precision"):
            return "numeric"
        if data_type in ("character varying", "text", "character"):
            if profile.get("looks_like_description"):
                return "description"
            if profile.get("looks_like_name"):
                return "name"
            if profile.get("distinct_count", 0) <= 20:
                return "category"
            return "text"
        if data_type == "jsonb":
            return "json"
        if data_type == "ARRAY":
            return "array"

        return "other"

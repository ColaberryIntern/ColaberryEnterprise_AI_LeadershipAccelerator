"""Configuration loader for Intelligence OS AI Engine."""

import os
from pathlib import Path
from typing import Any, Optional

import yaml
from dotenv import load_dotenv

load_dotenv()

_BASE_DIR = Path(__file__).resolve().parent.parent


def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with open(path, "r") as f:
        return yaml.safe_load(f) or {}


def _env(key: str, default: Any = None, cast: type = str) -> Any:
    val = os.getenv(key, default)
    if val is None:
        return None
    return cast(val)


class Config:
    """Typed configuration for the Intelligence OS AI Engine."""

    def __init__(self, config_path: Optional[str] = None):
        yaml_path = Path(config_path) if config_path else _BASE_DIR / "config.yaml"
        cfg = _load_yaml(yaml_path)

        # Required
        self.project_name: str = cfg.get("PROJECT_NAME", _env("PROJECT_NAME", "IntelligenceOS"))
        self.database_url: str = cfg.get("DATABASE_URL", _env("DATABASE_URL", ""))
        self.openai_api_key: str = cfg.get("OPENAI_API_KEY", _env("OPENAI_API_KEY", ""))

        # Domain
        self.primary_entity: str = cfg.get("PRIMARY_ENTITY", "entity")
        self.primary_entity_plural: str = cfg.get("PRIMARY_ENTITY_PLURAL", "entities")
        self.group_entity: str = cfg.get("GROUP_ENTITY", "group")
        self.group_entity_plural: str = cfg.get("GROUP_ENTITY_PLURAL", "groups")
        self.domain_description: str = cfg.get("DOMAIN_DESCRIPTION", "")

        # Optional overrides
        self.primary_entity_table: Optional[str] = cfg.get("PRIMARY_ENTITY_TABLE")
        self.primary_entity_id_column: Optional[str] = cfg.get("PRIMARY_ENTITY_ID_COLUMN")
        self.primary_entity_name_column: Optional[str] = cfg.get("PRIMARY_ENTITY_NAME_COLUMN")
        self.geo_lat_column: Optional[str] = cfg.get("GEO_LAT_COLUMN")
        self.geo_lng_column: Optional[str] = cfg.get("GEO_LNG_COLUMN")
        self.timestamp_column: Optional[str] = cfg.get("TIMESTAMP_COLUMN")
        self.text_columns: list[str] = cfg.get("TEXT_COLUMNS", []) or []

        # LLM
        self.llm_model: str = _env("LLM_MODEL", "gpt-4o")
        self.llm_temperature: float = _env("LLM_TEMPERATURE", 0.3, float)

        # Embedding
        self.embedding_model: str = _env("EMBEDDING_MODEL", "text-embedding-3-small")
        self.embedding_dimensions: int = _env("EMBEDDING_DIMENSIONS", 1536, int)

        # Flask
        self.flask_port: int = _env("FLASK_PORT", 5000, int)

        # ML
        self.ml_anomaly_contamination: float = _env("ML_ANOMALY_CONTAMINATION", 0.1, float)
        self.ml_forecast_periods: int = _env("ML_FORECAST_PERIODS", 90, int)
        self.ml_cluster_min_size: int = _env("ML_CLUSTER_MIN_SIZE", 5, int)
        self.ml_xgboost_estimators: int = _env("ML_XGBOOST_ESTIMATORS", 100, int)
        self.ml_xgboost_depth: int = _env("ML_XGBOOST_DEPTH", 6, int)

        # Risk
        self.risk_critical: int = _env("RISK_CRITICAL_THRESHOLD", 80, int)
        self.risk_high: int = _env("RISK_HIGH_THRESHOLD", 60, int)
        self.risk_medium: int = _env("RISK_MEDIUM_THRESHOLD", 40, int)

        # Context
        self.max_context_tokens: int = _env("MAX_CONTEXT_TOKENS", 8000, int)
        self.sql_timeout: str = _env("SQL_TIMEOUT", "10s")

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.__dict__.items() if not k.startswith("_")}


config = Config()

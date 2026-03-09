"""Dictionary builder - assembles all discovery results into data_dictionary.json."""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .schema_inspector import SchemaInspector
from .data_profiler import DataProfiler
from .semantic_classifier import SemanticClassifier
from .relationship_mapper import RelationshipMapper

logger = logging.getLogger(__name__)


class DictionaryBuilder:
    """Combines schema, profiles, semantic types, and relationships into data_dictionary.json."""

    def __init__(self, database_url: str):
        self.database_url = database_url
        self.inspector = SchemaInspector(database_url)
        self.profiler = DataProfiler(database_url)
        self.classifier = SemanticClassifier()
        self.relationship_mapper = RelationshipMapper()

    def build(self, config: dict[str, Any] | None = None) -> dict[str, Any]:
        config = config or {}
        logger.info("Starting data discovery pipeline...")

        # Phase 0.1: Schema inspection
        logger.info("Inspecting schema...")
        schema = self.inspector.inspect()
        logger.info(
            "Found %d tables, %d foreign keys",
            len(schema["tables"]),
            len(schema["foreign_keys"]),
        )

        # Phase 0.2: Data profiling
        logger.info("Profiling tables...")
        profiles = self.profiler.profile_all(schema["tables"], schema["columns"])

        # Phase 0.3: Semantic classification
        logger.info("Classifying column semantics...")
        semantics = self.classifier.classify_all(schema["columns"], profiles)

        # Phase 0.4: Relationship mapping
        logger.info("Mapping relationships...")
        relationships = self.relationship_mapper.map_relationships(schema, profiles)

        # Assemble dictionary
        db_host = self.database_url.split("@")[-1] if "@" in self.database_url else "unknown"
        dictionary: dict[str, Any] = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "database_host": db_host,
            "config": {
                "primary_entity": config.get("PRIMARY_ENTITY", "entity"),
                "group_entity": config.get("GROUP_ENTITY", "group"),
                "domain_description": config.get("DOMAIN_DESCRIPTION", ""),
            },
            "tables": {},
            "relationships": relationships["relationships"],
            "hub_entity": relationships["hub_entity"],
            "entity_graph": relationships["entity_graph"],
            "text_columns": [],
            "numeric_columns": [],
            "time_series_candidates": [],
            "geo_columns": [],
        }

        # Build table entries
        for table_info in schema["tables"]:
            table_name = table_info["table_name"]
            table_cols = schema["columns"].get(table_name, [])
            table_profile = profiles.get(table_name, {})
            table_semantics = semantics.get(table_name, {})
            pks = schema["primary_keys"].get(table_name, [])

            col_entries = {}
            for col_info in table_cols:
                col_name = col_info["column_name"]
                sem_type = table_semantics.get(col_name, "other")
                col_profile = table_profile.get("columns", {}).get(col_name, {})

                is_fk = any(
                    fk["source_column"] == col_name and fk["source_table"] == table_name
                    for fk in relationships["relationships"]
                )

                col_entries[col_name] = {
                    "data_type": col_info["data_type"],
                    "semantic_type": sem_type,
                    "nullable": col_info["is_nullable"] == "YES",
                    "is_primary_key": col_name in pks,
                    "is_foreign_key": is_fk,
                    "profile": col_profile,
                }

                # Collect special columns
                if sem_type == "description":
                    dictionary["text_columns"].append({"table": table_name, "column": col_name})
                if sem_type in ("currency", "count", "score", "percentage", "numeric"):
                    dictionary["numeric_columns"].append({"table": table_name, "column": col_name})
                if sem_type == "date":
                    dictionary["time_series_candidates"].append({"table": table_name, "column": col_name})
                if sem_type == "geo_lat":
                    dictionary["geo_columns"].append({"table": table_name, "column": col_name, "type": "lat"})
                if sem_type == "geo_lng":
                    dictionary["geo_columns"].append({"table": table_name, "column": col_name, "type": "lng"})

            dictionary["tables"][table_name] = {
                "row_count": table_profile.get("row_count", schema["row_counts"].get(table_name, 0)),
                "column_count": len(col_entries),
                "columns": col_entries,
            }

        logger.info(
            "Dictionary built: %d tables, %d relationships, %d text columns, %d numeric columns",
            len(dictionary["tables"]),
            len(dictionary["relationships"]),
            len(dictionary["text_columns"]),
            len(dictionary["numeric_columns"]),
        )

        return dictionary

    def build_and_save(self, config: dict[str, Any] | None = None, output_path: str | None = None) -> dict[str, Any]:
        dictionary = self.build(config)
        path = Path(output_path or "intelligence/data_dictionary.json")
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(dictionary, f, indent=2, default=str)
        logger.info("Data dictionary saved to %s", path)
        return dictionary

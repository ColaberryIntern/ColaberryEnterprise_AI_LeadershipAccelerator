"""Relationship mapping - builds entity-relationship graph from FK and inferred relationships."""

from collections import Counter
from typing import Any


class RelationshipMapper:
    """Maps explicit (FK) and inferred relationships between tables."""

    def map_relationships(
        self,
        schema: dict[str, Any],
        profiles: dict[str, dict],
    ) -> dict[str, Any]:
        relationships = []

        # 1. Explicit: foreign keys from schema
        for fk in schema.get("foreign_keys", []):
            relationships.append({
                "type": "explicit_fk",
                "source_table": fk["source_table"],
                "source_column": fk["source_column"],
                "target_table": fk["target_table"],
                "target_column": fk["target_column"],
                "confidence": 1.0,
            })

        # 2. Inferred: columns named "{table}_id" that match another table
        all_tables = {t["table_name"] for t in schema.get("tables", [])}
        explicit_pairs = {
            (r["source_table"], r["source_column"])
            for r in relationships
        }

        columns = schema.get("columns", {})
        for table_name, table_cols in columns.items():
            for col_info in table_cols:
                col_name = col_info["column_name"]
                if not col_name.endswith("_id"):
                    continue
                if (table_name, col_name) in explicit_pairs:
                    continue

                candidate = col_name[:-3]  # strip "_id"
                target_table = None
                if candidate in all_tables:
                    target_table = candidate
                elif f"{candidate}s" in all_tables:
                    target_table = f"{candidate}s"
                elif f"{candidate}es" in all_tables:
                    target_table = f"{candidate}es"

                if target_table and target_table != table_name:
                    relationships.append({
                        "type": "inferred",
                        "source_table": table_name,
                        "source_column": col_name,
                        "target_table": target_table,
                        "target_column": "id",
                        "confidence": 0.8,
                    })

        hub_entity = self._detect_hub_entity(relationships)
        entity_graph = self._build_adjacency_list(relationships)

        return {
            "relationships": relationships,
            "hub_entity": hub_entity,
            "entity_graph": entity_graph,
        }

    def _detect_hub_entity(self, relationships: list[dict]) -> str | None:
        """The hub entity is the table most referenced by foreign keys."""
        inbound = Counter()
        for rel in relationships:
            inbound[rel["target_table"]] += 1
        if not inbound:
            return None
        return inbound.most_common(1)[0][0]

    def _build_adjacency_list(self, relationships: list[dict]) -> dict[str, list[str]]:
        graph: dict[str, list[str]] = {}
        for rel in relationships:
            src = rel["source_table"]
            tgt = rel["target_table"]
            if src not in graph:
                graph[src] = []
            if tgt not in graph[src]:
                graph[src].append(tgt)
            if tgt not in graph:
                graph[tgt] = []
            if src not in graph[tgt]:
                graph[tgt].append(src)
        return graph

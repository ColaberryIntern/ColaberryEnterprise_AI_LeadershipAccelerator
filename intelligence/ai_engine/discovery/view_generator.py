"""View generator - auto-generates materialized view SQL from data dictionary."""

from typing import Any


class ViewGenerator:
    """Auto-generates materialized view SQL from the data dictionary."""

    def generate_all(self, dictionary: dict[str, Any]) -> list[str]:
        statements: list[str] = []

        hub = dictionary.get("hub_entity")
        if hub and hub in dictionary.get("tables", {}):
            perf_view = self._generate_performance_view(dictionary, hub)
            if perf_view:
                statements.append(perf_view)

        return statements

    def _generate_performance_view(self, dictionary: dict[str, Any], hub_table: str) -> str | None:
        hub_cols = dictionary["tables"][hub_table]["columns"]

        # Find PK and name column
        pk_col = None
        name_col = None
        for col_name, col_info in hub_cols.items():
            if col_info["is_primary_key"]:
                pk_col = col_name
            if col_info["semantic_type"] == "name" and not name_col:
                name_col = col_name

        if not pk_col:
            return None

        # Build SELECT columns
        select_parts = [f'  h."{pk_col}" AS entity_id']
        if name_col:
            select_parts.append(f'  h."{name_col}" AS entity_name')

        # Add numeric columns from hub table
        for col_name, col_info in hub_cols.items():
            if col_info["semantic_type"] in ("currency", "count", "score", "percentage"):
                if col_name not in (pk_col, name_col):
                    select_parts.append(f'  h."{col_name}"')

        config = dictionary.get("config", {})
        entity = config.get("primary_entity", "entity")
        view_name = f"{entity}_performance_features"

        select_clause = ",\n".join(select_parts)
        sql = f"""CREATE MATERIALIZED VIEW IF NOT EXISTS {view_name} AS
SELECT
{select_clause}
FROM "{hub_table}" h;

CREATE UNIQUE INDEX IF NOT EXISTS idx_{view_name}_entity_id
  ON {view_name} (entity_id);
"""
        return sql

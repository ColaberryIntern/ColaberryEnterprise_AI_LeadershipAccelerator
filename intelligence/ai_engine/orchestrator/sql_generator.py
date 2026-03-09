"""Auto-generates parameterized SQL templates from data dictionary."""

from typing import Any


class SQLGenerator:
    """Generates common SQL query templates from the data dictionary."""

    def __init__(self, dictionary: dict[str, Any]):
        self.dictionary = dictionary
        self.hub = dictionary.get("hub_entity")

    def entity_summary_query(self, entity_id: str | None = None) -> str:
        """Generate a query for entity-level summary stats."""
        if not self.hub:
            return ""

        hub_info = self.dictionary["tables"].get(self.hub, {})
        cols = hub_info.get("columns", {})

        pk_col = None
        name_col = None
        numeric_cols = []

        for col_name, col_info in cols.items():
            if col_info.get("is_primary_key"):
                pk_col = col_name
            if col_info.get("semantic_type") == "name" and not name_col:
                name_col = col_name
            if col_info.get("semantic_type") in ("currency", "count", "score", "percentage"):
                numeric_cols.append(col_name)

        if not pk_col:
            return ""

        select_parts = [f'"{pk_col}"']
        if name_col:
            select_parts.append(f'"{name_col}"')
        select_parts.extend(f'"{c}"' for c in numeric_cols)

        sql = f'SELECT {", ".join(select_parts)} FROM "{self.hub}"'
        if entity_id:
            sql += f" WHERE \"{pk_col}\" = '{entity_id}'"
        sql += " LIMIT 1000"
        return sql

    def aggregation_query(self, table: str, group_col: str, agg_col: str, agg_func: str = "SUM") -> str:
        """Generate a grouped aggregation query."""
        return f'''SELECT "{group_col}", {agg_func}("{agg_col}") AS {agg_func.lower()}_{agg_col}
FROM "{table}"
WHERE "{agg_col}" IS NOT NULL
GROUP BY "{group_col}"
ORDER BY {agg_func.lower()}_{agg_col} DESC
LIMIT 100'''

    def time_series_query(self, table: str, date_col: str, value_col: str, agg_func: str = "SUM") -> str:
        """Generate a time-series aggregation query."""
        return f'''SELECT "{date_col}"::date AS period, {agg_func}("{value_col}") AS value
FROM "{table}"
WHERE "{date_col}" IS NOT NULL AND "{value_col}" IS NOT NULL
GROUP BY "{date_col}"::date
ORDER BY period
LIMIT 1000'''

    def relationship_join_query(self, source_table: str, target_table: str) -> str:
        """Generate a JOIN query between related tables."""
        relationships = self.dictionary.get("relationships", [])
        for rel in relationships:
            if rel["source_table"] == source_table and rel["target_table"] == target_table:
                return f'''SELECT s.*, t.*
FROM "{source_table}" s
JOIN "{target_table}" t ON s."{rel['source_column']}" = t."{rel['target_column']}"
LIMIT 1000'''
            if rel["source_table"] == target_table and rel["target_table"] == source_table:
                return f'''SELECT s.*, t.*
FROM "{source_table}" s
JOIN "{target_table}" t ON t."{rel['source_column']}" = s."{rel['target_column']}"
LIMIT 1000'''
        return ""

    def get_table_schema_description(self, table: str | None = None) -> str:
        """Get human-readable schema description for LLM context."""
        tables = self.dictionary.get("tables", {})
        if table:
            tables = {table: tables[table]} if table in tables else {}

        parts = []
        for tname, tinfo in tables.items():
            cols_desc = []
            for cname, cinfo in tinfo.get("columns", {}).items():
                flags = []
                if cinfo.get("is_primary_key"):
                    flags.append("PK")
                if cinfo.get("is_foreign_key"):
                    flags.append("FK")
                flag_str = f" [{', '.join(flags)}]" if flags else ""
                cols_desc.append(f"  - {cname} ({cinfo['data_type']}, {cinfo['semantic_type']}){flag_str}")
            parts.append(f"Table: {tname} ({tinfo.get('row_count', '?')} rows)\n" + "\n".join(cols_desc))

        return "\n\n".join(parts)

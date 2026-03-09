"""Data profiling - samples data and computes column-level statistics."""

from typing import Any

import psycopg2
import psycopg2.extras


class DataProfiler:
    """Profiles each table: cardinality, distributions, null rates, samples."""

    def __init__(self, database_url: str):
        self.database_url = database_url

    def _connect(self):
        return psycopg2.connect(self.database_url)

    def profile_all(self, tables: list[dict], columns: dict[str, list[dict]]) -> dict[str, dict]:
        result = {}
        for table_info in tables:
            table_name = table_info["table_name"]
            if table_info.get("table_type") == "VIEW":
                continue
            table_cols = columns.get(table_name, [])
            result[table_name] = self.profile_table(table_name, table_cols)
        return result

    def profile_table(self, table_name: str, columns: list[dict]) -> dict[str, Any]:
        with self._connect() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(f"SELECT COUNT(*) AS cnt FROM \"{table_name}\";")
                row_count = cur.fetchone()["cnt"]

                col_profiles = {}
                for col in columns:
                    col_name = col["column_name"]
                    data_type = col["data_type"]
                    col_profiles[col_name] = self._profile_column(
                        cur, table_name, col_name, data_type, row_count
                    )

                return {"row_count": row_count, "columns": col_profiles}

    def _profile_column(
        self, cur, table_name: str, col_name: str, data_type: str, total: int
    ) -> dict[str, Any]:
        safe_col = f'"{col_name}"'
        safe_table = f'"{table_name}"'

        profile: dict[str, Any] = {"data_type": data_type}

        # Null count and distinct count
        cur.execute(f"""
            SELECT
                COUNT(*) - COUNT({safe_col}) AS null_count,
                COUNT(DISTINCT {safe_col}) AS distinct_count
            FROM {safe_table};
        """)
        stats = cur.fetchone()
        profile["null_count"] = stats["null_count"]
        profile["null_rate"] = round(stats["null_count"] / total, 4) if total > 0 else 0
        profile["distinct_count"] = stats["distinct_count"]
        profile["cardinality_ratio"] = round(stats["distinct_count"] / total, 4) if total > 0 else 0
        profile["is_unique"] = stats["distinct_count"] == total and total > 0

        # Numeric stats
        if data_type in ("integer", "bigint", "smallint", "numeric", "real", "double precision"):
            try:
                cur.execute(f"""
                    SELECT
                        MIN({safe_col})::float AS min_val,
                        MAX({safe_col})::float AS max_val,
                        AVG({safe_col})::float AS mean_val,
                        STDDEV({safe_col})::float AS std_val,
                        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY {safe_col})::float AS median_val
                    FROM {safe_table}
                    WHERE {safe_col} IS NOT NULL;
                """)
                num_stats = cur.fetchone()
                if num_stats:
                    profile["min"] = num_stats["min_val"]
                    profile["max"] = num_stats["max_val"]
                    profile["mean"] = round(num_stats["mean_val"], 4) if num_stats["mean_val"] else None
                    profile["std"] = round(num_stats["std_val"], 4) if num_stats["std_val"] else None
                    profile["median"] = num_stats["median_val"]
            except Exception:
                pass

        # Text stats
        if data_type in ("character varying", "text", "character"):
            try:
                cur.execute(f"""
                    SELECT
                        AVG(LENGTH({safe_col}))::float AS avg_length,
                        MAX(LENGTH({safe_col})) AS max_length
                    FROM {safe_table}
                    WHERE {safe_col} IS NOT NULL;
                """)
                txt = cur.fetchone()
                if txt:
                    profile["avg_text_length"] = round(txt["avg_length"], 1) if txt["avg_length"] else 0
                    profile["max_text_length"] = txt["max_length"]
                    profile["looks_like_name"] = (
                        profile["is_unique"]
                        and profile.get("avg_text_length", 0) < 80
                    )
                    profile["looks_like_description"] = profile.get("avg_text_length", 0) > 50
            except Exception:
                pass

        # Top values (for categorical detection)
        if stats["distinct_count"] <= 100 and stats["distinct_count"] > 0:
            try:
                cur.execute(f"""
                    SELECT {safe_col}::text AS val, COUNT(*) AS freq
                    FROM {safe_table}
                    WHERE {safe_col} IS NOT NULL
                    GROUP BY {safe_col}
                    ORDER BY freq DESC
                    LIMIT 10;
                """)
                profile["top_values"] = [
                    {"value": r["val"], "count": r["freq"]} for r in cur.fetchall()
                ]
            except Exception:
                profile["top_values"] = []

        # Sample values
        try:
            cur.execute(f"""
                SELECT {safe_col}::text AS val
                FROM {safe_table}
                WHERE {safe_col} IS NOT NULL
                ORDER BY RANDOM()
                LIMIT 5;
            """)
            profile["sample_values"] = [r["val"] for r in cur.fetchall()]
        except Exception:
            profile["sample_values"] = []

        return profile

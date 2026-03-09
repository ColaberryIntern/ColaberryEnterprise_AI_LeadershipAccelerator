"""Schema introspection - discovers all tables, columns, types, constraints, and indexes."""

from typing import Any

import psycopg2
import psycopg2.extras


class SchemaInspector:
    """Discovers all tables, columns, types, constraints, and indexes from PostgreSQL."""

    def __init__(self, database_url: str):
        self.database_url = database_url

    def _connect(self):
        return psycopg2.connect(self.database_url)

    def inspect(self) -> dict[str, Any]:
        return {
            "tables": self._get_tables(),
            "columns": self._get_columns(),
            "foreign_keys": self._get_foreign_keys(),
            "primary_keys": self._get_primary_keys(),
            "unique_constraints": self._get_unique_constraints(),
            "indexes": self._get_indexes(),
            "views": self._get_views(),
            "materialized_views": self._get_materialized_views(),
            "extensions": self._get_extensions(),
            "row_counts": self._get_row_counts(),
        }

    def _get_tables(self) -> list[dict]:
        sql = """
            SELECT table_name, table_type
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type IN ('BASE TABLE', 'VIEW')
            ORDER BY table_name;
        """
        with self._connect() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql)
                return [dict(r) for r in cur.fetchall()]

    def _get_columns(self) -> dict[str, list[dict]]:
        sql = """
            SELECT table_name, column_name, ordinal_position, data_type,
                   udt_name, is_nullable, column_default,
                   character_maximum_length, numeric_precision, numeric_scale
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position;
        """
        result: dict[str, list[dict]] = {}
        with self._connect() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql)
                for row in cur.fetchall():
                    table = row["table_name"]
                    if table not in result:
                        result[table] = []
                    result[table].append(dict(row))
        return result

    def _get_foreign_keys(self) -> list[dict]:
        sql = """
            SELECT
                tc.table_name AS source_table,
                kcu.column_name AS source_column,
                ccu.table_name AS target_table,
                ccu.column_name AS target_column,
                tc.constraint_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
                ON tc.constraint_name = ccu.constraint_name
                AND tc.table_schema = ccu.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = 'public';
        """
        with self._connect() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql)
                return [dict(r) for r in cur.fetchall()]

    def _get_primary_keys(self) -> dict[str, list[str]]:
        sql = """
            SELECT tc.table_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_schema = 'public';
        """
        result: dict[str, list[str]] = {}
        with self._connect() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql)
                for row in cur.fetchall():
                    table = row["table_name"]
                    if table not in result:
                        result[table] = []
                    result[table].append(row["column_name"])
        return result

    def _get_unique_constraints(self) -> dict[str, list[str]]:
        sql = """
            SELECT tc.table_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'UNIQUE'
              AND tc.table_schema = 'public';
        """
        result: dict[str, list[str]] = {}
        with self._connect() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql)
                for row in cur.fetchall():
                    table = row["table_name"]
                    if table not in result:
                        result[table] = []
                    result[table].append(row["column_name"])
        return result

    def _get_indexes(self) -> list[dict]:
        sql = """
            SELECT tablename, indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
            ORDER BY tablename, indexname;
        """
        with self._connect() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql)
                return [dict(r) for r in cur.fetchall()]

    def _get_views(self) -> list[str]:
        sql = """
            SELECT table_name FROM information_schema.views
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """
        with self._connect() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql)
                return [r["table_name"] for r in cur.fetchall()]

    def _get_materialized_views(self) -> list[str]:
        sql = """
            SELECT matviewname FROM pg_matviews
            WHERE schemaname = 'public'
            ORDER BY matviewname;
        """
        with self._connect() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql)
                return [r["matviewname"] for r in cur.fetchall()]

    def _get_extensions(self) -> list[dict]:
        sql = "SELECT extname, extversion FROM pg_extension;"
        with self._connect() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql)
                return [dict(r) for r in cur.fetchall()]

    def _get_row_counts(self) -> dict[str, int]:
        sql = """
            SELECT relname AS table_name, reltuples::bigint AS approximate_row_count
            FROM pg_class
            WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
              AND relkind = 'r';
        """
        with self._connect() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql)
                return {r["table_name"]: r["approximate_row_count"] for r in cur.fetchall()}

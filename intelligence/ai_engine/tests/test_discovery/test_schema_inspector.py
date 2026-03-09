"""Tests for schema inspector (mocked DB)."""

from unittest.mock import patch, MagicMock
from intelligence.ai_engine.discovery.schema_inspector import SchemaInspector


class TestSchemaInspector:
    def setup_method(self):
        self.inspector = SchemaInspector("postgresql://test:test@localhost/testdb")

    @patch("intelligence.ai_engine.discovery.schema_inspector.psycopg2.connect")
    def test_inspect_returns_structure(self, mock_connect):
        mock_conn = MagicMock()
        mock_connect.return_value.__enter__ = MagicMock(return_value=mock_conn)
        mock_connect.return_value.__exit__ = MagicMock(return_value=False)

        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        # Mock the various queries
        mock_cursor.fetchall.side_effect = [
            # tables
            [{"table_name": "users", "table_type": "BASE TABLE"}],
            # columns
            [{"table_name": "users", "column_name": "id", "data_type": "uuid", "is_nullable": "NO", "column_default": None}],
            # foreign_keys
            [],
            # primary_keys
            [{"table_name": "users", "column_name": "id"}],
            # unique_constraints
            [],
            # indexes
            [],
            # views
            [],
            # materialized_views
            [],
            # extensions
            [{"extname": "uuid-ossp"}],
            # row_counts - individual query per table
            [{"cnt": 100}],
        ]

        result = self.inspector.inspect()
        assert "tables" in result
        assert "columns" in result
        assert "foreign_keys" in result
        assert "primary_keys" in result
        assert len(result["tables"]) == 1
        assert result["tables"][0]["table_name"] == "users"

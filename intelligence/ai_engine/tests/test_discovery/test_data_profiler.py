"""Tests for data profiler (mocked DB)."""

from unittest.mock import patch, MagicMock
from intelligence.ai_engine.discovery.data_profiler import DataProfiler


class TestDataProfiler:
    def setup_method(self):
        self.profiler = DataProfiler("postgresql://test:test@localhost/testdb")

    @patch("intelligence.ai_engine.discovery.data_profiler.psycopg2.connect")
    def test_profile_table(self, mock_connect):
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)

        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        # row count query
        mock_cursor.fetchone.side_effect = [
            {"cnt": 100},
            # null/distinct for col1
            {"null_count": 0, "distinct_count": 100},
            # numeric stats for col1
            {"min_val": 1.0, "max_val": 100.0, "mean_val": 50.0, "std_val": 28.0, "median_val": 50.0},
        ]
        mock_cursor.fetchall.side_effect = [
            # top_values (distinct_count <= 100)
            [{"val": "1", "freq": 1}],
            # sample_values
            [{"val": "42"}],
        ]

        columns = [{"column_name": "score", "data_type": "integer"}]
        result = self.profiler.profile_table("test_table", columns)
        assert result["row_count"] == 100
        assert "score" in result["columns"]
        assert result["columns"]["score"]["is_unique"]

    def test_profile_all_skips_views(self):
        tables = [
            {"table_name": "real_table", "table_type": "BASE TABLE"},
            {"table_name": "my_view", "table_type": "VIEW"},
        ]
        columns = {
            "real_table": [],
            "my_view": [],
        }
        with patch.object(self.profiler, "profile_table", return_value={"row_count": 0, "columns": {}}) as mock_profile:
            result = self.profiler.profile_all(tables, columns)
            mock_profile.assert_called_once_with("real_table", [])
            assert "my_view" not in result

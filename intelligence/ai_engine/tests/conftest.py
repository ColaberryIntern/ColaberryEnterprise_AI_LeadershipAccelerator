"""Shared test fixtures for Intelligence OS tests."""

import pytest


@pytest.fixture
def sample_schema():
    """Minimal schema structure returned by SchemaInspector."""
    return {
        "tables": [
            {"table_name": "leads", "table_type": "BASE TABLE"},
            {"table_name": "campaigns", "table_type": "BASE TABLE"},
            {"table_name": "campaign_leads", "table_type": "BASE TABLE"},
        ],
        "columns": {
            "leads": [
                {"column_name": "id", "data_type": "uuid", "is_nullable": "NO"},
                {"column_name": "name", "data_type": "character varying", "is_nullable": "NO"},
                {"column_name": "email", "data_type": "character varying", "is_nullable": "YES"},
                {"column_name": "revenue", "data_type": "numeric", "is_nullable": "YES"},
                {"column_name": "created_at", "data_type": "timestamp with time zone", "is_nullable": "YES"},
                {"column_name": "status", "data_type": "character varying", "is_nullable": "YES"},
            ],
            "campaigns": [
                {"column_name": "id", "data_type": "uuid", "is_nullable": "NO"},
                {"column_name": "campaign_name", "data_type": "character varying", "is_nullable": "NO"},
                {"column_name": "budget", "data_type": "numeric", "is_nullable": "YES"},
                {"column_name": "open_rate", "data_type": "numeric", "is_nullable": "YES"},
                {"column_name": "created_at", "data_type": "timestamp with time zone", "is_nullable": "YES"},
            ],
            "campaign_leads": [
                {"column_name": "id", "data_type": "uuid", "is_nullable": "NO"},
                {"column_name": "campaign_id", "data_type": "uuid", "is_nullable": "NO"},
                {"column_name": "lead_id", "data_type": "uuid", "is_nullable": "NO"},
                {"column_name": "enrolled_at", "data_type": "timestamp with time zone", "is_nullable": "YES"},
            ],
        },
        "foreign_keys": [
            {
                "source_table": "campaign_leads",
                "source_column": "campaign_id",
                "target_table": "campaigns",
                "target_column": "id",
            },
            {
                "source_table": "campaign_leads",
                "source_column": "lead_id",
                "target_table": "leads",
                "target_column": "id",
            },
        ],
        "primary_keys": {
            "leads": ["id"],
            "campaigns": ["id"],
            "campaign_leads": ["id"],
        },
        "row_counts": {"leads": 500, "campaigns": 20, "campaign_leads": 2000},
        "unique_constraints": {},
        "indexes": {},
        "views": [],
        "materialized_views": [],
        "extensions": [],
    }


@pytest.fixture
def sample_profiles():
    """Minimal profile data returned by DataProfiler."""
    return {
        "leads": {
            "row_count": 500,
            "columns": {
                "id": {"data_type": "uuid", "null_count": 0, "null_rate": 0, "distinct_count": 500, "cardinality_ratio": 1.0, "is_unique": True},
                "name": {"data_type": "character varying", "null_count": 0, "null_rate": 0, "distinct_count": 498, "cardinality_ratio": 0.996, "is_unique": False, "avg_text_length": 18.5, "max_text_length": 45, "looks_like_name": True, "looks_like_description": False},
                "email": {"data_type": "character varying", "null_count": 5, "null_rate": 0.01, "distinct_count": 495, "cardinality_ratio": 0.99, "is_unique": False, "avg_text_length": 24.2, "max_text_length": 60, "looks_like_name": False, "looks_like_description": False},
                "revenue": {"data_type": "numeric", "null_count": 50, "null_rate": 0.1, "distinct_count": 200, "cardinality_ratio": 0.4, "is_unique": False, "min": 0, "max": 50000, "mean": 5000, "std": 8000, "median": 2500},
                "created_at": {"data_type": "timestamp with time zone", "null_count": 0, "null_rate": 0, "distinct_count": 490, "cardinality_ratio": 0.98, "is_unique": False},
                "status": {"data_type": "character varying", "null_count": 0, "null_rate": 0, "distinct_count": 5, "cardinality_ratio": 0.01, "is_unique": False, "avg_text_length": 8, "max_text_length": 12, "looks_like_name": False, "looks_like_description": False},
            },
        },
        "campaigns": {
            "row_count": 20,
            "columns": {
                "id": {"data_type": "uuid", "null_count": 0, "null_rate": 0, "distinct_count": 20, "cardinality_ratio": 1.0, "is_unique": True},
                "campaign_name": {"data_type": "character varying", "null_count": 0, "null_rate": 0, "distinct_count": 20, "cardinality_ratio": 1.0, "is_unique": True, "avg_text_length": 25, "max_text_length": 60, "looks_like_name": True, "looks_like_description": False},
                "budget": {"data_type": "numeric", "null_count": 2, "null_rate": 0.1, "distinct_count": 18, "cardinality_ratio": 0.9, "is_unique": False, "min": 500, "max": 50000, "mean": 10000, "std": 12000, "median": 5000},
                "open_rate": {"data_type": "numeric", "null_count": 0, "null_rate": 0, "distinct_count": 20, "cardinality_ratio": 1.0, "is_unique": True, "min": 0.05, "max": 0.65, "mean": 0.25, "std": 0.15, "median": 0.22},
                "created_at": {"data_type": "timestamp with time zone", "null_count": 0, "null_rate": 0, "distinct_count": 20, "cardinality_ratio": 1.0, "is_unique": True},
            },
        },
        "campaign_leads": {
            "row_count": 2000,
            "columns": {
                "id": {"data_type": "uuid", "null_count": 0, "null_rate": 0, "distinct_count": 2000, "cardinality_ratio": 1.0, "is_unique": True},
                "campaign_id": {"data_type": "uuid", "null_count": 0, "null_rate": 0, "distinct_count": 20, "cardinality_ratio": 0.01, "is_unique": False},
                "lead_id": {"data_type": "uuid", "null_count": 0, "null_rate": 0, "distinct_count": 450, "cardinality_ratio": 0.225, "is_unique": False},
                "enrolled_at": {"data_type": "timestamp with time zone", "null_count": 0, "null_rate": 0, "distinct_count": 1800, "cardinality_ratio": 0.9, "is_unique": False},
            },
        },
    }

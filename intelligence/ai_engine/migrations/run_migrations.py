"""Run SQL migrations in order against the configured database."""

import logging
import sys
from pathlib import Path

import psycopg2

logger = logging.getLogger(__name__)


def run_migrations(database_url: str) -> list[str]:
    """Execute all .sql migration files in order."""
    migrations_dir = Path(__file__).parent
    sql_files = sorted(migrations_dir.glob("*.sql"))

    if not sql_files:
        logger.info("No migration files found.")
        return []

    applied: list[str] = []
    conn = psycopg2.connect(database_url)
    conn.autocommit = True

    try:
        with conn.cursor() as cur:
            for sql_file in sql_files:
                logger.info("Applying migration: %s", sql_file.name)
                sql = sql_file.read_text()
                try:
                    cur.execute(sql)
                    applied.append(sql_file.name)
                    logger.info("Applied: %s", sql_file.name)
                except Exception as e:
                    logger.warning("Migration %s failed (may already be applied): %s", sql_file.name, e)
    finally:
        conn.close()

    return applied


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    if len(sys.argv) < 2:
        print("Usage: python run_migrations.py <DATABASE_URL>")
        sys.exit(1)
    run_migrations(sys.argv[1])

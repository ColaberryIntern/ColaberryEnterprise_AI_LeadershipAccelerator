"""SQL sanitization - ensures only read-only queries are executed."""

import re
import logging

logger = logging.getLogger(__name__)

BLOCKED_KEYWORDS = [
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE",
    "GRANT", "REVOKE", "COPY", "EXECUTE", "CALL",
]

BLOCKED_PATTERN = re.compile(
    r"\b(" + "|".join(BLOCKED_KEYWORDS) + r")\b",
    re.IGNORECASE,
)


class SQLSanitizer:
    """Validates SQL queries are read-only."""

    @staticmethod
    def validate(sql: str) -> tuple[bool, str]:
        """Validate a SQL query. Returns (is_valid, error_message)."""
        if not sql or not sql.strip():
            return False, "Empty SQL query"

        cleaned = SQLSanitizer._strip_comments(sql).strip()

        if not cleaned.upper().startswith("SELECT") and not cleaned.upper().startswith("WITH"):
            return False, "Only SELECT and WITH (CTE) queries are allowed"

        match = BLOCKED_PATTERN.search(cleaned)
        if match:
            return False, f"Blocked keyword found: {match.group()}"

        if ";" in cleaned[:-1]:
            return False, "Multiple statements not allowed"

        return True, ""

    @staticmethod
    def sanitize(sql: str) -> str | None:
        """Validate and return sanitized SQL, or None if invalid."""
        is_valid, error = SQLSanitizer.validate(sql)
        if not is_valid:
            logger.warning("SQL rejected: %s — Query: %s", error, sql[:200])
            return None

        cleaned = SQLSanitizer._strip_comments(sql).strip().rstrip(";")

        if "LIMIT" not in cleaned.upper():
            cleaned += " LIMIT 1000"

        return cleaned

    @staticmethod
    def _strip_comments(sql: str) -> str:
        sql = re.sub(r"--.*$", "", sql, flags=re.MULTILINE)
        sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.DOTALL)
        return sql

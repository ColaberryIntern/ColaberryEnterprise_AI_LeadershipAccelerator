"""Token-budgeted context builder for LLM prompts."""

import json
from typing import Any

TOKEN_BUDGET = 8000
CHARS_PER_TOKEN = 4


class ContextBuilder:
    """Builds token-budgeted context strings for LLM prompts."""

    def __init__(self, budget: int = TOKEN_BUDGET):
        self.budget_chars = budget * CHARS_PER_TOKEN

    def build_dictionary_summary(self, dictionary: dict[str, Any]) -> str:
        """Summarize the data dictionary within token budget."""
        parts = []
        tables = dictionary.get("tables", {})
        hub = dictionary.get("hub_entity", "")
        config = dictionary.get("config", {})

        parts.append(f"Domain: {config.get('domain_description', 'Unknown')}")
        parts.append(f"Primary entity: {config.get('primary_entity', 'entity')}")
        parts.append(f"Hub table: {hub}")
        parts.append(f"Total tables: {len(tables)}")
        parts.append("")

        # Prioritize hub entity table first
        if hub and hub in tables:
            parts.append(self._summarize_table(hub, tables[hub], is_hub=True))

        # Then other tables
        for tname, tinfo in tables.items():
            if tname == hub:
                continue
            summary = self._summarize_table(tname, tinfo)
            if self._char_count(parts) + len(summary) > self.budget_chars:
                parts.append(f"... and {len(tables) - len(parts) + 4} more tables")
                break
            parts.append(summary)

        # Relationships
        rels = dictionary.get("relationships", [])
        if rels:
            parts.append(f"\nRelationships ({len(rels)}):")
            for rel in rels[:10]:
                parts.append(f"  {rel['source_table']}.{rel['source_column']} -> {rel['target_table']}.{rel['target_column']} ({rel['type']})")

        return "\n".join(parts)

    def build_results_context(self, results: dict[str, Any]) -> str:
        """Format query results within token budget."""
        output = json.dumps(results, default=str, indent=2)
        if len(output) > self.budget_chars:
            output = output[: self.budget_chars - 100] + "\n... [truncated]"
        return output

    def format_value(self, value: Any, semantic_type: str) -> str:
        """Format a value based on its semantic type."""
        if value is None:
            return "N/A"
        if semantic_type == "currency":
            return f"${value:,.2f}" if isinstance(value, (int, float)) else str(value)
        if semantic_type == "percentage":
            return f"{value:.1%}" if isinstance(value, float) and value <= 1 else f"{value}%"
        if semantic_type == "count":
            return f"{value:,}" if isinstance(value, (int, float)) else str(value)
        return str(value)

    def _summarize_table(self, name: str, info: dict, is_hub: bool = False) -> str:
        hub_marker = " [HUB]" if is_hub else ""
        cols = info.get("columns", {})
        col_summaries = []
        for cname, cinfo in cols.items():
            flags = []
            if cinfo.get("is_primary_key"):
                flags.append("PK")
            if cinfo.get("is_foreign_key"):
                flags.append("FK")
            sem = cinfo.get("semantic_type", "other")
            flag_str = f" [{','.join(flags)}]" if flags else ""
            col_summaries.append(f"    {cname} ({cinfo['data_type']}, {sem}){flag_str}")
        return f"Table: {name}{hub_marker} ({info.get('row_count', '?')} rows)\n" + "\n".join(col_summaries)

    @staticmethod
    def _char_count(parts: list[str]) -> int:
        return sum(len(p) for p in parts)

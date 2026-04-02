# Data Analyst Agent

## Purpose
Deterministic validation agent that enriches SQL query results with business-friendly labels, coerces PostgreSQL string-typed numbers to actual numbers, filters garbage rows, strips internal columns, and translates raw column names in insights to business language. No LLM calls - pure functions with sub-2ms latency.

## Department
Assistant | Data Enrichment

## Status
Live | Trigger: event (invoked during query response assembly)

## Input
- List of `SqlResult` objects (rows of raw database query results)
- List of `Insight` objects (analytical findings with raw metric names)

## Output
- Enriched `SqlResult` list with:
  - Numeric string values coerced to numbers
  - Internal columns stripped (id, uuid, created_by, etc.)
  - Garbage rows removed (all-zero or all-null numeric values)
- Enriched `Insight` list with:
  - Raw column names replaced by business labels in messages
  - Metric fields translated to business-friendly names

## How It Works
1. **Strip internal columns**: Removes columns not useful for display (id, uuid, created_by, updated_by, deleted_at, and most _id columns)
2. **Coerce numeric strings**: PostgreSQL returns bigint COUNT/SUM results as strings. The agent identifies numeric-looking strings in known aggregate columns (_count, _total, value, amount, score, etc.) and converts them to actual JavaScript numbers
3. **Filter garbage rows**: Removes rows where all numeric values are zero or null, keeping only rows with at least one positive value
4. **Enrich insight labels**: Scans insight messages for raw column names (e.g., "error_count", "avg_duration_ms") and replaces them with business labels (e.g., "Errors", "Avg Duration (ms)")
5. **Business dictionary**: Maintains a 100+ entry mapping of raw column names to labels covering counts, rates, scores, financial fields, entity fields, statuses, and time fields

## Use Cases
- **Business Intelligence**: Ensures query results display "Total Leads" instead of "lead_count" in reports and dashboards
- **Executive Reporting**: Removes technical database artifacts from insights before presenting to non-technical stakeholders
- **Data Quality**: Filters out meaningless zero-value rows that would clutter charts and tables

## Integration Points
- Invoked by the **Query Engine** during response assembly
- **Chart Validation Agent** uses `getBusinessLabel` for chart title generation
- **Report Quality Agent** uses `getBusinessLabel` for insight enrichment
- Business dictionary is the single source of truth for column name translation across the assistant layer

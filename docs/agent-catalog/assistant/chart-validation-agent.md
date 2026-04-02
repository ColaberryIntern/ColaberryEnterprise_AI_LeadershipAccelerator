# Chart Validation Agent

## Purpose
Deterministic validation agent that ensures every chart has the correct type for its data shape and the correct configuration keys for its frontend component. Validates data fitness, normalizes config keys across 15+ chart types, applies business-friendly titles, removes empty charts, and ensures a minimum chart count. No LLM calls - pure functions with sub-2ms latency.

## Department
Assistant | Data Visualization Quality

## Status
Live | Trigger: event (invoked during query response assembly)

## Input
- List of `ChartConfig` objects (type, title, data, labelKey, valueKey)
- List of `SqlResult` objects (for synthesizing additional charts if needed)

## Output
- Validated and normalized list of `ChartConfig` objects (max 4 charts), each with:
  - Correct chart type for the data shape
  - Normalized frontend config keys
  - Business-friendly title
  - Non-empty, non-zero data

## How It Works
1. **Data shape validation**: Checks each chart against shape rules (minimum/maximum rows, required numeric columns). Demotes charts to "bar" type if their data does not fit the selected type (e.g., radar requires 3 to 8 rows).
2. **Config key normalization**: Maps each chart type to its frontend component's expected config keys. For example, a bar chart gets `x_axis`, `xKey`, `category`, `y_axes`, and `bars` keys. This is the core fix for empty-rendering charts.
3. **Business title cleanup**: Replaces technical titles (SQL fragments, query references) with business-friendly labels using the data analyst dictionary.
4. **Empty chart removal**: Filters out charts with no data or all-zero values.
5. **Minimum chart guarantee**: If fewer than 2 charts remain, synthesizes additional bar charts from SQL results by finding string/numeric column pairs.
6. Caps output at 4 charts maximum.

## Supported Chart Types
bar, radar, line, combo, waterfall, heatmap, scatter, risk_matrix, treemap, funnel, network, forecast_cone, cluster, geo, decomposition_tree

## Use Cases
- **Business Intelligence**: Ensures dashboard charts always render correctly regardless of data shape variations
- **Education Analytics**: Validates student performance charts have appropriate visualization types for the data
- **Executive Reporting**: Guarantees professional, business-friendly chart titles instead of technical column names

## Integration Points
- Invoked by the **Query Engine** during response assembly
- Uses **Data Analyst Agent** (`getBusinessLabel`) for title generation
- Reads `SqlResult` data for chart synthesis fallback
- Normalized config is extracted via `extractNormalizedConfig` by the query engine

# Report Quality Agent

## Purpose
Final quality gate that validates narrative content, filters technical terms from all user-facing text, ensures minimum insight counts, validates recommendations, and scores overall report quality on a 0-to-100 scale. No LLM calls - pure functions with sub-2ms latency.

## Department
Assistant | Report Quality Assurance

## Status
Live | Trigger: event (invoked as the last step in query response assembly)

## Input
- `AssistantResponse` object containing narrative, narrative sections, insights, visualizations, and recommendations
- Optional `SqlResult` list for synthesizing additional insights if needed

## Output
- Validated `AssistantResponse` with:
  - Technical terms filtered from all narrative text
  - Minimum 3 insights guaranteed (synthesized from SQL if needed)
  - Recommendations validated for business relevance
  - All insight messages cleaned of technical language

## How It Works
1. **Technical term filtering**: Applies 20+ regex-based replacements to remove or translate technical terms:
   - Database terms (SQL, Sequelize, PostgreSQL, schema) become neutral alternatives
   - Programming terms (null, undefined, NaN, bigint) become "no data"
   - Agent internals (agent_name, trace_id, stack_trace) become business terms
   - Cleans up artifacts like double spaces, double commas, and leading punctuation
2. **Narrative section filtering**: Applies the same technical term filter to executive summary, detailed analysis, key findings, risk assessment, recommended actions, and follow-up areas
3. **Minimum insight guarantee**: If fewer than 3 insights exist, synthesizes additional ones from SQL results:
   - Single-row aggregates become KPI-style insights ("Total Leads: 1,234")
   - Multi-row results become highlight insights ("Top Agent: CoryBot with 500 Executions")
4. **Recommendation validation**: If no recommendations exist, provides sensible defaults. Filters technical terms from existing recommendations and removes any that become too short after filtering.
5. **Quality scoring** (0 to 100): Awards points for narrative length (20), chart count (20), insight count (20), technical term absence (20), and recommendation count (20)

## Use Cases
- **Executive Reporting**: Ensures C-suite dashboards never display technical jargon like "NULL" or "PostgreSQL"
- **Business Intelligence**: Guarantees every report has actionable insights even when the underlying queries return minimal data
- **Quality Monitoring**: The quality score enables tracking report quality over time and flagging degradation

## Integration Points
- Invoked by the **Query Engine** as the final validation step
- Uses **Data Analyst Agent** (`getBusinessLabel`) for insight enrichment
- Processes output from **Chart Validation Agent** (visualizations are already validated)
- Quality score can be logged by **Process Observation Agent** for monitoring

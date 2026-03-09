"""LLM prompt templates for the orchestration pipeline."""

from typing import Any


def build_intent_prompt(question: str, dictionary_summary: str) -> str:
    return f"""You are a data analyst AI. Classify the user's question intent.

Available data context:
{dictionary_summary}

Question: {question}

Classify the intent as one of:
- metric_query: Asking about a specific number or KPI
- trend_analysis: Asking about changes over time
- comparison: Comparing entities or groups
- anomaly_investigation: Asking about unusual patterns
- root_cause: Asking why something happened
- forecast: Asking about future predictions
- exploration: Open-ended data exploration
- summary: Requesting an overview or executive summary

Respond with JSON only:
{{"intent": "<intent>", "entities": ["<entity names mentioned>"], "metrics": ["<metric names mentioned>"], "time_range": "<if any>"}}"""


def build_plan_prompt(question: str, intent: str, dictionary_summary: str) -> str:
    return f"""You are a data analyst AI planning a query execution.

Intent: {intent}
Question: {question}

Available data:
{dictionary_summary}

Plan the execution steps. For each step, specify the method:
- sql: Run a SQL query against the database
- ml: Run an ML model (anomaly, forecast, cluster, root_cause, risk)
- vector: Run a semantic search
- aggregate: Combine results from previous steps

Respond with JSON only:
{{"steps": [{{"step": 1, "method": "<method>", "description": "<what this step does>", "params": {{}}}}], "scope": {{"level": "global|group|entity", "entity_type": "<if applicable>", "entity_id": "<if applicable>"}}}}"""


def build_sql_prompt(question: str, plan_step: dict, table_schema: str) -> str:
    return f"""Generate a READ-ONLY PostgreSQL query for this analysis step.

Step: {plan_step.get('description', '')}
Question context: {question}

Available schema:
{table_schema}

Rules:
- Only SELECT statements allowed
- Use double quotes for identifiers
- Include LIMIT 1000 for safety
- Use aggregations where appropriate
- Return meaningful column aliases

Respond with the SQL query only, no explanation."""


def build_narrative_prompt(question: str, intent: str, results: dict[str, Any], context: str) -> str:
    return f"""You are an executive data analyst. Write a clear narrative answering the user's question.

Question: {question}
Intent: {intent}
Data context: {context}

Analysis results:
{_format_results(results)}

Write a concise narrative (2-4 paragraphs) that:
1. Directly answers the question
2. Highlights key findings with specific numbers
3. Notes any anomalies or concerns
4. Suggests follow-up areas if relevant

Use professional language appropriate for C-suite executives. Format currency with $, percentages with %, and large numbers with commas."""


def build_followup_prompt(question: str, intent: str, narrative: str) -> str:
    return f"""Based on this analysis, suggest 3-5 natural follow-up questions.

Original question: {question}
Intent: {intent}
Analysis summary: {narrative[:500]}

Generate follow-up questions that:
1. Go deeper into the findings
2. Explore related dimensions
3. Are actionable and specific

Respond with JSON only:
{{"follow_ups": ["question 1", "question 2", "question 3"]}}"""


def _format_results(results: dict[str, Any]) -> str:
    """Format results dict into readable text."""
    parts = []
    for key, value in results.items():
        if isinstance(value, list) and len(value) > 10:
            parts.append(f"{key}: [{len(value)} items, first 5: {value[:5]}]")
        else:
            parts.append(f"{key}: {value}")
    return "\n".join(parts)

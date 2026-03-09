"""9-step LLM orchestration pipeline."""

import json
import logging
from typing import Any

import openai
import psycopg2
import psycopg2.extras

from ..config import get_config
from .prompts import (
    build_intent_prompt,
    build_plan_prompt,
    build_sql_prompt,
    build_narrative_prompt,
    build_followup_prompt,
)
from .sql_generator import SQLGenerator
from .sql_sanitizer import SQLSanitizer
from .context_builder import ContextBuilder
from .chart_data_mapper import ChartDataMapper

logger = logging.getLogger(__name__)


class QueryEngine:
    """9-step LLM orchestration pipeline for data Q&A."""

    def __init__(self, dictionary: dict[str, Any]):
        self.dictionary = dictionary
        self.cfg = get_config()
        self.client = openai.OpenAI(api_key=self.cfg.openai_api_key)
        self.sql_gen = SQLGenerator(dictionary)
        self.sanitizer = SQLSanitizer()
        self.context = ContextBuilder()
        self.chart_mapper = ChartDataMapper()

    def query(self, question: str, scope: dict | None = None) -> dict[str, Any]:
        """Execute the full 9-step pipeline."""
        try:
            # Step 1: Classify intent
            intent_data = self._classify_intent(question)
            intent = intent_data.get("intent", "exploration")
            entities = intent_data.get("entities", [])
            metrics = intent_data.get("metrics", [])

            # Step 2: Plan execution
            plan = self._plan_execution(question, intent)
            steps = plan.get("steps", [])

            # Step 3: Resolve scope
            resolved_scope = scope or plan.get("scope", {"level": "global"})

            # Step 4: Resolve entities
            # (entities are already extracted from step 1)

            # Step 5: Execute data retrieval (SQL/ML/Vector)
            results = self._execute_steps(question, steps)

            # Step 6: Build context
            results_context = self.context.build_results_context(results)

            # Step 7: Generate narrative
            narrative = self._generate_narrative(question, intent, results, results_context)

            # Step 8: Map visualizations
            vis_data = results.get("data", [])
            if isinstance(vis_data, list) and vis_data:
                visualizations = self.chart_mapper.auto_map(vis_data, intent)
            else:
                visualizations = []

            # Step 9: Generate follow-ups
            follow_ups = self._generate_followups(question, intent, narrative)

            return {
                "question": question,
                "intent": intent,
                "entities": entities,
                "metrics": metrics,
                "scope": resolved_scope,
                "narrative": narrative,
                "data": results,
                "visualizations": visualizations,
                "follow_ups": follow_ups,
                "sources": list(results.get("tables_queried", [])),
                "execution_path": " -> ".join(s.get("method", "?") for s in steps),
            }
        except Exception as e:
            logger.error("Query pipeline error: %s", e)
            return {
                "question": question,
                "intent": "error",
                "narrative": f"I encountered an error processing your question: {str(e)}",
                "data": {},
                "visualizations": [],
                "follow_ups": ["Can you rephrase your question?"],
                "sources": [],
                "execution_path": "error",
            }

    def _classify_intent(self, question: str) -> dict:
        summary = self.context.build_dictionary_summary(self.dictionary)
        prompt = build_intent_prompt(question, summary)
        return self._llm_json(prompt)

    def _plan_execution(self, question: str, intent: str) -> dict:
        summary = self.context.build_dictionary_summary(self.dictionary)
        prompt = build_plan_prompt(question, intent, summary)
        return self._llm_json(prompt)

    def _execute_steps(self, question: str, steps: list[dict]) -> dict[str, Any]:
        combined_results: dict[str, Any] = {"data": [], "tables_queried": set()}

        for step in steps:
            method = step.get("method", "sql")
            try:
                if method == "sql":
                    result = self._execute_sql_step(question, step)
                    if result:
                        combined_results["data"].extend(result)
                elif method == "ml":
                    result = self._execute_ml_step(step)
                    combined_results["ml_result"] = result
                elif method == "vector":
                    result = self._execute_vector_step(question)
                    combined_results["vector_context"] = result
            except Exception as e:
                logger.warning("Step %s failed: %s", step.get("step"), e)

        return combined_results

    def _execute_sql_step(self, question: str, step: dict) -> list[dict]:
        schema_desc = self.sql_gen.get_table_schema_description()
        prompt = build_sql_prompt(question, step, schema_desc)
        sql = self._llm_text(prompt).strip().strip("`").strip()

        if sql.startswith("sql"):
            sql = sql[3:].strip()

        sanitized = self.sanitizer.sanitize(sql)
        if not sanitized:
            return []

        conn = psycopg2.connect(self.cfg.database_url)
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sanitized)
                rows = [dict(r) for r in cur.fetchall()]
                return rows
        except Exception as e:
            logger.warning("SQL execution error: %s", e)
            return []
        finally:
            conn.close()

    def _execute_ml_step(self, step: dict) -> dict:
        params = step.get("params", {})
        model_type = params.get("model", "anomaly")

        from ..models.anomaly_detector import AnomalyDetector
        from ..models.forecaster import Forecaster
        from ..models.risk_scorer import RiskScorer

        models = {
            "anomaly": AnomalyDetector,
            "forecast": Forecaster,
            "risk": RiskScorer,
        }

        model_class = models.get(model_type)
        if not model_class:
            return {}

        model = model_class()
        if model.can_run(self.dictionary):
            return model.run(self.dictionary, self.cfg.database_url)
        return {}

    def _execute_vector_step(self, question: str) -> dict:
        from ..services.embedding_service import EmbeddingService
        from ..services.vector_service import VectorService

        embedder = EmbeddingService(self.cfg.openai_api_key)
        vector_svc = VectorService(self.cfg.database_url, embedder)
        return vector_svc.semantic_search(question, limit=5)

    def _generate_narrative(self, question: str, intent: str, results: dict, context: str) -> str:
        prompt = build_narrative_prompt(question, intent, results, context)
        return self._llm_text(prompt)

    def _generate_followups(self, question: str, intent: str, narrative: str) -> list[str]:
        prompt = build_followup_prompt(question, intent, narrative)
        result = self._llm_json(prompt)
        return result.get("follow_ups", [])

    def _llm_json(self, prompt: str) -> dict:
        text = self._llm_text(prompt)
        try:
            text = text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0]
            return json.loads(text)
        except json.JSONDecodeError:
            logger.warning("LLM returned non-JSON: %s", text[:200])
            return {}

    def _llm_text(self, prompt: str) -> str:
        response = self.client.chat.completions.create(
            model=self.cfg.llm_model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=self.cfg.llm_max_tokens,
            temperature=0.1,
        )
        return response.choices[0].message.content or ""

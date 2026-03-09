"""Orchestrator API routes."""

import json
from pathlib import Path

from flask import Blueprint, jsonify, request
from ..config import get_config
from ..orchestrator.query_engine import QueryEngine
from ..orchestrator.context_builder import ContextBuilder

orchestrator_bp = Blueprint("orchestrator", __name__, url_prefix="/orchestrator")


def _load_dictionary() -> dict | None:
    path = Path("intelligence/data_dictionary.json")
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


@orchestrator_bp.route("/query", methods=["POST"])
def query():
    """Run the full 9-step query pipeline."""
    data = request.get_json() or {}
    question = data.get("question", "")
    scope = data.get("scope")

    if not question:
        return jsonify({"error": "question is required"}), 400

    dictionary = _load_dictionary()
    if not dictionary:
        return jsonify({"error": "No data dictionary found. Run discovery first."}), 404

    engine = QueryEngine(dictionary)
    result = engine.query(question, scope)
    return jsonify(result)


@orchestrator_bp.route("/executive-summary", methods=["GET"])
def executive_summary():
    """Generate an executive summary of all data."""
    dictionary = _load_dictionary()
    if not dictionary:
        return jsonify({"error": "No data dictionary found"}), 404

    engine = QueryEngine(dictionary)
    result = engine.query("Give me an executive summary of all key metrics and their current status")
    return jsonify(result)


@orchestrator_bp.route("/ranked-insights", methods=["GET"])
def ranked_insights():
    """Get ranked insights across all data."""
    dictionary = _load_dictionary()
    if not dictionary:
        return jsonify({"error": "No data dictionary found"}), 404

    engine = QueryEngine(dictionary)
    result = engine.query("What are the top insights and anomalies across all our data?")
    return jsonify(result)


@orchestrator_bp.route("/entity-network", methods=["GET"])
def entity_network():
    """Get entity relationship network for visualization."""
    dictionary = _load_dictionary()
    if not dictionary:
        return jsonify({"error": "No data dictionary found"}), 404

    tables = dictionary.get("tables", {})
    relationships = dictionary.get("relationships", [])
    hub = dictionary.get("hub_entity")

    nodes = []
    for tname, tinfo in tables.items():
        nodes.append({
            "id": tname,
            "label": tname,
            "row_count": tinfo.get("row_count", 0),
            "column_count": tinfo.get("column_count", 0),
            "is_hub": tname == hub,
        })

    edges = []
    for rel in relationships:
        edges.append({
            "source": rel["source_table"],
            "target": rel["target_table"],
            "type": rel["type"],
            "confidence": rel.get("confidence", 1.0),
        })

    return jsonify({"nodes": nodes, "edges": edges, "hub_entity": hub})

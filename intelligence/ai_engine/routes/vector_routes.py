"""Vector search API routes."""

from flask import Blueprint, jsonify, request
from ..config import get_config
from ..services.embedding_service import EmbeddingService
from ..services.embedding_pipeline import EmbeddingPipeline
from ..services.vector_service import VectorService

vector_bp = Blueprint("vectors", __name__, url_prefix="/vectors")


def _get_services():
    cfg = get_config()
    embedder = EmbeddingService(cfg.openai_api_key, cfg.embedding_model, cfg.embedding_dimensions)
    vector_svc = VectorService(cfg.database_url, embedder)
    pipeline = EmbeddingPipeline(cfg.database_url, embedder)
    return embedder, vector_svc, pipeline


@vector_bp.route("/embed-pipeline", methods=["POST"])
def run_embed_pipeline():
    """Run the full embedding pipeline."""
    _, _, pipeline = _get_services()
    result = pipeline.run()
    return jsonify({"status": "completed", **result})


@vector_bp.route("/search", methods=["POST"])
def semantic_search():
    """Semantic search across entities and Q&A history."""
    data = request.get_json() or {}
    query = data.get("query", "")
    limit = data.get("limit", 10)

    if not query:
        return jsonify({"error": "query is required"}), 400

    _, vector_svc, _ = _get_services()
    results = vector_svc.semantic_search(query, limit)
    return jsonify(results)


@vector_bp.route("/similar", methods=["POST"])
def similar_entities():
    """Find similar entities."""
    data = request.get_json() or {}
    query = data.get("query", "")
    limit = data.get("limit", 10)

    if not query:
        return jsonify({"error": "query is required"}), 400

    _, vector_svc, _ = _get_services()
    results = vector_svc.similar_entities(query, limit)
    return jsonify(results)


@vector_bp.route("/entity-network", methods=["POST"])
def entity_network():
    """Build entity similarity network."""
    data = request.get_json() or {}
    entity_ids = data.get("entity_ids", [])
    threshold = data.get("threshold", 0.7)

    _, vector_svc, _ = _get_services()
    edges = vector_svc.entity_similarity_network(entity_ids, threshold)
    return jsonify({"edges": edges})

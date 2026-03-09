"""Discovery API routes."""

from flask import Blueprint, jsonify, request
from ..discovery.dictionary_builder import DictionaryBuilder
from ..discovery.view_generator import ViewGenerator
from ..config import get_config

discovery_bp = Blueprint("discovery", __name__, url_prefix="/discovery")


@discovery_bp.route("/run", methods=["POST"])
def run_discovery():
    """Run the full discovery pipeline."""
    cfg = get_config()
    builder = DictionaryBuilder(cfg.database_url)
    user_config = {
        "PRIMARY_ENTITY": cfg.primary_entity,
        "GROUP_ENTITY": cfg.group_entity,
        "DOMAIN_DESCRIPTION": cfg.domain_description,
    }
    dictionary = builder.build_and_save(config=user_config)
    return jsonify({
        "status": "completed",
        "tables_discovered": len(dictionary.get("tables", {})),
        "relationships_found": len(dictionary.get("relationships", [])),
        "hub_entity": dictionary.get("hub_entity"),
    })


@discovery_bp.route("/dictionary", methods=["GET"])
def get_dictionary():
    """Return the current data dictionary."""
    import json
    from pathlib import Path

    path = Path("intelligence/data_dictionary.json")
    if not path.exists():
        return jsonify({"error": "No data dictionary found. Run discovery first."}), 404
    with open(path) as f:
        return jsonify(json.load(f))


@discovery_bp.route("/views", methods=["POST"])
def generate_views():
    """Generate materialized view SQL from the data dictionary."""
    import json
    from pathlib import Path

    path = Path("intelligence/data_dictionary.json")
    if not path.exists():
        return jsonify({"error": "No data dictionary found. Run discovery first."}), 404
    with open(path) as f:
        dictionary = json.load(f)

    generator = ViewGenerator()
    statements = generator.generate_all(dictionary)
    return jsonify({"statements": statements, "count": len(statements)})

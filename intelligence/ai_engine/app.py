"""Flask entry point for Intelligence OS AI Engine."""

import json
from datetime import datetime, timezone

from flask import Flask, jsonify
from flask_cors import CORS

from .config import config


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)

    # Register blueprints (lazy imports to avoid circular deps)
    try:
        from .routes.discovery_routes import discovery_bp
        app.register_blueprint(discovery_bp)
    except ImportError:
        pass

    try:
        from .routes.vector_routes import vector_bp
        app.register_blueprint(vector_bp)
    except ImportError:
        pass

    try:
        from .routes.ml_routes import ml_bp
        app.register_blueprint(ml_bp)
    except ImportError:
        pass

    try:
        from .routes.orchestrator_routes import orchestrator_bp
        app.register_blueprint(orchestrator_bp)
    except ImportError:
        pass

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({
            "status": "ok",
            "service": "intelligence-os-ai-engine",
            "project": config.project_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    @app.route("/config", methods=["GET"])
    def get_config():
        safe = config.to_dict()
        safe.pop("openai_api_key", None)
        safe.pop("database_url", None)
        return jsonify(safe)

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=config.flask_port, debug=True)

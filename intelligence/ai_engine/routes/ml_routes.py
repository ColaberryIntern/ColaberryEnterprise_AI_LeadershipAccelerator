"""ML model API routes."""

import json
from pathlib import Path

from flask import Blueprint, jsonify, request
from ..config import get_config
from ..models.anomaly_detector import AnomalyDetector
from ..models.forecaster import Forecaster
from ..models.text_clusterer import TextClusterer
from ..models.root_cause_explainer import RootCauseExplainer
from ..models.risk_scorer import RiskScorer

ml_bp = Blueprint("ml", __name__, url_prefix="/ml")


def _load_dictionary() -> dict | None:
    path = Path("intelligence/data_dictionary.json")
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


@ml_bp.route("/anomaly", methods=["GET"])
def detect_anomalies():
    """Run anomaly detection."""
    dictionary = _load_dictionary()
    if not dictionary:
        return jsonify({"error": "No data dictionary found"}), 404

    cfg = get_config()
    detector = AnomalyDetector()
    if not detector.can_run(dictionary):
        return jsonify({"error": "Insufficient data for anomaly detection"}), 400

    result = detector.run(dictionary, cfg.database_url)
    return jsonify(result)


@ml_bp.route("/forecast", methods=["GET"])
def forecast():
    """Run time-series forecast."""
    dictionary = _load_dictionary()
    if not dictionary:
        return jsonify({"error": "No data dictionary found"}), 404

    cfg = get_config()
    forecaster = Forecaster()
    if not forecaster.can_run(dictionary):
        return jsonify({"error": "Insufficient data for forecasting"}), 400

    table = request.args.get("table")
    date_col = request.args.get("date_column")
    value_col = request.args.get("value_column")
    periods = int(request.args.get("periods", 30))

    result = forecaster.run(dictionary, cfg.database_url, table, date_col, value_col, periods)
    return jsonify(result)


@ml_bp.route("/cluster", methods=["GET"])
def cluster_text():
    """Run text clustering."""
    dictionary = _load_dictionary()
    if not dictionary:
        return jsonify({"error": "No data dictionary found"}), 404

    cfg = get_config()
    clusterer = TextClusterer()
    if not clusterer.can_run(dictionary):
        return jsonify({"error": "No text columns available for clustering"}), 400

    table = request.args.get("table")
    column = request.args.get("column")
    result = clusterer.run(dictionary, cfg.database_url, table, column)
    return jsonify(result)


@ml_bp.route("/root-cause", methods=["GET"])
def root_cause():
    """Run root cause analysis."""
    dictionary = _load_dictionary()
    if not dictionary:
        return jsonify({"error": "No data dictionary found"}), 404

    cfg = get_config()
    explainer = RootCauseExplainer()
    if not explainer.can_run(dictionary):
        return jsonify({"error": "Insufficient data for root cause analysis"}), 400

    target_table = request.args.get("table")
    target_column = request.args.get("column")
    result = explainer.run(dictionary, cfg.database_url, target_table, target_column)
    return jsonify(result)


@ml_bp.route("/risk-score", methods=["GET"])
def risk_score():
    """Compute entity risk scores."""
    dictionary = _load_dictionary()
    if not dictionary:
        return jsonify({"error": "No data dictionary found"}), 404

    cfg = get_config()
    scorer = RiskScorer()
    if not scorer.can_run(dictionary):
        return jsonify({"error": "Insufficient data for risk scoring"}), 400

    result = scorer.run(dictionary, cfg.database_url)
    return jsonify(result)

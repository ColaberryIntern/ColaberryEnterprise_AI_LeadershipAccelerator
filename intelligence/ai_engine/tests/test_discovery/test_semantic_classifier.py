"""Tests for semantic column classifier."""

from intelligence.ai_engine.discovery.semantic_classifier import SemanticClassifier


class TestSemanticClassifier:
    def setup_method(self):
        self.classifier = SemanticClassifier()

    def test_currency_by_name(self):
        assert self.classifier.classify("revenue", "numeric", {}) == "currency"
        assert self.classifier.classify("total_amount", "numeric", {}) == "currency"
        assert self.classifier.classify("monthly_mrr", "numeric", {}) == "currency"

    def test_percentage_by_name(self):
        assert self.classifier.classify("open_rate", "numeric", {}) == "percentage"
        assert self.classifier.classify("churn_pct", "numeric", {}) == "percentage"
        assert self.classifier.classify("conversion", "numeric", {}) == "percentage"

    def test_count_by_name(self):
        assert self.classifier.classify("lead_count", "integer", {}) == "count"
        assert self.classifier.classify("num_sessions", "integer", {}) == "count"

    def test_score_by_name(self):
        assert self.classifier.classify("health_score", "numeric", {}) == "score"
        assert self.classifier.classify("risk_rating", "numeric", {}) == "score"

    def test_date_by_data_type(self):
        assert self.classifier.classify("whatever", "timestamp with time zone", {}) == "date"
        assert self.classifier.classify("whatever", "date", {}) == "date"

    def test_boolean_by_data_type(self):
        assert self.classifier.classify("whatever", "boolean", {}) == "boolean"

    def test_uuid_is_id(self):
        assert self.classifier.classify("anything", "uuid", {}) == "id"

    def test_id_by_name(self):
        assert self.classifier.classify("user_id", "integer", {}) == "id"

    def test_name_by_keyword(self):
        assert self.classifier.classify("agent_name", "character varying", {}) == "name"
        assert self.classifier.classify("campaign_name", "character varying", {}) == "name"

    def test_description_by_keyword(self):
        assert self.classifier.classify("description", "text", {}) == "description"
        assert self.classifier.classify("error_message", "text", {}) == "description"

    def test_category_by_keyword(self):
        assert self.classifier.classify("agent_type", "character varying", {}) == "category"
        assert self.classifier.classify("status", "character varying", {}) == "category"

    def test_email_by_keyword(self):
        assert self.classifier.classify("email", "character varying", {}) == "email"

    def test_geo_by_keyword(self):
        assert self.classifier.classify("latitude", "numeric", {}) == "geo_lat"
        assert self.classifier.classify("longitude", "numeric", {}) == "geo_lng"

    def test_boolean_by_name(self):
        assert self.classifier.classify("is_active", "character varying", {}) == "boolean"
        assert self.classifier.classify("has_premium", "character varying", {}) == "boolean"

    def test_url_by_name(self):
        assert self.classifier.classify("website_url", "character varying", {}) == "url"

    def test_unique_integer_is_id(self):
        assert self.classifier.classify("record_num", "integer", {"is_unique": True}) == "id"

    def test_fallback_integer_is_count(self):
        assert self.classifier.classify("xyz", "integer", {}) == "count"

    def test_fallback_numeric_is_numeric(self):
        assert self.classifier.classify("xyz", "double precision", {}) == "numeric"

    def test_text_with_low_cardinality_is_category(self):
        assert self.classifier.classify("xyz", "character varying", {"distinct_count": 5}) == "category"

    def test_text_looks_like_description(self):
        assert self.classifier.classify("xyz", "text", {"looks_like_description": True, "distinct_count": 500}) == "description"

    def test_text_looks_like_name(self):
        assert self.classifier.classify("xyz", "character varying", {"looks_like_name": True, "distinct_count": 500}) == "name"

    def test_jsonb_is_json(self):
        assert self.classifier.classify("metadata", "jsonb", {}) == "json"

    def test_array_is_array(self):
        assert self.classifier.classify("tags", "ARRAY", {}) == "array"

    def test_classify_all(self):
        columns = {
            "leads": [
                {"column_name": "id", "data_type": "uuid"},
                {"column_name": "revenue", "data_type": "numeric"},
            ],
        }
        profiles = {
            "leads": {"columns": {"id": {}, "revenue": {}}},
        }
        result = self.classifier.classify_all(columns, profiles)
        assert result["leads"]["id"] == "id"
        assert result["leads"]["revenue"] == "currency"

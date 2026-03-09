"""Tests for relationship mapper."""

from intelligence.ai_engine.discovery.relationship_mapper import RelationshipMapper


class TestRelationshipMapper:
    def setup_method(self):
        self.mapper = RelationshipMapper()

    def test_explicit_fk_relationships(self, sample_schema):
        result = self.mapper.map_relationships(sample_schema, {})
        explicit = [r for r in result["relationships"] if r["type"] == "explicit_fk"]
        assert len(explicit) == 2
        assert explicit[0]["source_table"] == "campaign_leads"
        assert explicit[0]["target_table"] == "campaigns"
        assert explicit[0]["confidence"] == 1.0

    def test_inferred_relationships(self):
        schema = {
            "tables": [
                {"table_name": "orders"},
                {"table_name": "customers"},
            ],
            "columns": {
                "orders": [
                    {"column_name": "id", "data_type": "uuid"},
                    {"column_name": "customer_id", "data_type": "uuid"},
                ],
                "customers": [
                    {"column_name": "id", "data_type": "uuid"},
                ],
            },
            "foreign_keys": [],
        }
        result = self.mapper.map_relationships(schema, {})
        inferred = [r for r in result["relationships"] if r["type"] == "inferred"]
        assert len(inferred) == 1
        assert inferred[0]["source_table"] == "orders"
        assert inferred[0]["target_table"] == "customers"
        assert inferred[0]["confidence"] == 0.8

    def test_inferred_plural_table(self):
        schema = {
            "tables": [
                {"table_name": "order_items"},
                {"table_name": "products"},
            ],
            "columns": {
                "order_items": [
                    {"column_name": "product_id", "data_type": "uuid"},
                ],
                "products": [],
            },
            "foreign_keys": [],
        }
        result = self.mapper.map_relationships(schema, {})
        inferred = [r for r in result["relationships"] if r["type"] == "inferred"]
        assert len(inferred) == 1
        assert inferred[0]["target_table"] == "products"

    def test_hub_entity_detection(self, sample_schema):
        result = self.mapper.map_relationships(sample_schema, {})
        # leads and campaigns are both targets; leads has 1 FK pointing to it, campaigns has 1
        # The hub is whichever has most inbound - with 2 FKs total, both pointing from campaign_leads
        assert result["hub_entity"] in ("leads", "campaigns")

    def test_entity_graph(self, sample_schema):
        result = self.mapper.map_relationships(sample_schema, {})
        graph = result["entity_graph"]
        assert "campaign_leads" in graph
        assert "campaigns" in graph["campaign_leads"]
        assert "leads" in graph["campaign_leads"]
        # Bidirectional
        assert "campaign_leads" in graph["campaigns"]

    def test_no_self_referencing_inferred(self):
        schema = {
            "tables": [{"table_name": "nodes"}],
            "columns": {
                "nodes": [{"column_name": "node_id", "data_type": "uuid"}],
            },
            "foreign_keys": [],
        }
        result = self.mapper.map_relationships(schema, {})
        # node_id -> strip _id -> "node" -> plural "nodes" matches table, but it's self-referencing
        # Actually the mapper checks target_table != table_name, but "node" != "nodes"
        # and "nodes" == "nodes" via plural... let's check
        inferred = [r for r in result["relationships"] if r["type"] == "inferred"]
        # node_id -> candidate "node" -> "nodes" exists -> but target "nodes" == source "nodes" -> filtered out
        assert len(inferred) == 0

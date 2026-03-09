"""Maps query results to Recharts-compatible data contracts."""

from typing import Any


class ChartDataMapper:
    """Transforms raw data into Recharts-compatible visualization specs."""

    def auto_map(self, data: list[dict], intent: str, metadata: dict[str, Any] | None = None) -> list[dict]:
        """Auto-select chart type and map data."""
        if not data:
            return []

        visualizations = []

        if intent == "trend_analysis":
            visualizations.append(self.to_line_chart(data, metadata))
        elif intent == "comparison":
            visualizations.append(self.to_bar_chart(data, metadata))
        elif intent == "forecast":
            visualizations.append(self.to_forecast_chart(data, metadata))
        elif intent == "anomaly_investigation":
            visualizations.append(self.to_scatter_chart(data, metadata))
        elif intent == "root_cause":
            visualizations.append(self.to_horizontal_bar(data, metadata))
        else:
            # Default: bar chart for small datasets, line for time series
            if len(data) > 20:
                visualizations.append(self.to_line_chart(data, metadata))
            else:
                visualizations.append(self.to_bar_chart(data, metadata))

        return visualizations

    def to_line_chart(self, data: list[dict], metadata: dict[str, Any] | None = None) -> dict:
        metadata = metadata or {}
        keys = list(data[0].keys()) if data else []
        x_key = self._find_x_key(keys)
        y_keys = [k for k in keys if k != x_key]

        return {
            "chart_type": "line",
            "title": metadata.get("title", "Trend Analysis"),
            "data": data,
            "config": {
                "xAxisKey": x_key,
                "lines": [{"dataKey": k, "name": metadata.get(f"label_{k}", k)} for k in y_keys],
            },
        }

    def to_bar_chart(self, data: list[dict], metadata: dict[str, Any] | None = None) -> dict:
        metadata = metadata or {}
        keys = list(data[0].keys()) if data else []
        x_key = self._find_category_key(keys)
        y_keys = [k for k in keys if k != x_key]

        return {
            "chart_type": "bar",
            "title": metadata.get("title", "Comparison"),
            "data": data,
            "config": {
                "xAxisKey": x_key,
                "bars": [{"dataKey": k, "name": metadata.get(f"label_{k}", k)} for k in y_keys[:5]],
            },
        }

    def to_forecast_chart(self, data: list[dict], metadata: dict[str, Any] | None = None) -> dict:
        metadata = metadata or {}
        return {
            "chart_type": "forecast",
            "title": metadata.get("title", "Forecast"),
            "data": data,
            "config": {
                "xAxisKey": "date",
                "valueKey": "predicted",
                "lowerKey": "lower_bound",
                "upperKey": "upper_bound",
            },
        }

    def to_scatter_chart(self, data: list[dict], metadata: dict[str, Any] | None = None) -> dict:
        metadata = metadata or {}
        keys = list(data[0].keys()) if data else []
        numeric_keys = [k for k in keys if k not in ("entity_id", "entity_name", "risk_level")]

        return {
            "chart_type": "scatter",
            "title": metadata.get("title", "Anomaly Map"),
            "data": data,
            "config": {
                "xAxisKey": numeric_keys[0] if numeric_keys else keys[0],
                "yAxisKey": numeric_keys[1] if len(numeric_keys) > 1 else numeric_keys[0] if numeric_keys else keys[0],
                "nameKey": "entity_name" if "entity_name" in keys else keys[0],
            },
        }

    def to_horizontal_bar(self, data: list[dict], metadata: dict[str, Any] | None = None) -> dict:
        metadata = metadata or {}
        return {
            "chart_type": "horizontal_bar",
            "title": metadata.get("title", "Feature Importance"),
            "data": data,
            "config": {
                "yAxisKey": "feature",
                "valueKey": "importance",
                "layout": "vertical",
            },
        }

    def to_radar_chart(self, data: list[dict], metadata: dict[str, Any] | None = None) -> dict:
        metadata = metadata or {}
        return {
            "chart_type": "radar",
            "title": metadata.get("title", "Multi-Dimensional Analysis"),
            "data": data,
            "config": {
                "angleKey": "dimension",
                "radiusKey": "value",
            },
        }

    def to_heatmap(self, data: list[dict], metadata: dict[str, Any] | None = None) -> dict:
        metadata = metadata or {}
        return {
            "chart_type": "heatmap",
            "title": metadata.get("title", "Correlation Matrix"),
            "data": data,
            "config": {
                "xKey": "x",
                "yKey": "y",
                "valueKey": "value",
            },
        }

    @staticmethod
    def _find_x_key(keys: list[str]) -> str:
        for candidate in ["date", "period", "ds", "month", "week", "year", "time"]:
            if candidate in keys:
                return candidate
        return keys[0] if keys else "x"

    @staticmethod
    def _find_category_key(keys: list[str]) -> str:
        for candidate in ["name", "entity_name", "label", "category", "group", "type"]:
            if candidate in keys:
                return candidate
        return keys[0] if keys else "category"

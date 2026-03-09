"""Time-series forecasting using Prophet."""

import logging
from typing import Any

import pandas as pd
import psycopg2
import psycopg2.extras

from .base_model import BaseMLModel

logger = logging.getLogger(__name__)


class Forecaster(BaseMLModel):
    """Forecasts time-series metrics using Prophet."""

    @property
    def name(self) -> str:
        return "forecaster"

    def can_run(self, data_dictionary: dict[str, Any]) -> bool:
        return bool(data_dictionary.get("time_series_candidates")) and bool(data_dictionary.get("numeric_columns"))

    def run(
        self,
        data_dictionary: dict[str, Any],
        database_url: str,
        table: str | None = None,
        date_col: str | None = None,
        value_col: str | None = None,
        periods: int = 30,
    ) -> dict[str, Any]:
        # Auto-select if not provided
        if not table or not date_col or not value_col:
            ts_candidates = data_dictionary.get("time_series_candidates", [])
            num_cols = data_dictionary.get("numeric_columns", [])
            if not ts_candidates or not num_cols:
                return {"forecast": [], "error": "No time series data available"}

            date_col = ts_candidates[0]["column"]
            table = ts_candidates[0]["table"]
            # Find a numeric column in the same table
            for nc in num_cols:
                if nc["table"] == table:
                    value_col = nc["column"]
                    break
            if not value_col:
                return {"forecast": [], "error": "No numeric column found for forecasting"}

        conn = psycopg2.connect(database_url)
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(f'''
                    SELECT "{date_col}"::date AS ds, SUM("{value_col}")::float AS y
                    FROM "{table}"
                    WHERE "{date_col}" IS NOT NULL AND "{value_col}" IS NOT NULL
                    GROUP BY "{date_col}"::date
                    ORDER BY ds
                ''')
                rows = cur.fetchall()
        finally:
            conn.close()

        if len(rows) < 10:
            return {"forecast": [], "error": "Not enough data points for forecasting"}

        df = pd.DataFrame(rows)
        df["ds"] = pd.to_datetime(df["ds"])

        try:
            from prophet import Prophet

            model = Prophet(
                daily_seasonality=False,
                weekly_seasonality=True,
                yearly_seasonality=len(df) > 365,
                changepoint_prior_scale=0.05,
            )
            model.fit(df)

            future = model.make_future_dataframe(periods=periods)
            forecast = model.predict(future)

            result_df = forecast[["ds", "yhat", "yhat_lower", "yhat_upper"]].tail(periods)
            forecast_data = []
            for _, row in result_df.iterrows():
                forecast_data.append({
                    "date": row["ds"].strftime("%Y-%m-%d"),
                    "predicted": round(row["yhat"], 2),
                    "lower_bound": round(row["yhat_lower"], 2),
                    "upper_bound": round(row["yhat_upper"], 2),
                })

            return {
                "forecast": forecast_data,
                "table": table,
                "date_column": date_col,
                "value_column": value_col,
                "periods": periods,
                "historical_points": len(df),
            }
        except ImportError:
            logger.warning("Prophet not installed, using linear extrapolation fallback")
            return {"forecast": [], "error": "Prophet not installed"}

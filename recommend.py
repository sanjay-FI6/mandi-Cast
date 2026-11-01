"""
Step 4 - Mandi Cast recommendation logic.

Turns a trained model's near-term price forecast into the plain-language
recommendation shown on the frontend's AI Market Insight card.

Not ML - just a rule layer on top of whichever model won in Step 3:
    predicted change > +5%  -> WAIT (prices expected to rise)
    predicted change < -5%  -> SELL NOW (prices expected to drop)
    otherwise                -> STABLE (either is fine)

Confidence % is derived from how tight the model's own error was on its
test set (lower MAPE -> higher displayed confidence), not invented.
"""

from datetime import datetime, timezone

import numpy as np
import pandas as pd


def forecast_next_n_days(model_bundle, n_days=7):
    """
    Given a saved model bundle (as produced by train_models.py), return a
    forecast for the next n_days. Returns a plain list of predicted prices.
    """
    model_type = model_bundle["best_model_type"]
    model = model_bundle["model"]

    if model_type == "sarima":
        forecast = model.forecast(steps=n_days)
        return [round(float(v), 2) for v in np.asarray(forecast)]

    if model_type == "xgboost":
        # XGBoost needs feature rows for future dates. Since we don't have
        # future weather, we hold rainfall/temp at their last known values
        # and roll lag features forward using the model's own predictions -
        # a standard, defensible approach for short multi-step forecasts.
        xgb_model, feature_cols = model
        last_known = model_bundle.get("_last_rows")  # attached by load_model_for_prediction
        preds = []
        history = last_known.copy()

        for _ in range(n_days):
            next_date = history["date"].iloc[-1] + pd.Timedelta(days=1)
            row = {
                "lag_7": history["modal_price"].iloc[-7] if len(history) >= 7 else history["modal_price"].iloc[-1],
                "lag_14": history["modal_price"].iloc[-14] if len(history) >= 14 else history["modal_price"].iloc[-1],
                "rolling_mean_7": history["modal_price"].iloc[-7:].mean(),
                "month": next_date.month,
                "day_of_week": next_date.dayofweek,
                "is_harvest_season": int(next_date.month in [3, 4, 10, 11]),
                "rainfall": history["rainfall"].iloc[-1],
                "temp": history["temp"].iloc[-1],
            }
            x = pd.DataFrame([row])[feature_cols]
            pred_price = float(xgb_model.predict(x)[0])
            preds.append(round(pred_price, 2))

            history = pd.concat([history, pd.DataFrame([{
                "date": next_date, "modal_price": pred_price,
                "rainfall": row["rainfall"], "temp": row["temp"],
            }])], ignore_index=True)

        return preds

    raise ValueError(f"Unknown model type: {model_type}")


def confidence_from_mape(mape):
    """Map a model's test MAPE to a displayed confidence %. Lower error -> higher confidence."""
    confidence = 100 - (mape * 3)  # simple linear penalty, tuned so ~3% MAPE -> ~91% confidence
    return int(round(max(50, min(97, confidence))))


def build_insight(model_bundle, n_days=7):
    """
    Returns the aiInsight object shaped exactly for the frontend:
    { recommendation, price, confidence_pct, message, updated_at }
    """
    current_price = model_bundle["last_price"]
    forecast = forecast_next_n_days(model_bundle, n_days=n_days)
    predicted_price = forecast[-1]

    change_pct = ((predicted_price - current_price) / current_price) * 100

    if change_pct > 5:
        recommendation = "WAIT"
        message = f"Prices are trending up and expected to rise about {round(change_pct, 1)}% over the next {n_days} days."
    elif change_pct < -5:
        recommendation = "SELL NOW"
        message = f"Prices are trending down and expected to fall about {abs(round(change_pct, 1))}% over the next {n_days} days."
    else:
        recommendation = "STABLE"
        message = f"Prices are expected to stay roughly steady over the next {n_days} days."

    confidence_pct = confidence_from_mape(model_bundle["metrics"]["mape"])

    return {
        "recommendation": recommendation,
        "price": current_price,
        "confidence_pct": confidence_pct,
        "message": message,
        "forecast": forecast,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

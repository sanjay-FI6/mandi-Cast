"""
Step 3 - Mandi Cast model training.

For every crop-market pair in data/merged/<crop>.csv, trains two
forecasting models:
    - SARIMA   (baseline, price history only)
    - XGBoost  (lag + rolling + calendar features + weather)

(Prophet was evaluated and dropped - with <2 years of history its yearly
seasonality was unstable and it underperformed both other models. Worth
a line in the report's model-comparison section.)

Evaluates each on a held-out last-30-days test split using RMSE, MAE,
MAPE, prints a comparison table, and saves the best model per
crop-market pair to models/<crop>__<market>.pkl for the backend to load.

Usage:
    python train_models.py
    python train_models.py --crop tomato          # train just one crop
    python train_models.py --test-days 14         # shorter test window
"""

import argparse
import os
import warnings

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error, mean_squared_error
from statsmodels.tsa.statespace.sarimax import SARIMAX

warnings.filterwarnings("ignore")  # statsmodels/prophet are noisy about convergence, non-fatal

BASE_DIR = os.path.dirname(__file__)
MERGED_DIR = os.path.join(BASE_DIR, "data", "merged")
MODELS_DIR = os.path.join(BASE_DIR, "models")

MIN_ROWS_REQUIRED = 60  # need reasonable history before we bother modeling a market


def load_market_series(crop):
    """Return {market_name: dataframe} for a crop's merged CSV, one series per market."""
    path = os.path.join(MERGED_DIR, f"{crop}.csv")
    if not os.path.exists(path):
        raise FileNotFoundError(f"No merged data for '{crop}'. Run fetch_prices.py + fetch_weather.py first.")
    df = pd.read_csv(path, parse_dates=["date"])
    df = df.sort_values("date")
    return {market: g.reset_index(drop=True) for market, g in df.groupby("market")}


def add_features(df):
    """Lag/rolling/calendar features used by XGBoost."""
    df = df.copy()
    df["lag_7"] = df["modal_price"].shift(7)
    df["lag_14"] = df["modal_price"].shift(14)
    df["rolling_mean_7"] = df["modal_price"].shift(1).rolling(7).mean()
    df["month"] = df["date"].dt.month
    df["day_of_week"] = df["date"].dt.dayofweek
    df["is_harvest_season"] = df["month"].isin([3, 4, 10, 11]).astype(int)  # rough rabi/kharif harvest months
    return df.dropna().reset_index(drop=True)


def split_train_test(df, test_days):
    return df.iloc[:-test_days].reset_index(drop=True), df.iloc[-test_days:].reset_index(drop=True)


def evaluate(y_true, y_pred):
    y_true, y_pred = np.array(y_true), np.array(y_pred)
    return {
        "rmse": round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 2),
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 2),
        "mape": round(float(mean_absolute_percentage_error(y_true, y_pred)) * 100, 2),
    }


def train_sarima(train_df, test_len):
    model = SARIMAX(
        train_df["modal_price"], order=(1, 1, 1), seasonal_order=(1, 1, 1, 7),
        enforce_stationarity=False, enforce_invertibility=False,
    ).fit(disp=False)
    forecast = model.forecast(steps=test_len)
    return model, np.asarray(forecast)


def train_xgboost(train_feat, test_feat):
    feature_cols = ["lag_7", "lag_14", "rolling_mean_7", "month", "day_of_week", "is_harvest_season", "rainfall", "temp"]
    model = xgb.XGBRegressor(n_estimators=200, max_depth=5, learning_rate=0.05)
    model.fit(train_feat[feature_cols], train_feat["modal_price"])
    preds = model.predict(test_feat[feature_cols])
    return model, preds, feature_cols


def train_and_select_best(crop, market, df, test_days):
    if len(df) < MIN_ROWS_REQUIRED:
        print(f"  skip {market}: only {len(df)} rows (< {MIN_ROWS_REQUIRED} minimum)")
        return None

    results = {}
    saved_models = {}

    # --- SARIMA ---
    train_df, test_df = split_train_test(df, test_days)
    try:
        sarima_model, sarima_preds = train_sarima(train_df, len(test_df))
        results["sarima"] = evaluate(test_df["modal_price"], sarima_preds)
        saved_models["sarima"] = sarima_model
    except Exception as e:
        print(f"  SARIMA failed for {market}: {e}")

    # --- XGBoost ---
    try:
        feat_df = add_features(df)
        train_feat, test_feat = split_train_test(feat_df, test_days)
        if len(train_feat) > 10 and len(test_feat) > 0:
            xgb_model, xgb_preds, feature_cols = train_xgboost(train_feat, test_feat)
            results["xgboost"] = evaluate(test_feat["modal_price"], xgb_preds)
            saved_models["xgboost"] = (xgb_model, feature_cols)
    except Exception as e:
        print(f"  XGBoost failed for {market}: {e}")

    if not results:
        print(f"  skip {market}: all models failed")
        return None

    best_name = min(results, key=lambda k: results[k]["mape"])

    print(f"\n  {market}")
    print(f"  {'model':<10}{'RMSE':>10}{'MAE':>10}{'MAPE %':>10}")
    for name, metrics in results.items():
        marker = "  <- best" if name == best_name else ""
        print(f"  {name:<10}{metrics['rmse']:>10}{metrics['mae']:>10}{metrics['mape']:>10}{marker}")

    os.makedirs(MODELS_DIR, exist_ok=True)
    model_path = os.path.join(MODELS_DIR, f"{crop}__{market.replace(' ', '_')}.pkl")
    joblib.dump({
        "crop": crop,
        "market": market,
        "best_model_type": best_name,
        "model": saved_models[best_name],
        "metrics": results[best_name],
        "last_price": float(df["modal_price"].iloc[-1]),
        "last_date": df["date"].iloc[-1].isoformat(),
    }, model_path)
    print(f"  saved -> {model_path}")

    return {"crop": crop, "market": market, "best_model": best_name, **results[best_name]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--crop", help="train only this crop (e.g. tomato)")
    parser.add_argument("--test-days", type=int, default=30, help="held-out test window size")
    args = parser.parse_args()

    crops = [args.crop] if args.crop else [
        f.replace(".csv", "") for f in os.listdir(MERGED_DIR) if f.endswith(".csv")
    ]

    summary = []
    for crop in crops:
        print(f"\n=== {crop.upper()} ===")
        markets = load_market_series(crop)
        for market, df in markets.items():
            result = train_and_select_best(crop, market, df, args.test_days)
            if result:
                summary.append(result)

    print("\n=== SUMMARY: best model per crop-market ===")
    for row in summary:
        print(f"  {row['crop']:<10} {row['market']:<22} -> {row['best_model']:<8} (MAPE {row['mape']}%)")


if __name__ == "__main__":
    main()

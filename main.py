"""
Step 5 - Mandi Cast backend API.

Serves the Mandi Cast React frontend using the models trained in Step 3
and the recommendation logic from Step 4.

Endpoints (shapes match the frontend's mock data exactly):
    GET /crops
    GET /markets?crop=tomato&lat=..&lng=..
    GET /insight?crop=tomato&market=Mattuthavani Mandi
    GET /trends?crop=tomato&market=Mattuthavani Mandi&days=30

Run:
    pip install fastapi uvicorn joblib pandas numpy
    uvicorn main:app --reload --port 8000
"""

import math
import os
from functools import lru_cache

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from recommend import build_insight
from alerts import subscribe as add_subscriber, list_subscribers
from auth_otp import send_otp, verify_otp
from pydantic import BaseModel

BASE_DIR = os.path.dirname(__file__)
MODELS_DIR = os.path.join(BASE_DIR, "models")
MERGED_DIR = os.path.join(BASE_DIR, "data", "merged")

app = FastAPI(title="Mandi Cast API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  # Vite dev server
    allow_methods=["*"],
    allow_headers=["*"],
)

CROPS = [
    {"id": "tomato", "name": "Tomato", "emoji": "\U0001F345"},
    {"id": "onion", "name": "Onion", "emoji": "\U0001F9C5"},
    {"id": "potato", "name": "Potato", "emoji": "\U0001F954"},
    {"id": "chilli", "name": "Chilli", "emoji": "\U0001F336\ufe0f"},
    {"id": "wheat", "name": "Wheat", "emoji": "\U0001F33E"},
    {"id": "soybean", "name": "Soybean", "emoji": "\U0001F331"},
    {"id": "cotton", "name": "Cotton", "emoji": "\U0001F33F"},
]

# Approx market coordinates for distance calc (matches markets used in fetch_prices.py)
MARKET_COORDS = {
    "Mattuthavani Mandi": (9.9252, 78.1198),
    "Oddanchatram Mandi": (10.3624, 77.9695),
    "Dindigul Mandi": (10.3673, 77.9803),
    "Koyambedu Mandi": (13.0827, 80.2707),
    "Lasalgaon Mandi": (19.9975, 73.7898),
}

MARKET_LOCATION = {
    "Mattuthavani Mandi": ("Madurai", "Tamil Nadu"),
    "Oddanchatram Mandi": ("Dindigul", "Tamil Nadu"),
    "Dindigul Mandi": ("Dindigul", "Tamil Nadu"),
    "Koyambedu Mandi": ("Chennai", "Tamil Nadu"),
    "Lasalgaon Mandi": ("Nashik", "Maharashtra"),
}


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


@lru_cache(maxsize=64)
def load_model_bundle(crop, market):
    """Load a saved .pkl model and attach recent price history for forecasting."""
    path = os.path.join(MODELS_DIR, f"{crop}__{market.replace(' ', '_')}.pkl")
    if not os.path.exists(path):
        return None
    bundle = joblib.load(path)

    merged_path = os.path.join(MERGED_DIR, f"{crop}.csv")
    df = pd.read_csv(merged_path, parse_dates=["date"])
    df = df[df["market"] == market].sort_values("date").tail(30).reset_index(drop=True)
    bundle["_last_rows"] = df

    return bundle


@lru_cache(maxsize=1)
def known_crop_markets():
    """Every (crop, market) pair we actually have a saved model for."""
    pairs = []
    for fname in os.listdir(MODELS_DIR):
        if not fname.endswith(".pkl"):
            continue
        crop, market_part = fname[:-4].split("__", 1)
        pairs.append((crop, market_part.replace("_", " ")))
    return pairs


@app.get("/crops")
def get_crops():
    return CROPS


@app.get("/markets")
def get_markets(crop: str = Query(...), lat: float = Query(None), lng: float = Query(None)):
    pairs = [m for c, m in known_crop_markets() if c == crop]
    if not pairs:
        raise HTTPException(404, f"No trained markets for crop '{crop}'")

    results = []
    for market in pairs:
        bundle = load_model_bundle(crop, market)
        if not bundle:
            continue
        mlat, mlng = MARKET_COORDS.get(market, (None, None))
        distance_km = round(haversine_km(lat, lng, mlat, mlng), 1) if (lat and lng and mlat) else None
        district, state = MARKET_LOCATION.get(market, ("", ""))

        results.append({
            "id": market.lower().replace(" ", "-"),
            "name": market,
            "district": district,
            "state": state,
            "price": bundle["last_price"],
            "change_pct": None,  # filled in below relative to the group's average
            "distance_km": distance_km,
            "isBestPrice": False,
        })

    if results:
        avg_price = sum(r["price"] for r in results) / len(results)
        best = max(results, key=lambda r: r["price"])
        best["isBestPrice"] = True
        for r in results:
            r["change_pct"] = round(((r["price"] - avg_price) / avg_price) * 100, 1)

    results.sort(key=lambda r: (r["distance_km"] is None, r["distance_km"]))
    return results


@app.get("/insight")
def get_insight(crop: str = Query(...), market: str = Query(...)):
    bundle = load_model_bundle(crop, market)
    if not bundle:
        raise HTTPException(404, f"No trained model for {crop} / {market}")
    return build_insight(bundle)


@app.get("/trends")
def get_trends(crop: str = Query(...), market: str = Query(...), days: int = Query(30)):
    merged_path = os.path.join(MERGED_DIR, f"{crop}.csv")
    if not os.path.exists(merged_path):
        raise HTTPException(404, f"No data for crop '{crop}'")

    df = pd.read_csv(merged_path, parse_dates=["date"])
    df = df[df["market"] == market].sort_values("date").tail(days)
    if df.empty:
        raise HTTPException(404, f"No data for {crop} / {market}")

    prices = df["modal_price"].tolist()
    return {
        "current": round(prices[-1], 2),
        "average": round(sum(prices) / len(prices), 2),
        "highest": round(max(prices), 2),
        "lowest": round(min(prices), 2),
        "days": [
            {"date": d.strftime("%Y-%m-%d"), "price": round(p, 2)}
            for d, p in zip(df["date"], prices)
        ],
    }


class PhoneRequest(BaseModel):
    phone: str


class VerifyRequest(BaseModel):
    phone: str
    code: str


@app.post("/auth/send-otp")
def auth_send_otp(body: PhoneRequest):
    phone = body.phone.strip()
    if not phone.startswith("+") or len(phone) < 10:
        raise HTTPException(400, "Phone number must be in international format, e.g. +919876543210")
    result = send_otp(phone)
    return result


@app.post("/auth/verify-otp")
def auth_verify_otp(body: VerifyRequest):
    result = verify_otp(body.phone.strip(), body.code.strip())
    if not result["valid"]:
        raise HTTPException(400, f"Invalid code: {result['reason']}")
    return {"status": "verified", "phone": body.phone}


@app.post("/alerts/subscribe")
def subscribe_alert(phone: str = Query(...), crop: str = Query(...), market: str = Query(...), language: str = Query("English")):
    if not phone.startswith("+"):
        raise HTTPException(400, "Phone number must be in international format, e.g. +919876543210")
    result = add_subscriber(phone, crop, market, language)
    return result


@app.get("/")
def root():
    return {"status": "ok", "crop_market_pairs_available": len(known_crop_markets())}

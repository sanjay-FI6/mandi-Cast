"""
Step 1 - Mandi Cast price data pipeline.

Pulls historical daily mandi price data from the data.gov.in
"Variety-wise Daily Market Prices" API for the crops/markets used
in the Mandi Cast frontend, cleans it, and writes one CSV per crop.

Usage:
    export DATA_GOV_API_KEY=your_key_here
    python fetch_prices.py
    python fetch_prices.py --demo      # no key needed, synthetic-but-realistic data

Output:
    data/raw/<crop>.csv   columns: date, market, district, state,
                                   min_price, max_price, modal_price
"""

import argparse
import csv
import os
import random
import time
from datetime import date, timedelta

import requests

RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070"  # data.gov.in mandi prices resource
BASE_URL = f"https://api.data.gov.in/resource/{RESOURCE_ID}"

# Crops shown in the Mandi Cast crop selector
CROPS = ["Tomato", "Onion", "Potato", "Chilli", "Wheat", "Soybean", "Cotton"]

# Markets shown in the Mandi Cast UI -> (district, state) used to filter API results
MARKETS = {
    "Mattuthavani Mandi": ("Madurai", "Tamil Nadu"),
    "Oddanchatram Mandi": ("Dindigul", "Tamil Nadu"),
    "Dindigul Mandi": ("Dindigul", "Tamil Nadu"),
    "Koyambedu Mandi": ("Chennai", "Tamil Nadu"),
    "Lasalgaon Mandi": ("Nashik", "Maharashtra"),
}

OUT_DIR = os.path.join(os.path.dirname(__file__), "data", "raw")
DAYS_OF_HISTORY = 365


def fetch_page(api_key, crop, offset, limit=1000, max_retries=5):
    params = {
        "api-key": api_key,
        "format": "json",
        "limit": limit,
        "offset": offset,
        "filters[commodity]": crop,
    }
    for attempt in range(max_retries):
        try:
            resp = requests.get(BASE_URL, params=params, timeout=60)
            resp.raise_for_status()
            return resp.json().get("records", [])
        except requests.exceptions.RequestException as e:
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt
                print(f"    API request failed ({e.__class__.__name__}). Retrying in {wait_time}s... (Attempt {attempt + 1}/{max_retries})")
                time.sleep(wait_time)
            else:
                print(f"    Failed after {max_retries} attempts.")
                raise


def fetch_real(crop, api_key):
    """Pull all available records for a crop, filtered to our target markets."""
    rows = []
    offset = 0
    while True:
        records = fetch_page(api_key, crop, offset)
        if not records:
            break
        for r in records:
            market = r.get("market", "").strip()
            if market not in MARKETS:
                continue
            district, state = MARKETS[market]
            try:
                rows.append({
                    "date": r.get("arrival_date"),
                    "market": market,
                    "district": district,
                    "state": state,
                    "min_price": float(r.get("min_price", 0)),
                    "max_price": float(r.get("max_price", 0)),
                    "modal_price": float(r.get("modal_price", 0)),
                })
            except (TypeError, ValueError):
                continue  # skip malformed rows instead of crashing the whole pull
        offset += 1000
        time.sleep(0.2)  # be polite to the API
    return rows


def fetch_demo(crop):
    """Synthetic but realistic daily price series per market, for offline dev/testing."""
    base_prices = {
        "Tomato": 2200, "Onion": 1800, "Potato": 1400, "Chilli": 6500,
        "Wheat": 2350, "Soybean": 4200, "Cotton": 7000,
    }
    base = base_prices.get(crop, 2000)
    rows = []
    today = date.today()
    for market, (district, state) in MARKETS.items():
        price = base * random.uniform(0.9, 1.1)
        for i in range(DAYS_OF_HISTORY, 0, -1):
            d = today - timedelta(days=i)
            # mild seasonal wave + daily noise, clamped to stay positive
            seasonal = 1 + 0.15 * random.uniform(-1, 1) * ((i % 90) / 90)
            noise = random.uniform(-0.03, 0.03)
            price = max(price * (1 + noise) * seasonal / seasonal, base * 0.5)
            modal = round(price, 2)
            rows.append({
                "date": d.isoformat(),
                "market": market,
                "district": district,
                "state": state,
                "min_price": round(modal * 0.95, 2),
                "max_price": round(modal * 1.05, 2),
                "modal_price": modal,
            })
    return rows


def clean(rows):
    """Drop duplicates/outliers, sort by date."""
    seen = set()
    cleaned = []
    for r in rows:
        key = (r["date"], r["market"])
        if key in seen or not r["date"] or r["modal_price"] <= 0:
            continue
        seen.add(key)
        cleaned.append(r)
    cleaned.sort(key=lambda r: (r["market"], r["date"]))
    return cleaned


def write_csv(crop, rows):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{crop.lower()}.csv")
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "date", "market", "district", "state",
            "min_price", "max_price", "modal_price",
        ])
        writer.writeheader()
        writer.writerows(rows)
    print(f"  wrote {len(rows):5d} rows -> {path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo", action="store_true", help="generate synthetic data, no API key needed")
    args = parser.parse_args()

    api_key = os.environ.get("DATA_GOV_API_KEY")
    if not args.demo and not api_key:
        raise SystemExit(
            "No DATA_GOV_API_KEY set. Either export it, or run with --demo for synthetic data."
        )

    for crop in CROPS:
        print(f"Fetching {crop} ({'demo' if args.demo else 'live'})...")
        rows = fetch_demo(crop) if args.demo else fetch_real(crop, api_key)
        rows = clean(rows)
        write_csv(crop, rows)


if __name__ == "__main__":
    main()

"""
Step 2 - Mandi Cast weather pipeline.

Fetches historical daily weather (rainfall, temperature) for the districts
used in Mandi Cast via OpenWeatherMap's One Call API 3.0 (timemachine
endpoint), respects the 1,000 calls/day free-tier cap by caching each
fetched day to disk, and merges the result with the price CSVs from
fetch_prices.py into per-crop training-ready CSVs.

Usage:
    export OWM_API_KEY=your_key_here
    python fetch_weather.py              # real historical fetch, resumable
    python fetch_weather.py --demo       # synthetic climatologically-plausible data

Output:
    data/cache/weather_<district>.csv     per-district daily weather (cache)
    data/merged/<crop>.csv                date, market, modal_price, rainfall, temp
"""

import argparse
import csv
import math
import os
import random
import time
from datetime import date, datetime, timedelta

import requests

DAILY_CALL_LIMIT = 1000
DAYS_OF_HISTORY = 365

BASE_DIR = os.path.dirname(__file__)
RAW_DIR = os.path.join(BASE_DIR, "data", "raw")
CACHE_DIR = os.path.join(BASE_DIR, "data", "cache")
MERGED_DIR = os.path.join(BASE_DIR, "data", "merged")

# district -> (lat, lng)
DISTRICTS = {
    "Madurai": (9.9252, 78.1198),
    "Dindigul": (10.3624, 77.9695),
    "Chennai": (13.0827, 80.2707),
    "Nashik": (19.9975, 73.7898),
}

TROPICAL_DISTRICTS = {"Madurai", "Dindigul", "Chennai"}  # Tamil Nadu monsoon pattern
TEMPERATE_DISTRICTS = {"Nashik"}  # Maharashtra climate, slightly cooler/drier


def cache_path(district):
    os.makedirs(CACHE_DIR, exist_ok=True)
    return os.path.join(CACHE_DIR, f"weather_{district.lower()}.csv")


def load_cache(district):
    path = cache_path(district)
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return {row["date"]: row for row in csv.DictReader(f)}


def save_cache(district, rows_by_date):
    path = cache_path(district)
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["date", "rainfall", "temp"])
        writer.writeheader()
        for d in sorted(rows_by_date):
            writer.writerow(rows_by_date[d])


def fetch_one_day(api_key, lat, lng, day):
    """One Call API 3.0 'timemachine' endpoint for a single historical day."""
    ts = int(datetime.combine(day, datetime.min.time()).timestamp())
    url = "https://api.openweathermap.org/data/3.0/onecall/timemachine"
    params = {"lat": lat, "lon": lng, "dt": ts, "appid": api_key, "units": "metric"}
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    payload = resp.json()
    hours = payload.get("data", [{}])
    temps = [h.get("temp") for h in hours if h.get("temp") is not None]
    rain_mm = sum(h.get("rain", {}).get("1h", 0) for h in hours if isinstance(h.get("rain"), dict))
    avg_temp = sum(temps) / len(temps) if temps else None
    return {"date": day.isoformat(), "rainfall": round(rain_mm, 2), "temp": round(avg_temp, 2) if avg_temp else ""}


def fetch_real(api_key):
    """
    Fetch up to DAILY_CALL_LIMIT missing days across all districts, resuming
    from cache each run. Call this script daily until every district has a
    full 365-day history cached.
    """
    calls_made = 0
    for district, (lat, lng) in DISTRICTS.items():
        cached = load_cache(district)
        today = date.today()
        missing_days = [
            today - timedelta(days=i)
            for i in range(DAYS_OF_HISTORY, 0, -1)
            if (today - timedelta(days=i)).isoformat() not in cached
        ]
        if not missing_days:
            print(f"{district}: already fully cached ({DAYS_OF_HISTORY} days)")
            continue

        print(f"{district}: {len(missing_days)} days missing, fetching...")
        for day in missing_days:
            if calls_made >= DAILY_CALL_LIMIT:
                print(f"Hit daily cap of {DAILY_CALL_LIMIT} calls. Re-run tomorrow to continue.")
                save_cache(district, cached)
                return
            try:
                row = fetch_one_day(api_key, lat, lng, day)
                cached[row["date"]] = row
                calls_made += 1
                time.sleep(0.1)
            except requests.HTTPError as e:
                print(f"  warning: failed to fetch {district} {day}: {e}")
        save_cache(district, cached)
        print(f"  {district}: cache now has {len(cached)}/{DAYS_OF_HISTORY} days ({calls_made} calls used so far)")


def fetch_demo():
    """Synthetic but climatologically plausible daily weather, no API needed."""
    today = date.today()
    for district in DISTRICTS:
        cached = load_cache(district)
        is_tropical = district in TROPICAL_DISTRICTS
        for i in range(DAYS_OF_HISTORY, 0, -1):
            d = today - timedelta(days=i)
            key = d.isoformat()
            if key in cached:
                continue
            day_of_year = d.timetuple().tm_yday
            if is_tropical:
                # warm year-round, monsoon bump Jun-Sep
                base_temp = 29 + 3 * math.sin((day_of_year / 365) * 2 * math.pi)
                monsoon = 1.0 if 150 <= day_of_year <= 270 else 0.0
                rainfall = max(0, random.gauss(8 * monsoon, 4))
            else:
                # more seasonal swing, monsoon Jun-Sep, cooler winters
                base_temp = 25 + 8 * math.sin((day_of_year / 365) * 2 * math.pi - 1.2)
                monsoon = 1.0 if 160 <= day_of_year <= 260 else 0.0
                rainfall = max(0, random.gauss(6 * monsoon, 3))
            temp = round(base_temp + random.uniform(-1.5, 1.5), 2)
            cached[key] = {"date": key, "rainfall": round(rainfall, 2), "temp": temp}
        save_cache(district, cached)
        print(f"{district}: demo weather cache complete ({len(cached)} days)")


def merge_prices_with_weather():
    """Join each crop's price CSV with its market's district weather cache."""
    if not os.path.exists(RAW_DIR):
        raise SystemExit("No price data found. Run fetch_prices.py first.")

    os.makedirs(MERGED_DIR, exist_ok=True)
    weather_by_district = {d: load_cache(d) for d in DISTRICTS}

    for fname in os.listdir(RAW_DIR):
        if not fname.endswith(".csv"):
            continue
        crop = fname.replace(".csv", "")
        merged_rows = []
        with open(os.path.join(RAW_DIR, fname)) as f:
            for row in csv.DictReader(f):
                weather = weather_by_district.get(row["district"], {}).get(row["date"])
                if not weather:
                    continue  # skip days we don't have weather for yet
                merged_rows.append({
                    "date": row["date"],
                    "market": row["market"],
                    "modal_price": row["modal_price"],
                    "rainfall": weather["rainfall"],
                    "temp": weather["temp"],
                })
        out_path = os.path.join(MERGED_DIR, f"{crop}.csv")
        with open(out_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["date", "market", "modal_price", "rainfall", "temp"])
            writer.writeheader()
            writer.writerows(merged_rows)
        print(f"merged {crop}: {len(merged_rows)} rows -> {out_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo", action="store_true", help="generate synthetic weather, no API key needed")
    args = parser.parse_args()

    if args.demo:
        fetch_demo()
    else:
        api_key = os.environ.get("OWM_API_KEY")
        if not api_key:
            raise SystemExit("No OWM_API_KEY set. Either export it, or run with --demo.")
        fetch_real(api_key)

    merge_prices_with_weather()


if __name__ == "__main__":
    main()

// src/api.js
//
// Step 6 - live backend integration.
//
// Replaces the static `crops` / `markets` exports in data.js with functions
// that fetch real predictions from the FastAPI backend (main.py), but return
// the EXACT SAME shapes your components already consume - so component code
// barely has to change, just swap where the data comes from.

const API_BASE = 'http://127.0.0.1:8000';

const ICONS = { tomato: '🍅', onion: '🧅', potato: '🥔', chilli: '🌶️', wheat: '🌾', soybean: '🌱', cotton: '🌿' };

// Markets we actually have trained models for. (data.js has 8, our backend
// currently has 5 - Azadpur/Guntur/Indore aren't trained yet.)
const KNOWN_MARKETS = ['Mattuthavani Mandi', 'Oddanchatram Mandi', 'Dindigul Mandi', 'Koyambedu Mandi', 'Lasalgaon Mandi'];

async function getJSON(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
  return res.json();
}

/**
 * Fetch all crops with their live recommendation for a given market.
 * Shape matches data.js's `crops` export:
 *   { id, name, icon, price, change, recommendation, confidence }
 */
export async function fetchCrops(market = 'Mattuthavani Mandi') {
  const cropList = await getJSON('/crops'); // [{id, name, emoji}, ...]

  const results = await Promise.all(
    cropList.map(async (c) => {
      try {
        const insight = await getJSON(`/insight?crop=${c.id}&market=${encodeURIComponent(market)}`);
        const trend = await getJSON(`/trends?crop=${c.id}&market=${encodeURIComponent(market)}&days=2`);
        const change = trend.days.length >= 2
          ? Number((((trend.current - trend.days[0].price) / trend.days[0].price) * 100).toFixed(1))
          : 0;

        return {
          id: c.id,
          name: c.name,
          icon: ICONS[c.id] || c.emoji,
          price: insight.price,
          change,
          recommendation: insight.recommendation === 'SELL NOW' ? 'SELL' : insight.recommendation, // matches data.js's 'SELL'/'WAIT' values
          confidence: insight.confidence_pct,
        };
      } catch (e) {
        console.warn(`No trained model for ${c.id} / ${market}, skipping`, e);
        return null;
      }
    })
  );

  return results.filter(Boolean);
}

/**
 * Fetch nearby markets with live prices for a given crop.
 * Shape matches data.js's `markets` export:
 *   { id, name, city, state, distance, prices: { <crop>: price, ... } }
 */
export async function fetchMarkets(cropId, lat, lng) {
  const rows = await getJSON(`/markets?crop=${cropId}&lat=${lat}&lng=${lng}`);

  return rows.map((r) => ({
    id: r.name.toLowerCase().replace(/\s+mandi$/i, '').replace(/\s+/g, '-'),
    name: r.name,
    city: r.district || r.name.replace(' Mandi', ''),
    state: r.state || '',
    distance: r.distance_km ?? null,
    isBestPrice: r.isBestPrice,
    prices: { [cropId]: r.price }, // only the requested crop's price is live; see note below
  }));
}

/**
 * Fetch the AI insight card content (Sell Now / Wait / Stable) for one crop+market.
 */
export async function fetchInsight(cropId, market) {
  return getJSON(`/insight?crop=${cropId}&market=${encodeURIComponent(market)}`);
}

/**
 * Fetch price trend history for the chart page.
 */
export async function fetchTrends(cropId, market, days = 30) {
  return getJSON(`/trends?crop=${cropId}&market=${encodeURIComponent(market)}&days=${days}`);
}

export const money = (value) => `₹${Number(value).toLocaleString('en-IN')}`;

export { KNOWN_MARKETS };

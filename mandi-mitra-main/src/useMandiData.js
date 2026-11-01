// src/useMandiData.js
//
// Example of how to replace `import { crops, markets } from './data'`
// with live backend data. Use this pattern in whichever component
// currently imports the static arrays.

import { useEffect, useState } from 'react';
import { fetchCrops, fetchMarkets } from './api';

/**
 * Drop-in replacement for `import { crops } from './data'`.
 * Usage in a component:
 *
 *   const { crops, loading, error } = useCrops('Mattuthavani Mandi');
 *   if (loading) return <p>Loading prices...</p>;
 *   if (error) return <p>Could not load prices.</p>;
 *   // crops is the same shape as the old static array
 */
export function useCrops(market = 'Mattuthavani Mandi') {
  const [crops, setCrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCrops(market)
      .then((data) => { if (!cancelled) setCrops(data); })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [market]);

  return { crops, loading, error };
}

/**
 * Drop-in replacement for `import { markets } from './data'`.
 * Needs the selected crop + user's lat/lng (falls back to Madurai's
 * coordinates if geolocation isn't available/granted).
 */
export function useMarkets(cropId, lat = 9.9252, lng = 78.1198) {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!cropId) return;
    let cancelled = false;
    setLoading(true);
    fetchMarkets(cropId, lat, lng)
      .then((data) => { if (!cancelled) setMarkets(data); })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cropId, lat, lng]);

  return { markets, loading, error };
}

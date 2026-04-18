import { GOOGLE_MAPS_API_KEY } from '@/lib/env';
import {
  cacheKey,
  cacheLog,
  CacheTTL,
  readEnvelope,
  writeEnvelope,
  isSoftFresh,
} from '@/services/cache/cacheService';

function geocodeCacheKey(lat: number, lng: number) {
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  return cacheKey('geocode_v1', `${r(lat)}_${r(lng)}`);
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const coordsFallback = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  const gKey = geocodeCacheKey(lat, lng);
  const env = await readEnvelope<string>(gKey);
  if (env?.data && isSoftFresh(env)) {
    cacheLog('geocode', 'hit');
    return env.data;
  }

  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY.trim() === '') {
    return coordsFallback;
  }

  try {
    const params = new URLSearchParams({
      latlng: `${lat},${lng}`,
      language: 'pt',
      key: GOOGLE_MAPS_API_KEY,
    });
    const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return coordsFallback;
    }

    const json = await response.json();
    if (json.status !== 'OK' || !Array.isArray(json.results) || json.results.length === 0) {
      return coordsFallback;
    }

    const address = String(json.results[0].formatted_address ?? coordsFallback);
    await writeEnvelope(gKey, address, CacheTTL.reverseGeocode, CacheTTL.reverseGeocode);
    cacheLog('geocode', 'set');
    return address;
  } catch {
    return coordsFallback;
  }
}

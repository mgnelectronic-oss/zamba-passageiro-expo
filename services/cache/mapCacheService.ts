import type { VehicleCategory } from '@/services/rideService';
import { primeMapCenter, primeMapRegionSnapshot } from '@/services/mapLocationMemory';
import {
  cacheKey,
  cacheLog,
  CacheTTL,
  readEnvelope,
  writeEnvelope,
  removeKey,
  isSoftFresh,
  isWithinMaxAge,
} from '@/services/cache/cacheService';

/** Última localização conhecida (ecrã inicial / mapa). */
export type LastKnownLocation = {
  lat: number;
  lng: number;
  address: string;
};

/** Região do mapa para reutilizar centro aproximado. */
export type MapRegionSnapshot = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type DirectionsCacheValue = {
  coordinates: { latitude: number; longitude: number }[];
  distanceKm: number;
  durationMin: number;
};

const VEHICLE_KEY = cacheKey('map', 'vehicle_categories_v2');
const LAST_LOC_KEY = cacheKey('map', 'last_location_v1');
const REGION_KEY = cacheKey('map', 'last_region_v1');

function directionsKey(originLat: number, originLng: number, destLat: number, destLng: number) {
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  return cacheKey('directions_v1', `${r(originLat)}_${r(originLng)}_${r(destLat)}_${r(destLng)}`);
}

export const mapCacheService = {
  async getVehicleCategories(): Promise<VehicleCategory[] | null> {
    const env = await readEnvelope<VehicleCategory[]>(VEHICLE_KEY);
    if (!env?.data?.length) {
      cacheLog('map_categories', 'miss');
      return null;
    }
    if (!isSoftFresh(env)) {
      cacheLog('map_categories', 'expire');
      return null;
    }
    cacheLog('map_categories', 'hit');
    return env.data;
  },

  async setVehicleCategories(categories: VehicleCategory[]): Promise<void> {
    await writeEnvelope(VEHICLE_KEY, categories, CacheTTL.vehicleCategories, CacheTTL.vehicleCategories);
    cacheLog('map_categories', 'set');
  },

  async getDirections(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<DirectionsCacheValue | null> {
    const key = directionsKey(originLat, originLng, destLat, destLng);
    const env = await readEnvelope<DirectionsCacheValue>(key);
    if (!env?.data?.coordinates?.length) {
      cacheLog('map_directions', 'miss');
      return null;
    }
    if (!isSoftFresh({ ...env, softTtlMs: CacheTTL.directionsRoute, maxTtlMs: CacheTTL.directionsRoute })) {
      cacheLog('map_directions', 'expire');
      return null;
    }
    cacheLog('map_directions', 'hit');
    return env.data;
  },

  async setDirections(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
    value: DirectionsCacheValue,
  ): Promise<void> {
    const key = directionsKey(originLat, originLng, destLat, destLng);
    await writeEnvelope(key, value, CacheTTL.directionsRoute, CacheTTL.directionsRoute);
    cacheLog('map_directions', 'set');
  },

  async getLastKnownLocation(): Promise<LastKnownLocation | null> {
    const env = await readEnvelope<LastKnownLocation>(LAST_LOC_KEY);
    const v = env?.data;
    if (!v || typeof v.lat !== 'number' || typeof v.lng !== 'number') return null;
    if (!isWithinMaxAge(env)) return null;
    cacheLog('map_location', 'hit');
    return v;
  },

  async setLastKnownLocation(lat: number, lng: number, address: string): Promise<void> {
    const payload: LastKnownLocation = { lat, lng, address };
    primeMapCenter(lat, lng);
    const day = 24 * 60 * 60 * 1000;
    await writeEnvelope(LAST_LOC_KEY, payload, day, day);
    cacheLog('map_location', 'set');
  },

  async getLastMapRegion(): Promise<MapRegionSnapshot | null> {
    const env = await readEnvelope<MapRegionSnapshot>(REGION_KEY);
    const v = env?.data;
    if (!v || typeof v.latitude !== 'number') return null;
    if (!isWithinMaxAge(env)) return null;
    cacheLog('map_region', 'hit');
    return v;
  },

  async setLastMapRegion(region: MapRegionSnapshot): Promise<void> {
    primeMapRegionSnapshot(region);
    const day = 24 * 60 * 60 * 1000;
    await writeEnvelope(REGION_KEY, region, day, day);
    cacheLog('map_region', 'set');
  },

  async clearEphemeral(): Promise<void> {
    await removeKey(LAST_LOC_KEY);
    await removeKey(REGION_KEY);
    cacheLog('map_location', 'invalidate');
  },
};

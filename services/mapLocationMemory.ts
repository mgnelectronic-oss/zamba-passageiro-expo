/** Compatível com `MapRegionSnapshot` em mapCacheService (evita import circular). */
export type PrimedMapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/** Maputo — fallback quando não há cache. */
const FALLBACK_LAT = -25.9692;
const FALLBACK_LNG = 32.5732;
const DEFAULT_DELTA = 0.02;

let primedRegion: PrimedMapRegion | null = null;

export function primeMapRegionSnapshot(region: PrimedMapRegion): void {
  if (
    typeof region.latitude !== 'number' ||
    typeof region.longitude !== 'number' ||
    !Number.isFinite(region.latitude) ||
    !Number.isFinite(region.longitude)
  ) {
    return;
  }
  primedRegion = {
    latitude: region.latitude,
    longitude: region.longitude,
    latitudeDelta:
      typeof region.latitudeDelta === 'number' && Number.isFinite(region.latitudeDelta)
        ? region.latitudeDelta
        : DEFAULT_DELTA,
    longitudeDelta:
      typeof region.longitudeDelta === 'number' && Number.isFinite(region.longitudeDelta)
        ? region.longitudeDelta
        : DEFAULT_DELTA,
  };
}

export function primeMapCenter(lat: number, lng: number): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  primeMapRegionSnapshot({
    latitude: lat,
    longitude: lng,
    latitudeDelta: DEFAULT_DELTA,
    longitudeDelta: DEFAULT_DELTA,
  });
}

/** Região inicial para MapView (última conhecida ou Maputo). */
export function getPrimedInitialRegion(): PrimedMapRegion {
  if (primedRegion) return primedRegion;
  return {
    latitude: FALLBACK_LAT,
    longitude: FALLBACK_LNG,
    latitudeDelta: DEFAULT_DELTA,
    longitudeDelta: DEFAULT_DELTA,
  };
}

import { isValidMapCoord } from '@/lib/geo';
import {
  evaluateDriverCurrentLocation,
  logPassengerDriverLiveLocation,
  type DriverCurrentLocationRow,
} from '@/services/driverLocationService';

export type PickupDriverLocationSource =
  | 'driver_locations_current'
  | 'driver_info'
  | 'ride_state'
  | 'live_route'
  | 'none';

export type ResolvedPickupDriverLocation = {
  lat?: number;
  lng?: number;
  source: PickupDriverLocationSource;
};

export type PickupDriverLiveLocation = {
  row: DriverCurrentLocationRow;
  isValid: boolean;
  isStale: boolean;
  ageMs: number | null;
};

function tryCoords(lat?: number | null, lng?: number | null): { lat: number; lng: number } | null {
  if (lat == null || lng == null) return null;
  if (!isValidMapCoord(lat, lng)) return null;
  return { lat, lng };
}

export function resolvePickupDriverMapLocation(input: {
  liveLocation: PickupDriverLiveLocation | null;
  driverInfoLat?: number | null;
  driverInfoLng?: number | null;
  stateDriverLat?: number | null;
  stateDriverLng?: number | null;
  liveRouteLat?: number | null;
  liveRouteLng?: number | null;
}): ResolvedPickupDriverLocation {
  const live = input.liveLocation;

  if (live?.isValid && !live.isStale) {
    return {
      lat: live.row.lat,
      lng: live.row.lng,
      source: 'driver_locations_current',
    };
  }

  if (live?.isValid && live.isStale) {
    logPassengerDriverLiveLocation('stale live location', {
      lat: live.row.lat,
      lng: live.row.lng,
      updatedAt: live.row.updated_at,
      ageMs: live.ageMs,
    });
  }

  const fromInfo = tryCoords(input.driverInfoLat, input.driverInfoLng);
  if (fromInfo) {
    return { ...fromInfo, source: 'driver_info' };
  }

  const fromState = tryCoords(input.stateDriverLat, input.stateDriverLng);
  if (fromState) {
    return { ...fromState, source: 'ride_state' };
  }

  const fromRoute = tryCoords(input.liveRouteLat, input.liveRouteLng);
  if (fromRoute) {
    return { ...fromRoute, source: 'live_route' };
  }

  if (live?.isValid && live.isStale) {
    logPassengerDriverLiveLocation('fallback stale live location', {
      lat: live.row.lat,
      lng: live.row.lng,
      updatedAt: live.row.updated_at,
      ageMs: live.ageMs,
    });
    return {
      lat: live.row.lat,
      lng: live.row.lng,
      source: 'driver_locations_current',
    };
  }

  return { source: 'none' };
}

export function toPickupDriverLiveLocation(
  row: DriverCurrentLocationRow | null,
  nowMs = Date.now(),
): PickupDriverLiveLocation | null {
  if (!row) return null;
  const evaluated = evaluateDriverCurrentLocation(row, nowMs);
  if (!evaluated.isValid || !evaluated.row) return null;
  return {
    row: evaluated.row,
    isValid: evaluated.isValid,
    isStale: evaluated.isStale,
    ageMs: evaluated.ageMs,
  };
}

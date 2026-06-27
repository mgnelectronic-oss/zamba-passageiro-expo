import type { MapLatLng } from '@/components/maps/types';
import type { PassengerVisualState } from '@/lib/passengerRideVisualState';
import type { NavigationPhase } from '@/components/maps/types';

const LOG = '[PASSENGER MAPBOX LOCATION]';

export type PassengerMapLocationSource = 'gps' | 'context' | 'pickup' | 'none';

export function logPassengerMapboxLocation(message: string, extra?: Record<string, unknown>) {
  if (!__DEV__) return;
  if (extra) {
    console.log(LOG, message, extra);
  } else {
    console.log(LOG, message);
  }
}

export function logPassengerMapLocationState(input: {
  visual: PassengerVisualState | null;
  phase: NavigationPhase | 'none';
  passengerAvailable: boolean;
  driverAvailable: boolean;
  indicatorSource: PassengerMapLocationSource;
  driverMarkerHidden: boolean;
  fallback?: PassengerMapLocationSource;
}) {
  logPassengerMapboxLocation('state', {
    visual: input.visual,
    phase: input.phase,
    passengerLocation: input.passengerAvailable,
    driverLocation: input.driverAvailable,
    indicatorSource: input.indicatorSource,
    driverMarkerDisabled: input.driverMarkerHidden,
    ...(input.fallback ? { fallback: input.fallback } : {}),
  });
}

export function coordsFromPassengerLocation(
  coords: { latitude: number; longitude: number } | null | undefined,
): MapLatLng | null {
  if (!coords) return null;
  return { latitude: coords.latitude, longitude: coords.longitude };
}

export function normalizePassengerGpsHeading(heading: number | null | undefined): number | null {
  if (heading == null || !Number.isFinite(heading) || heading < 0 || heading > 360 || heading === -1) {
    return null;
  }
  return heading;
}

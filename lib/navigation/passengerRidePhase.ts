import type { LiveRoute } from '@/services/rideService';
import type { PassengerVisualState } from '@/lib/passengerRideVisualState';
import type { MapLatLng, NavigationPhase } from '@/components/maps/types';
import { isValidMapCoord } from '@/lib/geo';

export type PassengerMapMode = 'overview' | 'follow' | 'static';

export function parseMapCoord(lat?: number | null, lng?: number | null): MapLatLng | null {
  if (lat == null || lng == null) return null;
  if (!isValidMapCoord(lat, lng)) return null;
  return { latitude: lat, longitude: lng };
}

export function resolvePassengerNavigationPhase(
  uiState: string,
  routePhase?: LiveRoute['route_phase'] | null,
): NavigationPhase | 'none' {
  if (routePhase === 'to_pickup') return 'to_pickup';
  if (routePhase === 'to_destination') return 'to_destination';
  if (uiState === 'driver_en_route' || uiState === 'driver_arrived') return 'to_pickup';
  if (uiState === 'on_trip') return 'to_destination';
  return 'none';
}

export function resolvePassengerMapMode(
  visual: PassengerVisualState | null,
  uiState: string,
): PassengerMapMode {
  if (visual === 'on_trip') return 'follow';
  if (visual === 'driver_assigned' || visual === 'driver_arrived') return 'overview';
  if (visual === 'completed' || visual === 'cancelled') return 'static';
  if (uiState === 'on_trip') return 'follow';
  return 'overview';
}

export function shouldShowPickupMarker(
  visual: PassengerVisualState | null,
  phase: NavigationPhase | 'none',
): boolean {
  return visual !== 'on_trip' && phase === 'to_pickup';
}

export function shouldShowDestinationMarker(
  visual: PassengerVisualState | null,
  phase: NavigationPhase | 'none',
): boolean {
  return visual === 'on_trip' || phase === 'to_destination';
}

/** Trim só na recolha — em on_trip a polyline oficial não é alterada. */
export function shouldTrimRouteLine(visual: PassengerVisualState | null): boolean {
  return visual === 'driver_assigned' || visual === 'driver_arrived';
}

/** Viagem activa em direcção ao destino final (passageiro a bordo). */
export function isActiveTripToFinalDestination(
  visual: PassengerVisualState | null,
  _phase?: NavigationPhase | 'none',
): boolean {
  return visual === 'on_trip';
}

/** Marcador do motorista visível só na recolha — em on_trip o puck do passageiro é o indicador principal. */
export function shouldShowDriverMarker(
  visual: PassengerVisualState | null,
  _phase: NavigationPhase | 'none',
): boolean {
  return visual === 'driver_assigned' || visual === 'driver_arrived';
}

export function resolveOverviewEndpoints(input: {
  visual: PassengerVisualState | null;
  phase: NavigationPhase | 'none';
  driver: MapLatLng | null;
  pickup: MapLatLng | null;
  destination: MapLatLng | null;
}): { start: MapLatLng | null; end: MapLatLng | null } {
  const { visual, phase, driver, pickup, destination } = input;
  if (visual === 'driver_assigned' || phase === 'to_pickup') {
    return { start: driver ?? pickup, end: pickup };
  }
  if (visual === 'driver_arrived' || phase === 'to_destination') {
    return { start: pickup ?? driver, end: destination };
  }
  if (visual === 'on_trip') {
    return { start: pickup ?? driver, end: destination };
  }
  return { start: driver ?? pickup, end: destination ?? pickup };
}

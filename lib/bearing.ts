import type { MapLatLng } from '@/components/maps/types';

export function bearingBetween(a: MapLatLng, b: MapLatLng): number {
  const φ1 = (a.latitude * Math.PI) / 180;
  const φ2 = (b.latitude * Math.PI) / 180;
  const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (((θ * 180) / Math.PI) + 360) % 360;
}

const MIN_MOVEMENT_METERS = 3;

function haversineMeters(a: MapLatLng, b: MapLatLng): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearingFromGpsMovement(
  previous: MapLatLng | null,
  current: MapLatLng,
  fallbackBearing: number,
): number {
  if (!previous) return fallbackBearing;
  const moved = haversineMeters(previous, current);
  if (moved < MIN_MOVEMENT_METERS) return fallbackBearing;
  return bearingBetween(previous, current);
}

export function lerpHeadingDeg(current: number, target: number, t: number): number {
  const diff = ((((target - current + 540) % 360) + 360) % 360) - 180;
  return (current + diff * t + 360) % 360;
}

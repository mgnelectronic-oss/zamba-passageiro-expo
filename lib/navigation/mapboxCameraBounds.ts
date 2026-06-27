import type { MapLatLng } from '@/components/maps/types';
import { haversineKm } from '@/lib/geo';

export type MapboxCameraBounds = {
  ne: [number, number];
  sw: [number, number];
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
  minZoomLevel?: number;
  maxZoomLevel: number;
};

export type LngLatBounds = {
  ne: [number, number];
  sw: [number, number];
};

export function boundsFromPoints(points: MapLatLng[]): LngLatBounds | null {
  if (points.length === 0) return null;

  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;

  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }

  if (minLat === maxLat) {
    minLat -= 0.002;
    maxLat += 0.002;
  }
  if (minLng === maxLng) {
    minLng -= 0.002;
    maxLng += 0.002;
  }

  return {
    ne: [maxLng, maxLat],
    sw: [minLng, minLat],
  };
}

export function collectRouteBoundsPoints(
  origin: MapLatLng | null,
  destination: MapLatLng | null,
  routeCoords: MapLatLng[],
): MapLatLng[] {
  const points: MapLatLng[] = [];
  if (origin) points.push(origin);
  if (destination) points.push(destination);
  for (const coord of routeCoords) points.push(coord);
  return points;
}

export function buildMapboxFitCameraConfig(
  origin: MapLatLng | null,
  destination: MapLatLng | null,
  routeCoords: MapLatLng[],
  extraPadding?: Partial<MapboxCameraBounds>,
): MapboxCameraBounds | null {
  const points = collectRouteBoundsPoints(origin, destination, routeCoords);
  if (points.length === 0) return null;
  const bounds = boundsFromPoints(points);
  if (!bounds) return null;

  const distKm =
    origin && destination
      ? haversineKm(origin.latitude, origin.longitude, destination.latitude, destination.longitude)
      : 6;

  return {
    ne: bounds.ne,
    sw: bounds.sw,
    paddingTop: extraPadding?.paddingTop ?? 80,
    paddingBottom: extraPadding?.paddingBottom ?? 120,
    paddingLeft: extraPadding?.paddingLeft ?? 40,
    paddingRight: extraPadding?.paddingRight ?? 40,
    maxZoomLevel: extraPadding?.maxZoomLevel ?? 15.5,
    ...(distKm <= 5 ? { minZoomLevel: 14 } : {}),
  };
}

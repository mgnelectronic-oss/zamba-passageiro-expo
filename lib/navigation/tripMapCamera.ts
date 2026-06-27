import { haversineKm, isValidMapCoord, offsetLatLngAlongBearing } from '@/lib/geo';
import {
  bearingAlongPolyline,
  bearingForwardAlongPolyline,
  bearingBetween,
  coordinateAtDistanceAlongPolyline,
  projectionAlongPolyline,
  rejectSharpBearingFlip,
  shortestAngleDiffDeg,
} from '@/lib/navigation/routeBearing';
import {
  NAV_CAMERA_ANIM_MS,
  NAV_CAMERA_CENTER_OFFSET_M,
  NAV_CAMERA_FOLLOW_DIST_THRESHOLD_M,
  NAV_CAMERA_FOLLOW_MS,
  NAV_CAMERA_HEADING_ONLY_DEG,
  NAV_CAMERA_MAX_IDLE_MS,
  NAV_CAMERA_MIN_HEADING_DEG,
  NAV_CAMERA_MIN_MOVE_M,
  NAV_CAMERA_ROTATION_MS,
  NAV_ROUTE_HEADING_LOOKAHEAD_M,
} from '@/lib/navigation/navigationCamera';
import type { MapLatLng } from '@/components/maps/types';

export type NavigationCameraState = {
  lat: number;
  lng: number;
  h: number;
  t: number;
};

export function isValidCoordinate(lat: number, lng: number): boolean {
  return isValidMapCoord(lat, lng);
}

export function smoothHeading(previousHeading: number, nextHeading: number, alpha = 0.18): number {
  if (!Number.isFinite(previousHeading)) return nextHeading;
  if (!Number.isFinite(nextHeading)) return previousHeading;
  const diff = shortestAngleDiffDeg(previousHeading, nextHeading);
  return (previousHeading + diff * alpha + 360) % 360;
}

export function getPointAhead(
  lat: number,
  lng: number,
  headingDeg: number,
  distanceMeters = NAV_CAMERA_CENTER_OFFSET_M,
): MapLatLng {
  return offsetLatLngAlongBearing(lat, lng, headingDeg, distanceMeters);
}

export function getRouteNavigationHeading(
  driverLocation: MapLatLng,
  routeCoords: MapLatLng[],
  lookaheadMeters = NAV_ROUTE_HEADING_LOOKAHEAD_M,
): number | null {
  if (routeCoords.length < 2) return null;
  return (
    bearingForwardAlongPolyline(
      routeCoords,
      driverLocation.latitude,
      driverLocation.longitude,
      lookaheadMeters,
    ) ?? bearingAlongPolyline(routeCoords, driverLocation.latitude, driverLocation.longitude)
  );
}

export function resolveNavigationHeading(
  driverLocation: MapLatLng,
  routeCoords: MapLatLng[],
  previousHeading: number,
  previousLocation: MapLatLng | null,
  lookaheadMeters = NAV_ROUTE_HEADING_LOOKAHEAD_M,
): number {
  const routeBearing = getRouteNavigationHeading(driverLocation, routeCoords, lookaheadMeters);
  if (routeBearing != null) return routeBearing;
  if (previousLocation) {
    const movedM = haversineKm(
      previousLocation.latitude,
      previousLocation.longitude,
      driverLocation.latitude,
      driverLocation.longitude,
    ) * 1000;
    if (movedM >= 5) {
      return rejectSharpBearingFlip(previousHeading, bearingBetween(previousLocation, driverLocation));
    }
  }
  return previousHeading;
}

export function shouldUpdateNavigationCamera(
  prev: NavigationCameraState | null,
  lat: number,
  lng: number,
  heading: number,
  now = Date.now(),
): boolean {
  if (!prev) return true;
  const distM = haversineKm(prev.lat, prev.lng, lat, lng) * 1000;
  const dH = Math.abs(shortestAngleDiffDeg(prev.h, heading));
  const headingThreshold =
    distM < NAV_CAMERA_MIN_MOVE_M ? NAV_CAMERA_HEADING_ONLY_DEG : NAV_CAMERA_MIN_HEADING_DEG;
  return (
    distM > NAV_CAMERA_MIN_MOVE_M ||
    dH >= headingThreshold ||
    now - prev.t > NAV_CAMERA_MAX_IDLE_MS
  );
}

export function getNavigationCameraDuration(distMeters: number, headingDeltaDeg = 0): number {
  if (distMeters < 1.5 && headingDeltaDeg >= NAV_CAMERA_HEADING_ONLY_DEG) {
    return NAV_CAMERA_ROTATION_MS;
  }
  return distMeters < NAV_CAMERA_FOLLOW_DIST_THRESHOLD_M
    ? NAV_CAMERA_FOLLOW_MS
    : NAV_CAMERA_ANIM_MS;
}

export function getNextRoutePoint(
  currentLocation: MapLatLng,
  routeCoordinates: MapLatLng[],
  lookaheadMeters: number,
): MapLatLng | null {
  if (routeCoordinates.length < 2) return null;
  const projection = projectionAlongPolyline(
    routeCoordinates,
    currentLocation.latitude,
    currentLocation.longitude,
  );
  if (!projection) return null;
  return coordinateAtDistanceAlongPolyline(
    routeCoordinates,
    projection.distAlong + Math.max(lookaheadMeters, 12),
  );
}

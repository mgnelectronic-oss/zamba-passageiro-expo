import type { MapLatLng } from '@/components/maps/types';
import { haversineKm, isValidMapCoord } from '@/lib/geo';
import {
  bearingForwardAlongPolyline,
  chaseDistanceAlongPolyline,
  coordinateAtDistanceAlongPolyline,
  projectionAlongPolyline,
  shortestAngleDiffDeg,
} from '@/lib/navigation/routeBearing';
import { polylineLengthMeters } from '@/lib/navigation/polylineMetrics';
import {
  NAV_HEADING_SMOOTH_ALPHA,
  NAV_ROUTE_HEADING_LOOKAHEAD_M,
} from '@/lib/navigation/navigationCamera';
import { getRouteNavigationHeading, smoothHeading } from '@/lib/navigation/tripMapCamera';

export type PassengerRouteDisplayState = {
  distAlongM: number | null;
  prevHeading: number;
  prevDriver: MapLatLng | null;
};

export function createPassengerRouteDisplayState(): PassengerRouteDisplayState {
  return { distAlongM: null, prevHeading: 0, prevDriver: null };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function copyCoord(c: MapLatLng): MapLatLng {
  return { latitude: c.latitude, longitude: c.longitude };
}

function sliceRemainingFromDistance(coords: MapLatLng[], distAlongM: number): MapLatLng[] {
  if (coords.length < 2) return [...coords];
  const start = coordinateAtDistanceAlongPolyline(coords, distAlongM);
  if (!start) return [...coords];
  const out: MapLatLng[] = [copyCoord(start)];
  const projection = projectionAlongPolyline(coords, start.latitude, start.longitude);
  const startIndex = projection ? Math.min(coords.length - 2, Math.max(0, Math.floor(projection.distAlong))) : 0;
  for (let i = startIndex + 1; i < coords.length; i++) {
    out.push(copyCoord(coords[i]));
  }
  if (out.length < 2 && coords.length >= 2) {
    out.push(copyCoord(coords[coords.length - 1]));
  }
  return out.length >= 2 ? out : coords.map(copyCoord);
}

export type PassengerRouteDisplayInput = {
  routeCoords: MapLatLng[];
  driverLocation: MapLatLng | null;
  state: PassengerRouteDisplayState;
  trimEnabled: boolean;
};

export type PassengerRouteDisplayResult = {
  drawCoords: MapLatLng[];
  heading: number;
  progressPercent: number;
  anchorPoint: MapLatLng | null;
};

export function computePassengerRouteDisplay(
  input: PassengerRouteDisplayInput,
): PassengerRouteDisplayResult {
  const { routeCoords, driverLocation, state, trimEnabled } = input;
  const validRoute = routeCoords.filter((c) => isValidMapCoord(c.latitude, c.longitude));

  if (validRoute.length < 2) {
    return {
      drawCoords: validRoute,
      heading: state.prevHeading,
      progressPercent: 0,
      anchorPoint: driverLocation,
    };
  }

  if (!driverLocation || !isValidMapCoord(driverLocation.latitude, driverLocation.longitude)) {
    return {
      drawCoords: validRoute,
      heading: state.prevHeading,
      progressPercent: 0,
      anchorPoint: null,
    };
  }

  const routeLengthM = polylineLengthMeters(validRoute);
  const projection = projectionAlongPolyline(
    validRoute,
    driverLocation.latitude,
    driverLocation.longitude,
  );

  let distAlongM = projection?.distAlong ?? 0;
  if (trimEnabled) {
    distAlongM = chaseDistanceAlongPolyline(state.distAlongM, distAlongM);
    state.distAlongM = distAlongM;
  }

  const anchorRaw =
    coordinateAtDistanceAlongPolyline(validRoute, distAlongM) ??
    projection?.point ??
    driverLocation;
  const anchorPoint = copyCoord(anchorRaw);

  const routeHeading =
    getRouteNavigationHeading(anchorPoint, validRoute, NAV_ROUTE_HEADING_LOOKAHEAD_M) ??
    state.prevHeading;
  const heading = smoothHeading(state.prevHeading, routeHeading, NAV_HEADING_SMOOTH_ALPHA);
  state.prevHeading = heading;
  state.prevDriver = copyCoord(driverLocation);

  const progressPercent =
    routeLengthM > 0 ? clamp((distAlongM / routeLengthM) * 100, 0, 100) : 0;

  const drawCoords = trimEnabled
    ? sliceRemainingFromDistance(validRoute, distAlongM)
    : validRoute.map(copyCoord);

  return {
    drawCoords: drawCoords.length >= 2 ? drawCoords : validRoute.map(copyCoord),
    heading,
    progressPercent,
    anchorPoint,
  };
}

export function shouldSmoothDriverMove(prev: MapLatLng | null, next: MapLatLng): boolean {
  if (!prev) return true;
  return haversineKm(prev.latitude, prev.longitude, next.latitude, next.longitude) * 1000 > 2;
}

export function smoothDriverHeading(prev: number, next: number): number {
  if (Math.abs(shortestAngleDiffDeg(prev, next)) < 2) return prev;
  return smoothHeading(prev, next, NAV_HEADING_SMOOTH_ALPHA);
}

import type { MapLatLng } from '@/components/maps/types';
import { haversineKm } from '@/lib/geo';
import { NAV_ROUTE_LINE_START_OFFSET_M } from '@/lib/navigation/navigationCamera';
import { logPassengerMapRotation } from '@/lib/navigation/passengerMapRotationLog';
import { sliceRouteFromDistanceAlong } from '@/lib/navigation/passengerNavigationAnchor';
import { polylineLengthMeters } from '@/lib/navigation/polylineMetrics';
import {
  coordinateAtDistanceAlongPolyline,
  projectionAlongPolyline,
} from '@/lib/navigation/routeBearing';

const ONTRIP_LOG = '[PASSENGER ONTRIP PUCK SYNC]';

export const ROUTE_SYNC_MAX_OFF_ROUTE_M = 45;

const MIN_POINT_SPACING_M = 0.35;

function copyCoord(c: MapLatLng): MapLatLng {
  return { latitude: c.latitude, longitude: c.longitude };
}

function coordsEqual(a: MapLatLng, b: MapLatLng): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < 1e-7 && Math.abs(a.longitude - b.longitude) < 1e-7
  );
}

function filterValidCoords(coords: MapLatLng[]): MapLatLng[] {
  return coords.filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));
}

function isValidDistAlong(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v) && v >= 0;
}

export function buildRemainingRouteFromMarkerVisual(
  fullRoute: MapLatLng[],
  markerVisual: MapLatLng,
  distAlongM: number,
): MapLatLng[] {
  const route = filterValidCoords(fullRoute);
  if (route.length < 2) return route;

  const { remaining } = sliceRouteFromDistanceAlong(route, distAlongM);
  const routePoint = coordinateAtDistanceAlongPolyline(route, distAlongM);
  const start = copyCoord(routePoint ?? markerVisual);
  const out: MapLatLng[] = [start];

  for (const c of remaining) {
    if (coordsEqual(c, start)) continue;
    const last = out[out.length - 1];
    if (haversineKm(last.latitude, last.longitude, c.latitude, c.longitude) * 1000 < MIN_POINT_SPACING_M) {
      continue;
    }
    out.push(copyCoord(c));
  }

  if (out.length < 2) {
    const end = route[route.length - 1];
    if (!coordsEqual(end, start)) out.push(copyCoord(end));
  }

  return out.length >= 2 ? out : route.map(copyCoord);
}

export type SyncRouteLineWithMarkerInput = {
  fullRoute: MapLatLng[];
  markerVisual: MapLatLng;
  markerDistAlongM?: number | null;
  maxOffRouteM?: number;
};

export type SyncRouteLineWithMarkerResult = {
  coords: MapLatLng[];
  synced: boolean;
  offRoute: boolean;
  distAlongM: number | null;
  lineStartOffsetM: number;
  trimmedAheadOfMarker: boolean;
};

function buildRemainingRouteAheadOfMarker(
  route: MapLatLng[],
  markerDistAlongM: number,
): { coords: MapLatLng[]; lineStartDist: number; trimmedAheadOfMarker: boolean } {
  const routeLengthM = polylineLengthMeters(route);
  const lineStartDist = Math.min(
    routeLengthM,
    markerDistAlongM + NAV_ROUTE_LINE_START_OFFSET_M,
  );
  const lineStartPoint =
    coordinateAtDistanceAlongPolyline(route, lineStartDist) ??
    coordinateAtDistanceAlongPolyline(route, markerDistAlongM);
  if (!lineStartPoint) {
    return { coords: route, lineStartDist: markerDistAlongM, trimmedAheadOfMarker: false };
  }

  const remaining = buildRemainingRouteFromMarkerVisual(route, lineStartPoint, lineStartDist);
  return {
    coords: remaining,
    lineStartDist,
    trimmedAheadOfMarker: lineStartDist > markerDistAlongM + 0.5,
  };
}

/**
 * Corta a polyline com base na posição visual do passageiro (mesma fonte do puck).
 */
export function syncRouteLineWithMarkerVisual(
  input: SyncRouteLineWithMarkerInput,
): SyncRouteLineWithMarkerResult {
  const {
    fullRoute,
    markerVisual,
    markerDistAlongM,
    maxOffRouteM = ROUTE_SYNC_MAX_OFF_ROUTE_M,
  } = input;
  const route = filterValidCoords(fullRoute);

  if (route.length < 2) {
    return {
      coords: route,
      synced: false,
      offRoute: false,
      distAlongM: null,
      lineStartOffsetM: NAV_ROUTE_LINE_START_OFFSET_M,
      trimmedAheadOfMarker: false,
    };
  }

  if (isValidDistAlong(markerDistAlongM)) {
    const { coords, lineStartDist, trimmedAheadOfMarker } = buildRemainingRouteAheadOfMarker(
      route,
      markerDistAlongM,
    );
    if (coords.length >= 2) {
      logPassengerMapRotation('polyline trimmed ahead of marker', {
        markerDistAlongM: Math.round(markerDistAlongM),
        lineStartDist: Math.round(lineStartDist),
        lineStartOffsetM: NAV_ROUTE_LINE_START_OFFSET_M,
        remainingPoints: coords.length,
        trimmedAheadOfMarker,
      });
      return {
        coords,
        synced: true,
        offRoute: false,
        distAlongM: markerDistAlongM,
        lineStartOffsetM: NAV_ROUTE_LINE_START_OFFSET_M,
        trimmedAheadOfMarker,
      };
    }
    return {
      coords: route,
      synced: false,
      offRoute: false,
      distAlongM: markerDistAlongM,
      lineStartOffsetM: NAV_ROUTE_LINE_START_OFFSET_M,
      trimmedAheadOfMarker: false,
    };
  }

  const projection = projectionAlongPolyline(route, markerVisual.latitude, markerVisual.longitude);
  if (!projection) {
    return {
      coords: route,
      synced: false,
      offRoute: false,
      distAlongM: null,
      lineStartOffsetM: NAV_ROUTE_LINE_START_OFFSET_M,
      trimmedAheadOfMarker: false,
    };
  }

  const distanceToRouteM =
    haversineKm(
      markerVisual.latitude,
      markerVisual.longitude,
      projection.point.latitude,
      projection.point.longitude,
    ) * 1000;

  if (distanceToRouteM > maxOffRouteM) {
    if (__DEV__) {
      console.log(ONTRIP_LOG, 'polyline trim blocked — off-route', {
        distanceToRouteM: Math.round(distanceToRouteM),
        maxOffRouteM,
      });
    }
    return {
      coords: route,
      synced: false,
      offRoute: true,
      distAlongM: projection.distAlong,
      lineStartOffsetM: NAV_ROUTE_LINE_START_OFFSET_M,
      trimmedAheadOfMarker: false,
    };
  }

  const { coords, lineStartDist, trimmedAheadOfMarker } = buildRemainingRouteAheadOfMarker(
    route,
    projection.distAlong,
  );
  if (coords.length < 2) {
    return {
      coords: route,
      synced: false,
      offRoute: false,
      distAlongM: projection.distAlong,
      lineStartOffsetM: NAV_ROUTE_LINE_START_OFFSET_M,
      trimmedAheadOfMarker: false,
    };
  }

  logPassengerMapRotation('polyline trimmed ahead of marker', {
    markerDistAlongM: Math.round(projection.distAlong),
    lineStartDist: Math.round(lineStartDist),
    lineStartOffsetM: NAV_ROUTE_LINE_START_OFFSET_M,
    remainingPoints: coords.length,
    trimmedAheadOfMarker,
  });

  return {
    coords,
    synced: true,
    offRoute: false,
    distAlongM: projection.distAlong,
    lineStartOffsetM: NAV_ROUTE_LINE_START_OFFSET_M,
    trimmedAheadOfMarker,
  };
}

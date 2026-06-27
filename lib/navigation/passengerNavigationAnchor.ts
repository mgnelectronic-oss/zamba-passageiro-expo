/**
 * Âncora visual do passageiro na polyline oficial (ride_live_route).
 * Adaptado de navigationAnchor.ts do motorista — só leitura da rota, sem recálculo.
 */

import type { MapLatLng } from '@/components/maps/types';
import { haversineKm, isValidMapCoord } from '@/lib/geo';
import {
  NAV_HEADING_SMOOTH_ALPHA,
  NAV_ROUTE_HEADING_LOOKAHEAD_M,
} from '@/lib/navigation/navigationCamera';
import { polylineLengthMeters } from '@/lib/navigation/polylineMetrics';
import {
  bearingForwardAlongPolyline,
  chaseDistanceForwardOnly,
  coordinateAtDistanceAlongPolyline,
  projectionAlongPolyline,
  projectionAlongPolylineForward,
  rejectSharpBearingFlip,
  type MapCoord,
} from '@/lib/navigation/routeBearing';
import { logPassengerMapRotation } from '@/lib/navigation/passengerMapRotationLog';
import {
  getRouteNavigationHeading,
  smoothHeading,
} from '@/lib/navigation/tripMapCamera';

const LOG = '[PASSENGER ROUTE ANCHOR]';

/** Dentro desta margem (m): snap obrigatório à polyline. */
export const PASSENGER_ANCHOR_SNAP_ZONE_M = 25;

/** Distância máxima (m) do GPS à polyline para snap visual. */
export const PASSENGER_ANCHOR_MAX_OFF_ROUTE_M = 45;

/** Recuo máximo (m) na projeção forward — evita saltos a segmentos já ultrapassados. */
export const PASSENGER_ANCHOR_MAX_BACKWARD_M = 8;

/** Salto máximo (m) ao longo da rota aceite quando o GPS moveu pouco. */
export const PASSENGER_ANCHOR_MAX_DIST_ALONG_JUMP_M = 35;

const MIN_GPS_MOVE_FOR_JUMP_REJECT_M = 20;

function bearingFromRouteAhead(
  fullRoute: MapLatLng[],
  distAlongM: number,
  prevHeading: number,
): { bearing: number; futurePoint: MapLatLng | null } {
  const routePoint =
    coordinateAtDistanceAlongPolyline(fullRoute, distAlongM) ??
    fullRoute[0] ??
    null;
  if (!routePoint) {
    return { bearing: prevHeading, futurePoint: null };
  }

  const aheadDist = distAlongM + NAV_ROUTE_HEADING_LOOKAHEAD_M;
  const futurePoint = coordinateAtDistanceAlongPolyline(fullRoute, aheadDist);

  const raw =
    bearingForwardAlongPolyline(
      fullRoute,
      routePoint.latitude,
      routePoint.longitude,
      NAV_ROUTE_HEADING_LOOKAHEAD_M,
    ) ?? getRouteNavigationHeading(routePoint, fullRoute, NAV_ROUTE_HEADING_LOOKAHEAD_M);

  if (raw == null || !Number.isFinite(raw)) {
    return { bearing: prevHeading, futurePoint: futurePoint ? copyCoord(futurePoint) : null };
  }

  const candidate = rejectSharpBearingFlip(prevHeading, raw);
  const bearing =
    !Number.isFinite(prevHeading) || prevHeading === 0
      ? candidate
      : smoothHeading(prevHeading, candidate, NAV_HEADING_SMOOTH_ALPHA);

  return {
    bearing,
    futurePoint: futurePoint ? copyCoord(futurePoint) : null,
  };
}

export type PassengerNavigationAnchorState = {
  distAlongM: number | null;
  prevHeading: number;
  prevReal: MapLatLng | null;
  lastValidAnchor: MapLatLng | null;
};

export function createPassengerNavigationAnchorState(): PassengerNavigationAnchorState {
  return { distAlongM: null, prevHeading: 0, prevReal: null, lastValidAnchor: null };
}

export function resetPassengerNavigationAnchorState(state: PassengerNavigationAnchorState): void {
  state.distAlongM = null;
  state.prevHeading = 0;
  state.prevReal = null;
  state.lastValidAnchor = null;
}

export type PassengerNavigationAnchorInput = {
  gps: MapLatLng;
  fullRouteCoords: MapLatLng[];
  state: PassengerNavigationAnchorState;
  gpsHeading?: number | null;
  routeSessionKey: string;
};

export type PassengerNavigationAnchorResult = {
  gps: MapLatLng;
  anchorPoint: MapLatLng;
  distAlongM: number;
  progressPercent: number;
  routeLengthM: number;
  remainingRouteCoordinates: MapLatLng[];
  heading: number;
  distanceGpsToRouteM: number | null;
  onRoute: boolean;
  usedFallback: boolean;
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function copyCoord(c: MapLatLng): MapLatLng {
  return { latitude: c.latitude, longitude: c.longitude };
}

function coordsEqual(a: MapLatLng, b: MapLatLng, eps = 1e-7): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < eps && Math.abs(a.longitude - b.longitude) < eps
  );
}

function segmentLengthM(a: MapCoord, b: MapCoord): number {
  return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) * 1000;
}

export function logPassengerRouteAnchor(message: string, extra?: Record<string, unknown>): void {
  if (!__DEV__) return;
  if (extra) console.log(LOG, message, extra);
  else console.log(LOG, message);
}

/** Constrói coordenadas desde `distAlongM` até ao fim da polyline. */
export function sliceRouteFromDistanceAlong(
  coords: MapLatLng[],
  distAlongM: number,
): { remaining: MapLatLng[]; traveled: MapLatLng[] } {
  if (coords.length < 2) {
    return { remaining: [...coords], traveled: [] };
  }

  const totalM = polylineLengthMeters(coords);
  const along = clamp(distAlongM, 0, totalM);

  const startPoint = coordinateAtDistanceAlongPolyline(coords, along);
  if (!startPoint) {
    return { remaining: [...coords], traveled: [] };
  }

  if (along <= 0) {
    return { remaining: [...coords], traveled: [] };
  }

  if (along >= totalM - 0.5) {
    return {
      remaining: [copyCoord(coords[coords.length - 1])],
      traveled: coords.map(copyCoord),
    };
  }

  const traveled: MapLatLng[] = [copyCoord(coords[0])];
  let acc = 0;
  let cutVertexIndex = coords.length - 1;

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const leg = segmentLengthM(a, b);
    if (acc + leg >= along) {
      cutVertexIndex = i + 1;
      if (segmentLengthM(traveled[traveled.length - 1], startPoint) > 2) {
        traveled.push(copyCoord(startPoint));
      }
      break;
    }
    acc += leg;
    traveled.push(copyCoord(b));
  }

  const remaining: MapLatLng[] = [copyCoord(startPoint)];
  for (let i = cutVertexIndex; i < coords.length; i++) {
    const c = coords[i];
    const last = remaining[remaining.length - 1];
    if (coordsEqual(c, last)) continue;
    remaining.push(copyCoord(c));
  }

  if (remaining.length < 2 && coords.length >= 2) {
    const end = coords[coords.length - 1];
    if (!coordsEqual(end, startPoint)) {
      remaining.push(copyCoord(end));
    }
  }

  return { remaining, traveled };
}

function buildRemainingFromAnchor(
  fullRoute: MapLatLng[],
  anchorPoint: MapLatLng,
  distAlongM: number,
): MapLatLng[] {
  const { remaining } = sliceRouteFromDistanceAlong(fullRoute, distAlongM);
  const out: MapLatLng[] = [copyCoord(anchorPoint)];

  for (let i = 0; i < remaining.length; i++) {
    const c = remaining[i];
    if (coordsEqual(c, anchorPoint)) continue;
    out.push(copyCoord(c));
  }

  if (out.length < 2 && fullRoute.length >= 2) {
    const end = fullRoute[fullRoute.length - 1];
    if (!coordsEqual(end, anchorPoint)) {
      out.push(copyCoord(end));
    }
  }

  return out.length >= 2 ? out : fullRoute.map(copyCoord);
}

function resolvePassengerAnchorHeading(
  fullRoute: MapLatLng[],
  distAlongM: number,
  state: PassengerNavigationAnchorState,
): number {
  const { bearing } = bearingFromRouteAhead(fullRoute, distAlongM, state.prevHeading);
  return bearing;
}

function fallbackFromGps(
  gps: MapLatLng,
  state: PassengerNavigationAnchorState,
  usedFallback: boolean,
): PassengerNavigationAnchorResult {
  return {
    gps,
    anchorPoint: copyCoord(gps),
    distAlongM: state.distAlongM ?? 0,
    progressPercent: 0,
    routeLengthM: 0,
    remainingRouteCoordinates: [],
    heading: state.prevHeading,
    distanceGpsToRouteM: null,
    onRoute: false,
    usedFallback,
  };
}

/**
 * Projecta o GPS bruto na polyline oficial e devolve âncora visual estável.
 */
export function computePassengerNavigationAnchor(
  input: PassengerNavigationAnchorInput,
): PassengerNavigationAnchorResult {
  const { gps, fullRouteCoords, state, gpsHeading, routeSessionKey } = input;
  const fullRoute = fullRouteCoords.filter(
    (c) => isValidMapCoord(c.latitude, c.longitude),
  );

  if (fullRoute.length < 2) {
    logPassengerRouteAnchor('route absent — fallback to raw gps', { routeSessionKey });
    return fallbackFromGps(gps, state, true);
  }

  const routeLengthM = polylineLengthMeters(fullRoute);
  const minAlong =
    state.distAlongM != null
      ? Math.max(0, state.distAlongM - PASSENGER_ANCHOR_MAX_BACKWARD_M)
      : 0;
  const projection =
    state.distAlongM != null
      ? projectionAlongPolylineForward(fullRoute, gps.latitude, gps.longitude, minAlong)
      : projectionAlongPolyline(fullRoute, gps.latitude, gps.longitude);

  if (!projection) {
    logPassengerRouteAnchor('projection failed — fallback to raw gps', { routeSessionKey });
    return fallbackFromGps(gps, state, true);
  }

  const distanceGpsToRouteM =
    haversineKm(gps.latitude, gps.longitude, projection.point.latitude, projection.point.longitude) *
    1000;

  if (distanceGpsToRouteM > PASSENGER_ANCHOR_MAX_OFF_ROUTE_M) {
    if (state.lastValidAnchor) {
      logPassengerRouteAnchor('gps far from route — keeping last valid anchor', {
        distanceGpsToRouteM: Math.round(distanceGpsToRouteM),
        maxOffRouteM: PASSENGER_ANCHOR_MAX_OFF_ROUTE_M,
      });
      const distAlongM = state.distAlongM ?? 0;
      const anchorPoint = copyCoord(
        coordinateAtDistanceAlongPolyline(fullRoute, distAlongM) ?? state.lastValidAnchor,
      );
      const heading = resolvePassengerAnchorHeading(fullRoute, distAlongM, state);
      state.prevHeading = heading;
      state.prevReal = copyCoord(gps);
      return {
        gps,
        anchorPoint,
        distAlongM,
        progressPercent: routeLengthM > 0 ? clamp((distAlongM / routeLengthM) * 100, 0, 100) : 0,
        routeLengthM,
        remainingRouteCoordinates: buildRemainingFromAnchor(fullRoute, anchorPoint, distAlongM),
        heading,
        distanceGpsToRouteM,
        onRoute: false,
        usedFallback: false,
      };
    }

    logPassengerRouteAnchor('gps far from route — fallback to raw gps', {
      distanceGpsToRouteM: Math.round(distanceGpsToRouteM),
    });
    return fallbackFromGps(gps, state, true);
  }

  let targetAlong = clamp(projection.distAlong, 0, routeLengthM);

  const gpsMovedM =
    state.prevReal != null
      ? haversineKm(state.prevReal.latitude, state.prevReal.longitude, gps.latitude, gps.longitude) *
        1000
      : 999;

  if (
    state.distAlongM != null &&
    gpsMovedM < MIN_GPS_MOVE_FOR_JUMP_REJECT_M &&
    Math.abs(targetAlong - state.distAlongM) > PASSENGER_ANCHOR_MAX_DIST_ALONG_JUMP_M
  ) {
    logPassengerRouteAnchor('distAlong jump rejected — keeping forward progress', {
      targetAlong: Math.round(targetAlong),
      prevDistAlongM: Math.round(state.distAlongM),
      gpsMovedM: Math.round(gpsMovedM),
    });
    targetAlong = state.distAlongM;
  }

  const distAlongM = chaseDistanceForwardOnly(state.distAlongM, targetAlong);
  state.distAlongM = distAlongM;

  const anchorPoint = copyCoord(
    coordinateAtDistanceAlongPolyline(fullRoute, distAlongM) ?? projection.point,
  );
  state.lastValidAnchor = anchorPoint;

  const { bearing: heading, futurePoint } = bearingFromRouteAhead(
    fullRoute,
    distAlongM,
    state.prevHeading,
  );
  state.prevHeading = heading;
  state.prevReal = copyCoord(gps);

  const progressPercent =
    routeLengthM > 0 ? clamp((distAlongM / routeLengthM) * 100, 0, 100) : 0;

  const remainingRouteCoordinates = buildRemainingFromAnchor(fullRoute, anchorPoint, distAlongM);

  logPassengerMapRotation('anchor computed', {
    routeSessionKey,
    routePoints: fullRoute.length,
    gps: { lat: gps.latitude, lng: gps.longitude },
    anchor: { lat: anchorPoint.latitude, lng: anchorPoint.longitude },
    distanceGpsToRouteM: Math.round(distanceGpsToRouteM),
    distAlongM: Math.round(distAlongM),
    progressPercent: Math.round(progressPercent),
    futurePoint: futurePoint
      ? { lat: futurePoint.latitude, lng: futurePoint.longitude }
      : null,
    bearingCalculated: Math.round(heading),
    remainingRoutePoints: remainingRouteCoordinates.length,
  });

  if (distanceGpsToRouteM > PASSENGER_ANCHOR_SNAP_ZONE_M) {
    logPassengerRouteAnchor('gps adjusted to polyline', {
      distanceGpsToRouteM: Math.round(distanceGpsToRouteM),
      distAlongM: Math.round(distAlongM),
      snapZoneM: PASSENGER_ANCHOR_SNAP_ZONE_M,
    });
  }

  return {
    gps,
    anchorPoint,
    distAlongM,
    progressPercent,
    routeLengthM,
    remainingRouteCoordinates,
    heading,
    distanceGpsToRouteM,
    onRoute: true,
    usedFallback: false,
  };
}

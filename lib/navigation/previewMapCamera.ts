import type { MapLatLng } from '@/components/maps/types';
import { haversineKm } from '@/lib/geo';
import { boundsFromPoints, type LngLatBounds } from '@/lib/navigation/mapboxCameraBounds';
import {
  MAPBOX_ROUTE_OVERVIEW_BEARING,
  MAPBOX_ROUTE_OVERVIEW_PITCH,
} from '@/lib/navigation/navigationCamera';

export type MapboxRouteOverviewEdgeInsets = {
  top: number;
  left: number;
  bottom: number;
  right: number;
};

export type MapboxRouteOverviewCameraConfig = {
  bounds: {
    ne: [number, number];
    sw: [number, number];
    paddingTop: number;
    paddingBottom: number;
    paddingLeft: number;
    paddingRight: number;
  };
  overviewPadding: MapboxRouteOverviewEdgeInsets;
  maxZoomLevel: number;
  bearing: typeof MAPBOX_ROUTE_OVERVIEW_BEARING;
  pitch: typeof MAPBOX_ROUTE_OVERVIEW_PITCH;
  fitKey: string;
  distanceKm: number;
};

const OVERVIEW_TOP_RATIO = 0.08;
const OVERVIEW_BOTTOM_RATIO = 0.16;
const OVERVIEW_LEFT_RATIO = 0.08;
const OVERVIEW_RIGHT_RATIO = 0.16;
const OVERVIEW_MIN_TOP_PX = 32;
const OVERVIEW_MIN_BOTTOM_PX = 64;
const OVERVIEW_MIN_LEFT_PX = 28;
const OVERVIEW_MIN_RIGHT_PX = 36;
const OVERVIEW_SIDE_ACTIONS_RESERVE_PX = 118;
const OVERVIEW_BOUNDS_MIN_PAD_DEG = 0.00018;
const OVERVIEW_BOUNDS_SPAN_PAD_RATIO = 0.06;

function isValidCoord(loc: MapLatLng | null | undefined): loc is MapLatLng {
  if (!loc) return false;
  const { latitude: lat, longitude: lng } = loc;
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function isValidLngLatBounds(bounds: {
  ne: [number, number];
  sw: [number, number];
} | null | undefined): bounds is { ne: [number, number]; sw: [number, number] } {
  if (!bounds) return false;
  const [neLng, neLat] = bounds.ne;
  const [swLng, swLat] = bounds.sw;
  return [neLng, neLat, swLng, swLat].every(
    (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 180,
  );
}

export function routePathDistanceKm(coords: MapLatLng[]): number {
  if (coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineKm(
      coords[i - 1].latitude,
      coords[i - 1].longitude,
      coords[i].latitude,
      coords[i].longitude,
    );
  }
  return total;
}

export function effectiveRouteDistanceKm(
  start: MapLatLng,
  end: MapLatLng,
  routeCoords: MapLatLng[],
): number {
  const directKm = haversineKm(start.latitude, start.longitude, end.latitude, end.longitude);
  const pathKm = routePathDistanceKm(routeCoords);
  return Math.max(directKm, pathKm);
}

export function routeOverviewLocationBucket(loc: MapLatLng): string {
  return `${loc.latitude.toFixed(4)}:${loc.longitude.toFixed(4)}`;
}

export function computeMapboxRouteOverviewEdgeInsets(
  mapHeight: number | undefined,
  mapWidth: number | undefined,
  reserveSideActions = false,
): MapboxRouteOverviewEdgeInsets {
  const h = mapHeight != null && mapHeight > 0 ? mapHeight : 400;
  const w = mapWidth != null && mapWidth > 0 ? mapWidth : 360;
  return {
    top: Math.round(Math.max(OVERVIEW_MIN_TOP_PX, h * OVERVIEW_TOP_RATIO)),
    bottom: Math.round(Math.max(OVERVIEW_MIN_BOTTOM_PX, h * OVERVIEW_BOTTOM_RATIO)),
    left: Math.round(Math.max(OVERVIEW_MIN_LEFT_PX, w * OVERVIEW_LEFT_RATIO)),
    right: Math.round(
      Math.max(OVERVIEW_MIN_RIGHT_PX, w * OVERVIEW_RIGHT_RATIO) +
        (reserveSideActions ? OVERVIEW_SIDE_ACTIONS_RESERVE_PX : 0),
    ),
  };
}

export function collectRouteOverviewGeometryPoints(
  start: MapLatLng,
  end: MapLatLng,
  routeCoords: MapLatLng[],
): MapLatLng[] {
  const validRoute = routeCoords.filter(isValidCoord);
  return [start, end, ...validRoute];
}

function expandRouteOverviewBounds(bounds: LngLatBounds): LngLatBounds {
  const latSpan = Math.abs(bounds.ne[1] - bounds.sw[1]);
  const lngSpan = Math.abs(bounds.ne[0] - bounds.sw[0]);
  const padLat = Math.max(latSpan * OVERVIEW_BOUNDS_SPAN_PAD_RATIO, OVERVIEW_BOUNDS_MIN_PAD_DEG);
  const padLng = Math.max(lngSpan * OVERVIEW_BOUNDS_SPAN_PAD_RATIO, OVERVIEW_BOUNDS_MIN_PAD_DEG);
  return {
    ne: [bounds.ne[0] + padLng, bounds.ne[1] + padLat],
    sw: [bounds.sw[0] - padLng, bounds.sw[1] - padLat],
  };
}

export function routeOverviewMaxZoomForDistanceKm(routeDistanceKm: number): number {
  if (routeDistanceKm < 0.25) return 17.2;
  if (routeDistanceKm < 0.8) return 16.8;
  if (routeDistanceKm < 2) return 16;
  if (routeDistanceKm < 5) return 15;
  if (routeDistanceKm < 12) return 14;
  if (routeDistanceKm < 25) return 13;
  return 12;
}

export function routeOverviewFallbackZoomForDistanceKm(routeDistanceKm: number): number {
  if (routeDistanceKm < 0.5) return 14.5;
  if (routeDistanceKm < 2) return 13.5;
  if (routeDistanceKm <= 8) return 12.2;
  if (routeDistanceKm <= 20) return 11;
  return 10;
}

export type BuildMapboxRouteOverviewCameraInput = {
  start: MapLatLng | null;
  end: MapLatLng | null;
  routeCoords: MapLatLng[];
  fitKeySuffix: string;
  mapHeight?: number;
  mapWidth?: number;
  trackStartLocation?: boolean;
  reserveSideActions?: boolean;
  /** Boost adicional ao zoom máximo — usado em arrived para zoom mais próximo. */
  maxZoomBoost?: number;
};

export function buildMapboxRouteOverviewCameraConfig(
  input: BuildMapboxRouteOverviewCameraInput,
): MapboxRouteOverviewCameraConfig | null {
  const {
    start,
    end,
    routeCoords,
    fitKeySuffix,
    mapHeight,
    mapWidth,
    trackStartLocation,
    reserveSideActions,
    maxZoomBoost = 0,
  } = input;

  if (!isValidCoord(start) || !isValidCoord(end)) return null;

  const geometryPoints = collectRouteOverviewGeometryPoints(start, end, routeCoords);
  if (geometryPoints.length < 2) return null;

  const rawBounds = boundsFromPoints(geometryPoints);
  if (!isValidLngLatBounds(rawBounds)) return null;

  const bounds = expandRouteOverviewBounds(rawBounds);
  if (!isValidLngLatBounds(bounds)) return null;

  const distanceKm = effectiveRouteDistanceKm(start, end, routeCoords.filter(isValidCoord));
  const overviewPadding = computeMapboxRouteOverviewEdgeInsets(mapHeight, mapWidth, reserveSideActions);
  const maxZoomLevel = Math.min(routeOverviewMaxZoomForDistanceKm(distanceKm) + maxZoomBoost, 17.2);
  const layoutKey = `${Math.round(mapHeight ?? 0)}x${Math.round(mapWidth ?? 0)}`;
  const startBucket = trackStartLocation ? routeOverviewLocationBucket(start) : null;

  return {
    bounds: {
      ne: bounds.ne,
      sw: bounds.sw,
      paddingTop: overviewPadding.top,
      paddingBottom: overviewPadding.bottom,
      paddingLeft: overviewPadding.left,
      paddingRight: overviewPadding.right,
    },
    overviewPadding,
    maxZoomLevel,
    bearing: MAPBOX_ROUTE_OVERVIEW_BEARING,
    pitch: MAPBOX_ROUTE_OVERVIEW_PITCH,
    fitKey: [
      fitKeySuffix,
      startBucket ?? 'fixed-origin',
      distanceKm.toFixed(2),
      routeCoords.filter(isValidCoord).length,
      layoutKey,
    ].join('|'),
    distanceKm,
  };
}

export function routeOverviewFallbackCenter(start: MapLatLng, end: MapLatLng): [number, number] {
  return [(start.longitude + end.longitude) / 2, (start.latitude + end.latitude) / 2];
}

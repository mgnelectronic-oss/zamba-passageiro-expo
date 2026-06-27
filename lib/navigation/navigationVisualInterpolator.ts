/**
 * Interpolação visual do puck entre âncoras — adaptado do motorista.
 * Gera posição/heading ao longo da polyline para CustomLocationProvider.
 */

import type { MapLatLng } from '@/components/maps/types';
import { haversineKm } from '@/lib/geo';
import { polylineLengthMeters } from '@/lib/navigation/polylineMetrics';
import {
  coordinateAtDistanceAlongPolyline,
  projectionAlongPolyline,
} from '@/lib/navigation/routeBearing';
import { NAV_ROUTE_HEADING_LOOKAHEAD_M } from '@/lib/navigation/navigationCamera';
import { getRouteNavigationHeading, smoothHeading } from '@/lib/navigation/tripMapCamera';

export const NAV_VISUAL_TELEPORT_DISTANCE_M = 50;
export const NAV_VISUAL_MIN_ANIMATE_DISTANCE_M = 0.35;
export const NAV_VISUAL_KEY_POINT_SPACING_M = 3.5;
export const NAV_VISUAL_MAX_KEY_POINTS = 48;
export const NAV_VISUAL_ANIMATION_MS = 1000;
export const NAV_VISUAL_MIN_ANIMATION_MS = 280;
export const NAV_VISUAL_MAX_ANIMATION_MS = 1200;
export const NAV_VISUAL_MAX_BACKWARD_DIST_M = 2;
export const NAV_VISUAL_HEADING_ALPHA = 0.22;

export type VisualAnimationSegment = {
  fromDistAlongM: number;
  toDistAlongM: number;
  fromHeading: number;
  toHeading: number;
  keyPoints: MapLatLng[];
  distanceBetweenAnchorsM: number;
  isTeleport: boolean;
  durationMs: number;
  previousAnchor: MapLatLng;
  nextAnchor: MapLatLng;
};

export type VisualAnimationFrame = {
  position: MapLatLng;
  heading: number;
  distAlongM: number;
  animationProgress: number;
  keyPointsCount: number;
  isTeleport: boolean;
};

export type VisualAnimationRuntimeState = {
  routeSessionKey: string | null;
  distAlongM: number | null;
  heading: number;
  anchor: MapLatLng | null;
};

export function createVisualAnimationRuntimeState(): VisualAnimationRuntimeState {
  return {
    routeSessionKey: null,
    distAlongM: null,
    heading: 0,
    anchor: null,
  };
}

export function shouldResetVisualAnimation(
  runtime: VisualAnimationRuntimeState,
  routeSessionKey: string,
): boolean {
  return runtime.routeSessionKey != null && runtime.routeSessionKey !== routeSessionKey;
}

export function applyVisualAnimationReset(runtime: VisualAnimationRuntimeState): void {
  runtime.distAlongM = null;
  runtime.heading = 0;
  runtime.anchor = null;
}

export function syncVisualAnimationRuntimeAfterReset(
  runtime: VisualAnimationRuntimeState,
  routeSessionKey: string,
): void {
  runtime.routeSessionKey = routeSessionKey;
}

function copyCoord(c: MapLatLng): MapLatLng {
  return { latitude: c.latitude, longitude: c.longitude };
}

function distanceBetween(a: MapLatLng, b: MapLatLng): number {
  return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) * 1000;
}

export function resolveDistAlongForAnchor(
  routeCoordinates: MapLatLng[],
  anchor: MapLatLng,
  fallbackDistAlongM: number | null = null,
): number {
  const route = routeCoordinates.filter(
    (c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude),
  );
  if (route.length < 2) {
    return fallbackDistAlongM ?? 0;
  }
  const projection = projectionAlongPolyline(route, anchor.latitude, anchor.longitude);
  if (projection) return Math.max(0, projection.distAlong);
  return fallbackDistAlongM ?? 0;
}

export function buildVisualKeyPointsAlongRoute(
  routeCoordinates: MapLatLng[],
  fromDistAlongM: number,
  toDistAlongM: number,
): MapLatLng[] {
  const route = routeCoordinates.filter(
    (c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude),
  );
  if (route.length < 2) {
    return [copyCoord(route[0] ?? { latitude: 0, longitude: 0 })];
  }

  const totalM = polylineLengthMeters(route);
  const from = Math.max(0, Math.min(fromDistAlongM, totalM));
  const to = Math.max(0, Math.min(toDistAlongM, totalM));
  const span = Math.abs(to - from);

  if (span < NAV_VISUAL_MIN_ANIMATE_DISTANCE_M) {
    const end = coordinateAtDistanceAlongPolyline(route, to);
    return end ? [copyCoord(end)] : [];
  }

  const steps = Math.min(
    NAV_VISUAL_MAX_KEY_POINTS,
    Math.max(2, Math.ceil(span / NAV_VISUAL_KEY_POINT_SPACING_M) + 1),
  );

  const points: MapLatLng[] = [];
  for (let i = 0; i < steps; i++) {
    const t = steps <= 1 ? 1 : i / (steps - 1);
    const dist = from + (to - from) * t;
    const pt = coordinateAtDistanceAlongPolyline(route, dist);
    if (pt) points.push(copyCoord(pt));
  }

  return dedupeConsecutivePoints(points);
}

function dedupeConsecutivePoints(points: MapLatLng[]): MapLatLng[] {
  if (points.length <= 1) return points;
  const out: MapLatLng[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const cur = points[i];
    if (distanceBetween(prev, cur) < 0.15) continue;
    out.push(cur);
  }
  return out.length > 0 ? out : points;
}

export function computeVisualAnimationDurationMs(distanceAlongRouteM: number): number {
  const d = Math.max(0, distanceAlongRouteM);
  if (d < NAV_VISUAL_MIN_ANIMATE_DISTANCE_M) return 0;
  const scaled = NAV_VISUAL_ANIMATION_MS * (0.45 + 0.55 * Math.min(1, d / 18));
  return Math.round(
    Math.min(NAV_VISUAL_MAX_ANIMATION_MS, Math.max(NAV_VISUAL_MIN_ANIMATION_MS, scaled)),
  );
}

function easeOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) ** 3;
}

export function buildVisualAnimationSegment(input: {
  routeCoordinates: MapLatLng[];
  previousAnchor: MapLatLng;
  nextAnchor: MapLatLng;
  previousDistAlongM: number | null;
  nextDistAlongM: number;
  previousHeading: number;
  nextHeading: number;
}): VisualAnimationSegment {
  const route = input.routeCoordinates;
  const previousAnchor = input.previousAnchor;
  const nextAnchor = input.nextAnchor;

  const fromDistAlongM =
    input.previousDistAlongM != null && Number.isFinite(input.previousDistAlongM)
      ? input.previousDistAlongM
      : resolveDistAlongForAnchor(route, previousAnchor, 0);

  const toDistAlongM = Number.isFinite(input.nextDistAlongM)
    ? input.nextDistAlongM
    : resolveDistAlongForAnchor(route, nextAnchor, fromDistAlongM);

  const distanceBetweenAnchorsM = distanceBetween(previousAnchor, nextAnchor);
  const distAlongDelta = toDistAlongM - fromDistAlongM;

  const isBackward = distAlongDelta < -NAV_VISUAL_MAX_BACKWARD_DIST_M;
  const isTeleport =
    distanceBetweenAnchorsM >= NAV_VISUAL_TELEPORT_DISTANCE_M ||
    isBackward;

  const effectiveToDistAlongM = isBackward ? fromDistAlongM : toDistAlongM;
  const effectiveNextAnchor = isBackward ? copyCoord(previousAnchor) : copyCoord(nextAnchor);

  const spanAlong = Math.abs(effectiveToDistAlongM - fromDistAlongM);
  const keyPoints = isTeleport
    ? [copyCoord(effectiveNextAnchor)]
    : buildVisualKeyPointsAlongRoute(route, fromDistAlongM, effectiveToDistAlongM);

  const durationMs = isTeleport
    ? 0
    : spanAlong < NAV_VISUAL_MIN_ANIMATE_DISTANCE_M
      ? 0
      : computeVisualAnimationDurationMs(spanAlong);

  return {
    fromDistAlongM,
    toDistAlongM: effectiveToDistAlongM,
    fromHeading: input.previousHeading,
    toHeading: input.nextHeading,
    keyPoints,
    distanceBetweenAnchorsM,
    isTeleport,
    durationMs,
    previousAnchor: copyCoord(previousAnchor),
    nextAnchor: effectiveNextAnchor,
  };
}

export function getVisualPositionAtProgress(
  routeCoordinates: MapLatLng[],
  segment: VisualAnimationSegment,
  progress: number,
): MapLatLng {
  const route = routeCoordinates.filter(
    (c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude),
  );

  if (segment.isTeleport || segment.durationMs <= 0) {
    return copyCoord(segment.nextAnchor);
  }

  const eased = easeOutCubic(progress);
  const dist = segment.fromDistAlongM + (segment.toDistAlongM - segment.fromDistAlongM) * eased;
  const pt =
    route.length >= 2
      ? coordinateAtDistanceAlongPolyline(route, dist)
      : segment.nextAnchor;
  return pt ? copyCoord(pt) : copyCoord(segment.nextAnchor);
}

export function getVisualHeadingAtProgress(
  segment: VisualAnimationSegment,
  progress: number,
  previousDisplayedHeading: number,
): number {
  const eased = easeOutCubic(progress);
  const target =
    segment.fromHeading +
    (((segment.toHeading - segment.fromHeading + 540) % 360) - 180) * eased;
  const normalizedTarget = ((target % 360) + 360) % 360;
  return smoothHeading(previousDisplayedHeading, normalizedTarget, NAV_VISUAL_HEADING_ALPHA);
}

export function getVisualFrameAtProgress(
  routeCoordinates: MapLatLng[],
  segment: VisualAnimationSegment,
  progress: number,
  previousDisplayedHeading: number,
): VisualAnimationFrame {
  const clamped = Math.max(0, Math.min(1, progress));
  const position = getVisualPositionAtProgress(routeCoordinates, segment, clamped);
  const eased = easeOutCubic(clamped);
  const distAlongM = segment.fromDistAlongM + (segment.toDistAlongM - segment.fromDistAlongM) * eased;

  const routeHeading = getRouteNavigationHeading(
    position,
    routeCoordinates,
    NAV_ROUTE_HEADING_LOOKAHEAD_M,
  );
  const heading =
    routeHeading != null
      ? smoothHeading(previousDisplayedHeading, routeHeading, NAV_VISUAL_HEADING_ALPHA)
      : getVisualHeadingAtProgress(segment, clamped, previousDisplayedHeading);

  return {
    position,
    heading,
    distAlongM,
    animationProgress: clamped,
    keyPointsCount: segment.keyPoints.length,
    isTeleport: segment.isTeleport,
  };
}

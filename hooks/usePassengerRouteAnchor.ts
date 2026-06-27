import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapLatLng } from '@/components/maps/types';
import { haversineKm, isValidMapCoord } from '@/lib/geo';
import {
  applyVisualAnimationReset,
  buildVisualAnimationSegment,
  createVisualAnimationRuntimeState,
  getVisualFrameAtProgress,
  shouldResetVisualAnimation,
  syncVisualAnimationRuntimeAfterReset,
} from '@/lib/navigation/navigationVisualInterpolator';
import {
  computePassengerNavigationAnchor,
  createPassengerNavigationAnchorState,
  resetPassengerNavigationAnchorState,
  type PassengerNavigationAnchorResult,
} from '@/lib/navigation/passengerNavigationAnchor';
import { syncRouteLineWithMarkerVisual } from '@/lib/navigation/routeMarkerSync';
import { logPassengerMapRotation } from '@/lib/navigation/passengerMapRotationLog';

const ONTRIP_LOG = '[PASSENGER ONTRIP PUCK SYNC]';

function logOntripPuckSync(message: string, extra?: Record<string, unknown>): void {
  if (!__DEV__) return;
  if (extra) console.log(ONTRIP_LOG, message, extra);
  else console.log(ONTRIP_LOG, message);
}

export type PassengerRouteAnchorResult = {
  visualPosition: MapLatLng | null;
  heading: number;
  distAlongM: number | null;
  drawCoords: MapLatLng[];
  onRoute: boolean;
  isAnimating: boolean;
};

type InterpolatedProvider = {
  coordinate: [number, number];
  heading: number;
  distAlongM: number;
};

export function usePassengerRouteAnchor(input: {
  enabled: boolean;
  rawGps: MapLatLng | null;
  gpsHeading: number | null;
  routeCoords: MapLatLng[];
  routeSessionKey: string;
}): PassengerRouteAnchorResult {
  const anchorStateRef = useRef(createPassengerNavigationAnchorState());
  const visualRuntimeRef = useRef(createVisualAnimationRuntimeState());
  const lastAnchorLogKeyRef = useRef<string | null>(null);
  const lastSyncedDrawCoordsRef = useRef<MapLatLng[]>([]);

  const [interpolatedProvider, setInterpolatedProvider] = useState<InterpolatedProvider | null>(
    null,
  );
  const [visualInterpolationActive, setVisualInterpolationActive] = useState(false);

  const { enabled, rawGps, gpsHeading, routeCoords, routeSessionKey } = input;

  useEffect(() => {
    if (!enabled) {
      resetPassengerNavigationAnchorState(anchorStateRef.current);
      applyVisualAnimationReset(visualRuntimeRef.current);
      setInterpolatedProvider(null);
      setVisualInterpolationActive(false);
      lastSyncedDrawCoordsRef.current = [];
    }
  }, [enabled]);

  useEffect(() => {
    resetPassengerNavigationAnchorState(anchorStateRef.current);
    applyVisualAnimationReset(visualRuntimeRef.current);
    setInterpolatedProvider(null);
    lastSyncedDrawCoordsRef.current = [];
  }, [routeSessionKey]);

  const navAnchor = useMemo((): PassengerNavigationAnchorResult | null => {
    if (!enabled || !rawGps || !isValidMapCoord(rawGps.latitude, rawGps.longitude)) {
      return null;
    }

    if (shouldResetVisualAnimation(visualRuntimeRef.current, routeSessionKey)) {
      resetPassengerNavigationAnchorState(anchorStateRef.current);
    }

    return computePassengerNavigationAnchor({
      gps: rawGps,
      fullRouteCoords: routeCoords,
      state: anchorStateRef.current,
      gpsHeading,
      routeSessionKey,
    });
  }, [
    enabled,
    rawGps?.latitude,
    rawGps?.longitude,
    gpsHeading,
    routeCoords,
    routeSessionKey,
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (!navAnchor) return;

    const logKey = `${routeSessionKey}:${Math.round(navAnchor.distAlongM)}:${navAnchor.onRoute}:${navAnchor.usedFallback}`;
    if (lastAnchorLogKeyRef.current === logKey) return;
    lastAnchorLogKeyRef.current = logKey;

    if (navAnchor.usedFallback) {
      logOntripPuckSync('fallback to raw gps', { onRoute: navAnchor.onRoute });
    } else if (navAnchor.onRoute && navAnchor.distanceGpsToRouteM != null && navAnchor.distanceGpsToRouteM > 8) {
      logOntripPuckSync('gps snapped to polyline', {
        distanceGpsToRouteM: Math.round(navAnchor.distanceGpsToRouteM),
        distAlongM: Math.round(navAnchor.distAlongM),
      });
    } else if (!navAnchor.onRoute && navAnchor.distanceGpsToRouteM != null) {
      logOntripPuckSync('gps far from route — keeping last valid anchor', {
        distanceGpsToRouteM: Math.round(navAnchor.distanceGpsToRouteM),
      });
    }
  }, [enabled, navAnchor, routeSessionKey]);

  useEffect(() => {
    if (enabled) {
      logOntripPuckSync('on_trip puck sync active', { routeSessionKey });
    }
  }, [enabled, routeSessionKey]);

  useEffect(() => {
    if (!enabled) {
      setVisualInterpolationActive(false);
      return;
    }
    setVisualInterpolationActive(
      routeCoords.length >= 2 && navAnchor != null && !navAnchor.usedFallback,
    );
  }, [enabled, routeCoords.length, navAnchor?.onRoute, navAnchor?.usedFallback]);

  useEffect(() => {
    if (!visualInterpolationActive || !navAnchor || routeCoords.length < 2) {
      setInterpolatedProvider(null);
      return;
    }

    const runtime = visualRuntimeRef.current;
    if (shouldResetVisualAnimation(runtime, routeSessionKey)) {
      applyVisualAnimationReset(runtime);
    }
    syncVisualAnimationRuntimeAfterReset(runtime, routeSessionKey);

    const nextAnchor = navAnchor.anchorPoint;
    const nextHeading = navAnchor.heading;
    const nextDistAlongM = navAnchor.distAlongM;

    if (runtime.anchor == null) {
      setInterpolatedProvider({
        coordinate: [nextAnchor.longitude, nextAnchor.latitude],
        heading: nextHeading,
        distAlongM: nextDistAlongM,
      });
      runtime.anchor = nextAnchor;
      runtime.distAlongM = nextDistAlongM;
      runtime.heading = nextHeading;
      return;
    }

    const previousAnchor = runtime.anchor;
    const previousDistAlongM = runtime.distAlongM ?? nextDistAlongM;
    const previousHeading = runtime.heading;

    const movedM =
      haversineKm(
        previousAnchor.latitude,
        previousAnchor.longitude,
        nextAnchor.latitude,
        nextAnchor.longitude,
      ) * 1000;
    const distAlongDelta = Math.abs(nextDistAlongM - previousDistAlongM);

    if (movedM < 0.15 && distAlongDelta < 0.15) {
      setInterpolatedProvider({
        coordinate: [nextAnchor.longitude, nextAnchor.latitude],
        heading: nextHeading,
        distAlongM: nextDistAlongM,
      });
      runtime.anchor = nextAnchor;
      runtime.distAlongM = nextDistAlongM;
      runtime.heading = nextHeading;
      return;
    }

    const segment = buildVisualAnimationSegment({
      routeCoordinates: routeCoords,
      previousAnchor,
      nextAnchor,
      previousDistAlongM,
      nextDistAlongM,
      previousHeading,
      nextHeading,
    });

    const finishSegment = (progress: number) => {
      const frame = getVisualFrameAtProgress(
        routeCoords,
        segment,
        progress,
        runtime.heading || previousHeading,
      );
      setInterpolatedProvider({
        coordinate: [frame.position.longitude, frame.position.latitude],
        heading: frame.heading,
        distAlongM: frame.distAlongM,
      });
      runtime.heading = frame.heading;
      runtime.distAlongM = frame.distAlongM;
      runtime.anchor = frame.position;
    };

    if (segment.isTeleport || segment.durationMs <= 0) {
      finishSegment(1);
      runtime.anchor = nextAnchor;
      runtime.distAlongM = nextDistAlongM;
      runtime.heading = nextHeading;
      return;
    }

    let startMs: number | null = null;
    let rafId = 0;

    const tick = (now: number) => {
      if (startMs == null) startMs = now;
      const progress = Math.min(1, (now - startMs) / segment.durationMs);
      finishSegment(progress);
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        runtime.anchor = nextAnchor;
        runtime.distAlongM = nextDistAlongM;
        runtime.heading = nextHeading;
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    visualInterpolationActive,
    navAnchor?.anchorPoint.latitude,
    navAnchor?.anchorPoint.longitude,
    navAnchor?.heading,
    navAnchor?.distAlongM,
    routeSessionKey,
    routeCoords.length,
  ]);

  const visualPosition = useMemo((): MapLatLng | null => {
    if (!enabled || !navAnchor) return null;
    if (navAnchor.usedFallback) {
      return navAnchor.anchorPoint;
    }
    if (visualInterpolationActive && interpolatedProvider) {
      return {
        latitude: interpolatedProvider.coordinate[1],
        longitude: interpolatedProvider.coordinate[0],
      };
    }
    return navAnchor.anchorPoint;
  }, [
    enabled,
    navAnchor?.anchorPoint.latitude,
    navAnchor?.anchorPoint.longitude,
    visualInterpolationActive,
    interpolatedProvider?.coordinate[0],
    interpolatedProvider?.coordinate[1],
  ]);

  const heading = useMemo(() => {
    if (!enabled || !navAnchor) return 0;
    if (visualInterpolationActive && interpolatedProvider) {
      return interpolatedProvider.heading;
    }
    return navAnchor.heading;
  }, [enabled, navAnchor?.heading, visualInterpolationActive, interpolatedProvider?.heading]);

  const distAlongM = useMemo(() => {
    if (!enabled || !navAnchor) return null;
    if (visualInterpolationActive && interpolatedProvider?.distAlongM != null) {
      return interpolatedProvider.distAlongM;
    }
    return navAnchor.distAlongM;
  }, [enabled, navAnchor?.distAlongM, visualInterpolationActive, interpolatedProvider?.distAlongM]);

  const drawCoords = useMemo((): MapLatLng[] => {
    if (!enabled) return routeCoords;

    const full = routeCoords.filter((c) => isValidMapCoord(c.latitude, c.longitude));
    if (full.length < 2) return full;

    if (!visualPosition || navAnchor?.usedFallback) {
      return full;
    }

    const markerDistAlongM =
      interpolatedProvider?.distAlongM != null
        ? interpolatedProvider.distAlongM
        : navAnchor?.distAlongM;

    if (markerDistAlongM == null || !Number.isFinite(markerDistAlongM) || markerDistAlongM < 0) {
      return full;
    }

    const sync = syncRouteLineWithMarkerVisual({
      fullRoute: full,
      markerVisual: visualPosition,
      markerDistAlongM,
    });

    if (sync.synced && sync.coords.length >= 2) {
      lastSyncedDrawCoordsRef.current = sync.coords;
      logPassengerMapRotation('draw coords synced with marker', {
        markerDistAlongM: Math.round(markerDistAlongM),
        remainingPoints: sync.coords.length,
        trimmedAheadOfMarker: sync.trimmedAheadOfMarker,
        lineStartOffsetM: sync.lineStartOffsetM,
      });
      return sync.coords;
    }

    if (sync.offRoute) {
      logOntripPuckSync('polyline trim blocked — off-route fallback', {
        distAlongM: sync.distAlongM != null ? Math.round(sync.distAlongM) : null,
      });
    }

    return full;
  }, [
    enabled,
    routeCoords,
    visualPosition?.latitude,
    visualPosition?.longitude,
    navAnchor?.onRoute,
    navAnchor?.distAlongM,
    interpolatedProvider?.distAlongM,
  ]);

  return {
    visualPosition,
    heading,
    distAlongM,
    drawCoords,
    onRoute: navAnchor?.onRoute ?? false,
    isAnimating: visualInterpolationActive && interpolatedProvider != null,
  };
}

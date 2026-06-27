import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapLatLng, NavigationPhase } from '@/components/maps/types';
import type { PassengerVisualState } from '@/lib/passengerRideVisualState';
import { isValidMapCoord } from '@/lib/geo';
import {
  NAV_CAMERA_FOLLOW_MS,
  NAV_CAMERA_CENTER_OFFSET_M,
  NAV_FOLLOW_PITCH,
  NAV_FOLLOW_ZOOM,
  NAV_FOLLOW_TOP_PADDING_RATIO,
  NAV_FOLLOW_TOP_PADDING_MIN,
  NAV_FOLLOW_TOP_PADDING_MAX,
} from '@/lib/navigation/navigationCamera';
import {
  buildMapboxRouteOverviewCameraConfig,
  routeOverviewFallbackCenter,
  routeOverviewFallbackZoomForDistanceKm,
  type MapboxRouteOverviewCameraConfig,
} from '@/lib/navigation/previewMapCamera';
import {
  logPassengerCameraPhase,
  logPassengerMapboxCamera,
  resolvePassengerCameraBearing,
  resolvePassengerOntripCameraBearing,
  type PassengerCameraBearingSource,
} from '@/lib/navigation/passengerMapboxCameraController';
import { logPassengerMapRotation } from '@/lib/navigation/passengerMapRotationLog';
import {
  resolveOverviewEndpoints,
  type PassengerMapMode,
} from '@/lib/navigation/passengerRidePhase';
import {
  getNavigationCameraDuration,
  getPointAhead,
  shouldUpdateNavigationCamera,
  type NavigationCameraState,
} from '@/lib/navigation/tripMapCamera';
import { shortestAngleDiffDeg } from '@/lib/navigation/routeBearing';

export type PassengerMapboxCameraInput = {
  rideId: string;
  uiState: string;
  visual: PassengerVisualState | null;
  phase: NavigationPhase | 'none';
  mapMode: PassengerMapMode;
  driverAnchor: MapLatLng | null;
  driverLocation: MapLatLng | null;
  driverHeading: number;
  /** Alvo do follow (passageiro em on_trip; motorista nos restantes fluxos). */
  followAnchor: MapLatLng | null;
  followHeading: number;
  pickup: MapLatLng | null;
  destination: MapLatLng | null;
  routeCoords: MapLatLng[];
  drawCoords: MapLatLng[];
  mapLayout: { width: number; height: number } | null;
  mapPadding?: { top: number; right: number; bottom: number; left: number };
  recenterSignal?: number;
  liveRoutePolyline?: string;
  gpsHeading?: number | null;
};

export type PassengerFollowCameraConfig = {
  centerCoordinate: [number, number];
  zoomLevel: number;
  heading: number;
  pitch: number;
  animationDuration: number;
  key: string;
};

const FOLLOW_AUTO_RESUME_MS = 8000;

function toPosition(coord: MapLatLng): [number, number] {
  return [coord.longitude, coord.latitude];
}

function isValidLocation(loc: MapLatLng | null | undefined): loc is MapLatLng {
  return loc != null && isValidMapCoord(loc.latitude, loc.longitude);
}

function resolveCameraOverviewEndpoints(input: {
  visual: PassengerVisualState | null;
  phase: NavigationPhase | 'none';
  driver: MapLatLng | null;
  passenger: MapLatLng | null;
  pickup: MapLatLng | null;
  destination: MapLatLng | null;
}): { start: MapLatLng | null; end: MapLatLng | null } {
  if (input.visual === 'driver_arrived') {
    return {
      start: input.driver ?? input.pickup,
      end: input.pickup ?? input.driver,
    };
  }
  if (input.visual === 'on_trip') {
    return {
      start: input.passenger ?? input.pickup ?? input.driver,
      end: input.destination,
    };
  }
  return resolveOverviewEndpoints(input);
}

export function usePassengerMapboxCamera(input: PassengerMapboxCameraInput) {
  const cameraStateRef = useRef<NavigationCameraState | null>(null);
  const lastValidBearingRef = useRef(0);
  const lastOverviewFitKeyRef = useRef<string | null>(null);
  const lastPolylineRef = useRef<string | undefined>(undefined);
  const lastBearingSourceRef = useRef<PassengerCameraBearingSource>('last');
  const followResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [userExploring, setUserExploring] = useState(false);
  const [overviewFitGeneration, setOverviewFitGeneration] = useState(0);
  const [followGeneration, setFollowGeneration] = useState(0);
  const [followAnimationDuration, setFollowAnimationDuration] = useState(NAV_CAMERA_FOLLOW_MS);

  const {
    rideId,
    uiState,
    visual,
    phase,
    mapMode,
    driverAnchor,
    driverLocation,
    driverHeading,
    followAnchor,
    followHeading,
    pickup,
    destination,
    routeCoords,
    drawCoords,
    mapLayout,
    mapPadding,
    recenterSignal,
    liveRoutePolyline,
    gpsHeading,
  } = input;

  /** on_trip: câmera manual com bearing da rota (sem followUserLocation nativo). */
  const isOntripFollow = visual === 'on_trip' && mapMode === 'follow';

  useEffect(() => {
    return () => {
      if (followResumeTimerRef.current) {
        clearTimeout(followResumeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    logPassengerCameraPhase({ uiState, visual, phase, mapMode });
    if (isOntripFollow) {
      logPassengerMapRotation('ontrip manual camera follow active', {
        uiState,
        visual,
        phase,
        mapMode,
        routePoints: routeCoords.length,
      });
    }
  }, [uiState, visual, phase, mapMode, isOntripFollow, routeCoords.length]);

  useEffect(() => {
    setUserExploring(false);
    lastOverviewFitKeyRef.current = null;
    cameraStateRef.current = null;
    lastValidBearingRef.current = followHeading;
  }, [rideId, visual, phase, followHeading]);

  useEffect(() => {
    if (recenterSignal != null && recenterSignal > 0) {
      setUserExploring(false);
      lastOverviewFitKeyRef.current = null;
      if (mapMode === 'overview') {
        setOverviewFitGeneration((g) => g + 1);
      } else if (mapMode === 'follow') {
        setFollowGeneration((g) => g + 1);
      }
      logPassengerMapboxCamera('recenter', { mapMode });
    }
  }, [recenterSignal, mapMode]);

  const overviewConfig = useMemo((): MapboxRouteOverviewCameraConfig | null => {
    if (mapMode !== 'overview' && mapMode !== 'static') return null;

    const endpoints = resolveCameraOverviewEndpoints({
      visual,
      phase,
      driver: driverAnchor ?? driverLocation,
      passenger: followAnchor,
      pickup,
      destination,
    });
    const validRoute = drawCoords.length >= 2 ? drawCoords : routeCoords;
    if (validRoute.length < 2 && (!endpoints.start || !endpoints.end)) return null;

    const start = endpoints.start ?? validRoute[0] ?? null;
    const end = endpoints.end ?? validRoute[validRoute.length - 1] ?? null;

    return buildMapboxRouteOverviewCameraConfig({
      start,
      end,
      routeCoords: validRoute.length >= 2 ? validRoute : routeCoords,
      fitKeySuffix: `${visual ?? 'none'}:${phase}:${rideId}`,
      mapHeight: mapLayout?.height,
      mapWidth: mapLayout?.width,
      trackStartLocation: visual === 'driver_assigned' || phase === 'to_pickup',
      reserveSideActions: visual === 'on_trip',
      maxZoomBoost: visual === 'driver_arrived' ? 2 : 0,
    });
  }, [
    mapMode,
    visual,
    phase,
    rideId,
    driverAnchor,
    driverLocation,
    pickup,
    destination,
    drawCoords,
    routeCoords,
    mapLayout?.height,
    mapLayout?.width,
  ]);

  useEffect(() => {
    if (mapMode !== 'overview' || userExploring || !overviewConfig?.fitKey) return;
    const polyChanged = liveRoutePolyline !== lastPolylineRef.current;
    lastPolylineRef.current = liveRoutePolyline;
    if (lastOverviewFitKeyRef.current === overviewConfig.fitKey && !polyChanged) return;
    lastOverviewFitKeyRef.current = overviewConfig.fitKey;
    setOverviewFitGeneration((g) => g + 1);
    logPassengerMapboxCamera('camera applied', { mode: 'overview', fitKey: overviewConfig.fitKey });
  }, [mapMode, userExploring, overviewConfig?.fitKey, liveRoutePolyline]);

  const overviewFallback = useMemo(() => {
    if (!overviewConfig) return null;
    const endpoints = resolveCameraOverviewEndpoints({
      visual,
      phase,
      driver: driverAnchor ?? driverLocation,
      passenger: followAnchor,
      pickup,
      destination,
    });
    if (!endpoints.start || !endpoints.end) return null;
    return {
      center: routeOverviewFallbackCenter(endpoints.start, endpoints.end),
      zoom: routeOverviewFallbackZoomForDistanceKm(overviewConfig.distanceKm),
    };
  }, [overviewConfig, visual, phase, driverAnchor, driverLocation, pickup, destination]);

  /** Padding do modo follow — desloca o indicador para o terço inferior da área útil (nav strip + card). */
  const followPadding = useMemo(() => {
    const h = mapLayout?.height ?? 0;
    const uiTop = mapPadding?.top ?? 0;
    const uiBottom = mapPadding?.bottom ?? 0;
    const uiLeft = mapPadding?.left ?? 0;
    const uiRight = mapPadding?.right ?? 0;
    const usableHeight = Math.max(0, h - uiTop - uiBottom);
    const lookAheadTop =
      usableHeight > 0
        ? Math.min(
            NAV_FOLLOW_TOP_PADDING_MAX,
            Math.max(NAV_FOLLOW_TOP_PADDING_MIN, usableHeight * NAV_FOLLOW_TOP_PADDING_RATIO),
          )
        : NAV_FOLLOW_TOP_PADDING_MIN;
    return {
      paddingTop: Math.round(uiTop + lookAheadTop),
      paddingBottom: Math.round(uiBottom),
      paddingLeft: Math.round(uiLeft),
      paddingRight: Math.round(uiRight),
    };
  }, [
    mapLayout?.height,
    mapPadding?.top,
    mapPadding?.bottom,
    mapPadding?.left,
    mapPadding?.right,
  ]);

  const followCamera = useMemo((): PassengerFollowCameraConfig | null => {
    if (mapMode !== 'follow' || !isValidLocation(followAnchor)) return null;

    const previousLocation = cameraStateRef.current
      ? { latitude: cameraStateRef.current.lat, longitude: cameraStateRef.current.lng }
      : null;

    const bearingResult = isOntripFollow
      ? resolvePassengerOntripCameraBearing({
          followAnchor,
          routeCoords,
          routeDisplayHeading: followHeading,
          lastValidBearing: lastValidBearingRef.current,
        })
      : resolvePassengerCameraBearing({
          gpsHeading,
          driverLocation: followAnchor,
          previousLocation,
          routeCoords,
          routeDisplayHeading: followHeading,
          lastValidBearing: lastValidBearingRef.current,
        });

    const { bearing, source } = bearingResult;

    lastValidBearingRef.current = bearing;
    if (source !== lastBearingSourceRef.current) {
      lastBearingSourceRef.current = source;
      logPassengerMapboxCamera('bearing source', { source, bearing: Math.round(bearing) });
    }

    const center = getPointAhead(
      followAnchor.latitude,
      followAnchor.longitude,
      bearing,
      NAV_CAMERA_CENTER_OFFSET_M,
    );

    return {
      centerCoordinate: toPosition(center),
      zoomLevel: NAV_FOLLOW_ZOOM,
      heading: bearing,
      pitch: NAV_FOLLOW_PITCH,
      animationDuration: followAnimationDuration,
      key: `follow-${followGeneration}`,
    };
  }, [
    mapMode,
    followAnchor?.latitude,
    followAnchor?.longitude,
    followHeading,
    routeCoords,
    gpsHeading,
    followGeneration,
    followAnimationDuration,
    isOntripFollow,
  ]);

  useEffect(() => {
    if (mapMode !== 'follow' || userExploring || !followAnchor) return;

    const lat = followAnchor.latitude;
    const lng = followAnchor.longitude;
    if (!isValidMapCoord(lat, lng)) return;

    const previousLocation = cameraStateRef.current
      ? { latitude: cameraStateRef.current.lat, longitude: cameraStateRef.current.lng }
      : null;

    const { bearing } = isOntripFollow
      ? resolvePassengerOntripCameraBearing({
          followAnchor,
          routeCoords,
          routeDisplayHeading: followHeading,
          lastValidBearing: lastValidBearingRef.current,
        })
      : resolvePassengerCameraBearing({
          gpsHeading,
          driverLocation: followAnchor,
          previousLocation,
          routeCoords,
          routeDisplayHeading: followHeading,
          lastValidBearing: lastValidBearingRef.current,
        });

    lastValidBearingRef.current = bearing;

    const prev = cameraStateRef.current;
    if (!shouldUpdateNavigationCamera(prev, lat, lng, bearing)) return;

    const distM = prev ? Math.hypot(prev.lat - lat, prev.lng - lng) * 111000 : 999;
    const dH = prev ? Math.abs(shortestAngleDiffDeg(prev.h, bearing)) : 999;
    const animationDuration = getNavigationCameraDuration(distM, dH);

    cameraStateRef.current = { lat, lng, h: bearing, t: Date.now() };
    setFollowAnimationDuration(animationDuration);
    setFollowGeneration((g) => g + 1);
    logPassengerMapRotation('camera updated', {
      mode: 'follow',
      bearingApplied: Math.round(bearing),
      followPaused: userExploring,
      animationDuration,
    });
  }, [
    mapMode,
    userExploring,
    followAnchor?.latitude,
    followAnchor?.longitude,
    followHeading,
    routeCoords,
    gpsHeading,
    isOntripFollow,
  ]);

  const onUserInteractionStart = useCallback(() => {
    setUserExploring(true);
    logPassengerMapRotation('follow paused — user interaction', { autoResumeMs: FOLLOW_AUTO_RESUME_MS });
    if (followResumeTimerRef.current) {
      clearTimeout(followResumeTimerRef.current);
    }
    followResumeTimerRef.current = setTimeout(() => {
      followResumeTimerRef.current = null;
      setUserExploring(false);
      setFollowGeneration((g) => g + 1);
      logPassengerMapRotation('follow resumed after idle', { autoResumeMs: FOLLOW_AUTO_RESUME_MS });
    }, FOLLOW_AUTO_RESUME_MS);
  }, []);

  const showOverviewCamera =
    (mapMode === 'overview' || mapMode === 'static') && !userExploring && overviewConfig != null;
  const showFollowCamera = mapMode === 'follow' && !userExploring && followCamera != null;

  return {
    userExploring,
    onUserInteractionStart,
    overviewConfig,
    overviewFallback,
    overviewFitGeneration,
    followCamera,
    followPadding,
    showOverviewCamera,
    showFollowCamera,
  };
}

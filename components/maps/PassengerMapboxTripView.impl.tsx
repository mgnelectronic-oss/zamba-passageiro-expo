import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  Camera,
  CustomLocationProvider,
  LineLayer,
  LocationPuck,
  MapView,
  MarkerView,
  ShapeSource,
  StyleURL,
} from '@rnmapbox/maps';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { PassengerActiveRideMapProps } from '@/components/maps/types';
import type { MapLatLng } from '@/components/maps/types';
import { isValidMapCoord } from '@/lib/geo';
import {
  parseMapCoord,
  resolvePassengerMapMode,
  resolvePassengerNavigationPhase,
  shouldShowDestinationMarker,
  shouldShowDriverMarker,
  shouldShowPickupMarker,
  shouldTrimRouteLine,
  isActiveTripToFinalDestination,
} from '@/lib/navigation/passengerRidePhase';
import {
  computePassengerRouteDisplay,
  createPassengerRouteDisplayState,
} from '@/lib/navigation/passengerRouteDisplay';
import { usePassengerMapboxCamera } from '@/hooks/usePassengerMapboxCamera';
import { usePassengerRouteAnchor } from '@/hooks/usePassengerRouteAnchor';
import { usePassengerTripMapLocation } from '@/hooks/usePassengerTripMapLocation';
import { useSmoothDriverMarkerPosition } from '@/hooks/useSmoothDriverMarkerPosition';
import { decodePolyline, downsampleRouteCoordinates } from '@/utils/polylineDecode';
import { ROUTE_POLYLINE_COLOR } from '@/lib/tripMapTheme';

const ROUTE_OUTLINE = '#0d4f24';
const LOG = '[PASSENGER MAP]';
const ONTRIP_LOG = '[PASSENGER ONTRIP PUCK SYNC]';

function isValidLocation(loc: MapLatLng | null | undefined): loc is MapLatLng {
  return loc != null && isValidMapCoord(loc.latitude, loc.longitude);
}

function toPosition(coord: MapLatLng): [number, number] {
  return [coord.longitude, coord.latitude];
}

function coordsToLineFeature(coords: MapLatLng[]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: coords.map(toPosition),
    },
  };
}

function PickupMarker() {
  return (
    <View style={styles.pickupMarker}>
      <Ionicons name="person" size={16} color="#FFFFFF" />
    </View>
  );
}

function DestinationMarker() {
  return (
    <View style={styles.destDotOuter}>
      <View style={styles.destDotInner} />
    </View>
  );
}

function DriverMarker({ heading }: { heading: number }) {
  return (
    <View style={[styles.driverPin, { transform: [{ rotate: `${heading}deg` }] }]}>
      <Ionicons name="car-sport" size={22} color="#374151" />
    </View>
  );
}

export function PassengerMapboxTripView(props: PassengerActiveRideMapProps) {
  const routeDisplayState = useRef(createPassengerRouteDisplayState());
  const lastPolylineRef = useRef<string | undefined>(undefined);
  const onTripLoggedRef = useRef(false);
  const puckLoggedRef = useRef(false);
  const [mapLayout, setMapLayout] = useState<{ width: number; height: number } | null>(null);

  const driver = useMemo(
    () => parseMapCoord(props.driverLocation?.lat, props.driverLocation?.lng),
    [props.driverLocation?.lat, props.driverLocation?.lng],
  );
  const pickup = useMemo(
    () => parseMapCoord(props.pickup?.lat, props.pickup?.lng),
    [props.pickup?.lat, props.pickup?.lng],
  );
  const destination = useMemo(
    () => parseMapCoord(props.destination?.lat, props.destination?.lng),
    [props.destination?.lat, props.destination?.lng],
  );

  const phase = useMemo(
    () => resolvePassengerNavigationPhase(props.uiState, props.liveRoute?.route_phase),
    [props.uiState, props.liveRoute?.route_phase],
  );
  const mapMode = useMemo(
    () => resolvePassengerMapMode(props.visual, props.uiState),
    [props.visual, props.uiState],
  );

  /** Polyline oficial — decode directo de ride_live_route, sem alteração de geometria. */
  const routeCoords = useMemo(() => {
    const poly = props.liveRoute?.polyline?.trim();
    if (!poly) {
      console.log(LOG, 'polyline exists', false);
      return [] as MapLatLng[];
    }
    console.log(LOG, 'polyline exists', true);
    try {
      const decoded = downsampleRouteCoordinates(decodePolyline(poly));
      console.log(LOG, 'decoded route points', decoded.length);
      return decoded;
    } catch {
      console.log(LOG, 'decoded route points', 0);
      return [] as MapLatLng[];
    }
  }, [props.liveRoute?.polyline]);

  const onTripToDestination = isActiveTripToFinalDestination(props.visual, phase);
  const trimEnabled = shouldTrimRouteLine(props.visual);

  const routeSessionKey = `${props.rideId}:${props.liveRoute?.updated_at ?? 'none'}`;

  const passengerTripLocation = usePassengerTripMapLocation({
    enabled: onTripToDestination,
    pickup,
    visual: props.visual,
    phase,
    driverAvailable: isValidLocation(driver),
  });

  const routeAnchor = usePassengerRouteAnchor({
    enabled: onTripToDestination,
    rawGps: passengerTripLocation.position,
    gpsHeading: passengerTripLocation.gpsHeading,
    routeCoords,
    routeSessionKey,
  });

  const routeDisplay = useMemo(() => {
    if (onTripToDestination) return null;
    return computePassengerRouteDisplay({
      routeCoords,
      driverLocation: driver,
      state: routeDisplayState.current,
      trimEnabled,
    });
  }, [
    onTripToDestination,
    routeCoords,
    driver,
    trimEnabled,
    props.liveRoute?.updated_at,
    props.liveRoute?.last_driver_lat,
    props.liveRoute?.last_driver_lng,
  ]);

  const driverHeading = routeDisplay?.heading ?? 0;
  const driverAnchor = routeDisplay?.anchorPoint ?? driver;
  const showDriverMarker = shouldShowDriverMarker(props.visual, phase);

  const { animatedPosition: smoothDriverAnchor } = useSmoothDriverMarkerPosition({
    rawPosition: showDriverMarker && isValidLocation(driverAnchor) ? driverAnchor : null,
    enabled: showDriverMarker,
  });

  const drawCoords = onTripToDestination
    ? routeAnchor.drawCoords
    : (routeDisplay?.drawCoords ?? routeCoords);

  const followAnchor = onTripToDestination ? routeAnchor.visualPosition : driverAnchor;
  const followHeading = onTripToDestination ? routeAnchor.heading : driverHeading;
  const gpsHeading = onTripToDestination ? passengerTripLocation.gpsHeading : undefined;

  const puckFrame = useMemo(() => {
    if (!onTripToDestination || !isValidLocation(routeAnchor.visualPosition)) return null;
    const visual = routeAnchor.visualPosition;
    return {
      coordinate: [visual.longitude, visual.latitude] as [number, number],
      heading: routeAnchor.heading,
    };
  }, [
    onTripToDestination,
    routeAnchor.visualPosition?.latitude,
    routeAnchor.visualPosition?.longitude,
    routeAnchor.heading,
  ]);

  const routeLineFeature = useMemo(() => {
    if (drawCoords.length < 2) return null;
    console.log(LOG, 'render route polyline', drawCoords.length);
    return coordsToLineFeature(drawCoords);
  }, [drawCoords]);

  const {
    onUserInteractionStart,
    overviewConfig,
    overviewFallback,
    overviewFitGeneration,
    followCamera,
    followPadding,
    showOverviewCamera,
    showFollowCamera,
  } = usePassengerMapboxCamera({
    rideId: props.rideId,
    uiState: props.uiState,
    visual: props.visual,
    phase,
    mapMode,
    driverAnchor,
    driverLocation: driver,
    driverHeading,
    followAnchor,
    followHeading,
    pickup,
    destination,
    routeCoords,
    drawCoords,
    mapLayout,
    mapPadding: props.mapPadding,
    recenterSignal: props.recenterSignal,
    liveRoutePolyline: props.liveRoute?.polyline,
    gpsHeading,
  });

  useEffect(() => {
    if (!onTripToDestination) {
      onTripLoggedRef.current = false;
      puckLoggedRef.current = false;
      return;
    }
    if (onTripLoggedRef.current) return;
    onTripLoggedRef.current = true;
    if (__DEV__) {
      console.log(ONTRIP_LOG, 'on_trip active', {
        routePoints: routeCoords.length,
        polylineFromRideLiveRoute: !!props.liveRoute?.polyline,
      });
    }
  }, [onTripToDestination, routeCoords.length, props.liveRoute?.polyline]);

  useEffect(() => {
    if (!onTripToDestination || !puckFrame || puckLoggedRef.current) return;
    puckLoggedRef.current = true;
    if (__DEV__) {
      console.log(ONTRIP_LOG, 'LocationPuck uses passengerVisualPosition', {
        lat: puckFrame.coordinate[1].toFixed(5),
        lng: puckFrame.coordinate[0].toFixed(5),
        heading: Math.round(puckFrame.heading),
      });
    }
  }, [onTripToDestination, puckFrame?.coordinate[0], puckFrame?.coordinate[1], puckFrame?.heading]);

  useEffect(() => {
    console.log(LOG, 'mounted');
    console.log(LOG, 'ride status', props.uiState);
    console.log(LOG, 'route_phase', props.liveRoute?.route_phase ?? 'none');
  }, []);

  useEffect(() => {
    lastPolylineRef.current = props.liveRoute?.polyline;
    routeDisplayState.current = createPassengerRouteDisplayState();
  }, [props.rideId, props.visual, props.liveRoute?.route_phase]);

  const showPickup = shouldShowPickupMarker(props.visual, phase) && isValidLocation(pickup);
  const showDestination =
    shouldShowDestinationMarker(props.visual, phase) && isValidLocation(destination);

  const canRender = mapLayout != null && mapLayout.width > 0 && mapLayout.height > 0;

  return (
    <View
      style={styles.fill}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width <= 0 || height <= 0) return;
        setMapLayout((prev) =>
          prev?.width === width && prev?.height === height ? prev : { width, height },
        );
      }}
    >
      {canRender ? (
        <MapView
          style={{ width: mapLayout.width, height: mapLayout.height }}
          styleURL={StyleURL.Street}
          compassEnabled={false}
          scaleBarEnabled={false}
          logoEnabled={Platform.OS === 'android'}
          attributionEnabled={Platform.OS === 'ios'}
          scrollEnabled
          zoomEnabled
          rotateEnabled
          pitchEnabled
          onTouchStart={onUserInteractionStart}
          onDidFinishLoadingMap={() => props.onMapReady?.()}
        >
          {showOverviewCamera && overviewConfig?.bounds ? (
            <Camera
              key={`overview-${overviewFitGeneration}`}
              bounds={overviewConfig.bounds}
              maxZoomLevel={overviewConfig.maxZoomLevel}
              heading={overviewConfig.bearing}
              pitch={overviewConfig.pitch}
              animationMode="flyTo"
              animationDuration={850}
            />
          ) : showOverviewCamera && overviewFallback ? (
            <Camera
              key={`overview-fallback-${overviewFitGeneration}`}
              centerCoordinate={overviewFallback.center}
              zoomLevel={overviewFallback.zoom}
              heading={0}
              pitch={0}
              animationMode="flyTo"
              animationDuration={850}
            />
          ) : null}

          {showFollowCamera && followCamera ? (
            <Camera
              key={followCamera.key}
              centerCoordinate={followCamera.centerCoordinate}
              zoomLevel={followCamera.zoomLevel}
              heading={followCamera.heading}
              pitch={followCamera.pitch}
              padding={followPadding}
              animationMode="flyTo"
              animationDuration={followCamera.animationDuration}
            />
          ) : null}

          {routeLineFeature ? (
            <ShapeSource id="passenger-route" shape={routeLineFeature}>
              <LineLayer
                id="passenger-route-outline"
                style={{
                  lineColor: ROUTE_OUTLINE,
                  lineWidth: 7,
                  lineCap: 'round',
                  lineJoin: 'round',
                  lineOpacity: 1,
                }}
              />
              <LineLayer
                id="passenger-route-line"
                style={{
                  lineColor: ROUTE_POLYLINE_COLOR,
                  lineWidth: 5,
                  lineCap: 'round',
                  lineJoin: 'round',
                  lineOpacity: 1,
                }}
              />
            </ShapeSource>
          ) : null}

          {puckFrame ? (
            <CustomLocationProvider
              coordinate={puckFrame.coordinate}
              heading={puckFrame.heading}
            />
          ) : null}
          <LocationPuck
            visible={onTripToDestination}
            puckBearingEnabled
            puckBearing="heading"
            pulsing={{ isEnabled: true }}
          />

          {showPickup && pickup ? (
            <MarkerView coordinate={toPosition(pickup)} anchor={{ x: 0.5, y: 1 }}>
              <PickupMarker />
            </MarkerView>
          ) : null}

          {showDestination && destination ? (
            <MarkerView coordinate={toPosition(destination)} anchor={{ x: 0.5, y: 0.5 }}>
              <DestinationMarker />
            </MarkerView>
          ) : null}

          {showDriverMarker && smoothDriverAnchor && isValidLocation(smoothDriverAnchor) ? (
            <MarkerView
              coordinate={toPosition(smoothDriverAnchor)}
              anchor={{ x: 0.5, y: 0.5 }}
              allowOverlap
            >
              <DriverMarker heading={driverHeading} />
            </MarkerView>
          ) : null}
        </MapView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
  pickupMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
  },
  destDotOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#111827',
  },
  driverPin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: ROUTE_POLYLINE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
});

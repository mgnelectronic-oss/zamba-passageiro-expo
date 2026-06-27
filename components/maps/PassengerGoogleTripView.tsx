import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { PassengerActiveRideMapProps } from '@/components/maps/types';
import type { MapLatLng } from '@/components/maps/types';
import { MAP_STYLE_CLEAN } from '@/lib/mapStyleClean';
import { ROUTE_POLYLINE_COLOR } from '@/lib/tripMapTheme';
import {
  parseMapCoord,
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
import { NAV_ROUTE_HEADING_LOOKAHEAD_M } from '@/lib/navigation/navigationCamera';
import { getRouteNavigationHeading } from '@/lib/navigation/tripMapCamera';
import { decodePolyline, downsampleRouteCoordinates } from '@/utils/polylineDecode';
import { fitMapCamera, type LatLng } from '@/utils/mapCamera';
import { useSmoothDriverMarkerPosition } from '@/hooks/useSmoothDriverMarkerPosition';

const LOG = '[PASSENGER MAP]';

export function PassengerGoogleTripView(props: PassengerActiveRideMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const routeDisplayState = useRef(createPassengerRouteDisplayState());
  const lastPolylineRef = useRef<string | undefined>(undefined);
  const lastCameraFitAtRef = useRef(0);

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
      return [] as MapLatLng[];
    }
  }, [props.liveRoute?.polyline]);

  const onTripToDestination = isActiveTripToFinalDestination(props.visual, phase);
  const trimEnabled = shouldTrimRouteLine(props.visual);

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

  const drawCoords = onTripToDestination ? routeCoords : (routeDisplay?.drawCoords ?? routeCoords);
  const showDriverMarker = shouldShowDriverMarker(props.visual, phase);

  const { animatedPosition: smoothDriver } = useSmoothDriverMarkerPosition({
    rawPosition: showDriverMarker && driver ? driver : null,
    enabled: showDriverMarker,
  });

  const polylineStrokeColors = useMemo(() => {
    if (drawCoords.length < 2) return undefined;
    return new Array(drawCoords.length).fill(ROUTE_POLYLINE_COLOR);
  }, [drawCoords]);

  const mapPoints = useMemo(() => {
    const pts: LatLng[] = [];
    if (drawCoords.length) pts.push(...drawCoords);
    if (driver) pts.push(driver);
    if (pickup && shouldShowPickupMarker(props.visual, phase)) pts.push(pickup);
    if (destination && shouldShowDestinationMarker(props.visual, phase)) pts.push(destination);
    return pts;
  }, [drawCoords, driver, pickup, destination, props.visual, phase]);

  const fitCamera = useCallback(() => {
    if (!mapReady) return;
    if (mapPoints.length >= 2) {
      console.log(LOG, 'fit route');
      fitMapCamera(mapRef, mapPoints);
      return;
    }
    if (driver) {
      console.log(LOG, 'follow driver');
      mapRef.current?.animateToRegion(
        {
          latitude: driver.latitude,
          longitude: driver.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        400,
      );
    }
  }, [mapReady, mapPoints, driver]);

  useEffect(() => {
    console.log(LOG, 'mounted');
    console.log(LOG, 'ride status', props.uiState);
    console.log(LOG, 'route_phase', props.liveRoute?.route_phase ?? 'none');
  }, []);

  useEffect(() => {
    setMapReady(false);
    routeDisplayState.current = createPassengerRouteDisplayState();
  }, [props.rideId, props.visual, props.liveRoute?.route_phase]);

  useEffect(() => {
    if (!mapReady) return;
    const poly = props.liveRoute?.polyline;
    const polyChanged = poly !== lastPolylineRef.current;
    lastPolylineRef.current = poly;
    const now = Date.now();
    if (!polyChanged && lastCameraFitAtRef.current > 0 && now - lastCameraFitAtRef.current < 2600) {
      return;
    }
    const t = setTimeout(() => {
      lastCameraFitAtRef.current = Date.now();
      fitCamera();
    }, 350);
    return () => clearTimeout(t);
  }, [mapReady, mapPoints, props.liveRoute?.polyline, fitCamera]);

  useEffect(() => {
    if (props.recenterSignal != null && props.recenterSignal > 0) {
      fitCamera();
    }
  }, [props.recenterSignal, fitCamera]);

  useEffect(() => {
    if (driver) {
      console.log(LOG, 'driver location', driver.latitude.toFixed(5), driver.longitude.toFixed(5));
      if (showDriverMarker) {
        console.log(LOG, 'render driver marker');
      }
    }
  }, [driver?.latitude, driver?.longitude, showDriverMarker]);

  useEffect(() => {
    if (drawCoords.length >= 2) {
      console.log(LOG, 'render route polyline', drawCoords.length);
    }
  }, [drawCoords.length]);

  const showPickup = shouldShowPickupMarker(props.visual, phase) && pickup;
  const showDestination = shouldShowDestinationMarker(props.visual, phase) && destination;

  const driverHeading =
    onTripToDestination && driver
      ? getRouteNavigationHeading(driver, routeCoords, NAV_ROUTE_HEADING_LOOKAHEAD_M) ?? 0
      : routeDisplay?.heading ?? 0;

  return (
    <MapView
      ref={mapRef}
      style={styles.mapFill}
      provider={PROVIDER_GOOGLE}
      customMapStyle={MAP_STYLE_CLEAN}
      userInterfaceStyle="light"
      initialRegion={props.initialRegion}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsTraffic={false}
      toolbarEnabled={false}
      mapPadding={props.mapPadding}
      onMapReady={() => {
        setMapReady(true);
        props.onMapReady?.();
      }}
    >
      {drawCoords.length > 1 ? (
        <Polyline
          coordinates={drawCoords}
          strokeColor={ROUTE_POLYLINE_COLOR}
          strokeColors={polylineStrokeColors}
          strokeWidth={5}
          lineCap="round"
          lineJoin="round"
          geodesic
          zIndex={1}
        />
      ) : null}
      {showDriverMarker && smoothDriver ? (
        <Marker coordinate={smoothDriver} anchor={{ x: 0.5, y: 0.5 }} zIndex={10}>
          <View style={[styles.driverPin, { transform: [{ rotate: `${driverHeading}deg` }] }]}>
            <Ionicons name="car-sport" size={22} color="#374151" />
          </View>
        </Marker>
      ) : null}
      {showPickup && pickup ? (
        <Marker coordinate={pickup} anchor={{ x: 0.5, y: 1 }} zIndex={10}>
          <View style={styles.redPin}>
            <View style={styles.redPinInner} />
          </View>
        </Marker>
      ) : null}
      {showDestination && destination ? (
        <Marker coordinate={destination} anchor={{ x: 0.5, y: 0.5 }} zIndex={10}>
          <View style={styles.destDotOuter}>
            <View style={styles.destDotInner} />
          </View>
        </Marker>
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  mapFill: { ...StyleSheet.absoluteFillObject },
  driverPin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: ROUTE_POLYLINE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
  },
  redPinInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFF',
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
});

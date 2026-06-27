import type { MapLatLng } from '@/components/maps/types';
import type { PassengerVisualState } from '@/lib/passengerRideVisualState';
import { bearingFromGpsMovement } from '@/lib/bearing';
import { haversineKm, isValidMapCoord } from '@/lib/geo';
import {
  NAV_CAMERA_HEADING_SMOOTH_ALPHA,
  NAV_ROUTE_HEADING_LOOKAHEAD_M,
} from '@/lib/navigation/navigationCamera';
import type { NavigationPhase } from '@/components/maps/types';
import type { PassengerMapMode } from '@/lib/navigation/passengerRidePhase';
import {
  bearingForwardAlongPolyline,
  rejectSharpBearingFlip,
} from '@/lib/navigation/routeBearing';
import { logPassengerMapRotation } from '@/lib/navigation/passengerMapRotationLog';
import {
  getRouteNavigationHeading,
  smoothHeading,
} from '@/lib/navigation/tripMapCamera';

const LOG = '[PASSENGER MAPBOX CAMERA]';

export type PassengerCameraBearingSource = 'gps' | 'movement' | 'route' | 'display' | 'last';

export function logPassengerMapboxCamera(message: string, extra?: Record<string, unknown>) {
  if (!__DEV__) return;
  if (extra) {
    console.log(LOG, message, extra);
  } else {
    console.log(LOG, message);
  }
}

function isValidGpsHeading(heading: number | null | undefined): heading is number {
  return (
    heading != null &&
    Number.isFinite(heading) &&
    heading >= 0 &&
    heading <= 360 &&
    heading !== -1
  );
}

export function resolvePassengerCameraBearing(input: {
  gpsHeading?: number | null;
  driverLocation: MapLatLng;
  previousLocation: MapLatLng | null;
  routeCoords: MapLatLng[];
  routeDisplayHeading: number;
  lastValidBearing: number;
}): { bearing: number; source: PassengerCameraBearingSource } {
  const {
    gpsHeading,
    driverLocation,
    previousLocation,
    routeCoords,
    routeDisplayHeading,
    lastValidBearing,
  } = input;

  if (isValidGpsHeading(gpsHeading)) {
    const bearing = smoothHeading(lastValidBearing, gpsHeading, NAV_CAMERA_HEADING_SMOOTH_ALPHA);
    return { bearing, source: 'gps' };
  }

  if (previousLocation && isValidMapCoord(previousLocation.latitude, previousLocation.longitude)) {
    const movedM =
      haversineKm(
        previousLocation.latitude,
        previousLocation.longitude,
        driverLocation.latitude,
        driverLocation.longitude,
      ) * 1000;
    if (movedM >= 5) {
      const movementBearing = bearingFromGpsMovement(
        previousLocation,
        driverLocation,
        lastValidBearing,
      );
      if (Number.isFinite(movementBearing)) {
        const bearing = smoothHeading(
          lastValidBearing,
          movementBearing,
          NAV_CAMERA_HEADING_SMOOTH_ALPHA,
        );
        return { bearing, source: 'movement' };
      }
    }
  }

  const routeBearing = getRouteNavigationHeading(
    driverLocation,
    routeCoords,
    NAV_ROUTE_HEADING_LOOKAHEAD_M,
  );
  if (routeBearing != null && Number.isFinite(routeBearing)) {
    const bearing = smoothHeading(lastValidBearing, routeBearing, NAV_CAMERA_HEADING_SMOOTH_ALPHA);
    return { bearing, source: 'route' };
  }

  if (Number.isFinite(routeDisplayHeading) && routeDisplayHeading !== 0) {
    const bearing = smoothHeading(
      lastValidBearing,
      routeDisplayHeading,
      NAV_CAMERA_HEADING_SMOOTH_ALPHA,
    );
    return { bearing, source: 'display' };
  }

  return { bearing: lastValidBearing, source: 'last' };
}

/** Bearing de navegação on_trip: sempre rota à frente (P→Q), nunca GPS bruto. */
export function resolvePassengerOntripCameraBearing(input: {
  followAnchor: MapLatLng;
  routeCoords: MapLatLng[];
  routeDisplayHeading: number;
  lastValidBearing: number;
}): {
  bearing: number;
  source: PassengerCameraBearingSource;
  ignoredReason?: string;
} {
  const { followAnchor, routeCoords, routeDisplayHeading, lastValidBearing } = input;

  if (Number.isFinite(routeDisplayHeading) && routeDisplayHeading !== 0) {
    const candidate = rejectSharpBearingFlip(lastValidBearing, routeDisplayHeading);
    const bearing = smoothHeading(lastValidBearing, candidate, NAV_CAMERA_HEADING_SMOOTH_ALPHA);
    logPassengerMapRotation('bearing from route anchor heading', {
      bearingCalculated: Math.round(routeDisplayHeading),
      bearingApplied: Math.round(bearing),
      source: 'display',
    });
    return { bearing, source: 'display' };
  }

  const rawRouteBearing = bearingForwardAlongPolyline(
    routeCoords,
    followAnchor.latitude,
    followAnchor.longitude,
    NAV_ROUTE_HEADING_LOOKAHEAD_M,
  );

  if (rawRouteBearing != null && Number.isFinite(rawRouteBearing)) {
    const candidate = rejectSharpBearingFlip(lastValidBearing, rawRouteBearing);
    const bearing = smoothHeading(lastValidBearing, candidate, NAV_CAMERA_HEADING_SMOOTH_ALPHA);
    logPassengerMapRotation('bearing from polyline lookahead', {
      bearingCalculated: Math.round(rawRouteBearing),
      bearingApplied: Math.round(bearing),
      source: 'route',
    });
    return { bearing, source: 'route' };
  }

  const routeBearing = getRouteNavigationHeading(
    followAnchor,
    routeCoords,
    NAV_ROUTE_HEADING_LOOKAHEAD_M,
  );
  if (routeBearing != null && Number.isFinite(routeBearing)) {
    const candidate = rejectSharpBearingFlip(lastValidBearing, routeBearing);
    const bearing = smoothHeading(lastValidBearing, candidate, NAV_CAMERA_HEADING_SMOOTH_ALPHA);
    logPassengerMapRotation('bearing from route fallback', {
      bearingCalculated: Math.round(routeBearing),
      bearingApplied: Math.round(bearing),
      source: 'route',
    });
    return { bearing, source: 'route' };
  }

  logPassengerMapRotation('bearing ignored — keeping last valid', {
    lastValidBearing: Math.round(lastValidBearing),
    ignoredReason: 'no valid route bearing',
  });
  return { bearing: lastValidBearing, source: 'last', ignoredReason: 'no valid route bearing' };
}

export function logPassengerCameraPhase(input: {
  uiState: string;
  visual: PassengerVisualState | null;
  phase: NavigationPhase | 'none';
  mapMode: PassengerMapMode;
}) {
  logPassengerMapboxCamera('status', {
    uiState: input.uiState,
    visual: input.visual,
    phase: input.phase,
    mapMode: input.mapMode,
  });

  if (input.visual === 'driver_assigned' || input.phase === 'to_pickup') {
    logPassengerMapboxCamera('pickup phase');
  } else if (input.visual === 'driver_arrived') {
    logPassengerMapboxCamera('arrived phase');
  } else if (input.visual === 'on_trip' || input.phase === 'to_destination') {
    logPassengerMapboxCamera('ontrip phase');
  }
}

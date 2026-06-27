import { useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import type { MapLatLng } from '@/components/maps/types';
import { usePassengerLocation } from '@/hooks/usePassengerLocation';
import {
  coordsFromPassengerLocation,
  logPassengerMapLocationState,
  normalizePassengerGpsHeading,
  type PassengerMapLocationSource,
} from '@/lib/navigation/passengerMapboxLocation';
import type { NavigationPhase } from '@/components/maps/types';
import type { PassengerVisualState } from '@/lib/passengerRideVisualState';
import { isValidMapCoord } from '@/lib/geo';

export type PassengerTripMapLocation = {
  position: MapLatLng | null;
  gpsHeading: number | null;
  source: PassengerMapLocationSource;
};

export function usePassengerTripMapLocation(input: {
  enabled: boolean;
  pickup: MapLatLng | null;
  visual: PassengerVisualState | null;
  phase: NavigationPhase | 'none';
  driverAvailable: boolean;
}): PassengerTripMapLocation {
  const { currentLocation } = usePassengerLocation();
  const [watchedPosition, setWatchedPosition] = useState<MapLatLng | null>(null);
  const [watchedHeading, setWatchedHeading] = useState<number | null>(null);
  const lastLoggedSourceRef = useRef<PassengerMapLocationSource | null>(null);

  useEffect(() => {
    if (!input.enabled) {
      setWatchedPosition(null);
      setWatchedHeading(null);
      return;
    }

    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    void (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (cancelled || status !== Location.PermissionStatus.GRANTED) return;

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 5,
          timeInterval: 2000,
        },
        (pos) => {
          const { latitude, longitude } = pos.coords;
          if (!isValidMapCoord(latitude, longitude)) return;
          setWatchedPosition({ latitude, longitude });
          setWatchedHeading(normalizePassengerGpsHeading(pos.coords.heading));
        },
      );
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [input.enabled]);

  const resolved = useMemo((): PassengerTripMapLocation => {
    if (!input.enabled) {
      return { position: null, gpsHeading: null, source: 'none' };
    }

    if (watchedPosition) {
      return { position: watchedPosition, gpsHeading: watchedHeading, source: 'gps' };
    }

    const contextPosition = coordsFromPassengerLocation(currentLocation);
    if (contextPosition) {
      return {
        position: contextPosition,
        gpsHeading: normalizePassengerGpsHeading(currentLocation?.heading),
        source: 'context',
      };
    }

    if (input.pickup) {
      return { position: input.pickup, gpsHeading: null, source: 'pickup' };
    }

    return { position: null, gpsHeading: null, source: 'none' };
  }, [input.enabled, watchedPosition, watchedHeading, currentLocation, input.pickup]);

  useEffect(() => {
    if (!input.enabled) return;
    if (lastLoggedSourceRef.current === resolved.source) return;
    lastLoggedSourceRef.current = resolved.source;
    logPassengerMapLocationState({
      visual: input.visual,
      phase: input.phase,
      passengerAvailable: resolved.position != null,
      driverAvailable: input.driverAvailable,
      indicatorSource: resolved.source,
      driverMarkerHidden: true,
      fallback: resolved.source === 'pickup' ? 'pickup' : undefined,
    });
  }, [input.enabled, resolved.source, resolved.position, input.visual, input.phase, input.driverAvailable]);

  return resolved;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PassengerVisualState } from '@/lib/passengerRideVisualState';
import {
  driverLocationService,
  logPassengerDriverLiveLocation,
  type DriverCurrentLocationRow,
} from '@/services/driverLocationService';
import { toPickupDriverLiveLocation, type PickupDriverLiveLocation } from '@/lib/navigation/resolvePickupDriverLocation';

export function isPickupDriverTrackingEnabled(
  visual: PassengerVisualState | null,
  uiState: string,
): boolean {
  if (visual === 'on_trip' || uiState === 'on_trip') return false;
  return visual === 'driver_assigned' || visual === 'driver_arrived' || uiState === 'driver_en_route' || uiState === 'driver_arrived';
}

/** Tracking em tempo real via driver_locations_current (recolha apenas). */
export function isDriverLiveTrackingEnabled(
  visual: PassengerVisualState | null,
  uiState: string,
): boolean {
  return isPickupDriverTrackingEnabled(visual, uiState);
}

export function useDriverLiveLocationForPassenger(input: {
  rideId?: string;
  driverId?: string;
  enabled: boolean;
  visual: PassengerVisualState | null;
  uiState: string;
}) {
  const [row, setRow] = useState<DriverCurrentLocationRow | null>(null);
  const [staleTick, setStaleTick] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const mountedRef = useRef(true);

  const location = useMemo(() => toPickupDriverLiveLocation(row), [row, staleTick]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!input.enabled || !row) return;
    const id = setInterval(() => {
      setStaleTick((n) => n + 1);
    }, 10_000);
    return () => clearInterval(id);
  }, [input.enabled, row?.updated_at]);

  useEffect(() => {
    if (!input.enabled || !input.driverId?.trim()) {
      setRow(null);
      setIsSubscribed(false);
      return;
    }

    const driverId = input.driverId.trim();
    let cancelled = false;

    const applyRow = (next: DriverCurrentLocationRow | null) => {
      if (cancelled || !mountedRef.current) return;
      setRow(next);
    };

    void driverLocationService.getDriverCurrentLocation(driverId).then(applyRow);

    setIsSubscribed(true);
    const unsub = driverLocationService.subscribeToDriverCurrentLocation(driverId, applyRow, {
      rideId: input.rideId,
      scope: 'current-ride-pickup',
    });

    return () => {
      cancelled = true;
      setIsSubscribed(false);
      setRow(null);
      unsub();
    };
  }, [input.enabled, input.driverId, input.rideId]);

  useEffect(() => {
    if (!input.enabled) return;
    if (!input.driverId?.trim()) {
      logPassengerDriverLiveLocation('tracking disabled missing driverId', {
        rideId: input.rideId,
        visual: input.visual,
        uiState: input.uiState,
      });
    }
  }, [input.enabled, input.driverId, input.rideId, input.visual, input.uiState]);

  return { location, isSubscribed };
}

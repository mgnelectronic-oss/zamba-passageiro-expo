import { useEffect, useRef, useState, useCallback } from 'react';
import { rideStateService, type RideState, type DriverInfo } from '@/services/rideStateService';
import { rideService } from '@/services/rideService';

const POLL_INTERVAL = 3000;

export function useRideState(rideId: string | undefined) {
  const [state, setState] = useState<RideState | null>(null);
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const uiState = state?.ui_state ?? '';

  const isTerminal =
    uiState === 'completed' ||
    uiState === 'cancelled' ||
    uiState === 'no_driver_available_for_category';

  const poll = useCallback(async () => {
    if (!rideId || !mountedRef.current) return;
    try {
      const result = await rideStateService.getRideState(rideId);
      if (!mountedRef.current) return;
      if (result) {
        setState(result);

        const needsDriver =
          result.ui_state === 'driver_en_route' ||
          result.ui_state === 'driver_arrived' ||
          result.ui_state === 'on_trip';

        if (needsDriver && result.driver_id) {
          const info = await rideStateService.getDriverInfo(rideId);
          if (mountedRef.current && info) setDriverInfo(info);
        }
      }
    } catch {
      // silent
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [rideId]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    poll();

    pollRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [poll]);

  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!rideId) return;
    const unsub = rideService.subscribeToRide(rideId, () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      realtimeDebounceRef.current = setTimeout(() => {
        realtimeDebounceRef.current = null;
        poll();
      }, 220);
    });
    return () => {
      unsub();
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    };
  }, [rideId, poll]);

  useEffect(() => {
    if (isTerminal && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [isTerminal]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  return { state, driverInfo, loading, uiState, isTerminal, stopPolling, refresh: poll };
}

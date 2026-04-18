import { useEffect, useRef, useState, useCallback } from 'react';
import { driverService, type NearbyDriver } from '@/services/driverService';

const POLL_INTERVAL = 5000;

export function useNearbyDrivers(
  pickupLat: number,
  pickupLng: number,
  vehicleCategory: string,
  enabled = true,
) {
  const [drivers, setDrivers] = useState<NearbyDriver[]>([]);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const fetch = useCallback(async () => {
    if (!enabled || !mountedRef.current) return;
    setLoading(true);
    try {
      const result = await driverService.getNearbyDrivers(pickupLat, pickupLng, vehicleCategory);
      if (mountedRef.current) setDrivers(result);
    } catch {
      // silent
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [pickupLat, pickupLng, vehicleCategory, enabled]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      setDrivers([]);
      return;
    }

    fetch();
    pollRef.current = setInterval(fetch, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetch, enabled]);

  const stop = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  return { drivers, loading, stop, refresh: fetch };
}

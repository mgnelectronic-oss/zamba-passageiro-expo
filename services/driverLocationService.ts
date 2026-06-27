import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { isValidMapCoord } from '@/lib/geo';

const LOG = '[PASSENGER DRIVER LIVE LOCATION]';

export type DriverCurrentLocationRow = {
  driver_id: string;
  lat: number;
  lng: number;
  updated_at: string;
};

export const DRIVER_LOCATION_STALE_MS = 30_000;

export function logPassengerDriverLiveLocation(message: string, extra?: Record<string, unknown>) {
  if (!__DEV__) return;
  if (extra) {
    console.log(LOG, message, extra);
  } else {
    console.log(LOG, message);
  }
}

function parseDriverLocationRow(raw: Record<string, unknown> | null | undefined): DriverCurrentLocationRow | null {
  if (!raw) return null;
  const driver_id = String(raw.driver_id ?? '').trim();
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  const updated_at = String(raw.updated_at ?? '').trim();
  if (!driver_id || !updated_at) return null;
  if (!isValidMapCoord(lat, lng)) return null;
  return { driver_id, lat, lng, updated_at };
}

export function evaluateDriverCurrentLocation(
  row: DriverCurrentLocationRow | null,
  nowMs = Date.now(),
): {
  row: DriverCurrentLocationRow | null;
  isValid: boolean;
  isStale: boolean;
  ageMs: number | null;
} {
  if (!row) {
    return { row: null, isValid: false, isStale: true, ageMs: null };
  }
  const updatedMs = Date.parse(row.updated_at);
  const ageMs = Number.isFinite(updatedMs) ? Math.max(0, nowMs - updatedMs) : null;
  const isStale = ageMs == null || ageMs > DRIVER_LOCATION_STALE_MS;
  return { row, isValid: true, isStale, ageMs };
}

export const driverLocationService = {
  async getDriverCurrentLocation(driverId: string): Promise<DriverCurrentLocationRow | null> {
    if (!isSupabaseConfigured || !driverId?.trim()) return null;

    try {
      const { data, error } = await supabase
        .from('driver_locations_current')
        .select('driver_id, lat, lng, updated_at')
        .eq('driver_id', driverId.trim())
        .maybeSingle();

      if (error) {
        logPassengerDriverLiveLocation('initial fetch error', { driverId, message: error.message });
        return null;
      }

      const row = parseDriverLocationRow(data as Record<string, unknown> | null);
      if (row) {
        const evalResult = evaluateDriverCurrentLocation(row);
        logPassengerDriverLiveLocation('initial fetch', {
          driverId,
          lat: row.lat,
          lng: row.lng,
          updatedAt: row.updated_at,
          ageMs: evalResult.ageMs,
          stale: evalResult.isStale,
        });
      } else {
        logPassengerDriverLiveLocation('initial fetch empty', { driverId });
      }
      return row;
    } catch {
      logPassengerDriverLiveLocation('initial fetch failed', { driverId });
      return null;
    }
  },

  subscribeToDriverCurrentLocation(
    driverId: string,
    onUpdate: (row: DriverCurrentLocationRow | null) => void,
    opts?: { rideId?: string; scope?: string },
  ) {
    if (!isSupabaseConfigured || !driverId?.trim()) return () => {};

    const scope = opts?.scope ?? 'default';
    const channelName = `driver-location:${driverId}:${scope}`;
    let lastFingerprint = '';

    logPassengerDriverLiveLocation('subscription start', {
      rideId: opts?.rideId,
      driverId,
      scope,
    });

    const deliver = (raw: Record<string, unknown> | null) => {
      const row = parseDriverLocationRow(raw);
      const fingerprint = row
        ? `${row.lat}:${row.lng}:${row.updated_at}`
        : 'empty';
      if (fingerprint === lastFingerprint) return;
      lastFingerprint = fingerprint;

      if (row) {
        const evalResult = evaluateDriverCurrentLocation(row);
        logPassengerDriverLiveLocation('realtime update', {
          rideId: opts?.rideId,
          driverId,
          lat: row.lat,
          lng: row.lng,
          updatedAt: row.updated_at,
          ageMs: evalResult.ageMs,
          stale: evalResult.isStale,
        });
      }

      onUpdate(row);
    };

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_locations_current',
          filter: `driver_id=eq.${driverId.trim()}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            deliver(null);
            return;
          }
          deliver(payload.new as Record<string, unknown>);
        },
      );

    channel.subscribe();

    return () => {
      logPassengerDriverLiveLocation('subscription stop', { rideId: opts?.rideId, driverId });
      void supabase.removeChannel(channel);
    };
  },
};

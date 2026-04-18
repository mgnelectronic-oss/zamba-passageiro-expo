import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { mapCacheService } from '@/services/cache/mapCacheService';

export interface VehicleCategory {
  id: string;
  name: string;
  vehicle_category: string;
  description?: string;
  base_fare?: number;
  per_km?: number;
}

/** Alinhado a Zamba-Mocambique `services/rideService.ts` — `ride_live_route`. */
export interface LiveRoute {
  ride_id: string;
  route_phase: 'to_pickup' | 'to_destination';
  polyline: string;
  distance_meters: number;
  duration_seconds: number;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  vehicle_category?: string;
  last_driver_lat: number;
  last_driver_lng: number;
  updated_at: string;
}

const FALLBACK_CATEGORIES: VehicleCategory[] = [
  { id: '1', name: 'Carro Económico', vehicle_category: 'economico', description: 'Viagens baratas no dia a dia', base_fare: 100, per_km: 20 },
  { id: '2', name: 'Carro Conforto', vehicle_category: 'conforto', description: 'Carros novos e espaçosos', base_fare: 150, per_km: 30 },
  { id: '3', name: 'Moto', vehicle_category: 'moto', description: 'Rápido e económico', base_fare: 50, per_km: 10 },
  { id: '4', name: 'Txopela', vehicle_category: 'txopela', description: 'O clássico de Maputo', base_fare: 70, per_km: 15 },
];

export const rideService = {
  async getVehicleCategories(): Promise<VehicleCategory[]> {
    if (!isSupabaseConfigured) return FALLBACK_CATEGORIES;

    const cached = await mapCacheService.getVehicleCategories();
    if (cached?.length) {
      void (async () => {
        try {
          const { data, error } = await supabase
            .from('vehicle_categories')
            .select('*');
          if (!error && data && data.length > 0) {
            await mapCacheService.setVehicleCategories(data as VehicleCategory[]);
          }
        } catch {
          /* ignore */
        }
      })();
      return cached;
    }

    try {
      const { data, error } = await supabase
        .from('vehicle_categories')
        .select('*');

      if (error || !data || data.length === 0) {
        const stale = await mapCacheService.getVehicleCategories();
        return stale?.length ? stale : FALLBACK_CATEGORIES;
      }
      const rows = data as VehicleCategory[];
      await mapCacheService.setVehicleCategories(rows);
      return rows;
    } catch {
      const stale = await mapCacheService.getVehicleCategories();
      return stale?.length ? stale : FALLBACK_CATEGORIES;
    }
  },

  async calculateRideFare(
    category: string,
    distanceKm: number,
    durationMin: number,
  ): Promise<number | null> {
    if (!isSupabaseConfigured) return null;

    try {
      const { data, error } = await supabase.rpc('calculate_ride_fare', {
        p_category: category,
        p_distance_km: distanceKm,
        p_duration_min: durationMin,
      });

      if (error) return null;
      if (data && Array.isArray(data) && data.length > 0) {
        return data[0].total_fare as number;
      }
      return null;
    } catch {
      return null;
    }
  },

  async requestRideV2(params: {
    p_pickup_lat: number;
    p_pickup_lng: number;
    p_pickup_address: string;
    p_destination_lat: number;
    p_destination_lng: number;
    p_dropoff_address: string;
    p_vehicle_category: string;
    p_estimated_distance_km: number;
    p_estimated_duration_min: number;
  }) {
    if (!isSupabaseConfigured) throw new Error('Supabase não está configurado.');

    const { data, error } = await supabase.rpc('request_ride_v2', params);

    if (error) throw error;

    let result = data;
    if (Array.isArray(data) && data.length > 0) result = data[0];

    if (!result || (!result.ride_id && !result.id)) {
      throw new Error('Resposta inválida da RPC request_ride_v2');
    }

    return {
      id: result.ride_id || result.id,
      status: result.status || 'searching',
      search_status: result.search_status || result.status || 'searching',
      price_estimate: result.price_estimate || result.fare_estimate || 0,
    };
  },

  async getRideSearchStatus(rideId: string) {
    if (!isSupabaseConfigured) return null;

    const { data, error } = await supabase.rpc('obter_estado_corrida_passageiro', {
      p_ride_id: rideId,
    });

    if (error) return null;

    let result = data;
    if (Array.isArray(data) && data.length > 0) result = data[0];
    return result;
  },

  /** Última corrida do passageiro (mais recente). Alinhado a Zamba-Mocambique `getLatestRide`. */
  async getLatestRide(passengerId: string): Promise<Record<string, unknown> | null> {
    if (!isSupabaseConfigured) return null;
    if (!passengerId?.trim()) return null;
    try {
      const { data, error } = await supabase
        .from('rides')
        .select('*')
        .eq('passenger_id', passengerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as Record<string, unknown> | null;
    } catch {
      return null;
    }
  },

  /**
   * Corrida ativa a recuperar após abrir o app — mesma regra que `PassengerProvider` (web):
   * última corrida não finalizada + `obter_estado_corrida_passageiro`; cancela se só restar `no_driver_available_for_category`.
   */
  async resolveActivePassengerRideId(passengerId: string): Promise<string | null> {
    const latest = await this.getLatestRide(passengerId);
    if (!latest) return null;
    const id = String(latest.id ?? '');
    if (!id) return null;
    const status = String(latest.status ?? '');
    if (status === 'completed' || status === 'cancelled') return null;

    const row = await this.getRideSearchStatus(id);
    if (!row || typeof row !== 'object') return null;
    const r = row as Record<string, unknown>;
    const uiState = String(r.ui_state ?? r.search_status ?? '');
    if (uiState === 'no_driver_available_for_category') {
      try {
        await this.cancelRide(id);
      } catch {
        /* ignore */
      }
      return null;
    }
    return id;
  },

  async cancelRide(rideId: string) {
    if (!isSupabaseConfigured) throw new Error('Supabase não está configurado.');

    const { data, error } = await supabase.rpc('passenger_cancel_ride', {
      p_ride_id: rideId,
    });

    if (error) throw error;
    return data;
  },

  /** Linha oficial em `rides` (ex.: total pago na conclusão). Alinhado a Zamba-Mocambique `getRideById`. */
  async getRideById(rideId: string): Promise<Record<string, unknown> | null> {
    if (!isSupabaseConfigured || !rideId?.trim()) return null;
    const { data, error } = await supabase.from('rides').select('*').eq('id', rideId).maybeSingle();
    if (error) throw error;
    return data as Record<string, unknown> | null;
  },

  subscribeToRide(rideId: string, onUpdate: (payload: any) => void) {
    const channel = supabase
      .channel(`ride-${rideId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rides', filter: `id=eq.${rideId}` },
        (payload) => onUpdate(payload.new),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  },

  async getCompletedRidesCount(userId: string): Promise<number> {
    if (!isSupabaseConfigured) return 0;
    try {
      const { count, error } = await supabase
        .from('rides')
        .select('*', { count: 'exact', head: true })
        .eq('passenger_id', userId)
        .eq('status', 'completed');
      if (error) return 0;
      return count ?? 0;
    } catch {
      return 0;
    }
  },

  /**
   * Histórico oficial do passageiro (`auth.uid()` no servidor).
   * Sem parâmetros — alinhado a Zamba-Mocambique `app/history/page.tsx`.
   */
  async getPassengerRideHistory(): Promise<{
    data: Record<string, unknown>[] | null;
    error: { message: string; code?: string; details?: string } | null;
  }> {
    if (!isSupabaseConfigured) {
      return { data: null, error: { message: 'Supabase não está configurado.' } };
    }

    const { data, error } = await supabase.rpc('get_passenger_ride_history');

    if (error) {
      return {
        data: null,
        error: {
          message: error.message,
          code: error.code,
          details: (error as { details?: string }).details,
        },
      };
    }

    if (data == null) {
      return { data: [], error: null };
    }

    const rows = Array.isArray(data) ? data : [data];
    return { data: rows as Record<string, unknown>[], error: null };
  },

  async getSharedRidesForMe() {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase.rpc('get_shared_rides_for_me');
    if (error) {
      console.error('[shared_rides] get_shared_rides_for_me error:', error);
      return [];
    }
    return data || [];
  },

  async markRideShareNotificationAsRead(notificationId: string) {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.rpc('mark_ride_share_notification_as_read', {
      p_notification_id: notificationId,
    });
    if (error) console.error('[shared_rides] mark_read error:', error);
  },

  async getSharedRideLiveDetails(rideShareId: string) {
    if (!isSupabaseConfigured) return null;
    const { data, error } = await supabase.rpc('get_shared_ride_live_details', {
      p_ride_share_id: rideShareId,
    });
    if (error) {
      console.error('[shared_rides] get_live_details error:', error);
      return null;
    }
    return data;
  },

  async getLiveRoute(rideId: string): Promise<LiveRoute | null> {
    if (!isSupabaseConfigured || !rideId?.trim()) return null;
    try {
      const { data, error } = await supabase
        .from('ride_live_route')
        .select('*')
        .eq('ride_id', rideId)
        .maybeSingle();
      if (error) return null;
      return data as LiveRoute | null;
    } catch {
      return null;
    }
  },

  subscribeToLiveRoute(rideId: string, callback: (route: LiveRoute | null) => void) {
    if (!isSupabaseConfigured || !rideId) return () => {};

    let lastSent = '';
    let queued: LiveRoute | null | undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fingerprint = (r: LiveRoute | null) =>
      r
        ? `${r.updated_at}\0${r.polyline ?? ''}\0${r.last_driver_lat}\0${r.last_driver_lng}\0${r.duration_seconds}`
        : '∅';

    const deliver = () => {
      timer = null;
      if (queued === undefined) return;
      const next = queued;
      queued = undefined;
      const fp = fingerprint(next);
      if (fp === lastSent) return;
      lastSent = fp;
      callback(next);
    };

    const channel = supabase
      .channel(`live_route_${rideId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ride_live_route',
          filter: `ride_id=eq.${rideId}`,
        },
        (payload) => {
          const next: LiveRoute | null =
            payload.eventType === 'DELETE' ? null : (payload.new as LiveRoute);
          queued = next;
          if (timer != null) return;
          timer = setTimeout(deliver, 300);
        },
      )
      .subscribe();

    return () => {
      if (timer != null) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  },

  async submitDriverRating(params: {
    driver_id: string;
    ride_id: string;
    passenger_id: string;
    rating: number;
    comment?: string;
  }) {
    if (!isSupabaseConfigured) throw new Error('Supabase não está configurado.');
    const { data, error } = await supabase
      .from('driver_ratings')
      .insert([params])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async checkDriverRatingExists(rideId: string): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    try {
      const { data, error } = await supabase
        .from('driver_ratings')
        .select('id')
        .eq('ride_id', rideId)
        .maybeSingle();
      if (error) return false;
      return !!data;
    } catch {
      return false;
    }
  },

  /** Alinhado a Zamba-Mocambique `rideService.getEmergencyContacts` — RPC `get_emergency_contacts`. */
  async getEmergencyContacts(): Promise<Record<string, unknown>[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase.rpc('get_emergency_contacts');
    if (error) throw error;
    return Array.isArray(data) ? data : data ? [data as Record<string, unknown>] : [];
  },

  /** Alinhado a Zamba-Mocambique — RPC `get_sos_reasons`. */
  async getSosReasons(): Promise<Record<string, unknown>[]> {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase.rpc('get_sos_reasons');
    if (error) {
      console.error('[rideService] get_sos_reasons', error);
      return [];
    }
    return Array.isArray(data) ? data : data ? [data as Record<string, unknown>] : [];
  },

  /** Alinhado a Zamba-Mocambique — RPC `create_sos_alert`. */
  async createSosAlert(
    rideId: string,
    alertType: string,
    reasonCode: string,
    details: string,
    lat: number,
    lng: number,
  ): Promise<unknown> {
    if (!isSupabaseConfigured) throw new Error('Supabase não está configurado.');
    const { data, error } = await supabase.rpc('create_sos_alert', {
      p_ride_id: rideId,
      p_alert_type: alertType,
      p_reason_code: reasonCode,
      p_details: details,
      p_passenger_lat: lat,
      p_passenger_lng: lng,
    });
    if (error) throw error;
    return data;
  },

  /** Alinhado a Zamba-Mocambique — RPC `update_sos_alert_location`. */
  async updateSosAlertLocation(alertId: string, lat: number, lng: number): Promise<void> {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.rpc('update_sos_alert_location', {
      p_alert_id: alertId,
      p_lat: lat,
      p_lng: lng,
    });
    if (error) console.error('[rideService] update_sos_alert_location', error);
  },

  /** Alinhado a Zamba-Mocambique — RPC `create_ride_share`. */
  async createRideShare(rideId: string, sharedWithPhone: string): Promise<unknown> {
    if (!isSupabaseConfigured) throw new Error('Supabase não está configurado.');
    const { data, error } = await supabase.rpc('create_ride_share', {
      p_ride_id: rideId,
      p_shared_with_phone: sharedWithPhone,
    });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },

  /** Alinhado a Zamba-Mocambique — RPC `get_passenger_current_ride_driver_info`. */
  async getPassengerCurrentRideDriverInfo(rideId: string): Promise<Record<string, unknown>[] | null> {
    if (!isSupabaseConfigured) throw new Error('Supabase não está configurado.');
    const { data, error } = await supabase.rpc('get_passenger_current_ride_driver_info', {
      p_ride_id: rideId,
    });
    if (error) throw error;
    if (data == null) return null;
    return Array.isArray(data) ? data : [data as Record<string, unknown>];
  },
};

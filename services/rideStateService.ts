import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface RideState {
  ride_id: string;
  status: string;
  ui_state: string;
  pickup_address?: string;
  dropoff_address?: string;
  price_estimate?: number;
  final_fare?: number;
  /** auth.users.id do motorista (para RPCs que exigem user_id, não driver_id de negócio). */
  driver_user_id?: string;
  driver_id?: string;
  driver_name?: string;
  driver_phone?: string;
  vehicle_plate?: string;
  vehicle_model?: string;
  vehicle_category?: string;
  driver_lat?: number;
  driver_lng?: number;
  pickup_lat?: number;
  pickup_lng?: number;
  destination_lat?: number;
  destination_lng?: number;
}

export interface DriverInfo {
  driver_id: string;
  /** auth.users.id do motorista (chamadas / realtime com user_id). */
  user_id?: string;
  full_name?: string;
  phone?: string;
  avatar_url?: string;
  vehicle_brand?: string;
  vehicle_plate?: string;
  vehicle_model?: string;
  vehicle_color?: string;
  vehicle_category?: string;
  lat?: number;
  lng?: number;
  rating?: number;
}

export const rideStateService = {
  async getRideState(rideId: string): Promise<RideState | null> {
    if (!isSupabaseConfigured) return null;

    try {
      const { data, error } = await supabase.rpc('obter_estado_corrida_passageiro', {
        p_ride_id: rideId,
      });

      if (error || !data) return null;

      const row = Array.isArray(data) && data.length > 0 ? data[0] : data;
      if (!row) return null;

      return {
        ride_id: row.ride_id ?? row.id ?? rideId,
        status: row.status ?? '',
        ui_state: row.ui_state ?? row.search_status ?? row.status ?? '',
        pickup_address: row.pickup_address,
        dropoff_address: row.dropoff_address,
        /** Apenas colunas oficiais `rides` — sem `fare_estimate` como substituto de `price_estimate`. */
        price_estimate: row.price_estimate,
        final_fare: row.final_fare,
        driver_user_id:
          row.driver_user_id ??
          row.motorista_user_id ??
          row.driver_uuid ??
          row.auth_user_id ??
          undefined,
        driver_id: row.driver_id,
        driver_name: row.driver_name,
        driver_phone: row.driver_phone,
        vehicle_plate: row.vehicle_plate,
        vehicle_model: row.vehicle_model,
        vehicle_category: row.vehicle_category,
        driver_lat: row.driver_lat ?? row.driver_latitude,
        driver_lng: row.driver_lng ?? row.driver_longitude,
        pickup_lat: row.pickup_lat,
        pickup_lng: row.pickup_lng,
        destination_lat: row.destination_lat ?? row.dropoff_lat,
        destination_lng: row.destination_lng ?? row.dropoff_lng,
      };
    } catch {
      return null;
    }
  },

  async getDriverInfo(rideId: string): Promise<DriverInfo | null> {
    if (!isSupabaseConfigured) return null;

    try {
      const { data, error } = await supabase.rpc('get_passenger_current_ride_driver_info', {
        p_ride_id: rideId,
      });

      if (error || !data) return null;

      const row = Array.isArray(data) && data.length > 0 ? data[0] : data;
      if (!row) return null;

      return {
        driver_id: row.driver_id ?? row.id ?? '',
        user_id:
          row.user_id ??
          row.driver_user_id ??
          row.auth_user_id ??
          row.motorista_user_id ??
          row.driver_uuid,
        full_name: row.full_name ?? row.name,
        phone: row.phone,
        avatar_url: row.avatar_url ?? row.driver_photo_url,
        vehicle_brand: row.vehicle_brand ?? row.brand,
        vehicle_plate: row.vehicle_plate ?? row.plate,
        vehicle_model: row.vehicle_model ?? row.model,
        vehicle_color: row.vehicle_color ?? row.color,
        vehicle_category: row.vehicle_category,
        lat: row.lat ?? row.latitude,
        lng: row.lng ?? row.longitude,
        rating: row.rating ?? row.average_rating,
      };
    } catch {
      return null;
    }
  },
};

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface NearbyDriver {
  driver_id: string;
  lat: number;
  lng: number;
  vehicle_category?: string;
  full_name?: string;
  distance_meters?: number;
}

export const driverService = {
  async getNearbyDrivers(
    pickupLat: number,
    pickupLng: number,
    vehicleCategory: string,
  ): Promise<NearbyDriver[]> {
    if (!isSupabaseConfigured) return [];

    try {
      const { data, error } = await supabase.rpc('obter_motoristas_proximos_para_mapa', {
        p_latitude: pickupLat,
        p_longitude: pickupLng,
        p_vehicle_category: vehicleCategory,
      });

      if (error || !data) return [];

      const rows = Array.isArray(data) ? data : [data];

      return rows.map((d: any) => ({
        driver_id: d.driver_id ?? d.id ?? '',
        lat: d.lat ?? d.latitude ?? 0,
        lng: d.lng ?? d.longitude ?? 0,
        vehicle_category: d.vehicle_category,
        full_name: d.full_name ?? d.name,
        distance_meters: d.distance_meters ?? d.distance,
      }));
    } catch {
      return [];
    }
  },
};

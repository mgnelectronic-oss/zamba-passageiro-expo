import type { MapLatLng } from '@/components/maps/types';
import { haversineKm } from '@/lib/geo';

export function polylineLengthMeters(coords: MapLatLng[]): number {
  if (coords.length < 2) return 0;
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    acc +=
      haversineKm(
        coords[i - 1].latitude,
        coords[i - 1].longitude,
        coords[i].latitude,
        coords[i].longitude,
      ) * 1000;
  }
  return acc;
}

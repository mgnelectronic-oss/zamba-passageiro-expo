import type { SelectedDestination } from '@/services/googlePlaces';

export type RecentDestination = {
  id: string;
  place_name: string;
  full_address: string;
  lat: number;
  lng: number;
  last_used_at: string;
};

let recents: RecentDestination[] = [];

export function getRecentDestinations() {
  return recents;
}

const PLACEHOLDERS = ['A obter localização…', 'A obter localização...', 'Localização Actual', 'Localização Atual'];

export function addRecentDestination(destination: SelectedDestination) {
  if (PLACEHOLDERS.includes(destination.address) || PLACEHOLDERS.includes(destination.place_name)) return;
  if (!destination.address || destination.address.trim() === '') return;

  const existing = recents.find((item) => item.full_address === destination.address);
  const now = new Date().toISOString();
  if (existing) {
    recents = recents.map((item) =>
      item.full_address === destination.address
        ? {
            ...item,
            place_name: destination.place_name,
            last_used_at: now,
          }
        : item,
    );
  } else {
    recents = [
      {
        id: destination.place_id ?? `${Date.now()}`,
        place_name: destination.place_name,
        full_address: destination.address,
        lat: destination.lat,
        lng: destination.lng,
        last_used_at: now,
      },
      ...recents,
    ];
  }

  recents = recents
    .sort((a, b) => (a.last_used_at < b.last_used_at ? 1 : -1))
    .slice(0, 5);
}

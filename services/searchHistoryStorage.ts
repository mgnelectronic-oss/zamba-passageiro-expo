import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@zamba/passenger/search_history_v7';
const MAX = 7;

export type SearchHistoryEntry = {
  id: string;
  place_name: string;
  address: string;
  lat: number;
  lng: number;
  savedAt: number;
};

function stableId(dest: {
  place_id?: string;
  lat: number;
  lng: number;
}): string {
  if (dest.place_id && dest.place_id.length > 0) return dest.place_id;
  return `ll_${Math.round(dest.lat * 1e6)}_${Math.round(dest.lng * 1e6)}`;
}

export async function loadSearchHistory(): Promise<SearchHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SearchHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e) =>
          e &&
          typeof e.id === 'string' &&
          typeof e.place_name === 'string' &&
          typeof e.address === 'string' &&
          typeof e.lat === 'number' &&
          typeof e.lng === 'number',
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

/** FIFO: mais recente primeiro; remove duplicado pelo mesmo id. */
export async function pushSearchHistory(dest: {
  place_id?: string;
  place_name: string;
  address: string;
  lat: number;
  lng: number;
}): Promise<SearchHistoryEntry[]> {
  const id = stableId(dest);
  const prev = await loadSearchHistory();
  const filtered = prev.filter((e) => e.id !== id);
  const entry: SearchHistoryEntry = {
    id,
    place_name: dest.place_name,
    address: dest.address,
    lat: dest.lat,
    lng: dest.lng,
    savedAt: Date.now(),
  };
  const next = [entry, ...filtered].slice(0, MAX);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

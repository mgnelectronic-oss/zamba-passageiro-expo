import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RideHistoryItem } from '@/services/passengerRideHistoryModel';

const RIDES_KEY = '@zamba/passenger_history_rides_v1';
const META_KEY = '@zamba/passenger_history_meta_v1';

export type PassengerHistoryMeta = {
  /** Alinhado a `rideService.getCompletedRidesCount` — invalida cache quando mudar. */
  completedRidesCount: number;
  savedAt: string;
};

export async function loadPassengerHistoryCache(): Promise<{
  rides: RideHistoryItem[];
  meta: PassengerHistoryMeta | null;
}> {
  try {
    const [rawRides, rawMeta] = await Promise.all([
      AsyncStorage.getItem(RIDES_KEY),
      AsyncStorage.getItem(META_KEY),
    ]);

    let rides: RideHistoryItem[] = [];
    if (rawRides) {
      const parsed = JSON.parse(rawRides) as unknown;
      if (Array.isArray(parsed)) {
        rides = parsed as RideHistoryItem[];
      }
    }

    let meta: PassengerHistoryMeta | null = null;
    if (rawMeta) {
      const m = JSON.parse(rawMeta) as Partial<PassengerHistoryMeta>;
      if (
        m &&
        typeof m.completedRidesCount === 'number' &&
        typeof m.savedAt === 'string'
      ) {
        meta = {
          completedRidesCount: m.completedRidesCount,
          savedAt: m.savedAt,
        };
      }
    }

    return { rides, meta };
  } catch {
    return { rides: [], meta: null };
  }
}

export async function savePassengerHistoryCache(
  rides: RideHistoryItem[],
  meta: PassengerHistoryMeta,
): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.setItem(RIDES_KEY, JSON.stringify(rides)),
      AsyncStorage.setItem(META_KEY, JSON.stringify(meta)),
    ]);
  } catch {
    /* ignore */
  }
}

export async function clearPassengerHistoryCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([RIDES_KEY, META_KEY]);
  } catch {
    /* ignore */
  }
}

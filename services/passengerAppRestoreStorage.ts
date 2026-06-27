import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'passenger_app_restore_v1';

export type PersistedPassengerAppRestore = {
  rideId: string | null;
  route: string | null;
  updatedAt: number;
};

export async function loadPassengerAppRestore(): Promise<PersistedPassengerAppRestore | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedPassengerAppRestore>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      rideId: typeof parsed.rideId === 'string' && parsed.rideId.length > 0 ? parsed.rideId : null,
      route: typeof parsed.route === 'string' && parsed.route.length > 0 ? parsed.route : null,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export async function savePassengerAppRestore(
  data: Partial<PersistedPassengerAppRestore>,
): Promise<void> {
  try {
    const prev = (await loadPassengerAppRestore()) ?? {
      rideId: null,
      route: null,
      updatedAt: 0,
    };
    const next: PersistedPassengerAppRestore = {
      rideId: data.rideId !== undefined ? data.rideId : prev.rideId,
      route: data.route !== undefined ? data.route : prev.route,
      updatedAt: Date.now(),
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

export async function clearPassengerAppRestore(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

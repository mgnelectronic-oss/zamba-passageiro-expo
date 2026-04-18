import AsyncStorage from '@react-native-async-storage/async-storage';

/** TTLs centralizados (ms). */
export const CacheTTL = {
  /** Perfil: revalidação frequente em background. */
  profileSoft: 10 * 60 * 1000,
  /** Perfil: último valor aceite offline. */
  profileMax: 7 * 24 * 60 * 60 * 1000,
  addressesSoft: 15 * 60 * 1000,
  addressesMax: 7 * 24 * 60 * 60 * 1000,
  vehicleCategories: 24 * 60 * 60 * 1000,
  directionsRoute: 10 * 60 * 1000,
  reverseGeocode: 48 * 60 * 60 * 1000,
} as const;

export type CacheEnvelope<T> = {
  data: T;
  savedAt: number;
  /** Quando expira o uso “fresh”; após isso ainda pode servir como stale/offline. */
  softTtlMs: number;
  maxTtlMs: number;
};

const PREFIX = '@zamba/cache';

export function cacheKey(...parts: string[]): string {
  return [PREFIX, ...parts].join('/');
}

export function cacheLog(
  scope: string,
  event: 'hit' | 'miss' | 'set' | 'expire' | 'invalidate' | 'bg_refresh' | 'offline_fallback',
  detail?: string,
): void {
  if (!__DEV__) return;
  const d = detail ? ` ${detail}` : '';
  console.log(`[cache:${scope}] ${event}${d}`);
}

export async function readEnvelope<T>(key: string): Promise<CacheEnvelope<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.savedAt !== 'number' || parsed.data === undefined) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeEnvelope<T>(
  key: string,
  data: T,
  softTtlMs: number,
  maxTtlMs: number,
): Promise<void> {
  try {
    const env: CacheEnvelope<T> = {
      data,
      savedAt: Date.now(),
      softTtlMs,
      maxTtlMs,
    };
    await AsyncStorage.setItem(key, JSON.stringify(env));
  } catch {
    /* ignore */
  }
}

export function isSoftFresh(env: CacheEnvelope<unknown> | null): boolean {
  if (!env) return false;
  const age = Date.now() - env.savedAt;
  return age >= 0 && age <= env.softTtlMs;
}

export function isWithinMaxAge(env: CacheEnvelope<unknown> | null): boolean {
  if (!env) return false;
  const age = Date.now() - env.savedAt;
  return age >= 0 && age <= env.maxTtlMs;
}

export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

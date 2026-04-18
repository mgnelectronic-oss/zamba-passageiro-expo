import type { UserProfile } from '@/services/authService';
import {
  cacheKey,
  cacheLog,
  CacheTTL,
  readEnvelope,
  writeEnvelope,
  removeKey,
  isSoftFresh,
  isWithinMaxAge,
} from '@/services/cache/cacheService';

function profileKey(userId: string) {
  return cacheKey('profile_v2', userId);
}

export const profileCacheService = {
  async get(userId: string): Promise<UserProfile | null> {
    const env = await readEnvelope<UserProfile>(profileKey(userId));
    if (!env?.data) {
      cacheLog('profile', 'miss');
      return null;
    }
    if (!isWithinMaxAge(env)) {
      cacheLog('profile', 'expire', 'max');
      return null;
    }
    if (isSoftFresh(env)) cacheLog('profile', 'hit', 'soft');
    else cacheLog('profile', 'hit', 'stale');
    return env.data;
  },

  async set(userId: string, profile: UserProfile): Promise<void> {
    await writeEnvelope(profileKey(userId), profile, CacheTTL.profileSoft, CacheTTL.profileMax);
    cacheLog('profile', 'set');
  },

  async invalidate(userId: string): Promise<void> {
    await removeKey(profileKey(userId));
    cacheLog('profile', 'invalidate');
  },

  /** Último perfil em armazenamento, ignorando expiração (ex.: offline). */
  async getIgnoringExpiry(userId: string): Promise<UserProfile | null> {
    const env = await readEnvelope<UserProfile>(profileKey(userId));
    if (!env?.data) return null;
    cacheLog('profile', 'offline_fallback');
    return env.data;
  },
};

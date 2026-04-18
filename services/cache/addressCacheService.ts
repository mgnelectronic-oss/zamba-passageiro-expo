import type { RecentDestination, SavedAddress } from '@/services/addressService';
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

export type AddressCachePayload = {
  saved: SavedAddress[];
  recent: RecentDestination[];
};

function addressesKey(userId: string) {
  return cacheKey('addresses_v1', userId);
}

export const addressCacheService = {
  async get(userId: string): Promise<AddressCachePayload | null> {
    const env = await readEnvelope<AddressCachePayload>(addressesKey(userId));
    if (!env?.data) {
      cacheLog('addresses', 'miss');
      return null;
    }
    if (!isWithinMaxAge(env)) {
      cacheLog('addresses', 'expire', 'max');
      return null;
    }
    if (isSoftFresh(env)) cacheLog('addresses', 'hit', 'soft');
    else cacheLog('addresses', 'hit', 'stale');
    return {
      saved: Array.isArray(env.data.saved) ? env.data.saved : [],
      recent: Array.isArray(env.data.recent) ? env.data.recent : [],
    };
  },

  async set(userId: string, payload: AddressCachePayload): Promise<void> {
    await writeEnvelope(addressesKey(userId), payload, CacheTTL.addressesSoft, CacheTTL.addressesMax);
    cacheLog('addresses', 'set');
  },

  async invalidate(userId: string): Promise<void> {
    await removeKey(addressesKey(userId));
    cacheLog('addresses', 'invalidate');
  },
};

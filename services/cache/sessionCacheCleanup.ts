import { profileCacheService } from '@/services/cache/profileCacheService';
import { addressCacheService } from '@/services/cache/addressCacheService';
import { mapCacheService } from '@/services/cache/mapCacheService';
import { cacheLog } from '@/services/cache/cacheService';

/**
 * Limpa caches ligados ao utilizador ao terminar sessão.
 * Categorias globais / geocoding mantêm-se para reutilização anónima.
 */
export async function clearSessionCaches(userId: string): Promise<void> {
  await Promise.all([
    profileCacheService.invalidate(userId),
    addressCacheService.invalidate(userId),
    mapCacheService.clearEphemeral(),
  ]);
  cacheLog('session', 'invalidate', userId);
}

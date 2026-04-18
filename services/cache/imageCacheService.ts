import { Image as ExpoImage } from 'expo-image';

const loggedUrls = new Set<string>();

/**
 * Pré-carrega URLs remotas no cache em disco/memória do expo-image.
 */
export async function prefetchRemoteImages(uris: (string | null | undefined)[]): Promise<void> {
  const unique = [...new Set(uris.filter((u): u is string => !!u && u.startsWith('http')))];
  if (unique.length === 0) return;
  try {
    await ExpoImage.prefetch(unique, { cachePolicy: 'memory-disk' });
    if (__DEV__) console.log(`[cache:image] prefetch ok count=${unique.length}`);
  } catch (e) {
    if (__DEV__) console.log(`[cache:image] prefetch error ${(e as Error)?.message ?? e}`);
  }
}

/** Política padrão alinhada a reuso local (URL muda → nova entrada). */
export const remoteImageCachePolicy = 'memory-disk' as const;

export function logImageCacheHit(uri: string | undefined | null, source: string): void {
  if (!uri) return;
  const key = `${source}:${uri}`;
  if (loggedUrls.has(key)) return;
  loggedUrls.add(key);
  if (__DEV__) console.log(`[cache:image] display ${source} (disk/memory)`);
}

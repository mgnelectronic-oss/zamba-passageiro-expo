import React, { useCallback, useEffect, useState } from 'react';
import type { StyleProp, ImageStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { logImageCacheHit, remoteImageCachePolicy } from '@/services/cache/imageCacheService';

type Props = {
  uri: string | null | undefined;
  style: StyleProp<ImageStyle>;
  /** Mostrado quando não há URL ou após erro de carregamento. */
  fallback?: React.ReactNode;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  cacheScope?: string;
};

/**
 * Imagem remota com cache em disco/memória (expo-image) e fallback seguro.
 */
export function CachedRemoteImage({
  uri,
  style,
  fallback = null,
  contentFit = 'cover',
  cacheScope = 'remote',
}: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const onError = useCallback(() => {
    if (__DEV__) console.log(`[cache:image] load error scope=${cacheScope}`);
    setFailed(true);
  }, [cacheScope]);

  if (!uri || !uri.startsWith('http') || failed) {
    return <>{fallback}</>;
  }

  logImageCacheHit(uri, cacheScope);

  return (
    <ExpoImage
      source={{ uri }}
      style={style}
      contentFit={contentFit}
      cachePolicy={remoteImageCachePolicy}
      transition={120}
      onError={onError}
    />
  );
}

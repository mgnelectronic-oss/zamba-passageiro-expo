import { Image as ExpoImage } from 'expo-image';
import { isSupabaseConfigured } from '@/lib/supabase';
import { rideService } from '@/services/rideService';
import {
  buildPassengerHistoryDisplayList,
  collectDriverPhotoUrls,
  type RideHistoryItem,
  type RpcHistoryError,
} from '@/services/passengerRideHistoryModel';
import {
  loadPassengerHistoryCache,
  savePassengerHistoryCache,
  type PassengerHistoryMeta,
} from '@/services/passengerHistoryCacheStorage';

export type SyncPassengerHistoryResult = {
  rides: RideHistoryItem[];
  /** True quando não foi feita RPC (contagem igual ao meta e cache válido). */
  skipped: boolean;
  error: RpcHistoryError | null;
};

async function prefetchDriverPhotoUrls(urls: string[]): Promise<void> {
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) return;
  try {
    await ExpoImage.prefetch(unique, { cachePolicy: 'memory-disk' });
  } catch {
    /* ignore */
  }
}

function buildMeta(serverCount: number): PassengerHistoryMeta {
  return {
    completedRidesCount: serverCount,
    savedAt: new Date().toISOString(),
  };
}

/**
 * Sincroniza histórico com Supabase só quando a contagem de viagens concluídas
 * mudou em relação ao meta guardado (ou não há cache / forçar).
 * Grava AsyncStorage e pré-carrega fotos no cache em disco do expo-image.
 */
export async function syncPassengerHistory(userId: string): Promise<SyncPassengerHistoryResult> {
  if (!isSupabaseConfigured || !userId) {
    return {
      rides: [],
      skipped: true,
      error: { message: 'Supabase não está configurado.' },
    };
  }

  const cached = await loadPassengerHistoryCache();

  let serverCount: number;
  try {
    serverCount = await rideService.getCompletedRidesCount(userId);
  } catch {
    serverCount = -1;
  }

  if (serverCount < 0) {
    if (cached.rides.length > 0) {
      await prefetchDriverPhotoUrls(collectDriverPhotoUrls(cached.rides));
      return { rides: cached.rides, skipped: true, error: null };
    }
    return {
      rides: [],
      skipped: true,
      error: { message: 'Não foi possível verificar o histórico.' },
    };
  }

  /** Só mudou o histórico relevante no servidor quando esta contagem muda (novo «completed», etc.). */
  const metaMatches =
    cached.meta != null && cached.meta.completedRidesCount === serverCount;

  if (metaMatches) {
    await prefetchDriverPhotoUrls(collectDriverPhotoUrls(cached.rides));
    return { rides: cached.rides, skipped: true, error: null };
  }

  const result = await rideService.getPassengerRideHistory();

  if (result.error) {
    if (cached.rides.length > 0) {
      await prefetchDriverPhotoUrls(collectDriverPhotoUrls(cached.rides));
      return { rides: cached.rides, skipped: true, error: null };
    }
    return {
      rides: [],
      skipped: false,
      error: result.error,
    };
  }

  const rawRows = result.data ?? [];
  const rides = buildPassengerHistoryDisplayList(rawRows);
  const meta = buildMeta(serverCount);

  await savePassengerHistoryCache(rides, meta);
  await prefetchDriverPhotoUrls(collectDriverPhotoUrls(rides));

  return { rides, skipped: false, error: null };
}

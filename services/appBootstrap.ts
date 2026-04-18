import type { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { appBannerService, type AppBanner, type AppBannerSettings } from '@/services/appBannerService';
import { authService, type UserProfile } from '@/services/authService';
import { addressService, type SavedAddress, type RecentDestination } from '@/services/addressService';
import { loadBannerCache, saveBannerCache } from '@/services/bannerCacheStorage';
import { loadPassengerHistoryCache } from '@/services/passengerHistoryCacheStorage';
import type { RideHistoryItem } from '@/services/passengerRideHistoryModel';
import { rideService } from '@/services/rideService';
import { prefetchRemoteImages } from '@/services/cache/imageCacheService';
import { mapCacheService } from '@/services/cache/mapCacheService';
import { primeMapCenter, primeMapRegionSnapshot } from '@/services/mapLocationMemory';

export async function resolveSessionUser(): Promise<User | null> {
  if (!isSupabaseConfigured) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;

  const { data: userData, error } = await supabase.auth.getUser();
  if (!error && userData.user) return userData.user;

  return sessionData.session.user ?? null;
}

export type LoggedInAppData = {
  initialBanners: AppBanner[];
  initialBannerSettings: AppBannerSettings | null;
  initialProfile: UserProfile | null;
  initialSavedAddresses: SavedAddress[];
  initialRecentDestinations: RecentDestination[];
  initialPassengerHistory: RideHistoryItem[];
};

/**
 * Dados necessários para a Home com utilizador autenticado (banners + perfil + moradas + recentes).
 */
export async function loadLoggedInAppData(userId: string): Promise<LoggedInAppData> {
  const [cached, passengerHistoryCache, lastLoc, lastRegion] = await Promise.all([
    loadBannerCache(),
    loadPassengerHistoryCache(),
    mapCacheService.getLastKnownLocation(),
    mapCacheService.getLastMapRegion(),
  ]);
  if (lastRegion) primeMapRegionSnapshot(lastRegion);
  else if (lastLoc) primeMapCenter(lastLoc.lat, lastLoc.lng);

  const [bannerNetwork, profile, savedAddresses, recentDestinations] = await Promise.all([
    Promise.all([appBannerService.getActiveBanners(), appBannerService.getBannerSettings()])
      .then(([banners, settings]) => ({ banners, settings }))
      .catch(() => null),
    authService.getUserProfile(userId),
    addressService.getSavedAddresses(userId),
    addressService.getRecentDestinations(userId),
  ]);

  let initialBanners = cached?.banners ?? [];
  let initialBannerSettings = cached?.settings ?? null;

  if (bannerNetwork) {
    initialBanners = bannerNetwork.banners;
    initialBannerSettings = bannerNetwork.settings;
    await saveBannerCache({ banners: initialBanners, settings: initialBannerSettings });
  }

  void rideService.getVehicleCategories().catch(() => {});
  void prefetchRemoteImages([
    profile?.avatar_url,
    ...initialBanners.map((b) => b.image_url),
  ]);

  return {
    initialBanners,
    initialBannerSettings,
    initialProfile: profile,
    initialSavedAddresses: savedAddresses,
    initialRecentDestinations: recentDestinations,
    initialPassengerHistory: passengerHistoryCache.rides,
  };
}

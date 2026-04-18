import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppBanner, AppBannerSettings } from '@/services/appBannerService';

const KEY = '@zamba/banner_cache_v1';

export type BannerCachePayload = {
  banners: AppBanner[];
  settings: AppBannerSettings | null;
};

export async function loadBannerCache(): Promise<BannerCachePayload | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BannerCachePayload;
    if (!parsed || !Array.isArray(parsed.banners)) return null;
    return {
      banners: parsed.banners,
      settings: parsed.settings ?? null,
    };
  } catch {
    return null;
  }
}

export async function saveBannerCache(payload: BannerCachePayload): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

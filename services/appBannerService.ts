import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface AppBanner {
  id: string;
  image_url: string;
  target_url: string | null;
}

export interface AppBannerSettings {
  auto_slide_enabled: boolean;
  slide_interval_seconds: number | null;
}

function rowId(row: Record<string, unknown>, index: number): string {
  const id = row.id;
  if (typeof id === 'string' && id.length > 0) return id;
  if (typeof id === 'number') return String(id);
  return `banner-${index}`;
}

function normalizeTargetUrl(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function normalizeImageUrl(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export const appBannerService = {
  async getActiveBanners(): Promise<AppBanner[]> {
    if (!isSupabaseConfigured) return [];

    const { data, error } = await supabase.rpc('get_active_app_banners');

    if (error) {
      console.warn('[appBannerService] get_active_app_banners:', error.message);
      return [];
    }

    if (!Array.isArray(data)) return [];

    const out: AppBanner[] = [];
    data.forEach((raw, index) => {
      if (!raw || typeof raw !== 'object') return;
      const row = raw as Record<string, unknown>;
      const image_url = normalizeImageUrl(row.image_url);
      if (!image_url) return;
      out.push({
        id: rowId(row, index),
        image_url,
        target_url: normalizeTargetUrl(row.target_url),
      });
    });

    return out;
  },

  async getBannerSettings(): Promise<AppBannerSettings | null> {
    if (!isSupabaseConfigured) return null;

    const { data, error } = await supabase
      .from('app_banner_settings')
      .select('auto_slide_enabled, slide_interval_seconds')
      .limit(1);

    if (error) {
      console.warn('[appBannerService] app_banner_settings:', error.message);
      return null;
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row || typeof row !== 'object') return null;

    const r = row as Record<string, unknown>;
    const slideRaw = r.slide_interval_seconds;
    const slide_interval_seconds =
      slideRaw == null || slideRaw === ''
        ? null
        : typeof slideRaw === 'number'
          ? slideRaw
          : Number(slideRaw);

    return {
      auto_slide_enabled: Boolean(r.auto_slide_enabled),
      slide_interval_seconds:
        slide_interval_seconds != null && Number.isFinite(slide_interval_seconds)
          ? slide_interval_seconds
          : null,
    };
  },
};

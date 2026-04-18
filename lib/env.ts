/** No Android, o SDK Maps nativo usa esta mesma variável (injectada em `app.config.ts` → `android.config.googleMaps.apiKey`). */
export const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * UUID do projeto Expo (expo.dev → Project settings → Project ID).
 * Obrigatório: Notifications.getExpoPushTokenAsync({ projectId }) usa este valor (prefixo EXPO_PUBLIC_ para Metro injetar no bundle).
 */
export const EAS_PROJECT_ID = (process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '').trim();

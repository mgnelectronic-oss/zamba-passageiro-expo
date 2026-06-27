import { isExpoGoEnvironment } from '@/lib/isExpoGoEnvironment';

export const MAPBOX_ACCESS_TOKEN = (process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '').trim();

export function isMapboxConfigured(): boolean {
  return MAPBOX_ACCESS_TOKEN.startsWith('pk.') && MAPBOX_ACCESS_TOKEN.length > 20;
}

export function isMapboxNativeAvailable(): boolean {
  return !isExpoGoEnvironment();
}

let initialized = false;

export function initMapbox(): boolean {
  if (initialized) return isMapboxConfigured() && isMapboxNativeAvailable();
  if (!isMapboxNativeAvailable() || !isMapboxConfigured()) return false;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@/lib/mapboxInit.impl').applyMapboxAccessToken(MAPBOX_ACCESS_TOKEN);
  initialized = true;
  return true;
}

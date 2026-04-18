import { Platform } from 'react-native';

/**
 * Props extra do `MapView` só no Android (Google Maps SDK).
 * - `googleRenderer: 'LEGACY'`: contorna falhas de tiles vazios/bege com o renderer "LATEST" em alguns dispositivos/GPU.
 * - `cacheEnabled: false`: evita modo de cache estático.
 * - `loadingEnabled: false`: sem indicador nativo de “a carregar” (percepção instantânea).
 *
 * `customMapStyle` pode ser passado no `MapView` em conjunto com estes props (renderer LEGACY reduz mapa branco).
 *
 * @see https://developers.google.com/maps/documentation/android-sdk/renderer
 */
export const ANDROID_MAPVIEW_TILE_PROPS =
  Platform.OS === 'android'
    ? {
        mapType: 'standard' as const,
        liteMode: false,
        cacheEnabled: false,
        googleRenderer: 'LEGACY' as const,
        loadingEnabled: false,
      }
    : {};

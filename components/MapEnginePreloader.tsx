import React, { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import { MAP_STYLE_CLEAN } from '@/lib/mapStyleClean';
import { ANDROID_MAPVIEW_TILE_PROPS } from '@/lib/mapViewAndroid';
import { getPrimedInitialRegion } from '@/services/mapLocationMemory';

/**
 * Mapa oculto montado cedo para aquecer o motor Google Maps antes do ecrã do mapa.
 * Não bloqueia UI; não deve capturar toques.
 */
export function MapEnginePreloader() {
  const initialRegion = useMemo(() => getPrimedInitialRegion(), []);

  return (
    <View
      pointerEvents="none"
      style={st.wrap}
      collapsable={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <MapView
        provider={PROVIDER_GOOGLE}
        style={st.map}
        initialRegion={initialRegion}
        customMapStyle={MAP_STYLE_CLEAN}
        {...(Platform.OS === 'ios' ? { userInterfaceStyle: 'light' as const } : {})}
        {...ANDROID_MAPVIEW_TILE_PROPS}
        showsCompass={false}
        showsTraffic={false}
        showsIndoors={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
      />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
    left: 0,
    top: 0,
    zIndex: -1,
  },
  map: { width: 2, height: 2 },
});

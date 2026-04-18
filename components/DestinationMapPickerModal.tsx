import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ANDROID_MAPVIEW_TILE_PROPS } from '@/lib/mapViewAndroid';
import { reverseGeocode } from '@/services/googleGeocoding';
import { mapCacheService } from '@/services/cache/mapCacheService';
import type { SelectedDestination } from '@/services/googlePlaces';

/** Mapa nativo Android: SDK usa `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` (ver `app.config.ts`). */
const FALLBACK_CENTER = { lat: -25.9692, lng: 32.5732 };

/**
 * Zoom ~16–17 (área urbana): deltas pequenos ≈ nível 15–17 no Google Maps.
 * ~0.0025 lat ≈ ~280 m de envergadura (depende da latitude).
 */
const URBAN_DELTA = 0.0025;

const CARD_ANIM_MS = 220;
const OPEN_GUARD_MS = 650;

function regionFromCenter(lat: number, lng: number) {
  return {
    latitude: lat,
    longitude: lng,
    latitudeDelta: URBAN_DELTA,
    longitudeDelta: URBAN_DELTA,
  };
}

function isFallbackCenter(lat: number, lng: number) {
  return (
    Math.abs(lat - FALLBACK_CENTER.lat) < 0.015 && Math.abs(lng - FALLBACK_CENTER.lng) < 0.015
  );
}

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

type Props = {
  visible: boolean;
  onClose: () => void;
  initialLat: number;
  initialLng: number;
  onPick: (destination: SelectedDestination) => void;
};

const C = {
  text: '#0F172A',
  emerald: '#10B981',
  /** Botão principal: verde mais vivo e contrastado. */
  primaryBtn: '#059669',
  primaryBtnPressed: '#047857',
  stem: '#1E293B',
  surface: '#FFFFFF',
};

/** Área transparente por baixo do card para o logo/atribuição Google Maps não ficar tapado. */
const GOOGLE_ATTRIBUTION_STRIP = Platform.OS === 'android' ? 52 : 44;

const SQUIRCLE = 52;
const STEM_H = 15;
/** Altura total: a base da haste = ponto geográfico no centro do mapa. */
const MARKER_TOTAL_H = SQUIRCLE + STEM_H;

/**
 * Marcador fixo: squircle + ícone + haste fina + sombra (referência de estrutura, cores Zamba).
 * Posicionado para a base da haste coincidir com o centro do mapa.
 */
function CenterScreenPin() {
  return (
    <View
      style={pinStyles.anchor}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={pinStyles.column}>
        <View style={pinStyles.squircle}>
          <Ionicons name="flag" size={26} color={C.emerald} />
        </View>
        <View style={pinStyles.stem} />
      </View>
    </View>
  );
}

const pinStyles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    alignItems: 'center',
    marginTop: -MARKER_TOTAL_H,
  },
  column: {
    alignItems: 'center',
  },
  squircle: {
    width: SQUIRCLE,
    height: SQUIRCLE,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  stem: {
    width: 3,
    height: STEM_H,
    marginTop: -1,
    borderRadius: 1.5,
    backgroundColor: C.stem,
  },
});

/**
 * Mapa só para escolha manual de destino na pesquisa.
 * O ponto seleccionado é o centro geográfico do mapa (alinhado ao centro do ecrã).
 */
export function DestinationMapPickerModal({
  visible,
  onClose,
  initialLat,
  initialLng,
  onPick,
}: Props) {
  const insets = useSafeAreaInsets();

  const mapRef = useRef<MapView | null>(null);
  const mapReadyRef = useRef(false);
  const sessionIdRef = useRef(0);
  const gpsAnimatedRef = useRef(false);
  const gpsResolvedRef = useRef(false);
  const bootCenterRef = useRef({ lat: FALLBACK_CENTER.lat, lng: FALLBACK_CENTER.lng });

  const openedAtRef = useRef(0);
  const programmaticMoveRef = useRef(false);
  const panActiveRef = useRef(false);

  const chromeOpacity = useRef(new Animated.Value(1)).current;
  const chromeTranslate = useRef(new Animated.Value(0)).current;

  const safeInitial = useMemo(
    () => ({
      lat: Number.isFinite(initialLat) ? initialLat : FALLBACK_CENTER.lat,
      lng: Number.isFinite(initialLng) ? initialLng : FALLBACK_CENTER.lng,
    }),
    [initialLat, initialLng],
  );

  const [centerLat, setCenterLat] = useState(safeInitial.lat);
  const [centerLng, setCenterLng] = useState(safeInitial.lng);
  const [confirming, setConfirming] = useState(false);
  const [bootCenter, setBootCenter] = useState(() => ({
    lat: safeInitial.lat,
    lng: safeInitial.lng,
  }));

  bootCenterRef.current = bootCenter;

  const showChrome = useCallback(() => {
    Animated.parallel([
      Animated.timing(chromeOpacity, {
        toValue: 1,
        duration: CARD_ANIM_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(chromeTranslate, {
        toValue: 0,
        duration: CARD_ANIM_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [chromeOpacity, chromeTranslate]);

  const hideChrome = useCallback(() => {
    Animated.parallel([
      Animated.timing(chromeOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(chromeTranslate, {
        toValue: 22,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [chromeOpacity, chromeTranslate]);

  const runProgrammaticWindow = useCallback(
    (durationMs: number) => {
      programmaticMoveRef.current = true;
      const ms = Math.max(durationMs + 120, 400);
      setTimeout(() => {
        programmaticMoveRef.current = false;
        if (!panActiveRef.current) {
          showChrome();
        }
      }, ms);
    },
    [showChrome],
  );

  useEffect(() => {
    if (!visible) return;
    sessionIdRef.current += 1;
    const session = sessionIdRef.current;
    gpsAnimatedRef.current = false;
    gpsResolvedRef.current = false;
    mapReadyRef.current = false;
    panActiveRef.current = false;
    openedAtRef.current = Date.now();
    programmaticMoveRef.current = false;
    chromeOpacity.setValue(1);
    chromeTranslate.setValue(0);
    setConfirming(false);
    setCenterLat(safeInitial.lat);
    setCenterLng(safeInitial.lng);
    setBootCenter({ lat: safeInitial.lat, lng: safeInitial.lng });

    let cancelled = false;

    (async () => {
      if (!isFallbackCenter(safeInitial.lat, safeInitial.lng)) return;
      const last = await mapCacheService.getLastKnownLocation();
      if (cancelled || session !== sessionIdRef.current || !last) return;
      if (gpsResolvedRef.current) return;
      setBootCenter({ lat: last.lat, lng: last.lng });
      setCenterLat(last.lat);
      setCenterLng(last.lng);
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, safeInitial.lat, safeInitial.lng, chromeOpacity, chromeTranslate]);

  const initialRegion = useMemo(
    () => regionFromCenter(bootCenter.lat, bootCenter.lng),
    [bootCenter.lat, bootCenter.lng],
  );

  const applyUrbanRegion = useCallback(
    (lat: number, lng: number, durationMs: number) => {
      runProgrammaticWindow(durationMs);
      mapRef.current?.animateToRegion(regionFromCenter(lat, lng), durationMs);
    },
    [runProgrammaticWindow],
  );

  useEffect(() => {
    if (!visible) return;
    const session = sessionIdRef.current;
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          const ask = await Location.requestForegroundPermissionsAsync();
          if (ask.status !== 'granted') return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled || session !== sessionIdRef.current) return;

        gpsResolvedRef.current = true;

        const { latitude: lat, longitude: lng } = pos.coords;
        const bc = bootCenterRef.current;
        const d = distanceMeters(bc.lat, bc.lng, lat, lng);

        setCenterLat(lat);
        setCenterLng(lng);

        const shouldAnimate = d > 130;
        if (!shouldAnimate) return;

        if (gpsAnimatedRef.current) return;
        gpsAnimatedRef.current = true;

        const animate = () => {
          applyUrbanRegion(lat, lng, 520);
        };

        if (mapReadyRef.current) {
          requestAnimationFrame(animate);
        } else {
          setTimeout(() => {
            if (!cancelled && session === sessionIdRef.current) animate();
          }, 280);
        }
      } catch {
        /* mantém centro inicial */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, safeInitial.lat, safeInitial.lng, applyUrbanRegion]);

  const onRegionChange = useCallback(() => {
    if (programmaticMoveRef.current) return;
    if (Date.now() - openedAtRef.current < OPEN_GUARD_MS) return;
    if (panActiveRef.current) return;
    panActiveRef.current = true;
    hideChrome();
  }, [hideChrome]);

  const onRegionChangeComplete = useCallback(
    (r: { latitude: number; longitude: number }) => {
      setCenterLat(r.latitude);
      setCenterLng(r.longitude);
      if (programmaticMoveRef.current) {
        panActiveRef.current = false;
        return;
      }
      panActiveRef.current = false;
      showChrome();
    },
    [showChrome],
  );

  const handleConfirm = useCallback(async () => {
    setConfirming(true);
    try {
      const address = await reverseGeocode(centerLat, centerLng);
      const place_name = address.split(',')[0]?.trim() || address;
      const dest: SelectedDestination = {
        place_id: `map_pick_${centerLat.toFixed(5)}_${centerLng.toFixed(5)}`,
        place_name,
        address,
        lat: centerLat,
        lng: centerLng,
      };
      onPick(dest);
    } finally {
      setConfirming(false);
    }
  }, [centerLat, centerLng, onPick]);

  const mapMountKey = `${bootCenter.lat.toFixed(5)}_${bootCenter.lng.toFixed(5)}`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <MapView
          ref={mapRef}
          key={mapMountKey}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          initialRegion={initialRegion}
          mapType="standard"
          mapPadding={{
            top: insets.top + 64,
            right: 14,
            bottom: insets.bottom + 200,
            left: 14,
          }}
          {...ANDROID_MAPVIEW_TILE_PROPS}
          onRegionChange={onRegionChange}
          onRegionChangeComplete={onRegionChangeComplete}
          onMapReady={() => {
            mapReadyRef.current = true;
            runProgrammaticWindow(0);
            requestAnimationFrame(() => {
              const b = bootCenterRef.current;
              mapRef.current?.animateToRegion(regionFromCenter(b.lat, b.lng), 0);
            });
          }}
          showsPointsOfInterest
          showsBuildings
          showsIndoors
          rotateEnabled
          pitchEnabled
          toolbarEnabled={false}
        />

        <View style={styles.overlay} pointerEvents="box-none">
          <View
            style={[styles.topChrome, { paddingTop: insets.top + 10 }]}
            pointerEvents="box-none"
          >
            <View style={styles.topRow}>
              <View style={styles.topSideSlot}>
                <TouchableOpacity
                  style={styles.backFab}
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Voltar"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="chevron-back" size={26} color={C.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.topCenterSlot} pointerEvents="none">
                <View style={styles.titlePill}>
                  <Text style={styles.titlePillText} numberOfLines={1}>
                    Escolher no mapa
                  </Text>
                </View>
              </View>
              <View style={styles.topSideSlot} />
            </View>
          </View>

          <CenterScreenPin />

          <Animated.View
            style={[
              styles.bottomAnchor,
              {
                opacity: chromeOpacity,
                transform: [{ translateY: chromeTranslate }],
              },
            ]}
            pointerEvents="box-none"
          >
            <View
              style={[
                styles.confirmCard,
                { paddingBottom: Math.max(insets.bottom, 14) + 14 },
              ]}
            >
              <Text style={styles.hint}>
                Arraste o mapa para posicionar o ponto exato.
              </Text>
              <TouchableOpacity
                style={[styles.confirmBtn, confirming && styles.confirmBtnDisabled]}
                onPress={handleConfirm}
                disabled={confirming}
                activeOpacity={0.88}
              >
                {confirming ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmText}>Confirmar destino</Text>
                )}
              </TouchableOpacity>
            </View>
            <View style={styles.googleAttributionStrip} pointerEvents="none" />
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  topChrome: {
    zIndex: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  /** Largura igual dos lados para o título ficar geometricamente centrado no ecrã. */
  topSideSlot: {
    width: 48,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  topCenterSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  backFab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  titlePill: {
    maxWidth: '100%',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.14,
        shadowRadius: 10,
      },
      android: { elevation: 5 },
    }),
  },
  titlePillText: {
    fontSize: 17,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.35,
    textAlign: 'center',
  },
  bottomAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    paddingTop: 10,
  },
  confirmCard: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: C.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15,23,42,0.07)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
      },
      android: { elevation: 14 },
    }),
  },
  hint: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
    letterSpacing: -0.15,
  },
  confirmBtn: {
    backgroundColor: C.primaryBtn,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    ...Platform.select({
      ios: {
        shadowColor: '#047857',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  confirmBtnDisabled: {
    opacity: 0.88,
    backgroundColor: C.primaryBtnPressed,
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.35,
  },
  googleAttributionStrip: {
    height: GOOGLE_ATTRIBUTION_STRIP,
    width: '100%',
  },
});

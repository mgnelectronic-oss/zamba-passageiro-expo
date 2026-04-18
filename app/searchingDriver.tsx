import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRideState } from '@/hooks/useRideState';
import { useNearbyDrivers } from '@/hooks/useNearbyDrivers';
import { rideService } from '@/services/rideService';
import { fitMapCamera, type LatLng } from '@/utils/mapCamera';
import { isSearchingUiState } from '@/lib/passengerRideVisualState';
import { ROUTE_POLYLINE_COLOR } from '@/lib/tripMapTheme';
import { ANDROID_MAPVIEW_TILE_PROPS } from '@/lib/mapViewAndroid';

const MAP_STYLE_CLEAN = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#1A1A1A' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#1A1A1A' }] },
  { featureType: 'road.highway', elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

export default function SearchingDriverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [cardHeight, setCardHeight] = useState(0);
  const searchSheetSlide = useRef(new Animated.Value(12)).current;

  const params = useLocalSearchParams<{
    rideId: string;
    pickupLat: string;
    pickupLng: string;
    pickupAddress: string;
    vehicleCategory: string;
  }>();

  const rideId = params.rideId;
  const pickupLat = Number(params.pickupLat) || -25.9692;
  const pickupLng = Number(params.pickupLng) || 32.5732;
  const vehicleCategory = params.vehicleCategory || 'economico';

  const { state, uiState, stopPolling } = useRideState(rideId);
  const searchingEnabled = isSearchingUiState(uiState);

  const { drivers } = useNearbyDrivers(
    pickupLat,
    pickupLng,
    vehicleCategory,
    searchingEnabled,
  );

  const driversForMap = useMemo(() => drivers.slice(0, 28), [drivers]);

  const isOfferPending = uiState === 'driver_offer_pending';

  useEffect(() => {
    if (
      uiState === 'driver_en_route' ||
      uiState === 'driver_arrived' ||
      uiState === 'on_trip' ||
      uiState === 'completed'
    ) {
      stopPolling();
      router.replace({
        pathname: '/currentRide' as any,
        params: { rideId },
      });
    }
  }, [uiState, rideId, router, stopPolling]);

  useEffect(() => {
    if (uiState === 'cancelled') {
      stopPolling();
      router.replace('/(tabs)');
    }
  }, [uiState, router, stopPolling]);

  const handleCancel = () => {
    Alert.alert('Cancelar viagem', 'Tem a certeza que deseja cancelar?', [
      { text: 'Não', style: 'cancel' },
      {
        text: 'Sim, cancelar',
        style: 'destructive',
        onPress: async () => {
          try {
            stopPolling();
            await rideService.cancelRide(rideId!);
            router.replace('/(tabs)');
          } catch {
            Alert.alert('Erro', 'Não foi possível cancelar.');
          }
        },
      },
    ]);
  };

  const mapPoints = useMemo(() => {
    const pts: LatLng[] = [{ latitude: pickupLat, longitude: pickupLng }];
    for (const d of driversForMap) {
      pts.push({ latitude: d.lat, longitude: d.lng });
    }
    return pts;
  }, [pickupLat, pickupLng, driversForMap]);

  useEffect(() => {
    if (!mapReady || mapPoints.length < 2 || cardHeight === 0) return;
    const t = setTimeout(() => fitMapCamera(mapRef, mapPoints), 400);
    return () => clearTimeout(t);
  }, [mapReady, mapPoints, cardHeight]);

  const noDriver = uiState === 'no_driver_available_for_category';

  useEffect(() => {
    if (noDriver) return;
    searchSheetSlide.setValue(12);
    Animated.spring(searchSheetSlide, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
      tension: 80,
    }).start();
  }, [noDriver, searchSheetSlide]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.mapFlex}
        provider={PROVIDER_GOOGLE}
        customMapStyle={MAP_STYLE_CLEAN}
        userInterfaceStyle="light"
        initialRegion={{
          latitude: pickupLat,
          longitude: pickupLng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        mapPadding={{
          top: insets.top + 12,
          right: 10,
          bottom: cardHeight + 6,
          left: 10,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        showsTraffic={false}
        toolbarEnabled={false}
        {...ANDROID_MAPVIEW_TILE_PROPS}
        onMapReady={() => setMapReady(true)}
      >
        <Marker
          coordinate={{ latitude: pickupLat, longitude: pickupLng }}
          title="Recolha"
          anchor={{ x: 0.5, y: 1 }}
        >
          <View style={styles.pickupPin}>
            <View style={styles.pickupPinInner} />
          </View>
        </Marker>

        {driversForMap.map((d) => (
          <Marker
            key={d.driver_id}
            coordinate={{ latitude: d.lat, longitude: d.lng }}
            title={d.full_name ?? 'Motorista'}
          >
            <View style={styles.driverMarker}>
              <Ionicons name="car-sport" size={18} color="#10B981" />
            </View>
          </Marker>
        ))}
      </MapView>

      {noDriver ? (
        <View
          style={[styles.noDriverSheet, { paddingBottom: insets.bottom + 12 }]}
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.noDriverHandle} />
          <View style={styles.noDriverIconWrap}>
            <View style={styles.noDriverIconRing}>
              <Ionicons name="alert-circle" size={26} color="#B45309" />
            </View>
          </View>
          <Text style={styles.noDriverTitle} maxFontSizeMultiplier={1.25}>
            Nenhum motorista disponível
          </Text>
          <Text style={styles.noDriverSubtitle} maxFontSizeMultiplier={1.2}>
            Não encontramos motoristas disponíveis nesta categoria no momento.
          </Text>

          {(state?.pickup_address || state?.dropoff_address) ? (
            <View style={styles.noDriverAddrBox}>
              {state?.pickup_address ? (
                <View style={styles.noDriverAddrLine}>
                  <View style={[styles.dotSm, { backgroundColor: ROUTE_POLYLINE_COLOR }]} />
                  <Text style={styles.noDriverAddrText} numberOfLines={1}>
                    {state.pickup_address}
                  </Text>
                </View>
              ) : null}
              {state?.dropoff_address ? (
                <View
                  style={[
                    styles.noDriverAddrLine,
                    state?.pickup_address ? { marginTop: 6 } : null,
                  ]}
                >
                  <View style={[styles.dotSm, { backgroundColor: '#0F172A' }]} />
                  <Text style={styles.noDriverAddrText} numberOfLines={1}>
                    {state.dropoff_address}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.noDriverPrimaryBtn}
            activeOpacity={0.88}
            onPress={async () => {
              if (rideId) {
                try {
                  await rideService.cancelRide(rideId);
                } catch {
                  /* ignore */
                }
              }
              router.replace('/map' as any);
            }}
          >
            <Text style={styles.noDriverPrimaryBtnText}>Seleccionar outra categoria</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.noDriverSecondaryBtn}
            activeOpacity={0.7}
            onPress={async () => {
              if (rideId) {
                try {
                  await rideService.cancelRide(rideId);
                } catch {
                  /* ignore */
                }
              }
              router.replace('/(tabs)');
            }}
          >
            <Text style={styles.noDriverSecondaryBtnText}>Fechar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Animated.View
          style={[
            styles.searchingSheet,
            {
              paddingBottom: insets.bottom,
              transform: [{ translateY: searchSheetSlide }],
            },
          ]}
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.searchingHandle} />

          {searchingEnabled && (
            <View style={styles.rowMain}>
              <View style={styles.iconCol}>
                {isOfferPending ? (
                  <View style={styles.iconCircleEmerald}>
                    <Ionicons name="hourglass-outline" size={20} color="#059669" />
                  </View>
                ) : (
                  <View style={styles.iconCircleEmerald}>
                    <Ionicons name="search" size={20} color="#059669" />
                  </View>
                )}
              </View>

              <View style={styles.textCol}>
                <Text style={styles.title} maxFontSizeMultiplier={1.2}>
                  {isOfferPending
                    ? 'Motorista a responder...'
                    : 'Buscando motoristas próximos de si'}
                </Text>
                <Text style={styles.subtitle} maxFontSizeMultiplier={1.15}>
                  {isOfferPending
                    ? 'Um motorista recebeu o seu pedido e está a decidir.'
                    : 'Estamos a procurar motoristas disponíveis na sua área'}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleCancel}
                style={styles.cancelLink}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Cancelar viagem"
              >
                <Text style={styles.cancelLinkText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          )}

          {state?.pickup_address ? (
            <View style={styles.addressRow}>
              <View style={[styles.dot, { backgroundColor: ROUTE_POLYLINE_COLOR }]} />
              <Text style={styles.addressText} numberOfLines={1}>
                {state.pickup_address}
              </Text>
            </View>
          ) : null}
          {state?.dropoff_address ? (
            <View style={[styles.addressRow, !state?.pickup_address ? null : styles.addressRowTight]}>
              <View style={[styles.dot, { backgroundColor: '#111827' }]} />
              <Text style={styles.addressText} numberOfLines={1}>
                {state.dropoff_address}
              </Text>
            </View>
          ) : null}
        </Animated.View>
      )}
    </View>
  );
}

const SHADOW_SEARCH_SHEET = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
  },
  android: { elevation: 10 },
});

const FONT_SANS = Platform.select({
  ios: undefined,
  android: 'sans-serif',
  default: undefined,
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  mapFlex: { flex: 1, width: '100%' },
  searchingSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8ECF0',
    ...SHADOW_SEARCH_SHEET,
  },
  searchingHandle: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 6,
    opacity: 0.85,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 2,
  },
  iconCol: { width: 40, alignItems: 'center', justifyContent: 'center' },
  iconCircleEmerald: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  textCol: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: FONT_SANS,
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  subtitle: {
    fontFamily: FONT_SANS,
    marginTop: 2,
    fontSize: 12,
    fontWeight: '400',
    color: '#64748B',
    lineHeight: 16,
  },
  cancelLink: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  cancelLinkText: {
    fontFamily: FONT_SANS,
    fontSize: 12,
    fontWeight: '500',
    color: '#DC2626',
    letterSpacing: 0.15,
  },
  noDriverSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FAFAFA',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.07,
        shadowRadius: 16,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  noDriverHandle: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 10,
    opacity: 0.85,
  },
  noDriverIconWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  noDriverIconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDriverTitle: {
    fontFamily: FONT_SANS,
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.2,
    lineHeight: 22,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  noDriverSubtitle: {
    fontFamily: FONT_SANS,
    fontSize: 14,
    fontWeight: '400',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 12,
    paddingHorizontal: 6,
    maxWidth: 340,
    alignSelf: 'center',
  },
  noDriverAddrBox: {
    alignSelf: 'stretch',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  noDriverAddrLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickupPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: ROUTE_POLYLINE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: { elevation: 3 },
    }),
  },
  pickupPinInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFF',
  },
  dotSm: { width: 6, height: 6, borderRadius: 3 },
  noDriverAddrText: {
    fontFamily: FONT_SANS,
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  noDriverPrimaryBtn: {
    alignSelf: 'stretch',
    minHeight: 46,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDriverPrimaryBtnText: {
    fontFamily: FONT_SANS,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  noDriverSecondaryBtn: {
    alignSelf: 'center',
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  noDriverSecondaryBtnText: {
    fontFamily: FONT_SANS,
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    letterSpacing: 0.2,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 3,
    paddingHorizontal: 0,
  },
  addressRowTight: {
    marginTop: 2,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  addressText: {
    flex: 1,
    fontFamily: FONT_SANS,
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  driverMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  ScrollView,
  KeyboardAvoidingView,
  TextInput,
  Platform,
  Animated,
  Easing,
  LayoutAnimation,
  UIManager,
  Pressable,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useRideState } from '@/hooks/useRideState';
import { rideService, type LiveRoute } from '@/services/rideService';
import { authService } from '@/services/authService';
import { mapRpcUiStateToPassengerVisual, type PassengerVisualState } from '@/lib/passengerRideVisualState';
import { decodePolyline, downsampleRouteCoordinates } from '@/utils/polylineDecode';
import { fitMapCamera, type LatLng } from '@/utils/mapCamera';
import { ROUTE_POLYLINE_COLOR } from '@/lib/tripMapTheme';
import { EmergencySosModal } from '@/components/EmergencySosModal';
import { ShareTripModal } from '@/components/ShareTripModal';
import { SosTripActionIcon } from '@/components/SosTripActionIcon';
import { DriverInfoModal } from '@/components/DriverInfoModal';
import { CachedRemoteImage } from '@/components/CachedRemoteImage';

const { height: SCREEN_H } = Dimensions.get('window');

const FONT_BODY = Platform.select({
  ios: undefined,
  android: 'sans-serif',
  default: undefined,
});

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

const EMERALD = '#10B981';

function coerceRideAmount(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v)
    .trim()
    .replace(/\s/g, '')
    .replace(/\u00a0/g, '');
  if (!s) return null;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Valor oficial da tabela `rides`: `coalesce(final_fare, price_estimate)`.
 * Não usa `fare_estimate`, `estimated_fare` nem cálculos locais de preço.
 */
function coalesceFinalFarePriceEstimate(row: { final_fare?: unknown; price_estimate?: unknown } | null): number | null {
  if (!row) return null;
  const f = coerceRideAmount(row.final_fare);
  if (f != null && Number.isFinite(f)) return f;
  const e = coerceRideAmount(row.price_estimate);
  if (e != null && Number.isFinite(e)) return e;
  return null;
}

/** Meticais (MZN), sempre com valor numérico visível para a UI final. */
function formatMzn(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const s = n.toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${s} MZN`;
}

const STAR_SIZE = 30;
const STAR_GOLD = '#CA8A04';
const STAR_MUTED = '#94A3B8';

function CompletedTripStars({
  rating,
  onSelect,
}: {
  rating: number;
  onSelect: (n: number) => void;
}) {
  const scales = useRef([1, 2, 3, 4, 5].map(() => new Animated.Value(1))).current;

  const bump = (index: number) => {
    Animated.sequence([
      Animated.spring(scales[index], {
        toValue: 1.14,
        friction: 5,
        tension: 280,
        useNativeDriver: true,
      }),
      Animated.spring(scales[index], {
        toValue: 1,
        friction: 6,
        tension: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return (
    <View style={completedTripStarsStyles.row}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Pressable
          key={s}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`${s} estrelas`}
          onPress={() => {
            bump(s - 1);
            onSelect(s);
          }}
          style={completedTripStarsStyles.hit}
        >
          <Animated.View style={{ transform: [{ scale: scales[s - 1] }] }}>
            <Ionicons
              name={rating >= s ? 'star' : 'star-outline'}
              size={STAR_SIZE}
              color={rating >= s ? STAR_GOLD : STAR_MUTED}
            />
          </Animated.View>
        </Pressable>
      ))}
    </View>
  );
}

const completedTripStarsStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  hit: { padding: 2 },
});

export default function CurrentRideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const mapRef = useRef<MapView | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [cardHeight, setCardHeight] = useState(0);
  const [liveRoute, setLiveRoute] = useState<LiveRoute | null>(null);
  const [isTripCardCollapsed, setIsTripCardCollapsed] = useState(false);
  const onTripSheetEnter = useRef(new Animated.Value(0)).current;

  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [ratingSuccess, setRatingSuccess] = useState(false);
  const [hasExistingRating, setHasExistingRating] = useState(false);
  const [showSosModal, setShowSosModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDriverInfoModal, setShowDriverInfoModal] = useState(false);

  const { state, driverInfo, loading, uiState, isTerminal, stopPolling, refresh } = useRideState(rideId);

  const visual = mapRpcUiStateToPassengerVisual(uiState) as PassengerVisualState | null;

  useEffect(() => {
    if (visual !== 'on_trip') {
      setShowSosModal(false);
      setShowShareModal(false);
      setShowDriverInfoModal(false);
    }
  }, [visual]);

  useEffect(() => {
    if (isTerminal) stopPolling();
  }, [isTerminal, stopPolling]);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  /** Alinhado a Zamba-Mocambique `page.tsx`: colapsar card "viagem iniciada" após 5s. */
  useEffect(() => {
    if (uiState === 'on_trip') {
      setIsTripCardCollapsed(false);
      const timer = setTimeout(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsTripCardCollapsed(true);
      }, 5000);
      return () => clearTimeout(timer);
    }
    setIsTripCardCollapsed(false);
  }, [uiState]);

  useEffect(() => {
    if (visual !== 'on_trip') {
      onTripSheetEnter.setValue(0);
      return;
    }
    onTripSheetEnter.setValue(0);
    Animated.timing(onTripSheetEnter, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visual, onTripSheetEnter]);

  useEffect(() => {
    if (!rideId) return;
    rideService.getLiveRoute(rideId).then(setLiveRoute);
    const unsub = rideService.subscribeToLiveRoute(rideId, setLiveRoute);
    return unsub;
  }, [rideId]);

  const [rideFareSnapshot, setRideFareSnapshot] = useState<{
    final_fare?: unknown;
    price_estimate?: unknown;
  } | null>(null);

  useEffect(() => {
    if (visual !== 'completed' || !rideId) return;
    rideService.checkDriverRatingExists(rideId).then(setHasExistingRating);
  }, [visual, rideId]);

  /** Total pago: fonte oficial `rides` (mesma regra que `coalesce(final_fare, price_estimate)`). */
  useEffect(() => {
    if (visual !== 'completed' || !rideId) {
      setRideFareSnapshot(null);
      return;
    }
    let cancelled = false;
    void rideService
      .getRideById(rideId)
      .then((row) => {
        if (cancelled || !row) return;
        setRideFareSnapshot({
          final_fare: row.final_fare,
          price_estimate: row.price_estimate,
        });
      })
      .catch(() => {
        if (!cancelled) setRideFareSnapshot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [visual, rideId]);

  useEffect(() => {
    if (visual !== 'searching' && visual !== 'no_driver_available') return;
    if (!rideId || !state) return;
    router.replace({
      pathname: '/searchingDriver' as any,
      params: {
        rideId,
        pickupLat: String(state.pickup_lat ?? -25.9692),
        pickupLng: String(state.pickup_lng ?? 32.5732),
        pickupAddress: state.pickup_address ?? '',
        vehicleCategory: state.vehicle_category ?? 'economico',
      },
    });
  }, [visual, rideId, state, router]);

  const polylineCoords = useMemo(() => {
    if (!liveRoute?.polyline?.trim()) return [];
    try {
      return downsampleRouteCoordinates(decodePolyline(liveRoute.polyline));
    } catch {
      return [];
    }
  }, [liveRoute?.polyline]);

  /** Android aplica melhor a cor com `strokeColors` preenchido (ver `map.tsx`). */
  const polylineStrokeColors = useMemo(() => {
    if (polylineCoords.length < 2) return undefined;
    return new Array(polylineCoords.length).fill(ROUTE_POLYLINE_COLOR);
  }, [polylineCoords]);

  const driverLat =
    liveRoute?.last_driver_lat ??
    driverInfo?.lat ??
    state?.driver_lat;
  const driverLng =
    liveRoute?.last_driver_lng ??
    driverInfo?.lng ??
    state?.driver_lng;

  const pickupLat = state?.pickup_lat ?? liveRoute?.start_lat;
  const pickupLng = state?.pickup_lng ?? liveRoute?.start_lng;
  const destLat = state?.destination_lat ?? liveRoute?.end_lat;
  const destLng = state?.destination_lng ?? liveRoute?.end_lng;

  const etaMinutes =
    liveRoute?.duration_seconds != null && liveRoute.duration_seconds > 0
      ? Math.max(1, Math.round(liveRoute.duration_seconds / 60))
      : null;

  const mapPoints = useMemo(() => {
    const pts: LatLng[] = [];
    if (polylineCoords.length) pts.push(...polylineCoords);
    if (driverLat != null && driverLng != null) {
      pts.push({ latitude: driverLat, longitude: driverLng });
    }
    if (pickupLat != null && pickupLng != null) {
      pts.push({ latitude: pickupLat, longitude: pickupLng });
    }
    if (destLat != null && destLng != null) {
      pts.push({ latitude: destLat, longitude: destLng });
    }
    return pts;
  }, [polylineCoords, driverLat, driverLng, pickupLat, pickupLng, destLat, destLng]);

  const lastPolylineForCameraRef = useRef<string | undefined>(undefined);
  const lastCameraFitAtRef = useRef(0);

  useEffect(() => {
    if (!mapReady || cardHeight === 0) return;
    const poly = liveRoute?.polyline;
    const polyChanged = poly !== lastPolylineForCameraRef.current;
    lastPolylineForCameraRef.current = poly;

    const now = Date.now();
    if (
      !polyChanged &&
      lastCameraFitAtRef.current > 0 &&
      now - lastCameraFitAtRef.current < 2600
    ) {
      return;
    }

    const t = setTimeout(() => {
      lastCameraFitAtRef.current = Date.now();
      if (mapPoints.length >= 2) {
        fitMapCamera(mapRef, mapPoints);
      } else if (driverLat != null && driverLng != null) {
        mapRef.current?.animateToRegion(
          {
            latitude: driverLat,
            longitude: driverLng,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          },
          400,
        );
      }
    }, 350);
    return () => clearTimeout(t);
  }, [mapReady, mapPoints, cardHeight, driverLat, driverLng, liveRoute?.polyline]);

  const recenter = useCallback(() => {
    if (mapPoints.length >= 2) fitMapCamera(mapRef, mapPoints);
    else if (driverLat != null && driverLng != null) {
      mapRef.current?.animateToRegion(
        {
          latitude: driverLat,
          longitude: driverLng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        300,
      );
    }
  }, [mapPoints, driverLat, driverLng]);

  const driverName = driverInfo?.full_name ?? state?.driver_name ?? 'Motorista';
  const driverPhone = driverInfo?.phone ?? state?.driver_phone;
  const vehiclePlate = driverInfo?.vehicle_plate ?? state?.vehicle_plate ?? '';
  const vehicleLine = [driverInfo?.vehicle_brand, driverInfo?.vehicle_model ?? state?.vehicle_model]
    .filter(Boolean)
    .join(' ')
    .trim();
  const ratingDisplay = driverInfo?.rating != null ? driverInfo.rating.toFixed(1) : '4.9';
  const avatarUrl = driverInfo?.avatar_url;

  const completedFareAmount = useMemo(() => {
    const fromDb = coalesceFinalFarePriceEstimate(rideFareSnapshot);
    if (fromDb != null) return fromDb;
    const fromPoll = coalesceFinalFarePriceEstimate(state);
    if (fromPoll != null) return fromPoll;
    return 0;
  }, [rideFareSnapshot, state]);

  const completedFareText = useMemo(() => formatMzn(completedFareAmount), [completedFareAmount]);

  const canCancelTrip = uiState === 'driver_en_route' || uiState === 'driver_arrived';

  const handleCancel = () => {
    Alert.alert('Cancelar viagem', 'Tem a certeza?', [
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

  const handleCall = () => {
    if (driverPhone) Linking.openURL(`tel:${driverPhone}`);
    else Alert.alert('Indisponível', 'Número do motorista indisponível.');
  };

  const handleChat = () => {
    Alert.alert('Chat', 'Em breve disponível no aplicativo.');
  };

  const handleShareTrip = () => {
    if (!rideId) {
      Alert.alert('Indisponível', 'Identificador da viagem não encontrado.');
      return;
    }
    setShowShareModal(true);
  };

  const handleSos = () => {
    if (!rideId) {
      Alert.alert('Indisponível', 'Identificador da viagem não encontrado.');
      return;
    }
    setShowSosModal(true);
  };

  const handleDriverInfoCollapsed = () => {
    if (!rideId) {
      Alert.alert('Indisponível', 'Identificador da viagem não encontrado.');
      return;
    }
    setShowDriverInfoModal(true);
  };

  const handleSubmitRating = async () => {
    if (!rating || !state?.driver_id || !rideId) return;
    const user = await authService.getCurrentUser();
    if (!user) {
      Alert.alert('Erro', 'Inicie sessão para avaliar.');
      return;
    }
    setIsSubmittingRating(true);
    try {
      await rideService.submitDriverRating({
        driver_id: state.driver_id,
        ride_id: rideId,
        passenger_id: user.id,
        rating,
        comment: ratingComment.trim() || undefined,
      });
      setRatingSuccess(true);
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar a avaliação.');
    } finally {
      setIsSubmittingRating(false);
    }
  };

  const goHome = () => {
    router.replace('/(tabs)');
  };

  const onTripSheetAnimatedStyle = useMemo(
    () => ({
      opacity: onTripSheetEnter,
      transform: [
        {
          translateY: onTripSheetEnter.interpolate({
            inputRange: [0, 1],
            outputRange: [28, 0],
          }),
        },
      ],
    }),
    [onTripSheetEnter],
  );

  if (!rideId) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.muted}>Corrida inválida.</Text>
        <TouchableOpacity style={styles.blackBtn} onPress={goHome}>
          <Text style={styles.blackBtnText}>VOLTAR AO INÍCIO</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading && !state) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={EMERALD} />
      </View>
    );
  }

  if (visual === 'searching' || visual === 'no_driver_available') {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={EMERALD} />
        <Text style={[styles.muted, { marginTop: 12 }]}>A redirecionar…</Text>
      </View>
    );
  }

  const initialRegion = {
    latitude: driverLat ?? pickupLat ?? -25.9692,
    longitude: driverLng ?? pickupLng ?? 32.5732,
    latitudeDelta: 0.06,
    longitudeDelta: 0.06,
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.mapFill}
        provider={PROVIDER_GOOGLE}
        customMapStyle={MAP_STYLE_CLEAN}
        userInterfaceStyle="light"
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        showsTraffic={false}
        toolbarEnabled={false}
        mapPadding={{
          top: insets.top + 8,
          right: 12,
          bottom: cardHeight + 8,
          left: 12,
        }}
        onMapReady={() => setMapReady(true)}
      >
        {polylineCoords.length > 0 && (
          <Polyline
            coordinates={polylineCoords}
            strokeColor={ROUTE_POLYLINE_COLOR}
            strokeColors={polylineStrokeColors}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
            geodesic
            zIndex={999}
          />
        )}
        {driverLat != null && driverLng != null && (
          <Marker coordinate={{ latitude: driverLat, longitude: driverLng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.driverPin}>
              <Ionicons name="car-sport" size={22} color="#374151" />
            </View>
          </Marker>
        )}
        {pickupLat != null && pickupLng != null && visual !== 'on_trip' && (
          <Marker coordinate={{ latitude: pickupLat, longitude: pickupLng }} anchor={{ x: 0.5, y: 1 }}>
            <View style={styles.redPin}>
              <View style={styles.redPinInner} />
            </View>
          </Marker>
        )}
        {destLat != null && destLng != null && visual === 'on_trip' && (
          <Marker coordinate={{ latitude: destLat, longitude: destLng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.destDotOuter}>
              <View style={styles.destDotInner} />
            </View>
          </Marker>
        )}
      </MapView>

      <TouchableOpacity
        style={[styles.recenterFab, { top: insets.top + 12 }]}
        onPress={recenter}
        accessibilityRole="button"
        accessibilityLabel="Recentrar mapa"
      >
        <Ionicons name="navigate" size={22} color="#111827" />
      </TouchableOpacity>

      {/* Painéis inferiores — espelho funcional de Zamba-Mocambique `page.tsx` */}
      {(visual === 'driver_assigned' || visual === 'driver_arrived') && (
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={styles.headerTextCol}>
              <Text style={styles.titleLg}>
                {visual === 'driver_arrived' ? 'O seu motorista chegou' : 'Motorista a caminho'}
              </Text>
              <Text style={styles.subtitle}>
                {visual === 'driver_arrived'
                  ? 'Dirija-se ao ponto de recolha'
                  : 'O seu motorista está a dirigir-se ao local de recolha'}
              </Text>
            </View>
            <View style={styles.checkSquare}>
              <Ionicons name="checkmark-circle" size={24} color="#FFF" />
            </View>
          </View>

          <View style={styles.driverRowCard}>
            <View style={styles.avatarBtn}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Ionicons name="person-circle" size={40} color="#D1D5DB" />
              )}
            </View>
            <View style={styles.driverTextCol}>
              <Text style={styles.driverName} numberOfLines={1}>
                {driverName}
              </Text>
              <View style={styles.ratingVehicleRow}>
                <Ionicons name="star" size={12} color="#FBBF24" />
                <Text style={styles.ratingVehicleText}>
                  {' '}
                  {ratingDisplay} • {vehicleLine || '—'}
                </Text>
              </View>
            </View>
            {!!vehiclePlate && (
              <View style={styles.platePill}>
                <Text style={styles.plateText}>{vehiclePlate}</Text>
              </View>
            )}
          </View>

          <View style={styles.btnGrid}>
            <TouchableOpacity style={styles.chatBtn} onPress={handleChat} activeOpacity={0.85}>
              <Ionicons name="chatbubble-outline" size={18} color="#64748B" />
              <Text style={styles.chatBtnText}>Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.callBtn} onPress={handleCall} activeOpacity={0.85}>
              <Ionicons name="call" size={18} color="#FFF" />
              <Text style={styles.callBtnText}>Ligar</Text>
            </TouchableOpacity>
          </View>

          {canCancelTrip && (
            <TouchableOpacity style={styles.cancelGhost} onPress={handleCancel}>
              <Text style={styles.cancelGhostText}>Cancelar viagem</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {visual === 'on_trip' && (
        <Animated.View
          style={[
            styles.sheet,
            styles.sheetOnTrip,
            onTripSheetAnimatedStyle,
            { paddingBottom: insets.bottom + (isTripCardCollapsed ? 12 : 18) },
          ]}
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.handleOnTrip} />
          {!isTripCardCollapsed ? (
            <>
              <View style={styles.onTripIconWrap}>
                <Ionicons name="navigate" size={30} color={EMERALD} />
              </View>
              <Text style={styles.onTripTitle}>Viagem iniciada</Text>
              <Text style={styles.onTripSub}>
                Por favor, coloque o cinto de segurança. Boa viagem.
              </Text>
              <View style={styles.destEtaRow}>
                <View style={styles.destEtaCol}>
                  <Text style={styles.destEtaLabel}>DESTINO</Text>
                  <Text style={styles.destEtaValue} numberOfLines={2}>
                    {state?.dropoff_address ?? '—'}
                  </Text>
                </View>
                <View style={styles.destEtaColEnd}>
                  <Text style={styles.destEtaLabel}>CHEGADA</Text>
                  <Text style={styles.etaGreen}>
                    {etaMinutes != null ? `${etaMinutes} min` : '-- min'}
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.tripActionsRow}>
              <TouchableOpacity
                style={styles.tripActionCol}
                onPress={handleShareTrip}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Partilhar viagem"
              >
                <View style={styles.tripIconSlot}>
                  <View style={styles.tripShareCircle}>
                    <Ionicons name="share-outline" size={22} color="#FFF" />
                  </View>
                </View>
                <Text style={styles.tripBlockLine1}>PARTILHAR</Text>
                <Text style={styles.tripBlockLine2}>VIAGEM</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.tripActionCol}
                onPress={handleSos}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="SOS emergência"
              >
                <View style={styles.tripIconSlot}>
                  <SosTripActionIcon />
                </View>
                <Text style={styles.tripBlockLine1Sos}>SOS</Text>
                <Text style={styles.tripBlockLine2Sos}>EMERGÊNCIA</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.tripActionCol}
                onPress={handleDriverInfoCollapsed}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Informações do motorista"
              >
                <View style={styles.tripIconSlot}>
                  <View style={styles.tripDriverCircle}>
                    <CachedRemoteImage
                      uri={driverInfo?.avatar_url}
                      style={styles.tripDriverPhoto}
                      cacheScope="trip-bar-driver"
                      fallback={
                        <View style={styles.tripDriverPhotoFallback}>
                          <Ionicons name="person-outline" size={24} color="#475569" />
                        </View>
                      }
                    />
                  </View>
                </View>
                <Text style={styles.tripBlockLine1}>MOTORISTA</Text>
                <Text style={styles.tripBlockLine2}>INFORMAÇÕES</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      )}

      {visual === 'completed' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.sheet, styles.sheetCompleted, styles.completedSheetWrap]}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        >
          <View style={[styles.completedKeyboardPad, { paddingBottom: insets.bottom + 10 }]}>
            <View style={[styles.handle, styles.handleCompleted]} />
            <View style={styles.completedInner}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark" size={24} color="#FFF" />
              </View>
              <Text style={styles.completedTitle}>Viagem concluída</Text>
              <Text style={styles.completedSub}>
                Esperamos que tenha tido uma excelente viagem com a Zamba.
              </Text>

              <View style={styles.totalPaidCard}>
                <Text style={styles.totalPaidLabel}>TOTAL PAGO</Text>
                <Text style={styles.totalPaidValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {completedFareText}
                </Text>
              </View>

              {!hasExistingRating && !ratingSuccess ? (
                <View style={styles.ratingBlock}>
                  <Text style={styles.ratingPrompt}>Como foi o motorista?</Text>
                  <CompletedTripStars rating={rating} onSelect={setRating} />
                  <Text style={styles.commentLabel}>Comentário (opcional)</Text>
                  <TextInput
                    style={styles.commentInput}
                    placeholder="Partilhe a sua experiência…"
                    placeholderTextColor="#64748B"
                    value={ratingComment}
                    onChangeText={setRatingComment}
                    multiline
                    maxLength={500}
                  />
                  <TouchableOpacity
                    style={[styles.sendRatingBtn, (!rating || isSubmittingRating) && styles.sendRatingBtnDisabled]}
                    disabled={!rating || isSubmittingRating}
                    onPress={handleSubmitRating}
                    activeOpacity={0.92}
                  >
                    <Text
                      style={[
                        styles.sendRatingBtnText,
                        (!rating || isSubmittingRating) && styles.sendRatingBtnTextDisabled,
                      ]}
                    >
                      {isSubmittingRating ? 'A enviar…' : 'Enviar avaliação'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.thanksBox}>
                  <View style={styles.thanksIcon}>
                    <Ionicons name="checkmark" size={18} color="#FFF" />
                  </View>
                  <Text style={styles.thanksText}>Obrigado pela sua avaliação!</Text>
                </View>
              )}

              <TouchableOpacity style={styles.homeSecondaryBtn} onPress={goHome} activeOpacity={0.88}>
                <Text style={styles.homeSecondaryBtnText}>Voltar ao início</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {visual === 'cancelled' && (
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.handle} />
          <Text style={styles.titleLg}>Viagem cancelada</Text>
          <Text style={styles.subtitle}>Esta corrida foi cancelada.</Text>
          <TouchableOpacity style={[styles.blackBtn, { marginTop: 20 }]} onPress={goHome}>
            <Text style={styles.blackBtnText}>VOLTAR AO INÍCIO</Text>
          </TouchableOpacity>
        </View>
      )}

      {visual == null && (
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.handle} />
          <Text style={styles.titleLg}>Estado da corrida</Text>
          <Text style={styles.subtitle}>{uiState || 'A sincronizar…'}</Text>
          <TouchableOpacity style={[styles.blackBtn, { marginTop: 16 }]} onPress={goHome}>
            <Text style={styles.blackBtnText}>VOLTAR AO INÍCIO</Text>
          </TouchableOpacity>
        </View>
      )}

      <EmergencySosModal
        visible={showSosModal}
        onClose={() => setShowSosModal(false)}
        rideId={rideId}
      />
      <ShareTripModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        rideId={rideId}
      />
      <DriverInfoModal
        visible={showDriverInfoModal}
        onClose={() => setShowDriverInfoModal(false)}
        rideId={rideId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  center: { alignItems: 'center', justifyContent: 'center' },
  mapFill: {
    ...StyleSheet.absoluteFillObject,
  },
  muted: { color: '#6B7280', fontSize: 14, fontWeight: '600' },
  recenterFab: {
    position: 'absolute',
    right: 16,
    backgroundColor: '#FFF',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 5,
  },
  driverPin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: EMERALD,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  redPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
  },
  redPinInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFF',
  },
  destDotOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#111827',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
    zIndex: 10,
    maxHeight: SCREEN_H * 0.88,
  },
  sheetScroll: {
    maxHeight: SCREEN_H * 0.92,
  },
  sheetCompleted: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 22,
    paddingHorizontal: 16,
    paddingTop: 2,
  },
  /** Viagem concluída: card cabe no ecrã sem scroll obrigatório. */
  completedSheetWrap: {
    maxHeight: SCREEN_H * 0.84,
  },
  completedKeyboardPad: {
    width: '100%',
  },
  handleCompleted: {
    marginBottom: 4,
  },
  handle: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetOnTrip: {
    paddingHorizontal: 18,
    paddingTop: 8,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 0,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 18,
  },
  handleOnTrip: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerTextCol: { flex: 1, marginRight: 10 },
  titleLg: {
    fontFamily: FONT_BODY,
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  subtitle: {
    fontFamily: FONT_BODY,
    marginTop: 4,
    fontSize: 13,
    fontWeight: '400',
    color: '#64748B',
    lineHeight: 18,
  },
  checkSquare: {
    backgroundColor: EMERALD,
    borderRadius: 10,
    padding: 6,
  },
  driverRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F1F5F9',
  },
  avatarBtn: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: 56, height: 56 },
  driverTextCol: { flex: 1, minWidth: 0 },
  driverName: {
    fontFamily: FONT_BODY,
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    letterSpacing: -0.15,
  },
  ratingVehicleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  ratingVehicleText: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '400',
    color: '#64748B',
    flex: 1,
  },
  platePill: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  plateText: {
    fontFamily: FONT_BODY,
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  btnGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  chatBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  chatBtnText: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    letterSpacing: 0.8,
  },
  callBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: EMERALD,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...Platform.select({
      ios: {
        shadowColor: EMERALD,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.22,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  callBtnText: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.8,
  },
  cancelGhost: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelGhostText: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
    letterSpacing: 0.15,
  },
  onTripIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ECFDF5',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  onTripTitle: {
    fontFamily: FONT_BODY,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  onTripSub: {
    fontFamily: FONT_BODY,
    marginTop: 6,
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  destEtaRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F1F5F9',
  },
  destEtaCol: {
    flex: 1,
    marginRight: 12,
    minWidth: 0,
  },
  destEtaColEnd: {
    alignItems: 'flex-end',
    maxWidth: '42%',
  },
  destEtaLabel: {
    fontFamily: FONT_BODY,
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1.4,
  },
  destEtaValue: {
    fontFamily: FONT_BODY,
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  etaGreen: {
    fontFamily: FONT_BODY,
    marginTop: 4,
    fontSize: 15,
    fontWeight: '700',
    color: EMERALD,
    letterSpacing: -0.2,
  },
  tripActionsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 6,
    paddingHorizontal: 2,
    overflow: 'visible',
  },
  tripActionCol: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 2,
  },
  /** Altura fixa para alinhar os três ícones no mesmo eixo vertical. */
  tripIconSlot: {
    width: '100%',
    height: 72,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  tripShareCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.28,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  tripDriverCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1D5DB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  tripDriverPhoto: {
    width: '100%',
    height: '100%',
  },
  tripDriverPhotoFallback: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
  },
  tripBlockLine1: {
    fontFamily: FONT_BODY,
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.35,
    textAlign: 'center',
    lineHeight: 11,
  },
  tripBlockLine2: {
    fontFamily: FONT_BODY,
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.35,
    textAlign: 'center',
    lineHeight: 11,
    marginTop: 2,
  },
  tripBlockLine1Sos: {
    fontFamily: FONT_BODY,
    fontSize: 9,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.45,
    textAlign: 'center',
    lineHeight: 11,
  },
  tripBlockLine2Sos: {
    fontFamily: FONT_BODY,
    fontSize: 9,
    fontWeight: '700',
    color: '#B91C1C',
    letterSpacing: 0.4,
    textAlign: 'center',
    lineHeight: 11,
    marginTop: 2,
  },
  completedInner: {
    alignItems: 'center',
    paddingTop: 0,
    paddingHorizontal: 12,
    width: '100%',
  },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: EMERALD,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: EMERALD,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  completedTitle: {
    fontFamily: FONT_BODY,
    fontSize: 21,
    fontWeight: '900',
    color: '#020617',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  completedSub: {
    fontFamily: FONT_BODY,
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  totalPaidCard: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#D1FAE5',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  totalPaidLabel: {
    fontFamily: FONT_BODY,
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  totalPaidValue: {
    fontFamily: FONT_BODY,
    fontSize: 28,
    fontWeight: '900',
    color: '#020617',
    letterSpacing: -0.8,
  },
  ratingBlock: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
    marginBottom: 4,
  },
  ratingPrompt: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.15,
  },
  commentLabel: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.5,
    marginBottom: 4,
    alignSelf: 'flex-start',
    marginLeft: 2,
    textTransform: 'uppercase',
  },
  commentInput: {
    fontFamily: FONT_BODY,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 52,
    maxHeight: 68,
    fontSize: 14,
    fontWeight: '500',
    color: '#0F172A',
    marginBottom: 8,
    textAlignVertical: 'top',
  },
  sendRatingBtn: {
    width: '100%',
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    ...Platform.select({
      ios: {
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  sendRatingBtnDisabled: {
    backgroundColor: '#E2E8F0',
    shadowOpacity: 0,
    elevation: 0,
  },
  sendRatingBtnText: {
    fontFamily: FONT_BODY,
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  sendRatingBtnTextDisabled: {
    color: '#64748B',
  },
  thanksBox: {
    width: '100%',
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  thanksIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  thanksText: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  homeSecondaryBtn: {
    width: '100%',
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    marginTop: 2,
  },
  homeSecondaryBtnText: {
    fontFamily: FONT_BODY,
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.15,
  },
  blackBtn: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  blackBtnText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
});

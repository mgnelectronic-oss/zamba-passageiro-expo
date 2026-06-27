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
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useRideState } from '@/hooks/useRideState';
import { useDriverLiveLocationForPassenger, isDriverLiveTrackingEnabled } from '@/hooks/useDriverLiveLocationForPassenger';
import { resolvePickupDriverMapLocation } from '@/lib/navigation/resolvePickupDriverLocation';
import { logPassengerDriverLiveLocation } from '@/services/driverLocationService';
import { rideService, type LiveRoute } from '@/services/rideService';
import { mapRpcUiStateToPassengerVisual, type PassengerVisualState } from '@/lib/passengerRideVisualState';
import { EmergencySosModal } from '@/components/EmergencySosModal';
import { ShareTripModal } from '@/components/ShareTripModal';
import { DriverInfoModal } from '@/components/DriverInfoModal';
import { DriverRatingSection } from '@/components/DriverRatingSection';
import { AnimatedSideActionButton } from '@/components/AnimatedSideActionButton';
import { CachedRemoteImage } from '@/components/CachedRemoteImage';
import { rideCallUserMessage } from '@/services/rideCallService';
import { DriverCallOptionsModal } from '@/components/DriverCallOptionsModal';
import { PassengerInternetCallPanel } from '@/components/PassengerInternetCallPanel';
import { usePassengerOutboundInternetCall } from '@/hooks/usePassengerOutboundInternetCall';
import { PassengerActiveRideMap } from '@/components/maps/PassengerActiveRideMap';
import { PassengerTripTimeline } from '@/components/PassengerTripTimeline';

const { height: SCREEN_H } = Dimensions.get('window');

const FONT_BODY = Platform.select({
  ios: undefined,
  android: 'sans-serif',
  default: undefined,
});

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


export default function CurrentRideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [cardHeight, setCardHeight] = useState(0);
  const [navStripHeight, setNavStripHeight] = useState(0);
  const [liveRoute, setLiveRoute] = useState<LiveRoute | null>(null);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const onTripSheetEnter = useRef(new Animated.Value(0)).current;
  const [tripStartedAt] = useState(() => Date.now());
  const [elapsedMin, setElapsedMin] = useState(0);

  const [showSosModal, setShowSosModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDriverInfoModal, setShowDriverInfoModal] = useState(false);
  const [callOptionsOpen, setCallOptionsOpen] = useState(false);

  const outboundInternetCall = usePassengerOutboundInternetCall();
  const {
    visible: outboundCallVisible,
    uiPhase: outboundCallPhase,
    title: outboundCallTitle,
    subtitle: outboundCallSubtitle,
    driverName: outboundDriverName,
    driverAvatarUrl: outboundDriverAvatarUrl,
    durationSec: outboundDurationSec,
    showDuration: outboundShowDuration,
    isWaiting: outboundCallWaiting,
    micMuted: outboundMicMuted,
    speakerOn: outboundSpeakerOn,
    hangupBusy: outboundHangupBusy,
    remoteStreamUrl: outboundRemoteStreamUrl,
    startCall: startOutboundInternetCall,
    hangUp: hangUpOutboundInternetCall,
    toggleMicMuted: toggleOutboundMicMuted,
    toggleSpeaker: toggleOutboundSpeaker,
    dismiss: dismissOutboundInternetCall,
  } = outboundInternetCall;

  const { state, driverInfo, loading, uiState, isTerminal, stopPolling, refresh } = useRideState(rideId);

  const visual = mapRpcUiStateToPassengerVisual(uiState) as PassengerVisualState | null;

  const driverLiveTrackingEnabled = isDriverLiveTrackingEnabled(visual, uiState);

  const { location: driverLiveLocation } = useDriverLiveLocationForPassenger({
    rideId,
    driverId: state?.driver_id,
    enabled: driverLiveTrackingEnabled && !!state?.driver_id,
    visual,
    uiState,
  });

  const resolvedDriverLocation = useMemo(
    () =>
      resolvePickupDriverMapLocation({
        liveLocation: driverLiveLocation,
        driverInfoLat: driverInfo?.lat,
        driverInfoLng: driverInfo?.lng,
        stateDriverLat: state?.driver_lat,
        stateDriverLng: state?.driver_lng,
        liveRouteLat: liveRoute?.last_driver_lat,
        liveRouteLng: liveRoute?.last_driver_lng,
      }),
    [
      driverLiveLocation,
      driverInfo?.lat,
      driverInfo?.lng,
      state?.driver_lat,
      state?.driver_lng,
      liveRoute?.last_driver_lat,
      liveRoute?.last_driver_lng,
    ],
  );

  const lastDriverSourceRef = useRef(resolvedDriverLocation.source);
  useEffect(() => {
    if (!driverLiveTrackingEnabled) return;
    if (lastDriverSourceRef.current === resolvedDriverLocation.source) return;
    const previous = lastDriverSourceRef.current;
    lastDriverSourceRef.current = resolvedDriverLocation.source;
    const logFn = logPassengerDriverLiveLocation;
    logFn('selected source changed', {
      rideId,
      driverId: state?.driver_id,
      visual,
      uiState,
      previousSource: previous,
      selectedSource: resolvedDriverLocation.source,
      lat: resolvedDriverLocation.lat,
      lng: resolvedDriverLocation.lng,
      updatedAt: driverLiveLocation?.row.updated_at,
      ageMs: driverLiveLocation?.ageMs,
    });
    if (resolvedDriverLocation.source !== 'driver_locations_current') {
      logFn('fallback used', {
        rideId,
        driverId: state?.driver_id,
        selectedSource: resolvedDriverLocation.source,
        liveStale: driverLiveLocation?.isStale ?? null,
        liveAvailable: driverLiveLocation?.isValid ?? false,
      });
    }
  }, [
    driverLiveTrackingEnabled,
    resolvedDriverLocation.source,
    resolvedDriverLocation.lat,
    resolvedDriverLocation.lng,
    rideId,
    state?.driver_id,
    visual,
    uiState,
    driverLiveLocation?.row.updated_at,
    driverLiveLocation?.ageMs,
    driverLiveLocation?.isStale,
    driverLiveLocation?.isValid,
  ]);

  const driverLat = resolvedDriverLocation.lat;
  const driverLng = resolvedDriverLocation.lng;

  const showNavStrip =
    visual === 'driver_assigned' || visual === 'driver_arrived' || visual === 'on_trip';

  const navStripTitle =
    visual === 'driver_arrived'
      ? 'Motorista chegou'
      : visual === 'on_trip'
      ? 'A caminho do destino'
      : 'Motorista a caminho';

  const navStripSubtitle =
    visual === 'driver_arrived'
      ? 'Dirija-se ao local de recolha'
      : visual === 'on_trip'
      ? (state?.dropoff_address || 'Destino')
      : (state?.pickup_address || 'A aguardar localização');

  const handleGoToMenu = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

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
    if (visual !== 'on_trip') return;
    const interval = setInterval(() => {
      setElapsedMin(Math.floor((Date.now() - tripStartedAt) / 60000));
    }, 10000);
    return () => clearInterval(interval);
  }, [visual, tripStartedAt]);

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
    const unsub = rideService.subscribeToLiveRoute(rideId, setLiveRoute, {
      scope: 'current-ride-screen',
    });
    return unsub;
  }, [rideId]);

  const [rideFareSnapshot, setRideFareSnapshot] = useState<{
    final_fare?: unknown;
    price_estimate?: unknown;
  } | null>(null);

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

  const pickupLat = state?.pickup_lat ?? liveRoute?.start_lat;
  const pickupLng = state?.pickup_lng ?? liveRoute?.start_lng;
  const destLat = state?.destination_lat ?? liveRoute?.end_lat;
  const destLng = state?.destination_lng ?? liveRoute?.end_lng;

  const etaMinutes =
    liveRoute?.duration_seconds != null && liveRoute.duration_seconds > 0
      ? Math.max(1, Math.round(liveRoute.duration_seconds / 60))
      : null;

  const recenter = useCallback(() => {
    setRecenterSignal((n) => n + 1);
  }, []);

  const mapPadding = useMemo(
    () => ({
      top: showNavStrip ? navStripHeight + 4 : insets.top + 8,
      right: visual === 'on_trip' ? 70 : 12,
      bottom: cardHeight + 8,
      left: 12,
    }),
    [showNavStrip, navStripHeight, insets.top, visual, cardHeight],
  );

  const tripProgress =
    etaMinutes != null && etaMinutes > 0
      ? Math.max(0.05, Math.min(0.95, elapsedMin / (elapsedMin + etaMinutes)))
      : 0.05;

  const tripStartLabel = new Date(tripStartedAt).toLocaleTimeString('pt-MZ', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const tripDurationLabel =
    elapsedMin < 60
      ? `${elapsedMin} min`
      : `${Math.floor(elapsedMin / 60)}h ${String(elapsedMin % 60).padStart(2, '0')}min`;

  const tripArrivalLabel =
    etaMinutes != null
      ? new Date(Date.now() + etaMinutes * 60000).toLocaleTimeString('pt-MZ', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '--:--';

  const initialRegion = useMemo(
    () => ({
      latitude: driverLat ?? pickupLat ?? -25.9692,
      longitude: driverLng ?? pickupLng ?? 32.5732,
      latitudeDelta: 0.06,
      longitudeDelta: 0.06,
    }),
    [driverLat, driverLng, pickupLat, pickupLng],
  );

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

  const openPhoneCall = useCallback(async () => {
    if (!driverPhone) {
      Alert.alert('Indisponível', 'Número do motorista indisponível.');
      return;
    }
    const raw = String(driverPhone).replace(/[^\d+]/g, '');
    if (!raw) {
      Alert.alert('Indisponível', 'Número do motorista indisponível.');
      return;
    }
    const url = `tel:${raw}`;
    try {
      if (Platform.OS === 'ios') {
        const can = await Linking.canOpenURL(url);
        if (!can) {
          Alert.alert('Indisponível', 'Não é possível iniciar chamada telefónica neste dispositivo.');
          return;
        }
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir o discador.');
    }
  }, [driverPhone]);

  const startZambaInternetCall = useCallback(async () => {
    if (!rideId?.trim()) {
      Alert.alert('Indisponível', 'Identificador da viagem em falta.');
      return;
    }
    const receiverUserId =
      driverInfo?.user_id?.trim() ||
      state?.driver_user_id?.trim() ||
      '';
    if (!receiverUserId) {
      Alert.alert(
        'Indisponível',
        'Não foi possível obter o utilizador (auth) do motorista. Peça à API para expor user_id ou driver_user_id na resposta.',
      );
      return;
    }
    setCallOptionsOpen(false);
    try {
      await startOutboundInternetCall({
        rideId,
        receiverUserId,
        driverName,
        driverAvatarUrl: avatarUrl ?? null,
      });
    } catch (error: unknown) {
      console.error('[currentRide] startZambaInternetCall erro técnico:', error);
      Alert.alert('Erro', error instanceof Error ? error.message : rideCallUserMessage(error, 'start'));
    }
  }, [
    rideId,
    state?.driver_user_id,
    driverInfo?.user_id,
    driverName,
    avatarUrl,
    startOutboundInternetCall,
  ]);

  const handleCallOptions = useCallback(() => {
    setCallOptionsOpen(true);
  }, []);

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

  return (
    <View style={styles.container}>
      <PassengerActiveRideMap
        rideId={rideId}
        uiState={uiState}
        visual={visual}
        liveRoute={liveRoute}
        pickup={{ lat: pickupLat, lng: pickupLng, address: state?.pickup_address }}
        destination={{ lat: destLat, lng: destLng, address: state?.dropoff_address }}
        driverLocation={{ lat: driverLat, lng: driverLng }}
        mapPadding={mapPadding}
        recenterSignal={recenterSignal}
        initialRegion={initialRegion}
      />

      {/* ── NAV STRIP (top bar verde, fase activa) ── */}
      {showNavStrip && (
        <View
          style={[styles.navStrip, { position: 'absolute', top: insets.top + 4, left: 10, right: 10, zIndex: 20 }]}
          onLayout={(e) => setNavStripHeight(insets.top + 4 + e.nativeEvent.layout.height + 4)}
        >
          <TouchableOpacity
            style={styles.navBackBtn}
            onPress={handleGoToMenu}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.navPickupInstrCol}>
            <Text style={styles.navInstruction} numberOfLines={1}>{navStripTitle}</Text>
            <Text style={styles.navSecondaryText} numberOfLines={1}>{navStripSubtitle}</Text>
          </View>
          {etaMinutes != null && (
            <>
              <View style={styles.navPickupVertDivider} />
              <View style={styles.navOntripMetaCol}>
                <View style={styles.navOntripMetaTop}>
                  <Ionicons name="time-outline" size={12} color="#FFFFFF" />
                  <Text style={styles.navOntripMetaValue}> {etaMinutes} min</Text>
                </View>
                <Text style={styles.navOntripMetaSub}>Chegada</Text>
              </View>
            </>
          )}
        </View>
      )}

      {/* ── RECENTER FAB (estados sem navStrip) ── */}
      {!showNavStrip && (
        <TouchableOpacity
          style={[styles.recenterFab, { top: insets.top + 12 }]}
          onPress={recenter}
          accessibilityRole="button"
          accessibilityLabel="Recentrar mapa"
        >
          <Ionicons name="navigate" size={22} color="#111827" />
        </TouchableOpacity>
      )}

      {/* ── COMPACT MAP ACTIONS (coluna direita, acima do card inferior) ── */}
      {showNavStrip && (
        <View style={[styles.pickupMapActions, { bottom: cardHeight + 12 }]}>
          {visual === 'on_trip' ? (
            <>
              <AnimatedSideActionButton
                label="Minha localização"
                onPress={recenter}
                iconName="locate"
                iconColor={EMERALD}
                accessibilityLabel="Recentrar mapa"
                staggerIndex={0}
              />
              <AnimatedSideActionButton
                label="Partilhar viagem"
                onPress={handleShareTrip}
                iconName="share-social-outline"
                iconColor="#2563EB"
                accessibilityLabel="Partilhar viagem"
                staggerIndex={1}
              />
              <AnimatedSideActionButton
                label="Emergência SOS"
                onPress={handleSos}
                variant="sos"
                accessibilityLabel="SOS Emergência"
                staggerIndex={2}
              />
              <AnimatedSideActionButton
                label="Informações do motorista"
                onPress={handleDriverInfoCollapsed}
                imageUri={avatarUrl}
                iconName="person"
                iconColor="#374151"
                accessibilityLabel="Informações do motorista"
                staggerIndex={3}
              />
            </>
          ) : (
            <TouchableOpacity
              style={styles.pickupMapActionBtn}
              onPress={recenter}
              accessibilityRole="button"
              accessibilityLabel="Recentrar mapa"
            >
              <Ionicons name="locate" size={20} color={EMERALD} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── CARD INFERIOR: RECOLHA ── */}
      {(visual === 'driver_assigned' || visual === 'driver_arrived') && (
        <View
          style={[styles.bottomSheet, styles.bottomSheetCompact, { paddingBottom: insets.bottom + 12 }]}
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.handle} />
          <View style={styles.pickupCompactCard}>
            <View style={styles.driverRowCard}>
              <View style={styles.avatarBtn}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" />
                ) : (
                  <Ionicons name="person-circle" size={40} color="#D1D5DB" />
                )}
              </View>
              <View style={styles.driverTextCol}>
                <Text style={styles.driverName} numberOfLines={1}>{driverName}</Text>
                <View style={styles.ratingVehicleRow}>
                  <Ionicons name="star" size={12} color="#FBBF24" />
                  <Text style={styles.ratingVehicleText}> {ratingDisplay} • {vehicleLine || '—'}</Text>
                </View>
              </View>
              {!!vehiclePlate && (
                <View style={styles.platePill}>
                  <Text style={styles.plateText}>{vehiclePlate}</Text>
                </View>
              )}
            </View>
            <View style={styles.timelineActionsRow}>
              <TouchableOpacity style={styles.pickupOutlineAction} onPress={handleChat} activeOpacity={0.85}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color="#374151" />
                <Text style={styles.pickupOutlineActionText}>Chat</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickupOutlineAction} onPress={handleCallOptions} activeOpacity={0.85}>
                <Ionicons name="call" size={16} color="#374151" />
                <Text style={styles.pickupOutlineActionText}>Ligar</Text>
              </TouchableOpacity>
            </View>
          </View>
          {canCancelTrip && (
            <TouchableOpacity style={styles.cancelGhost} onPress={handleCancel}>
              <Text style={styles.cancelGhostText}>Cancelar viagem</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── CARD INFERIOR: EM VIAGEM ── */}
      {visual === 'on_trip' && (
        <Animated.View
          style={[
            styles.bottomSheet,
            styles.bottomSheetCompact,
            styles.ontripBottomCard,
            onTripSheetAnimatedStyle,
            { paddingBottom: insets.bottom + 6 },
          ]}
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.ontripGrabber} />
          <PassengerTripTimeline
            progress={tripProgress}
            startLabel={tripStartLabel}
            centerLabel={tripDurationLabel}
            arrivalLabel={tripArrivalLabel}
            compact
          />
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

              <DriverRatingSection rideId={rideId!} driverId={state?.driver_id} />

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
        driverId={state?.driver_id}
      />
      <DriverCallOptionsModal
        visible={callOptionsOpen}
        onClose={() => setCallOptionsOpen(false)}
        onZamba={startZambaInternetCall}
        onPhone={openPhoneCall}
      />
      <PassengerInternetCallPanel
        visible={outboundCallVisible}
        uiPhase={outboundCallPhase}
        title={outboundCallTitle}
        subtitle={outboundCallSubtitle}
        driverName={outboundDriverName}
        driverAvatarUrl={outboundDriverAvatarUrl}
        durationSec={outboundDurationSec}
        showDuration={outboundShowDuration}
        isWaiting={outboundCallWaiting}
        micMuted={outboundMicMuted}
        speakerOn={outboundSpeakerOn}
        hangupBusy={outboundHangupBusy}
        remoteStreamUrl={outboundRemoteStreamUrl}
        onToggleMic={toggleOutboundMicMuted}
        onToggleSpeaker={() => void toggleOutboundSpeaker()}
        onHangUp={() => void hangUpOutboundInternetCall()}
        onDismiss={dismissOutboundInternetCall}
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
  menuFab: {
    position: 'absolute',
    left: 16,
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
  sideActionsCol: {
    position: 'absolute',
    right: 14,
    top: '28%',
    zIndex: 8,
    alignItems: 'center',
    gap: 12,
  },
  sideActionCard: {
    width: 100,
    backgroundColor: '#FFF',
    borderRadius: 22,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  sideShareCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    ...Platform.select({
      ios: { shadowColor: '#2563EB', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6 },
      android: { elevation: 3 },
    }),
  },
  sideSosCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    ...Platform.select({
      ios: { shadowColor: '#DC2626', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6 },
      android: { elevation: 3 },
    }),
  },
  sideDriverCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1D5DB',
  },
  sideDriverPhoto: { width: '100%', height: '100%' } as any,
  sideDriverFallback: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
  },
  sideActionLine1: {
    fontFamily: FONT_BODY,
    fontSize: 9,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.4,
    textAlign: 'center',
    lineHeight: 12,
  },
  sideActionLine2: {
    fontFamily: FONT_BODY,
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.35,
    textAlign: 'center',
    lineHeight: 12,
  },
  sideActionLine1Sos: {
    fontFamily: FONT_BODY,
    fontSize: 9,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.45,
    textAlign: 'center',
    lineHeight: 12,
  },
  sideActionLine2Sos: {
    fontFamily: FONT_BODY,
    fontSize: 9,
    fontWeight: '700',
    color: '#B91C1C',
    letterSpacing: 0.4,
    textAlign: 'center',
    lineHeight: 12,
  },
  timelineSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 28,
    paddingTop: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
    zIndex: 10,
  },
  timelineHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    height: 14,
  },
  progressDotStart: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: EMERALD,
  },
  progressBarTrack: {
    flex: 1,
    height: 3,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4,
    borderRadius: 2,
    position: 'relative',
    overflow: 'visible',
  },
  progressBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: EMERALD,
    borderRadius: 2,
  },
  progressCurrentDot: {
    position: 'absolute',
    top: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: EMERALD,
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: EMERALD,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 3,
  },
  progressMidDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 3,
  },
  progressBarTrackEnd: {
    flex: 1,
    height: 3,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4,
    borderRadius: 2,
    justifyContent: 'center',
  },
  progressDotEnd: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
  },
  timelineInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  timelineInfoCol: { alignItems: 'flex-start' },
  timelineInfoColCenter: { alignItems: 'center' },
  timelineInfoColEnd: { alignItems: 'flex-end' },
  timelineLabel: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '500',
    color: '#94A3B8',
    marginBottom: 2,
  },
  timelineValueDark: {
    fontFamily: FONT_BODY,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  timelineValueGreen: {
    fontFamily: FONT_BODY,
    fontSize: 18,
    fontWeight: '700',
    color: EMERALD,
  },
  timelineValueRed: {
    fontFamily: FONT_BODY,
    fontSize: 18,
    fontWeight: '700',
    color: '#EF4444',
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

  // ── NAV STRIP ────────────────────────────────────────────────
  navStrip: {
    backgroundColor: '#0F5132',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    gap: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
      },
      android: { elevation: 10 },
    }),
  },
  navBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  navPickupInstrCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingVertical: 2,
    gap: 2,
  },
  navInstruction: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  navSecondaryText: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.88)',
  },
  navPickupVertDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    minHeight: 36,
    backgroundColor: 'rgba(255,255,255,0.28)',
    marginHorizontal: 2,
    flexShrink: 0,
  },
  navOntripMetaCol: {
    width: 78,
    flexShrink: 0,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  navOntripMetaTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  navOntripMetaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  navOntripMetaSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'right',
  },

  // ── COMPACT MAP ACTIONS (coluna FAB direita) ──────────────────
  pickupMapActions: {
    position: 'absolute',
    right: 14,
    zIndex: 15,
    gap: 8,
    alignItems: 'center',
  },
  pickupMapActionBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.14,
        shadowRadius: 6,
      },
      android: { elevation: 5 },
    }),
  },
  pickupMapActionAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  pickupMapActionBtnSos: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E5262E',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.14,
        shadowRadius: 6,
      },
      android: { elevation: 5 },
    }),
  },
  pickupMapActionSosText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: '#FFFFFF',
  },

  // ── BOTTOM SHEET (novo, substituí pickup/ontrip) ──────────────
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
    }),
  },
  bottomSheetCompact: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 12,
    paddingTop: 6,
  },

  // ── PICKUP COMPACT CARD (interior do bottomSheet) ─────────────
  pickupCompactCard: {
    borderRadius: 18,
    marginHorizontal: 2,
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  timelineActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: 10,
  },
  pickupOutlineAction: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  pickupOutlineActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },

  // ── ON TRIP CARD ──────────────────────────────────────────────
  ontripBottomCard: {
    paddingTop: 2,
    paddingBottom: 0,
    paddingHorizontal: 10,
  },
  ontripGrabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    marginTop: 2,
    marginBottom: 4,
  },
});

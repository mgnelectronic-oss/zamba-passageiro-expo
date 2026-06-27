import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import Feather from '@expo/vector-icons/Feather';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { rideService } from '@/services/rideService';
import { ROUTE_POLYLINE_COLOR } from '@/lib/tripMapTheme';
import { CachedRemoteImage } from '@/components/CachedRemoteImage';
import { decodePolyline, downsampleRouteCoordinates } from '@/utils/polylineDecode';
import {
  fetchSharedRideDetail,
  fetchSharedRideLiveSnapshot,
  formatSharedRideDateTime,
  formatSharedRideDistance,
  formatSharedRideDuration,
  formatSharedRidePrice,
  formatSharedRideTime,
  type SharedRideDetailPayload,
  type SharedRideViewMode,
} from '@/services/sharedRideDetailService';

const LOG = '[SHARED RIDE FLOW]';

type SharedRide = {
  notification_id: string;
  ride_share_id: string;
  sender_name: string;
  pickup_address: string;
  dropoff_address: string;
  ride_status: string;
  created_at: string;
  is_read: boolean;
};

type DetailScreenState = 'loading' | 'error' | SharedRideViewMode;

type LiveOverlay = {
  driver_lat?: number;
  driver_lng?: number;
  route_polyline?: string;
  ride_status?: string;
};

function logFlow(message: string, extra?: Record<string, unknown>): void {
  if (extra) console.log(LOG, message, extra);
  else console.log(LOG, message);
}

function safeDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

function statusLabel(s: string) {
  if (s === 'completed') return 'Concluída';
  if (s === 'cancelled') return 'Cancelada';
  return 'Em curso';
}

function statusStyle(s: string) {
  if (s === 'completed') return { bg: C.emeraldBg, color: C.emerald };
  if (s === 'cancelled') return { bg: C.redBg, color: C.red };
  return { bg: C.blueBg, color: C.blue };
}

function detailFloatingLabel(status?: string) {
  if (status === 'ontrip') return 'Viagem em curso';
  if (status === 'arrived') return 'Motorista no local';
  if (status === 'accepted' || status === 'arriving') return 'Motorista a caminho';
  if (status === 'completed') return 'Viagem concluída';
  if (status === 'cancelled') return 'Viagem cancelada';
  return 'Acompanhando em tempo real';
}

function statusDotColor(s?: string) {
  if (s === 'completed') return C.emerald;
  if (s === 'cancelled') return C.red;
  if (s === 'arrived') return C.amber;
  return C.blue;
}

const C = {
  bg: '#F7F8FA',
  surface: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  emerald: '#10B981',
  emeraldBg: '#ECFDF5',
  blue: '#3B82F6',
  blueBg: '#EFF6FF',
  amber: '#F59E0B',
  red: '#EF4444',
  redBg: '#FEF2F2',
};

const SHADOW = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 3 },
}) as object;

const SHADOW_LG = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.12, shadowRadius: 24 },
  android: { elevation: 12 },
}) as object;

function HistoryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.historyRow}>
      <Text style={st.historyLabel}>{label}</Text>
      <Text style={st.historyValue}>{value}</Text>
    </View>
  );
}

export default function SharedRidesPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [rides, setRides] = useState<SharedRide[]>([]);
  const [detail, setDetail] = useState<SharedRideDetailPayload | null>(null);
  const [detailScreen, setDetailScreen] = useState<DetailScreenState>('loading');
  const [detailError, setDetailError] = useState<string | null>(null);
  const [liveOverlay, setLiveOverlay] = useState<LiveOverlay>({});

  const fetchList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const data = await rideService.getSharedRidesForMe();
      setRides((data as SharedRide[]) || []);
    } catch {
      setListError('Não foi possível carregar as viagens partilhadas.');
    } finally {
      setListLoading(false);
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refreshLiveSnapshot = useCallback(async (rideId: string) => {
    const snap = await fetchSharedRideLiveSnapshot(rideId);
    if (snap) setLiveOverlay((prev) => ({ ...prev, ...snap }));
  }, []);

  const startLivePolling = useCallback(
    (rideId: string) => {
      stopPolling();
      void refreshLiveSnapshot(rideId);
      pollRef.current = setInterval(() => void refreshLiveSnapshot(rideId), 4000);
      logFlow('polling live activo', { ride_id: rideId });
    },
    [stopPolling, refreshLiveSnapshot],
  );

  const loadShareDetail = useCallback(
    async (shareId: string) => {
      setDetailScreen('loading');
      setDetail(null);
      setDetailError(null);
      setLiveOverlay({});
      stopPolling();

      const { detail: payload, error } = await fetchSharedRideDetail(shareId);
      if (error || !payload) {
        setDetailScreen('error');
        setDetailError(error ?? 'Partilha indisponível');
        return;
      }

      setDetail(payload);
      setDetailScreen(payload.viewMode);
      if (payload.viewMode === 'live_tracking') startLivePolling(payload.ride.id);
    },
    [startLivePolling, stopPolling],
  );

  useEffect(() => {
    fetchList();
    return () => stopPolling();
  }, [fetchList, stopPolling]);

  const effectiveStatus = liveOverlay.ride_status ?? detail?.ride.status;
  const effectiveDriverLat = liveOverlay.driver_lat ?? detail?.route?.last_driver_lat;
  const effectiveDriverLng = liveOverlay.driver_lng ?? detail?.route?.last_driver_lng;
  const effectivePolyline = liveOverlay.route_polyline ?? detail?.route?.polyline ?? '';

  const routeCoords = useMemo(() => {
    if (!effectivePolyline) return [];
    try {
      return downsampleRouteCoordinates(decodePolyline(effectivePolyline));
    } catch {
      return [];
    }
  }, [effectivePolyline]);

  useEffect(() => {
    if (!detail || detailScreen === 'loading' || detailScreen === 'error') return;
    const points: { latitude: number; longitude: number }[] = [];
    if (detail.ride.pickup_lat != null && detail.ride.pickup_lng != null) {
      points.push({ latitude: detail.ride.pickup_lat, longitude: detail.ride.pickup_lng });
    }
    if (detail.ride.destination_lat != null && detail.ride.destination_lng != null) {
      points.push({ latitude: detail.ride.destination_lat, longitude: detail.ride.destination_lng });
    }
    if (detailScreen === 'live_tracking' && effectiveDriverLat != null && effectiveDriverLng != null) {
      points.push({ latitude: effectiveDriverLat, longitude: effectiveDriverLng });
    }
    if (points.length >= 2) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(points, {
          edgePadding: { top: 60, right: 40, bottom: 30, left: 40 },
          animated: true,
        });
      }, 400);
    }
  }, [detail, detailScreen, effectiveDriverLat, effectiveDriverLng]);

  const handleRidePress = async (ride: SharedRide) => {
    const shareId = ride.ride_share_id?.trim();
    logFlow('clique na viagem partilhada', { share_id: shareId ?? null, ride_status: ride.ride_status });
    if (!shareId) {
      setView('detail');
      setDetailScreen('error');
      setDetailError('Partilha indisponível');
      return;
    }
    setView('detail');
    if (!ride.is_read) {
      await rideService.markRideShareNotificationAsRead(ride.notification_id);
      setRides((prev) =>
        prev.map((r) => (r.notification_id === ride.notification_id ? { ...r, is_read: true } : r)),
      );
    }
    await loadShareDetail(shareId);
  };

  const handleBack = () => {
    if (view === 'detail') {
      setView('list');
      setDetail(null);
      setDetailError(null);
      setDetailScreen('loading');
      setLiveOverlay({});
      stopPolling();
    } else {
      router.back();
    }
  };

  const detailTitle =
    detailScreen === 'live_tracking'
      ? 'Acompanhar Viagem'
      : detailScreen === 'history_details'
        ? 'Detalhe da viagem'
        : detailScreen === 'cancelled_details'
          ? 'Viagem cancelada'
          : detailScreen === 'expired_history'
            ? 'Histórico expirado'
            : 'Viagens Partilhadas';

  const renderMap = (showDriver: boolean, height: number | 'flex' = 240) => (
    <View style={{ height: height === 'flex' ? undefined : height, flex: height === 'flex' ? 1 : undefined, borderRadius: height === 'flex' ? 0 : 20, overflow: 'hidden', marginBottom: height === 'flex' ? 0 : 16 }}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: detail?.ride.pickup_lat ?? -25.9692,
          longitude: detail?.ride.pickup_lng ?? 32.5732,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        }}
        scrollEnabled={height !== 'flex'}
        zoomEnabled
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {routeCoords.length >= 2 ? (
          <Polyline coordinates={routeCoords} strokeColor={ROUTE_POLYLINE_COLOR} strokeWidth={4} geodesic />
        ) : null}
        {detail?.ride.pickup_lat != null && detail?.ride.pickup_lng != null ? (
          <Marker coordinate={{ latitude: detail.ride.pickup_lat, longitude: detail.ride.pickup_lng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={st.markerPickup}><View style={st.markerPickupDot} /></View>
          </Marker>
        ) : null}
        {detail?.ride.destination_lat != null && detail?.ride.destination_lng != null ? (
          <Marker coordinate={{ latitude: detail.ride.destination_lat, longitude: detail.ride.destination_lng }} anchor={{ x: 0.5, y: 1 }}>
            <View style={st.markerDest}><Ionicons name="location" size={28} color={C.text} /></View>
          </Marker>
        ) : null}
        {showDriver && effectiveDriverLat != null && effectiveDriverLng != null ? (
          <Marker coordinate={{ latitude: effectiveDriverLat, longitude: effectiveDriverLng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={st.markerCar}><Ionicons name="car" size={18} color="#FFF" /></View>
          </Marker>
        ) : null}
      </MapView>
    </View>
  );

  const renderDriverCard = () => {
    if (!detail) return null;
    const vehicleLine = [detail.vehicle.brand, detail.vehicle.model].filter(Boolean).join(' ').trim();
    return (
      <View style={st.driverRow}>
        <View style={st.driverAvatar}>
          <CachedRemoteImage uri={detail.driver.photo_url} style={st.driverAvatarImg} cacheScope="shared_rides_driver" fallback={<Ionicons name="person-circle" size={32} color={C.textMuted} />} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.driverName} numberOfLines={1}>{detail.driver.name}</Text>
          <Text style={st.driverMetaText} numberOfLines={1}>{[vehicleLine, detail.vehicle.category].filter(Boolean).join(' · ') || 'Veículo'}</Text>
        </View>
        <View style={st.driverActions}>
          {detail.vehicle.plate ? <View style={st.plateBadge}><Text style={st.plateText}>{detail.vehicle.plate}</Text></View> : null}
          {detail.driver.phone ? (
            <TouchableOpacity style={st.callBtn} onPress={() => Linking.openURL(`tel:${detail.driver.phone}`)} activeOpacity={0.8}>
              <Ionicons name="call" size={16} color="#FFF" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const renderRouteCard = () => {
    if (!detail) return null;
    return (
      <View style={st.routeInfo}>
        <View style={st.routeDots}><View style={st.routeDotGreen} /><View style={st.routeLine} /><View style={st.routeDotBlack} /></View>
        <View style={st.routeAddresses}>
          <View style={st.routeAddrBlock}><Text style={st.routeAddrLabel}>RECOLHA</Text><Text style={st.routeAddrText} numberOfLines={2}>{detail.ride.pickup_address || '—'}</Text></View>
          <View style={st.routeAddrBlock}><Text style={st.routeAddrLabel}>DESTINO</Text><Text style={st.routeAddrText} numberOfLines={2}>{detail.ride.dropoff_address || '—'}</Text></View>
        </View>
      </View>
    );
  };

  const renderMessageScreen = (title: string, message: string) => (
    <View style={st.centered}>
      <View style={[st.emptyIcon, { backgroundColor: C.redBg }]}><Ionicons name="information-circle" size={40} color={C.red} /></View>
      <Text style={st.emptyTitle}>{title}</Text>
      <Text style={st.emptyDesc}>{message}</Text>
      <TouchableOpacity style={st.retryBtn} onPress={handleBack} activeOpacity={0.8}><Text style={st.retryBtnText}>Voltar à lista</Text></TouchableOpacity>
    </View>
  );

  const renderDetail = () => {
    if (detailScreen === 'loading') {
      return (
        <View style={st.centered}>
          <ActivityIndicator size="large" color={C.emerald} />
          <Text style={st.loadingLabel}>A carregar viagem partilhada…</Text>
        </View>
      );
    }
    if (detailScreen === 'error' || detailScreen === 'unavailable') {
      return renderMessageScreen('Partilha indisponível', detailError ?? 'Esta partilha não existe, foi revogada ou não tem permissão para a ver.');
    }
    if (detailScreen === 'expired_history') {
      return renderMessageScreen('Histórico expirado', 'Esta viagem foi concluída há mais de 7 dias e o histórico detalhado já não está disponível.');
    }
    if (detailScreen === 'cancelled_details' && detail) {
      return (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          <View style={[st.statusBadge, { backgroundColor: C.redBg, alignSelf: 'flex-start', marginBottom: 12 }]}>
            <Text style={[st.statusBadgeText, { color: C.red }]}>Cancelada</Text>
          </View>
          {renderRouteCard()}
          {renderDriverCard()}
        </ScrollView>
      );
    }
    if (detailScreen === 'history_details' && detail) {
      return (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          <View style={[st.statusBadge, { backgroundColor: C.emeraldBg, alignSelf: 'flex-start', marginBottom: 12 }]}>
            <Text style={[st.statusBadgeText, { color: C.emerald }]}>Concluída</Text>
          </View>
          {renderMap(false)}
          {renderDriverCard()}
          {renderRouteCard()}
          <View style={st.historyGrid}>
            <HistoryRow label="Data da viagem" value={formatSharedRideDateTime(detail.ride.completed_at ?? detail.ride.created_at)} />
            <HistoryRow label="Hora de início" value={formatSharedRideTime(detail.ride.started_at ?? detail.ride.created_at)} />
            <HistoryRow label="Hora de conclusão" value={formatSharedRideTime(detail.ride.completed_at)} />
            <HistoryRow label="Duração total" value={formatSharedRideDuration(detail.ride.duration_min)} />
            <HistoryRow label="Distância total" value={formatSharedRideDistance(detail.ride.distance_km)} />
            <HistoryRow label="Preço final" value={formatSharedRidePrice(detail.ride.final_fare, detail.ride.price_estimate)} />
          </View>
        </ScrollView>
      );
    }
    if (detailScreen === 'live_tracking' && detail) {
      return (
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>
            {renderMap(true, 'flex')}
            <View style={[st.floatingBadge, { top: 12 }]} pointerEvents="none">
              <View style={st.floatingBadgeInner}>
                <View style={[st.floatingDot, { backgroundColor: statusDotColor(effectiveStatus) }]} />
                <Text style={st.floatingBadgeText}>{detailFloatingLabel(effectiveStatus)}</Text>
              </View>
            </View>
          </View>
          <View style={[st.bottomCard, { paddingBottom: insets.bottom + 20 }]}>
            <View style={st.bottomHandle} />
            {renderDriverCard()}
            {renderRouteCard()}
          </View>
        </View>
      );
    }
    return renderMessageScreen('Indisponível', 'Não foi possível abrir esta viagem partilhada.');
  };

  if (listLoading) {
    return (
      <View style={[st.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={C.emerald} />
        <Text style={st.loadingLabel}>A carregar viagens partilhadas...</Text>
      </View>
    );
  }

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} onPress={handleBack} hitSlop={12}><Feather name="arrow-left" size={22} color={C.text} /></TouchableOpacity>
        <Text style={st.headerTitle}>{view === 'list' ? 'Viagens Partilhadas' : detailTitle}</Text>
        <View style={{ width: 40 }} />
      </View>
      {view === 'list' ? (
        listError ? (
          <View style={st.emptyWrap}>
            <Text style={st.emptyDesc}>{listError}</Text>
            <TouchableOpacity style={st.retryBtn} onPress={fetchList}><Text style={st.retryBtnText}>Tentar novamente</Text></TouchableOpacity>
          </View>
        ) : rides.length === 0 ? (
          <View style={st.emptyWrap}>
            <Text style={st.emptyTitle}>Nenhuma viagem partilhada</Text>
            <Text style={st.emptyDesc}>Aqui aparecerão as viagens partilhadas consigo.</Text>
          </View>
        ) : (
          <ScrollView style={st.listScroll} contentContainerStyle={[st.listContent, { paddingBottom: insets.bottom + 24 }]}>
            {rides.map((ride) => {
              const ss = statusStyle(ride.ride_status);
              return (
                <TouchableOpacity key={ride.notification_id} style={st.rideCard} onPress={() => void handleRidePress(ride)} activeOpacity={0.8}>
                  {!ride.is_read ? <View style={st.unreadDot} /> : null}
                  <View style={st.rideCardIcon}><Ionicons name="person-circle" size={28} color={C.textMuted} /></View>
                  <View style={st.rideCardBody}>
                    <View style={st.rideCardTop}>
                      <Text style={st.rideCardSender} numberOfLines={1}>{ride.sender_name}</Text>
                      <Text style={st.rideCardTime}>{safeDate(ride.created_at)?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? '—'}</Text>
                    </View>
                    <View style={st.rideCardRoute}>
                      <Text style={st.rideCardAddr} numberOfLines={1}>{ride.pickup_address}</Text>
                      <Ionicons name="chevron-forward" size={12} color={C.textMuted} />
                      <Text style={[st.rideCardAddr, { fontWeight: '700', color: C.text }]} numberOfLines={1}>{ride.dropoff_address}</Text>
                    </View>
                    <View style={[st.statusBadge, { backgroundColor: ss.bg }]}><Text style={[st.statusBadgeText, { color: ss.color }]}>{statusLabel(ride.ride_status)}</Text></View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )
      ) : (
        renderDetail()
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.borderLight },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  loadingLabel: { marginTop: 12, fontSize: 13, fontWeight: '500', color: C.textMuted },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.borderLight, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 8 },
  emptyDesc: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  retryBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, borderColor: C.border },
  retryBtnText: { fontSize: 13, fontWeight: '700', color: C.text },
  listScroll: { flex: 1 },
  listContent: { padding: 16, gap: 12 },
  rideCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.borderLight, ...SHADOW },
  unreadDot: { position: 'absolute', top: 14, right: 14, width: 9, height: 9, borderRadius: 5, backgroundColor: C.emerald },
  rideCardIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.borderLight, alignItems: 'center', justifyContent: 'center' },
  rideCardBody: { flex: 1, gap: 4 },
  rideCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rideCardSender: { fontSize: 15, fontWeight: '800', color: C.text, flex: 1, marginRight: 8 },
  rideCardTime: { fontSize: 10, fontWeight: '600', color: C.textMuted },
  rideCardRoute: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rideCardAddr: { fontSize: 11, color: C.textSecondary, maxWidth: 100 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 2 },
  statusBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  markerPickup: { width: 22, height: 22, borderRadius: 11, borderWidth: 2.5, borderColor: C.emerald, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  markerPickupDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.emerald },
  markerDest: { alignItems: 'center' },
  markerCar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center', ...Platform.select({ android: { elevation: 4 } }) },
  floatingBadge: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  floatingBadgeInner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  floatingDot: { width: 7, height: 7, borderRadius: 4 },
  floatingBadgeText: { fontSize: 10, fontWeight: '800', color: C.text, letterSpacing: 1.2, textTransform: 'uppercase' },
  bottomCard: { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 8, ...SHADOW_LG },
  bottomHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.borderLight, borderRadius: 18, padding: 14, marginBottom: 18 },
  driverAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  driverAvatarImg: { width: 48, height: 48, borderRadius: 24 },
  driverName: { fontSize: 15, fontWeight: '800', color: C.text },
  driverMetaText: { fontSize: 11, fontWeight: '600', color: C.textMuted, marginTop: 2 },
  driverActions: { alignItems: 'flex-end', gap: 6 },
  plateBadge: { backgroundColor: C.text, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  plateText: { fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 1 },
  callBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.emerald, alignItems: 'center', justifyContent: 'center' },
  routeInfo: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  routeDots: { alignItems: 'center', paddingTop: 4, gap: 3 },
  routeDotGreen: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: C.emerald, backgroundColor: '#FFF' },
  routeLine: { width: 1.5, height: 28, backgroundColor: C.borderLight },
  routeDotBlack: { width: 9, height: 9, borderRadius: 2, backgroundColor: C.text },
  routeAddresses: { flex: 1, gap: 14 },
  routeAddrBlock: { gap: 2 },
  routeAddrLabel: { fontSize: 9, fontWeight: '800', color: C.textMuted, letterSpacing: 1.5 },
  routeAddrText: { fontSize: 13, fontWeight: '700', color: C.text },
  historyGrid: { backgroundColor: C.surface, borderRadius: 18, padding: 16, gap: 12, borderWidth: 1, borderColor: C.borderLight },
  historyRow: { gap: 4 },
  historyLabel: { fontSize: 11, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  historyValue: { fontSize: 15, fontWeight: '700', color: C.text },
});

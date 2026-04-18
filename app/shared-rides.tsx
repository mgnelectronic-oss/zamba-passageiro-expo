import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Dimensions,
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

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

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

type SharedRideDetails = {
  ride_id: string;
  ride_status: string;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat: number;
  pickup_lng: number;
  destination_lat: number;
  destination_lng: number;
  driver_name: string;
  driver_photo_url: string;
  driver_phone: string;
  vehicle_model: string;
  vehicle_plate: string;
  driver_lat: number;
  driver_lng: number;
  route_polyline: string;
  share_active: boolean;
};

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
  pink: '#EC4899',
  pinkBg: 'rgba(236,72,153,0.08)',
};

const SHADOW = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 3 },
}) as any;

const SHADOW_LG = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.12, shadowRadius: 24 },
  android: { elevation: 12 },
}) as any;

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

function statusDotColor(s?: string) {
  if (s === 'completed') return C.emerald;
  if (s === 'cancelled') return C.red;
  return C.blue;
}

export default function SharedRidesPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [loading, setLoading] = useState(true);
  const [refreshingDetail, setRefreshingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rides, setRides] = useState<SharedRide[]>([]);
  const [selectedRide, setSelectedRide] = useState<SharedRide | null>(null);
  const [details, setDetails] = useState<SharedRideDetails | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await rideService.getSharedRidesForMe();
      setRides(data || []);
    } catch {
      setError('Não foi possível carregar as viagens partilhadas.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetails = useCallback(async (rideShareId: string) => {
    try {
      const data = await rideService.getSharedRideLiveDetails(rideShareId);
      if (data) {
        setDetails(data);
        if (!data.share_active) stopPolling();
      } else {
        setError('Esta partilha já não está ativa ou foi removida.');
        stopPolling();
      }
    } catch {
      // silent
    } finally {
      setRefreshingDetail(false);
    }
  }, []);

  const startPolling = useCallback((rideShareId: string) => {
    stopPolling();
    fetchDetails(rideShareId);
    pollRef.current = setInterval(() => fetchDetails(rideShareId), 4000);
  }, [fetchDetails]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    fetchList();
    return () => stopPolling();
  }, [fetchList, stopPolling]);

  useEffect(() => {
    if (details && mapRef.current) {
      const points: { latitude: number; longitude: number }[] = [];
      if (details.pickup_lat) points.push({ latitude: details.pickup_lat, longitude: details.pickup_lng });
      if (details.destination_lat) points.push({ latitude: details.destination_lat, longitude: details.destination_lng });
      if (details.driver_lat) points.push({ latitude: details.driver_lat, longitude: details.driver_lng });
      if (points.length >= 2) {
        setTimeout(() => {
          mapRef.current?.fitToCoordinates(points, {
            edgePadding: { top: 60, right: 40, bottom: 30, left: 40 },
            animated: true,
          });
        }, 400);
      }
    }
  }, [details]);

  const handleRidePress = async (ride: SharedRide) => {
    setSelectedRide(ride);
    setView('detail');
    setRefreshingDetail(true);
    setDetails(null);
    setError(null);

    if (!ride.is_read) {
      await rideService.markRideShareNotificationAsRead(ride.notification_id);
      setRides(prev => prev.map(r =>
        r.notification_id === ride.notification_id ? { ...r, is_read: true } : r
      ));
    }

    startPolling(ride.ride_share_id);
  };

  const handleBack = () => {
    if (view === 'detail') {
      setView('list');
      setSelectedRide(null);
      setDetails(null);
      setError(null);
      stopPolling();
    } else {
      router.back();
    }
  };

  const routeCoords = useMemo(() => {
    if (!details?.route_polyline) return [];
    try {
      return downsampleRouteCoordinates(decodePolyline(details.route_polyline));
    } catch {
      return [];
    }
  }, [details?.route_polyline]);

  const renderList = () => {
    if (error) {
      return (
        <View style={st.emptyWrap}>
          <View style={[st.emptyIcon, { backgroundColor: C.redBg }]}>
            <Ionicons name="alert-circle" size={32} color={C.red} />
          </View>
          <Text style={st.emptyDesc}>{error}</Text>
          <TouchableOpacity style={st.retryBtn} onPress={fetchList} activeOpacity={0.8}>
            <Text style={st.retryBtnText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (rides.length === 0) {
      return (
        <View style={st.emptyWrap}>
          <View style={st.emptyIcon}>
            <Ionicons name="share-social" size={40} color={C.borderLight} />
          </View>
          <Text style={st.emptyTitle}>Nenhuma viagem partilhada</Text>
          <Text style={st.emptyDesc}>
            Aqui aparecerão as viagens que os seus amigos ou familiares partilharem consigo.
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        style={st.listScroll}
        contentContainerStyle={[st.listContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {rides.map((ride) => {
          const ss = statusStyle(ride.ride_status);
          return (
            <TouchableOpacity
              key={ride.notification_id}
              style={st.rideCard}
              onPress={() => handleRidePress(ride)}
              activeOpacity={0.8}
            >
              {!ride.is_read && <View style={st.unreadDot} />}

              <View style={st.rideCardIcon}>
                <Ionicons name="person-circle" size={28} color={C.textMuted} />
              </View>

              <View style={st.rideCardBody}>
                <View style={st.rideCardTop}>
                  <Text style={st.rideCardSender} numberOfLines={1}>{ride.sender_name}</Text>
                  <Text style={st.rideCardTime}>
                    {new Date(ride.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>

                <View style={st.rideCardRoute}>
                  <Text style={st.rideCardAddr} numberOfLines={1}>{ride.pickup_address}</Text>
                  <Ionicons name="chevron-forward" size={12} color={C.textMuted} />
                  <Text style={[st.rideCardAddr, { fontWeight: '700', color: C.text }]} numberOfLines={1}>
                    {ride.dropoff_address}
                  </Text>
                </View>

                <View style={[st.statusBadge, { backgroundColor: ss.bg }]}>
                  <Text style={[st.statusBadgeText, { color: ss.color }]}>{statusLabel(ride.ride_status)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  };

  const renderDetail = () => {
    if (refreshingDetail && !details) {
      return (
        <View style={st.centered}>
          <ActivityIndicator size="large" color={C.emerald} />
          <Text style={st.loadingLabel}>A carregar mapa real...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={st.centered}>
          <View style={[st.emptyIcon, { backgroundColor: C.redBg }]}>
            <Ionicons name="close-circle" size={40} color={C.red} />
          </View>
          <Text style={st.emptyTitle}>Partilha indisponível</Text>
          <Text style={st.emptyDesc}>{error}</Text>
          <TouchableOpacity style={st.retryBtn} onPress={handleBack} activeOpacity={0.8}>
            <Text style={st.retryBtnText}>Voltar à lista</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        {/* Map */}
        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFillObject}
            initialRegion={{
              latitude: details?.pickup_lat || -25.9692,
              longitude: details?.pickup_lng || 32.5732,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            mapPadding={{ top: insets.top + 56, right: 0, bottom: 0, left: 0 }}
            showsCompass={false}
            showsTraffic={false}
            showsIndoors={false}
            toolbarEnabled={false}
          >
            {routeCoords.length >= 2 && (
              <Polyline coordinates={routeCoords} strokeColor={ROUTE_POLYLINE_COLOR} strokeWidth={4} geodesic zIndex={999} />
            )}

            {details?.pickup_lat ? (
              <Marker coordinate={{ latitude: details.pickup_lat, longitude: details.pickup_lng }} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={st.markerPickup}>
                  <View style={st.markerPickupDot} />
                </View>
              </Marker>
            ) : null}

            {details?.destination_lat ? (
              <Marker coordinate={{ latitude: details.destination_lat, longitude: details.destination_lng }} anchor={{ x: 0.5, y: 1 }}>
                <View style={st.markerDest}>
                  <Ionicons name="location" size={28} color={C.text} />
                </View>
              </Marker>
            ) : null}

            {details?.driver_lat ? (
              <Marker coordinate={{ latitude: details.driver_lat, longitude: details.driver_lng }} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={st.markerCar}>
                  <Ionicons name="car" size={18} color="#FFF" />
                </View>
              </Marker>
            ) : null}
          </MapView>

          {/* Floating status badge */}
          <View style={[st.floatingBadge, { top: insets.top + 60 }]} pointerEvents="none">
            <View style={st.floatingBadgeInner}>
              <View style={[st.floatingDot, { backgroundColor: statusDotColor(details?.ride_status) }]} />
              <Text style={st.floatingBadgeText}>
                {details?.ride_status === 'completed' ? 'Viagem Concluída' :
                 details?.ride_status === 'cancelled' ? 'Viagem Cancelada' :
                 'Acompanhando em Tempo Real'}
              </Text>
            </View>
          </View>
        </View>

        {/* Bottom info card */}
        <View style={[st.bottomCard, { paddingBottom: insets.bottom + 20 }]}>
          <View style={st.bottomHandle} />

          {/* Driver info */}
          <View style={st.driverRow}>
            <View style={st.driverAvatar}>
              <CachedRemoteImage
                uri={details?.driver_photo_url}
                style={st.driverAvatarImg}
                cacheScope="shared_rides_driver"
                fallback={<Ionicons name="person-circle" size={32} color={C.textMuted} />}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.driverName} numberOfLines={1}>{details?.driver_name || 'Motorista'}</Text>
              <View style={st.driverMeta}>
                <Ionicons name="star" size={12} color={C.amber} />
                <Text style={st.driverMetaText}>4.9</Text>
                <Text style={st.driverMetaDot}>•</Text>
                <Text style={st.driverMetaText} numberOfLines={1}>{details?.vehicle_model}</Text>
              </View>
            </View>
            <View style={st.driverActions}>
              <View style={st.plateBadge}>
                <Text style={st.plateText}>{details?.vehicle_plate}</Text>
              </View>
              <TouchableOpacity
                style={st.callBtn}
                onPress={() => details?.driver_phone && Linking.openURL(`tel:${details.driver_phone}`)}
                activeOpacity={0.8}
              >
                <Ionicons name="call" size={16} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Route info */}
          <View style={st.routeInfo}>
            <View style={st.routeDots}>
              <View style={st.routeDotGreen} />
              <View style={st.routeLine} />
              <View style={st.routeDotBlack} />
            </View>
            <View style={st.routeAddresses}>
              <View style={st.routeAddrBlock}>
                <Text style={st.routeAddrLabel}>RECOLHA</Text>
                <Text style={st.routeAddrText} numberOfLines={1}>{details?.pickup_address}</Text>
              </View>
              <View style={st.routeAddrBlock}>
                <Text style={st.routeAddrLabel}>DESTINO</Text>
                <Text style={st.routeAddrText} numberOfLines={1}>{details?.dropoff_address}</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[st.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={C.emerald} />
        <Text style={st.loadingLabel}>A carregar viagens partilhadas...</Text>
      </View>
    );
  }

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} onPress={handleBack} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>
          {view === 'list' ? 'Viagens Partilhadas' : 'Acompanhar Viagem'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {view === 'list' ? renderList() : renderDetail()}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.borderLight,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: -0.3 },

  loadingLabel: { marginTop: 12, fontSize: 13, fontWeight: '500', color: C.textMuted },

  /* Empty / Error */
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: C.borderLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 8 },
  emptyDesc: { fontSize: 13, color: C.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
  retryBtn: {
    marginTop: 20, paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 14, borderWidth: 1.5, borderColor: C.border,
  },
  retryBtnText: { fontSize: 13, fontWeight: '700', color: C.text },

  /* List */
  listScroll: { flex: 1 },
  listContent: { padding: 16, gap: 12 },

  rideCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.surface, borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: C.borderLight, ...SHADOW,
  },
  unreadDot: {
    position: 'absolute', top: 14, right: 14,
    width: 9, height: 9, borderRadius: 5, backgroundColor: C.emerald,
  },
  rideCardIcon: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: C.borderLight,
    alignItems: 'center', justifyContent: 'center',
  },
  rideCardBody: { flex: 1, gap: 4 },
  rideCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rideCardSender: { fontSize: 15, fontWeight: '800', color: C.text, flex: 1, marginRight: 8 },
  rideCardTime: { fontSize: 10, fontWeight: '600', color: C.textMuted },
  rideCardRoute: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rideCardAddr: { fontSize: 11, color: C.textSecondary, maxWidth: 100 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 2 },
  statusBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },

  /* Map markers */
  markerPickup: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2.5, borderColor: C.emerald,
    backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center',
  },
  markerPickupDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.emerald },
  markerDest: { alignItems: 'center' },
  markerCar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: C.text,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
      android: { elevation: 4 },
    }),
  },

  /* Floating badge */
  floatingBadge: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  floatingBadgeInner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  floatingDot: { width: 7, height: 7, borderRadius: 4 },
  floatingBadgeText: { fontSize: 10, fontWeight: '800', color: C.text, letterSpacing: 1.2, textTransform: 'uppercase' },

  /* Bottom card */
  bottomCard: {
    backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 8, ...SHADOW_LG,
  },
  bottomHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: C.border,
    alignSelf: 'center', marginBottom: 16,
  },

  /* Driver */
  driverRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.borderLight, borderRadius: 18, padding: 14, marginBottom: 18,
  },
  driverAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.borderLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  driverAvatarImg: { width: 48, height: 48, borderRadius: 24 },
  driverName: { fontSize: 15, fontWeight: '800', color: C.text },
  driverMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  driverMetaText: { fontSize: 10, fontWeight: '600', color: C.textMuted },
  driverMetaDot: { fontSize: 10, color: C.textMuted },
  driverActions: { alignItems: 'flex-end', gap: 6 },
  plateBadge: { backgroundColor: C.text, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  plateText: { fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 1 },
  callBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: C.emerald,
    alignItems: 'center', justifyContent: 'center',
  },

  /* Route info */
  routeInfo: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  routeDots: { alignItems: 'center', paddingTop: 4, gap: 3 },
  routeDotGreen: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: C.emerald, backgroundColor: '#FFF' },
  routeLine: { width: 1.5, height: 28, backgroundColor: C.borderLight },
  routeDotBlack: { width: 9, height: 9, borderRadius: 2, backgroundColor: C.text },
  routeAddresses: { flex: 1, gap: 14 },
  routeAddrBlock: { gap: 2 },
  routeAddrLabel: { fontSize: 9, fontWeight: '800', color: C.textMuted, letterSpacing: 1.5 },
  routeAddrText: { fontSize: 13, fontWeight: '700', color: C.text },
});

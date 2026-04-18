import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppBootstrap } from '@/contexts/AppBootstrapContext';
import type { RideHistoryItem, RpcHistoryError } from '@/services/passengerRideHistoryModel';

const FONT_BODY = Platform.select({
  ios: undefined,
  android: 'sans-serif',
  default: undefined,
});

/* ─── Helpers ─── */

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  completed: { label: 'COMPLETED', color: '#059669', bg: '#ECFDF5' },
  cancelled: { label: 'CANCELLED', color: '#DC2626', bg: '#FEF2F2' },
  ontrip:    { label: 'EM VIAGEM', color: '#D97706', bg: '#FFFBEB' },
  searching: { label: 'BUSCANDO',  color: '#6366F1', bg: '#EEF2FF' },
};

function getStatus(s: string | null) {
  if (!s) return { label: '—', color: '#9CA3AF', bg: '#F3F4F6' };
  const k = s.trim().toLowerCase();
  return STATUS_CONFIG[k] ?? { label: s.trim().toUpperCase(), color: '#9CA3AF', bg: '#F3F4F6' };
}

/** Badge suave para lista (não compete com o valor). */
function getStatusSoft(s: string | null) {
  const st = getStatus(s);
  const k = s?.trim().toLowerCase() ?? '';
  if (k === 'completed') {
    return { label: st.label, fg: '#059669', bg: '#ECFDF5' };
  }
  if (k === 'cancelled') {
    return { label: st.label, fg: '#B91C1C', bg: '#FEE2E2' };
  }
  return { label: st.label, fg: st.color, bg: st.bg };
}

function formatVehicleMetaLine(ride: RideHistoryItem): string {
  const plate = (ride.vehicle_plate ?? '').trim();
  const brand = (ride.vehicle_brand ?? '').trim();
  const model = (ride.vehicle_model ?? '').trim();
  const brandModel = brand ? `${brand} ${model}`.trim() : model;
  const right = brandModel || '—';
  if (plate) return `${plate} • ${right}`;
  return right;
}

function formatPrice(p: number | null): string {
  if (p == null || isNaN(p)) return '—';
  return p.toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MTn';
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year}, ${h}:${m}`;
}

function callDriver(phone: string | null) {
  if (!phone) return;
  Linking.openURL(`tel:${phone}`).catch(() => {});
}

/**
 * Overlay de foto ampliada dentro do mesmo Modal de «Detalhes da Viagem».
 * Evita segundo Modal (problemático em Android com modais empilhados).
 */
function DriverPhotoExpandOverlay({
  uri,
  visible,
  onClose,
}: {
  uri: string | null;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!visible || !uri) return null;

  return (
    <View
      style={[StyleSheet.absoluteFillObject, { zIndex: 1000, elevation: 1000 }]}
      pointerEvents="auto"
    >
      <View style={[detailStyles.photoModalRoot, { flex: 1 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              justifyContent: 'center',
              alignItems: 'center',
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 20,
              paddingHorizontal: 20,
            },
          ]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={[detailStyles.photoCloseBtn, { top: insets.top + 8 }]}
            onPress={onClose}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
          >
            <Ionicons name="close" size={26} color="#FFF" />
          </TouchableOpacity>
          <View>
            <ExpoImage
              source={{ uri }}
              style={detailStyles.photoFull}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={0}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

/* ─── Detail Modal ─── */

function RideDetailModal({
  ride,
  visible,
  onClose,
}: {
  ride: RideHistoryItem | null;
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) setPhotoPreview(null);
  }, [visible]);

  if (!ride) return null;

  const stSoft = getStatusSoft(ride.status);
  const modelFromRpc = [ride.vehicle_brand, ride.vehicle_model]
    .filter((x) => x && String(x).trim())
    .join(' ')
    .trim();

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={{ flex: 1 }}>
          <Pressable style={detailStyles.backdrop} onPress={onClose} />
          <View style={[detailStyles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View style={detailStyles.headerRow}>
              <Text style={detailStyles.sheetTitle}>Detalhes da Viagem</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <Text style={detailStyles.closeGlyph}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Driver */}
            <View style={detailStyles.driverRow}>
              {ride.driver_photo_url ? (
                <Pressable
                  onPress={() => setPhotoPreview(ride.driver_photo_url)}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="Ampliar foto do motorista"
                >
                  <ExpoImage
                    source={{ uri: ride.driver_photo_url }}
                    style={detailStyles.driverPhoto}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={0}
                  />
                </Pressable>
              ) : (
                <View style={[detailStyles.driverPhoto, detailStyles.driverFallback]}>
                  <Text style={detailStyles.driverFallbackText}>
                    {(ride.driver_name ?? 'M')[0].toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={detailStyles.driverInfo}>
                <Text style={detailStyles.driverName}>{ride.driver_name ?? 'Motorista'}</Text>
                <Text style={detailStyles.driverPhone}>{ride.driver_phone ?? '—'}</Text>
                <TouchableOpacity
                  style={[detailStyles.callNowBtn, !ride.driver_phone && { opacity: 0.4 }]}
                  onPress={() => callDriver(ride.driver_phone)}
                  disabled={!ride.driver_phone}
                >
                  <Ionicons name="call-outline" size={16} color="#10B981" />
                  <Text style={detailStyles.callNowText}>LIGAR AGORA</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Vehicle info */}
            <View style={detailStyles.vehicleRow}>
              <View style={detailStyles.vehicleBlock}>
                <Text style={detailStyles.vehicleLabel}>MATRÍCULA</Text>
                <Text style={detailStyles.vehicleValue}>{ride.vehicle_plate ?? 'S/M'}</Text>
              </View>
              <View style={detailStyles.vehicleBlock}>
                <Text style={detailStyles.vehicleLabel}>MODELO</Text>
                <Text style={detailStyles.vehicleValue}>{modelFromRpc || '—'}</Text>
              </View>
            </View>

          <View style={detailStyles.colorBlock}>
            <Text style={detailStyles.vehicleLabel}>COR DO VEÍCULO</Text>
            <Text style={detailStyles.vehicleValue}>{ride.vehicle_color ?? 'Não informado'}</Text>
          </View>

          {/* Route */}
          <View style={detailStyles.routeSection}>
            <View style={detailStyles.routeRow}>
              <View style={detailStyles.routeDots}>
                <View style={[detailStyles.routeDot, { backgroundColor: '#22C55E' }]} />
                <View style={detailStyles.routeLine} />
                <View style={[detailStyles.routeDot, { backgroundColor: '#EF4444' }]} />
              </View>
              <View style={detailStyles.routeTexts}>
                <View style={detailStyles.routeItem}>
                  <Text style={detailStyles.routeLabel}>ORIGEM</Text>
                  <Text style={detailStyles.routeAddr} numberOfLines={4}>
                    {ride.origin ?? 'Origem não disponível'}
                  </Text>
                </View>
                <View style={[detailStyles.routeItem, { marginTop: 10 }]}>
                  <Text style={detailStyles.routeLabel}>DESTINO</Text>
                  <Text style={detailStyles.routeAddr} numberOfLines={4}>
                    {ride.destination ?? 'Destino não disponível'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Fare + Status */}
            <View style={detailStyles.fareSection}>
            <View style={detailStyles.fareCol}>
              <Text style={detailStyles.fareLabel}>VALOR TOTAL</Text>
              <Text style={detailStyles.fareValue}>{formatPrice(ride.price)}</Text>
            </View>
            <View style={detailStyles.fareColEnd}>
              <Text style={detailStyles.fareLabel}>STATUS</Text>
              <View style={[detailStyles.statusPill, { backgroundColor: stSoft.bg }]}>
                <Text style={[detailStyles.statusPillText, { color: stSoft.fg }]}>{stSoft.label}</Text>
              </View>
            </View>
          </View>

          {/* Date */}
            <View style={detailStyles.dateRow}>
              <Ionicons name="time-outline" size={16} color="#9CA3AF" />
              <Text style={detailStyles.dateText}>{formatDateTime(ride.created_at)}</Text>
            </View>
          </ScrollView>
        </View>
          <DriverPhotoExpandOverlay
            uri={photoPreview}
            visible={!!photoPreview}
            onClose={() => setPhotoPreview(null)}
          />
        </View>
      </Modal>
    </>
  );
}

/* ─── Card ─── */

function RideCard({
  ride,
  onViewMore,
}: {
  ride: RideHistoryItem;
  onViewMore: () => void;
}) {
  const stSoft = getStatusSoft(ride.status);
  const vehicleLine = formatVehicleMetaLine(ride);

  return (
    <View style={cardStyles.card}>
      {/* Cabeçalho: foto + nome | preço */}
      <View style={cardStyles.cardHeader}>
        <View style={cardStyles.headerLeft}>
          {ride.driver_photo_url ? (
            <ExpoImage
              source={{ uri: ride.driver_photo_url }}
              style={cardStyles.driverPhoto}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
            />
          ) : (
            <View style={[cardStyles.driverPhoto, cardStyles.driverFallback]}>
              <Text style={cardStyles.driverFallbackText}>
                {(ride.driver_name ?? 'M')[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={cardStyles.nameBlock}>
            <Text style={cardStyles.driverName} numberOfLines={2}>
              {ride.driver_name ?? 'Motorista'}
            </Text>
          </View>
        </View>
        <Text style={cardStyles.priceHero} numberOfLines={2}>
          {formatPrice(ride.price)}
        </Text>
      </View>

      {/* Matrícula • marca modelo + status */}
      <View style={cardStyles.metaRow}>
        <Text style={cardStyles.vehicleMeta} numberOfLines={2}>
          {vehicleLine}
        </Text>
        <View style={[cardStyles.statusPill, { backgroundColor: stSoft.bg }]}>
          <Text style={[cardStyles.statusPillText, { color: stSoft.fg }]} numberOfLines={1}>
            {stSoft.label}
          </Text>
        </View>
      </View>

      {/* Origem / destino */}
      <View style={cardStyles.routeSection}>
        <View style={cardStyles.routeDots}>
          <View style={[cardStyles.dot, { backgroundColor: '#22C55E' }]} />
          <View style={cardStyles.routeLine} />
          <View style={[cardStyles.dot, { backgroundColor: '#EF4444' }]} />
        </View>
        <View style={cardStyles.routeTexts}>
          <View style={cardStyles.routeItem}>
            <Text style={cardStyles.routeLabel}>ORIGEM</Text>
            <Text style={cardStyles.routeAddr} numberOfLines={2}>
              {ride.origin ?? 'Origem não disponível'}
            </Text>
          </View>
          <View style={[cardStyles.routeItem, { marginTop: 8 }]}>
            <Text style={cardStyles.routeLabel}>DESTINO</Text>
            <Text style={cardStyles.routeAddr} numberOfLines={2}>
              {ride.destination ?? 'Destino não disponível'}
            </Text>
          </View>
        </View>
      </View>

      {/* Rodapé: data (esq.) | LIGAR + VER MAIS (agrupados à direita) */}
      <View style={cardStyles.footerRow}>
        <View style={cardStyles.footerDate}>
          <Ionicons name="time-outline" size={13} color="#94A3B8" />
          <Text
            style={cardStyles.footerDateText}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {formatDateTime(ride.created_at)}
          </Text>
        </View>
        <View style={cardStyles.footerActions}>
          <TouchableOpacity
            style={[cardStyles.callBtnPremium, !ride.driver_phone && cardStyles.callBtnDisabled]}
            onPress={() => callDriver(ride.driver_phone)}
            disabled={!ride.driver_phone}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Ligar ao motorista"
          >
            <Ionicons name="call-outline" size={15} color="#10B981" />
            <Text style={cardStyles.callBtnPremiumText}>LIGAR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={cardStyles.moreBtn}
            onPress={onViewMore}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Ver mais detalhes"
          >
            <Text style={cardStyles.moreBtnText}>VER MAIS</Text>
            <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/* ─── Screen ─── */

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    passengerHistoryRides: rides,
    passengerHistoryError,
    passengerHistoryFirstSyncDone,
    refreshPassengerHistory,
  } = useAppBootstrap();
  const [detailRide, setDetailRide] = useState<RideHistoryItem | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refreshPassengerHistory();
    }, [refreshPassengerHistory]),
  );

  const loading = !passengerHistoryFirstSyncDone && rides.length === 0;
  const error: RpcHistoryError | null =
    passengerHistoryFirstSyncDone && rides.length === 0 ? passengerHistoryError : null;

  const renderItem = useCallback(
    ({ item }: { item: RideHistoryItem }) => (
      <RideCard ride={item} onViewMore={() => setDetailRide(item)} />
    ),
    [],
  );

  const keyExtractor = useCallback((item: RideHistoryItem) => item.id, []);

  return (
    <View style={[screenStyles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={screenStyles.header}>
        <TouchableOpacity style={screenStyles.backBtn} onPress={() => router.back()}>
          <Text style={screenStyles.backGlyph}>←</Text>
        </TouchableOpacity>
        <Text style={screenStyles.title}>Histórico de viagem</Text>
      </View>

      {loading ? (
        <View style={screenStyles.center}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : error ? (
        <View style={screenStyles.center}>
          <Text style={screenStyles.errorIcon}>⚠️</Text>
          <Text style={screenStyles.errorText}>{error.message}</Text>
          {error.code ? (
            <Text style={screenStyles.errorSub}>Código: {error.code}</Text>
          ) : null}
          {error.details ? (
            <Text style={screenStyles.errorSub}>Detalhes: {error.details}</Text>
          ) : null}
        </View>
      ) : rides.length === 0 ? (
        <View style={screenStyles.center}>
          <Text style={screenStyles.emptyIcon}>🕐</Text>
          <Text style={screenStyles.emptyText}>Nenhuma viagem ainda</Text>
        </View>
      ) : (
        <>
          <Text style={screenStyles.sectionLabel}>VIAGENS RECENTES</Text>
          <FlatList
            data={rides}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={[screenStyles.list, { paddingBottom: insets.bottom + 14 }]}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}

      <RideDetailModal
        ride={detailRide}
        visible={detailRide !== null}
        onClose={() => setDetailRide(null)}
      />
    </View>
  );
}

/* ─── Screen Styles ─── */

const SCREEN = Dimensions.get('window');

const screenStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: { fontSize: 20, color: '#000', fontWeight: '700' },
  title: { flex: 1, fontSize: 20, fontWeight: '900', color: '#111827', letterSpacing: -0.3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12, opacity: 0.35 },
  emptyText: { fontSize: 14, fontWeight: '700', color: '#9CA3AF', textAlign: 'center' },
  errorIcon: { fontSize: 36, marginBottom: 12 },
  errorText: { fontSize: 14, fontWeight: '700', color: '#EF4444', textAlign: 'center' },
  errorSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  list: { paddingHorizontal: 16 },
});

/* ─── Card Styles ─── */

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EEF1F4',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.045,
    shadowRadius: 10,
    elevation: 2,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  driverPhoto: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  driverFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#CBD5E1' },
  driverFallbackText: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  nameBlock: { flex: 1, minWidth: 0, justifyContent: 'center' },
  driverName: {
    fontFamily: FONT_BODY,
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    letterSpacing: -0.2,
    lineHeight: 19,
  },
  priceHero: {
    fontFamily: FONT_BODY,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.35,
    textAlign: 'right',
    maxWidth: '44%',
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  vehicleMeta: {
    fontFamily: FONT_BODY,
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    lineHeight: 16,
    minWidth: 0,
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'center',
    maxWidth: '40%',
  },
  statusPillText: {
    fontFamily: FONT_BODY,
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  routeSection: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  routeDots: { alignItems: 'center', paddingTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  routeLine: { width: 2, flex: 1, backgroundColor: '#E8ECF0', marginVertical: 2 },
  routeTexts: { flex: 1, minWidth: 0 },
  routeItem: {},
  routeLabel: {
    fontFamily: FONT_BODY,
    fontSize: 8,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 1,
    marginBottom: 2,
  },
  routeAddr: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
    lineHeight: 16,
  },

  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 10,
  },
  footerDate: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
    paddingRight: 4,
  },
  footerDateText: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '400',
    color: '#94A3B8',
    flexShrink: 1,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  callBtnPremium: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  callBtnDisabled: { opacity: 0.38 },
  callBtnPremiumText: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
    letterSpacing: 0.2,
  },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    paddingVertical: 6,
    paddingLeft: 4,
  },
  moreBtnText: {
    fontFamily: FONT_BODY,
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.3,
  },
});

/* ─── Detail Styles ─── */

const detailStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: '90%',
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: FONT_BODY,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  closeGlyph: { fontSize: 20, color: '#94A3B8', fontWeight: '600' },

  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F1F5F9',
    marginBottom: 16,
  },
  driverPhoto: { width: 56, height: 56, borderRadius: 14, backgroundColor: '#E5E7EB' },
  driverFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#CBD5E1' },
  driverFallbackText: { fontSize: 22, fontWeight: '700', color: '#FFF' },
  driverInfo: { flex: 1 },
  driverName: {
    fontFamily: FONT_BODY,
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 2,
  },
  driverPhone: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 6,
  },
  callNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  callNowText: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
    letterSpacing: 0.3,
  },

  photoModalRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  photoCloseBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    padding: 6,
  },
  photoFull: {
    width: SCREEN.width - 40,
    height: Math.min(SCREEN.height * 0.62, 560),
  },

  vehicleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  vehicleBlock: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F1F5F9',
  },
  vehicleLabel: {
    fontFamily: FONT_BODY,
    fontSize: 9,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  vehicleValue: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },

  colorBlock: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F1F5F9',
    marginBottom: 14,
  },

  routeSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F1F5F9',
    marginBottom: 14,
  },
  routeRow: { flexDirection: 'row', gap: 12 },
  routeDots: { alignItems: 'center', paddingTop: 2 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeLine: { width: 2, flex: 1, backgroundColor: '#E8ECF0', marginVertical: 3 },
  routeTexts: { flex: 1, minWidth: 0 },
  routeItem: {},
  routeLabel: {
    fontFamily: FONT_BODY,
    fontSize: 9,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 1,
    marginBottom: 3,
  },
  routeAddr: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    fontWeight: '500',
    color: '#334155',
    lineHeight: 18,
  },

  fareSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F1F5F9',
    marginBottom: 14,
  },
  fareCol: { flex: 1, minWidth: 0, marginRight: 12 },
  fareColEnd: { alignItems: 'flex-end' },
  fareLabel: {
    fontFamily: FONT_BODY,
    fontSize: 9,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  fareValue: {
    fontFamily: FONT_BODY,
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPillText: {
    fontFamily: FONT_BODY,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  dateIcon: { fontSize: 16, opacity: 0.5 },
  dateText: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '400',
    color: '#94A3B8',
  },
});

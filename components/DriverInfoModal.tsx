import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rideService } from '@/services/rideService';
import { CachedRemoteImage } from '@/components/CachedRemoteImage';
import { DriverRatingSection } from '@/components/DriverRatingSection';

const FONT_BODY = Platform.select({
  ios: undefined,
  android: 'sans-serif',
  default: undefined,
});

type DriverInfoRow = {
  driver_id?: string | null;
  driver_photo_url?: string | null;
  driver_name?: string | null;
  rating?: number | null;
  total_rides?: number | null;
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
  vehicle_color?: string | null;
  vehicle_plate?: string | null;
  vehicle_category?: string | null;
};

function asRow(r: Record<string, unknown>): DriverInfoRow {
  const ratingRaw = r.rating;
  let rating: number | null = null;
  if (typeof ratingRaw === 'number' && Number.isFinite(ratingRaw)) rating = ratingRaw;
  else if (typeof ratingRaw === 'string') {
    const n = parseFloat(ratingRaw.replace(',', '.'));
    if (Number.isFinite(n)) rating = n;
  }
  const tripsRaw = r.total_rides;
  let total_rides: number | null = null;
  if (typeof tripsRaw === 'number' && Number.isFinite(tripsRaw)) total_rides = Math.round(tripsRaw);
  else if (typeof tripsRaw === 'string') {
    const n = parseInt(tripsRaw, 10);
    if (Number.isFinite(n)) total_rides = n;
  }
  const cat =
    r.vehicle_category != null
      ? String(r.vehicle_category)
      : r.category != null
        ? String(r.category)
        : null;
  return {
    driver_id:
      r.driver_id != null
        ? String(r.driver_id)
        : r.id != null
          ? String(r.id)
          : null,
    driver_photo_url: r.driver_photo_url != null ? String(r.driver_photo_url) : null,
    driver_name: r.driver_name != null ? String(r.driver_name) : null,
    rating,
    total_rides,
    vehicle_brand: r.vehicle_brand != null ? String(r.vehicle_brand) : null,
    vehicle_model: r.vehicle_model != null ? String(r.vehicle_model) : null,
    vehicle_color: r.vehicle_color != null ? String(r.vehicle_color) : null,
    vehicle_plate: r.vehicle_plate != null ? String(r.vehicle_plate) : null,
    vehicle_category: cat,
  };
}

function PhotoLightbox({
  visible,
  uri,
  onClose,
}: {
  visible: boolean;
  uri: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[lightboxStyles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Pressable style={lightboxStyles.backdrop} onPress={onClose} accessibilityLabel="Fechar ao tocar fora" />
        <View style={lightboxStyles.toolbar} pointerEvents="box-none">
          <TouchableOpacity
            onPress={onClose}
            style={lightboxStyles.closeFab}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Fechar foto"
          >
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>
        </View>
        <View style={lightboxStyles.imageWrap} pointerEvents="none">
          {uri.startsWith('http') ? (
            <Image
              source={{ uri }}
              style={{ width: width - 32, height: height * 0.72 }}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : null}
        </View>
        <Text style={lightboxStyles.hint}>Toque fora para fechar</Text>
      </View>
    </Modal>
  );
}

const lightboxStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  toolbar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 2,
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  closeFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontFamily: FONT_BODY,
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    paddingBottom: 12,
  },
});

export function DriverInfoModal({
  visible,
  onClose,
  rideId,
  driverId,
}: {
  visible: boolean;
  onClose: () => void;
  rideId: string;
  driverId?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<DriverInfoRow | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    setDetails(null);
    try {
      const data = await rideService.getPassengerCurrentRideDriverInfo(rideId);
      if (data && data.length > 0) {
        setDetails(asRow(data[0] as Record<string, unknown>));
      } else {
        setDetails(null);
      }
    } catch (err: unknown) {
      console.error('[driver_info] error:', err);
      const msg = err instanceof Error ? err.message.trim() : '';
      setFetchError(msg || 'Erro ao carregar informações.');
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }, [rideId]);

  useEffect(() => {
    if (!visible || !rideId) return;
    void load();
  }, [visible, rideId, load]);

  useEffect(() => {
    if (!visible) setLightbox(false);
  }, [visible]);

  const closeIfAllowed = () => onClose();

  const ratingText =
    details?.rating != null && Number.isFinite(details.rating)
      ? details.rating.toFixed(1)
      : '5.0';
  const tripsText = details?.total_rides != null ? String(details.total_rides) : '0';

  const photoUri = details?.driver_photo_url?.trim() ?? '';
  const canZoom = photoUri.startsWith('http');
  const resolvedDriverId = driverId?.trim() || details?.driver_id?.trim() || '';

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={closeIfAllowed}
        statusBarTranslucent
      >
        <View style={styles.flex}>
          <View style={styles.wrap}>
            <Pressable style={styles.backdrop} onPress={closeIfAllowed} />
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
              <View style={styles.headerRow}>
                <Text style={styles.title}>Informações do Motorista</Text>
                <TouchableOpacity
                  onPress={closeIfAllowed}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Fechar"
                >
                  <Ionicons name="close" size={26} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
              >
                {loading ? (
                  <View style={styles.loadingBlock}>
                    <View style={styles.skelPhoto} />
                    <View style={styles.skelLineLg} />
                    <View style={styles.skelLineSm} />
                    <View style={styles.skelCardFull} />
                    <View style={styles.skelGrid}>
                      <View style={styles.skelCard} />
                      <View style={styles.skelCard} />
                    </View>
                  </View>
                ) : details ? (
                  <>
                    <View style={styles.hero}>
                      <TouchableOpacity
                        style={styles.photoTouchable}
                        onPress={() => canZoom && setLightbox(true)}
                        activeOpacity={canZoom ? 0.88 : 1}
                        disabled={!canZoom}
                        accessibilityRole={canZoom ? 'imagebutton' : 'none'}
                        accessibilityLabel={canZoom ? 'Ampliar foto do motorista' : undefined}
                      >
                        <View style={styles.photoFrame}>
                          <CachedRemoteImage
                            uri={details.driver_photo_url}
                            style={styles.photo}
                            cacheScope="driver-modal"
                            fallback={
                              <View style={styles.photoPlaceholder}>
                                <Ionicons name="person" size={40} color="#CBD5E1" />
                              </View>
                            }
                          />
                        </View>
                        {canZoom ? (
                          <Text style={styles.zoomHintText}>Toque para ampliar</Text>
                        ) : null}
                      </TouchableOpacity>

                      <Text style={styles.driverName}>{details.driver_name || 'Motorista'}</Text>

                      <View style={styles.statsRow}>
                        <View style={styles.ratingPill}>
                          <Ionicons name="star" size={13} color="#D97706" />
                          <Text style={styles.ratingText}>{ratingText}</Text>
                        </View>
                        <Text style={styles.tripsText}>{tripsText} viagens</Text>
                      </View>
                    </View>

                    <DriverRatingSection
                      rideId={rideId}
                      driverId={resolvedDriverId}
                      compact
                      prompt="Como está a viagem?"
                      submitAllowed={false}
                    />

                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Veículo e matrícula</Text>
                      <View style={styles.vehicleCard}>
                        <View style={styles.vehicleRow}>
                          <View style={styles.vehicleCell}>
                            <Text style={styles.fieldLbl}>Marca</Text>
                            <Text style={styles.fieldVal} numberOfLines={1}>
                              {details.vehicle_brand?.trim() || '—'}
                            </Text>
                          </View>
                          <View style={styles.vehicleCell}>
                            <Text style={styles.fieldLbl}>Modelo</Text>
                            <Text style={styles.fieldVal} numberOfLines={1}>
                              {details.vehicle_model?.trim() || '—'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.vehicleRow}>
                          <View style={styles.vehicleCell}>
                            <Text style={styles.fieldLbl}>Cor</Text>
                            <Text style={styles.fieldVal} numberOfLines={1}>
                              {details.vehicle_color?.trim() || '—'}
                            </Text>
                          </View>
                          {details.vehicle_category?.trim() ? (
                            <View style={styles.vehicleCell}>
                              <Text style={styles.fieldLbl}>Categoria</Text>
                              <Text style={styles.fieldVal} numberOfLines={1}>
                                {details.vehicle_category.trim()}
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.vehicleCell} />
                          )}
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.plateInline}>
                          <Text style={styles.fieldLbl}>Matrícula</Text>
                          <Text style={styles.plateTextInline}>
                            {details.vehicle_plate?.trim() || '—'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.errorBlock}>
                    <View style={styles.errorIconWrap}>
                      <Ionicons name="alert-circle" size={36} color="#EF4444" />
                    </View>
                    <Text style={styles.errorTitle}>
                      {fetchError
                        ? fetchError
                        : 'Não foi possível carregar as informações do motorista.'}
                    </Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={() => void load()} activeOpacity={0.88}>
                      <Text style={styles.retryBtnText}>Tentar Novamente</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      <PhotoLightbox visible={lightbox && canZoom} uri={photoUri} onClose={() => setLightbox(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '92%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  title: {
    fontFamily: FONT_BODY,
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    flex: 1,
    paddingRight: 12,
    letterSpacing: -0.3,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 20,
  },
  loadingBlock: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 14,
  },
  skelPhoto: {
    width: 104,
    height: 104,
    borderRadius: 36,
    backgroundColor: '#F1F5F9',
  },
  skelLineLg: {
    height: 24,
    width: '55%',
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  skelLineSm: {
    height: 14,
    width: '36%',
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  skelCardFull: {
    width: '100%',
    height: 120,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    marginTop: 8,
  },
  skelGrid: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  skelCard: {
    flex: 1,
    height: 72,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
  },
  hero: {
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 4,
  },
  photoTouchable: {
    alignItems: 'center',
  },
  photoFrame: {
    width: 88,
    height: 88,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    borderWidth: 3,
    borderColor: '#FFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 14,
      },
      android: { elevation: 5 },
    }),
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  zoomHintText: {
    fontFamily: FONT_BODY,
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 4,
  },
  driverName: {
    fontFamily: FONT_BODY,
    fontSize: 21,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 8,
    letterSpacing: -0.4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 6,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FEF3C7',
  },
  ratingText: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    fontWeight: '900',
    color: '#D97706',
  },
  tripsText: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
  section: {
    marginTop: 12,
  },
  sectionTitle: {
    fontFamily: FONT_BODY,
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  vehicleCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F1F5F9',
  },
  vehicleRow: {
    flexDirection: 'row',
    gap: 14,
  },
  vehicleCell: {
    flex: 1,
    minWidth: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginVertical: 10,
  },
  fieldLbl: {
    fontFamily: FONT_BODY,
    fontSize: 9,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  fieldVal: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 18,
  },
  plateInline: {
    gap: 4,
  },
  plateTextInline: {
    fontFamily: FONT_BODY,
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 3,
  },
  errorBlock: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 12,
    gap: 16,
  },
  errorIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 21,
  },
  retryBtn: {
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
});

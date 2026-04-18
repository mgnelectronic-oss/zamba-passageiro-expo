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

const FONT_BODY = Platform.select({
  ios: undefined,
  android: 'sans-serif',
  default: undefined,
});

type DriverInfoRow = {
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
}: {
  visible: boolean;
  onClose: () => void;
  rideId: string;
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
                                <Ionicons name="person" size={48} color="#CBD5E1" />
                              </View>
                            }
                          />
                        </View>
                        {canZoom ? (
                          <View style={styles.zoomHint}>
                            <Ionicons name="expand-outline" size={14} color="#64748B" />
                            <Text style={styles.zoomHintText}>Toque para ampliar</Text>
                          </View>
                        ) : null}
                      </TouchableOpacity>

                      <Text style={styles.driverName}>{details.driver_name || 'Motorista'}</Text>

                      <View style={styles.statsRow}>
                        <View style={styles.ratingPill}>
                          <Ionicons name="star" size={14} color="#D97706" />
                          <Text style={styles.ratingText}>{ratingText}</Text>
                        </View>
                        <Text style={styles.tripsText}>• {tripsText} viagens</Text>
                      </View>
                    </View>

                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Veículo</Text>
                      <View style={styles.vehicleCard}>
                        <View style={styles.vehicleRow}>
                          <View style={styles.vehicleCell}>
                            <Text style={styles.fieldLbl}>Marca</Text>
                            <Text style={styles.fieldVal} numberOfLines={2}>
                              {details.vehicle_brand?.trim() || '—'}
                            </Text>
                          </View>
                          <View style={styles.vehicleCell}>
                            <Text style={styles.fieldLbl}>Modelo</Text>
                            <Text style={styles.fieldVal} numberOfLines={2}>
                              {details.vehicle_model?.trim() || '—'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.vehicleFullRow}>
                          <Text style={styles.fieldLbl}>Cor</Text>
                          <Text style={styles.fieldVal}>{details.vehicle_color?.trim() || '—'}</Text>
                        </View>
                        {details.vehicle_category?.trim() ? (
                          <>
                            <View style={styles.divider} />
                            <View style={styles.vehicleFullRow}>
                              <Text style={styles.fieldLbl}>Categoria</Text>
                              <Text style={styles.fieldVal}>{details.vehicle_category.trim()}</Text>
                            </View>
                          </>
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Matrícula</Text>
                      <View style={styles.plateCard}>
                        <Text style={styles.plateText}>{details.vehicle_plate?.trim() || '—'}</Text>
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
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  title: {
    fontFamily: FONT_BODY,
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    flex: 1,
    paddingRight: 12,
    letterSpacing: -0.3,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 32,
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
    paddingTop: 12,
    paddingBottom: 8,
  },
  photoTouchable: {
    alignItems: 'center',
  },
  photoFrame: {
    width: 104,
    height: 104,
    borderRadius: 36,
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
  zoomHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  zoomHintText: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  driverName: {
    fontFamily: FONT_BODY,
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 16,
    letterSpacing: -0.5,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 10,
    gap: 8,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
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
    marginTop: 22,
  },
  sectionTitle: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  vehicleCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 22,
    padding: 18,
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
  vehicleFullRow: {
    gap: 6,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginVertical: 14,
  },
  fieldLbl: {
    fontFamily: FONT_BODY,
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  fieldVal: {
    fontFamily: FONT_BODY,
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 22,
  },
  plateCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plateText: {
    fontFamily: FONT_BODY,
    fontSize: 18,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 4,
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  searchPredictions,
  resolvePredictionToDestination,
  type PlacePrediction,
} from '@/services/googlePlaces';
import { DestinationMapPickerModal } from '@/components/DestinationMapPickerModal';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import type { PassengerCoords } from '@/hooks/usePassengerLocation';

/** Recolha escolhida manualmente (formato padrão). Não substitui o GPS no contexto global. */
export type SelectedPickupLocation = {
  latitude: number;
  longitude: number;
  address: string;
  name?: string;
  placeId?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  currentLocation: PassengerCoords | null;
  currentAddress: string | null;
  selectedPickupLocation: SelectedPickupLocation | null;
  /** null = voltar a usar a localização GPS atual. */
  onSelectPickupLocation: (location: SelectedPickupLocation | null) => void;
};

const C = {
  bg: '#FFFFFF',
  text: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  fieldBg: '#F3F4F6',
  emerald: '#10B981',
  emerald600: '#059669',
  emerald50: '#ECFDF5',
  blue: '#3B82F6',
  chipBg: '#F3F4F6',
  danger: '#DC2626',
};

const SEARCH_DEBOUNCE_MS = 180;
const FALLBACK_CENTER = { lat: -25.9692, lng: 32.5732 };

const formatDistance = (meters?: number) => {
  if (meters === undefined) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
};

export function PickupLocationPicker({
  visible,
  onClose,
  currentLocation,
  currentAddress,
  selectedPickupLocation,
  onSelectPickupLocation,
}: Props) {
  const insets = useSafeAreaInsets();
  const { isOffline } = useNetworkStatus();

  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);

  /** Centro da pesquisa: recolha já escolhida > GPS > fallback. */
  const searchCenter = useMemo(() => {
    if (selectedPickupLocation) {
      return { lat: selectedPickupLocation.latitude, lng: selectedPickupLocation.longitude };
    }
    if (currentLocation) {
      return { lat: currentLocation.latitude, lng: currentLocation.longitude };
    }
    return FALLBACK_CENTER;
  }, [selectedPickupLocation, currentLocation]);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setPredictions([]);
    setIsSearching(false);
    setResolveError(null);
  }, [visible]);

  useEffect(() => {
    if (!visible || isOffline) return;
    const input = query.trim();
    const seq = ++searchSeqRef.current;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (!input) {
      searchSeqRef.current += 1;
      setPredictions([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const ac = new AbortController();

    debounceRef.current = setTimeout(() => {
      void (async () => {
        if (searchSeqRef.current !== seq) return;
        try {
          const items = await searchPredictions(input, searchCenter, ac.signal);
          if (searchSeqRef.current !== seq) return;
          setPredictions(items);
        } catch {
          if (ac.signal.aborted || searchSeqRef.current !== seq) return;
          setPredictions([]);
        } finally {
          if (searchSeqRef.current === seq) setIsSearching(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      ac.abort();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [visible, query, searchCenter, isOffline]);

  const handleUseGps = useCallback(() => {
    onSelectPickupLocation(null);
    onClose();
  }, [onSelectPickupLocation, onClose]);

  const handlePredictionPress = useCallback(
    async (prediction: PlacePrediction) => {
      setIsResolving(true);
      setResolveError(null);
      try {
        const resolved = await resolvePredictionToDestination(prediction);
        onSelectPickupLocation({
          latitude: resolved.lat,
          longitude: resolved.lng,
          address: resolved.address,
          name: resolved.place_name,
          placeId: resolved.place_id,
        });
        onClose();
      } catch {
        setResolveError('Não foi possível selecionar este local. Tente novamente.');
      } finally {
        setIsResolving(false);
      }
    },
    [onSelectPickupLocation, onClose],
  );

  const queryTrimmed = query.trim();
  const queryActive = queryTrimmed.length > 0;
  const gpsAvailable = currentLocation !== null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      onShow={() => {
        setTimeout(() => inputRef.current?.focus(), Platform.OS === 'android' ? 120 : 0);
      }}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.sheet, { paddingTop: insets.top + 8 }]}>
            {/* ── Campo de pesquisa + Mapa ── */}
            <View style={styles.headerRow}>
              <View style={styles.searchField}>
                <View style={styles.searchIconBox}>
                  <Ionicons name="person" size={16} color="#FFFFFF" />
                </View>
                <View style={styles.searchCol}>
                  <Text style={styles.searchKicker}>Recolha</Text>
                  <TextInput
                    ref={inputRef}
                    style={styles.searchInput}
                    placeholder="Pesquisar ponto de recolha"
                    placeholderTextColor={C.textMuted}
                    value={query}
                    onChangeText={setQuery}
                    autoFocus
                    autoCorrect={false}
                    autoCapitalize="sentences"
                    returnKeyType="search"
                  />
                </View>
                <TouchableOpacity
                  onPress={() => {
                    if (queryActive) {
                      setQuery('');
                      inputRef.current?.focus();
                    } else {
                      onClose();
                    }
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={queryActive ? 'Limpar pesquisa' : 'Fechar'}
                >
                  <Ionicons name="close" size={22} color={C.textSecondary} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.mapBtn}
                onPress={() => setMapOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Escolher recolha no mapa"
              >
                <Text style={styles.mapBtnText}>Mapa</Text>
              </TouchableOpacity>
            </View>

            {resolveError ? <Text style={styles.resolveError}>{resolveError}</Text> : null}

            <ScrollView
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            >
              {/* ── Opção fixa: GPS ── */}
              <TouchableOpacity
                style={styles.gpsRow}
                onPress={handleUseGps}
                disabled={!gpsAvailable}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Usar a tua localização"
              >
                <View style={styles.gpsIconBox}>
                  <Ionicons
                    name="navigate"
                    size={17}
                    color={gpsAvailable ? C.text : C.textMuted}
                  />
                </View>
                <View style={styles.gpsCol}>
                  <Text style={[styles.gpsTitle, !gpsAvailable && styles.gpsTitleDisabled]}>
                    {gpsAvailable ? 'A tua localização' : 'Localização indisponível'}
                  </Text>
                  <Text style={styles.gpsSub} numberOfLines={1}>
                    {gpsAvailable
                      ? (currentAddress ?? 'Recolha na tua localização de GPS')
                      : 'Não foi possível obter a sua localização atual.'}
                  </Text>
                </View>
                {!selectedPickupLocation && gpsAvailable ? (
                  <Ionicons name="checkmark-circle" size={20} color={C.emerald600} />
                ) : null}
              </TouchableOpacity>

              {/* ── Estado offline ── */}
              {isOffline && queryActive ? (
                <View style={styles.emptyBlock}>
                  <Ionicons name="cloud-offline-outline" size={32} color={C.border} />
                  <Text style={styles.emptyTitle}>Sem conexão com a internet</Text>
                  <Text style={styles.emptyHint}>Verifique a sua internet para pesquisar locais.</Text>
                </View>
              ) : null}

              {/* ── Resultados ── */}
              {!isOffline && queryActive ? (
                <View style={styles.resultBlock}>
                  {isSearching && predictions.length === 0 ? (
                    <View style={styles.searchingRow}>
                      <ActivityIndicator size="small" color={C.emerald} />
                      <Text style={styles.searchingHint}>A procurar…</Text>
                    </View>
                  ) : null}

                  {!isSearching && predictions.length === 0 ? (
                    <View style={styles.emptyBlock}>
                      <Ionicons name="search-outline" size={32} color={C.border} />
                      <Text style={styles.emptyTitle}>Nenhum local encontrado</Text>
                      <Text style={styles.emptyHint}>
                        Tente pesquisar por outro nome ou endereço.
                      </Text>
                    </View>
                  ) : null}

                  {predictions.map((item, idx) => {
                    const main =
                      item.structured_formatting?.main_text ?? item.name ?? item.description ?? '';
                    const sub = item.structured_formatting?.secondary_text ?? item.address ?? '';
                    const dist = formatDistance(item.distance_meters);
                    const isLast = idx === predictions.length - 1;
                    return (
                      <TouchableOpacity
                        key={`${item.place_id}-${idx}`}
                        style={styles.predRow}
                        onPress={() => void handlePredictionPress(item)}
                        disabled={isResolving}
                        activeOpacity={0.7}
                      >
                        <View style={styles.predIconBox}>
                          <Ionicons name="location-sharp" size={15} color={C.textMuted} />
                        </View>
                        <View style={[styles.predMid, isLast && styles.predMidLast]}>
                          <Text style={styles.predMain} numberOfLines={2}>
                            {main}
                          </Text>
                          {sub ? (
                            <Text style={styles.predSub} numberOfLines={2}>
                              {sub}
                            </Text>
                          ) : null}
                        </View>
                        {dist ? <Text style={styles.predDist}>{dist}</Text> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </ScrollView>

            {isResolving ? (
              <View style={styles.resolvingOverlay} pointerEvents="auto">
                <ActivityIndicator size="large" color={C.emerald} />
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>

      <DestinationMapPickerModal
        visible={mapOpen}
        onClose={() => setMapOpen(false)}
        initialLat={searchCenter.lat}
        initialLng={searchCenter.lng}
        confirmLabel="Confirmar recolha"
        onPick={(picked) => {
          setMapOpen(false);
          onSelectPickupLocation({
            latitude: picked.lat,
            longitude: picked.lng,
            address: picked.address,
            name: picked.place_name,
            placeId: picked.place_id,
          });
          onClose();
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  kav: {
    flex: 1,
  },
  sheet: {
    flex: 1,
    marginTop: 0,
    backgroundColor: C.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.fieldBg,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  searchIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchCol: {
    flex: 1,
    minWidth: 0,
  },
  searchKicker: {
    fontSize: 10,
    fontWeight: '700',
    color: C.textMuted,
    letterSpacing: 0.4,
  },
  searchInput: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
    padding: 0,
    margin: 0,
  },
  mapBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: C.chipBg,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  mapBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
  },

  resolveError: {
    fontSize: 12,
    fontWeight: '600',
    color: C.danger,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },

  list: {
    flex: 1,
  },

  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  gpsIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsCol: {
    flex: 1,
    minWidth: 0,
  },
  gpsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
  },
  gpsTitleDisabled: {
    color: C.textMuted,
  },
  gpsSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: C.textSecondary,
  },

  resultBlock: {
    paddingTop: 4,
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 6,
  },
  searchingHint: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textSecondary,
  },
  emptyBlock: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 36,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    fontWeight: '500',
    color: C.textSecondary,
    textAlign: 'center',
  },

  predRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 6,
  },
  predIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  predMid: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  predMidLast: {
    borderBottomWidth: 0,
  },
  predMain: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  predSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: C.textSecondary,
  },
  predDist: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textMuted,
    marginLeft: 4,
  },

  resolvingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  type TextStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DestinationMapPickerModal } from '@/components/DestinationMapPickerModal';
import {
  type PlacePrediction,
  resolvePredictionToDestination,
  searchPredictions,
  type SelectedDestination,
} from '@/services/googlePlaces';
import { reverseGeocode } from '@/services/googleGeocoding';
import { addRecentDestination as addLocalRecent } from '@/services/recentDestinations';
import { setSelectedDestination, setSelectedPickup } from '@/services/searchFlowStore';
import { authService } from '@/services/authService';
import { addressService } from '@/services/addressService';
import { useAppBootstrap } from '@/contexts/AppBootstrapContext';
import { VerificationAccountCard } from '@/components/VerificationAccountCard';
import { getPrimedInitialRegion } from '@/services/mapLocationMemory';
import {
  loadSearchHistory,
  pushSearchHistory,
  type SearchHistoryEntry,
} from '@/services/searchHistoryStorage';

const COLORS = {
  white: '#FFFFFF',
  pageBg: '#FFFFFF',
  surface: '#FFFFFF',
  slate50: '#F9FAFB',
  slate100: '#F3F4F6',
  slate200: '#E5E7EB',
  slate400: '#9CA3AF',
  slate500: '#6B7280',
  slate900: '#111827',
  blue500: '#3B82F6',
  blue50: '#EFF6FF',
  emerald500: '#10B981',
  emerald600: '#059669',
  emerald50: '#ECFDF5',
  border: '#F3F4F6',
  borderStrong: '#E5E7EB',
};

const SEARCH_DEBOUNCE_MS = 180;

type PickupState = { lat: number; lng: number; address: string };

function initialPickupFromMemory(): PickupState {
  const r = getPrimedInitialRegion();
  return {
    lat: r.latitude,
    lng: r.longitude,
    address: 'A obter localização...',
  };
}

const formatDistance = (meters?: number) => {
  if (meters === undefined) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
};

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat);
  const dLng = toR(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Destaca ocorrências do termo no nome (verde, só texto). */
function HighlightedPlaceName({
  text,
  query,
  baseStyle,
  numberOfLines,
}: {
  text: string;
  query: string;
  baseStyle: TextStyle;
  numberOfLines?: number;
}) {
  const q = query.trim();
  if (!q) {
    return (
      <Text style={baseStyle} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }
  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let start = 0;
  let idx = lower.indexOf(qLower, start);
  let key = 0;
  while (idx !== -1) {
    if (idx > start) {
      parts.push(
        <Text key={`t-${key++}`} style={baseStyle}>
          {text.slice(start, idx)}
        </Text>,
      );
    }
    parts.push(
      <Text key={`h-${key++}`} style={[baseStyle, styles.highlightGreen]}>
        {text.slice(idx, idx + q.length)}
      </Text>,
    );
    start = idx + q.length;
    idx = lower.indexOf(qLower, start);
  }
  if (start < text.length) {
    parts.push(
      <Text key={`t-${key++}`} style={baseStyle}>
        {text.slice(start)}
      </Text>,
    );
  }
  if (parts.length === 0) {
    return (
      <Text style={baseStyle} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }
  return (
    <Text style={baseStyle} numberOfLines={numberOfLines}>
      {parts}
    </Text>
  );
}

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { initialProfile } = useAppBootstrap();
  const [query, setQuery] = useState('');
  const [pickup, setPickup] = useState<PickupState>(initialPickupFromMemory);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<SearchHistoryEntry[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);

  const refreshHistory = useCallback(() => {
    void loadSearchHistory().then(setHistoryItems);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshHistory();
    }, [refreshHistory]),
  );

  useEffect(() => {
    authService.getCurrentUser().then((u) => {
      if (!u) return;
      setUserId(u.id);
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadCurrentLocation() {
      try {
        setIsLocating(true);
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!mounted) return;
          setLocationError('Permissão de localização negada.');
          setPickup((prev) => ({ ...prev, address: 'Localização actual' }));
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        if (!mounted) return;
        setPickup({ lat, lng, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
        setIsLocating(false);

        reverseGeocode(lat, lng)
          .then((addr) => {
            if (mounted) setPickup((prev) => ({ ...prev, address: addr }));
          })
          .catch(() => {});
      } catch {
        if (!mounted) return;
        setLocationError('Não foi possível obter a localização actual.');
        setPickup((prev) => ({ ...prev, address: 'Localização actual' }));
      } finally {
        if (mounted) setIsLocating(false);
      }
    }

    loadCurrentLocation();
    return () => {
      mounted = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
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
          const items = await searchPredictions(
            input,
            { lat: pickup.lat, lng: pickup.lng },
            ac.signal,
          );
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
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      ac.abort();
    };
  }, [query, pickup.lat, pickup.lng]);

  const suggestions = useMemo(() => predictions, [predictions]);

  const isPlaceholder = (addr: string) =>
    !addr || addr === 'A obter localização...' || addr === 'A obter localização…';

  const applySelection = (destination: SelectedDestination) => {
    const pickupAddress = isPlaceholder(pickup.address)
      ? `${pickup.lat.toFixed(4)}, ${pickup.lng.toFixed(4)}`
      : pickup.address;

    setSelectedPickup({ lat: pickup.lat, lng: pickup.lng, address: pickupAddress });
    setSelectedDestination(destination);
    addLocalRecent(destination);
    void pushSearchHistory({
      place_id: destination.place_id,
      place_name: destination.place_name,
      address: destination.address,
      lat: destination.lat,
      lng: destination.lng,
    }).then(setHistoryItems);

    if (userId) {
      addressService
        .addRecentDestination({
          passenger_id: userId,
          place_name: destination.place_name,
          full_address: destination.address,
          lat: destination.lat,
          lng: destination.lng,
        })
        .catch(() => {});
    }

    router.push({
      pathname: '/map' as any,
      params: {
        originLat: String(pickup.lat),
        originLng: String(pickup.lng),
        originAddress: pickupAddress,
        destLat: String(destination.lat),
        destLng: String(destination.lng),
        destAddress: destination.address,
        destName: destination.place_name,
      },
    });
  };

  const handlePredictionPress = async (prediction: PlacePrediction) => {
    try {
      const destination = await resolvePredictionToDestination(prediction);
      applySelection(destination);
    } catch (error) {
      Alert.alert('Erro', error instanceof Error ? error.message : 'Erro ao selecionar destino.');
    }
  };

  const handleHistoryPress = (entry: SearchHistoryEntry) => {
    applySelection({
      place_id: entry.id.startsWith('ll_') ? undefined : entry.id,
      place_name: entry.place_name,
      address: entry.address,
      lat: entry.lat,
      lng: entry.lng,
    });
  };

  const queryTrimmed = query.trim();
  const queryActive = queryTrimmed.length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.safeTop, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.slate900} />
          </TouchableOpacity>
          <Text style={styles.title}>Para onde vai?</Text>
        </View>

        <ScrollView
          style={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        >
          <VerificationAccountCard
            profile={initialProfile}
            onPress={() => router.push('/verification' as any)}
          />

          <View style={styles.pickupBox}>
            <View style={styles.pickupDot} />
            <View style={styles.pickupCol}>
              <Text style={styles.pickupKicker}>Localização actual</Text>
              <Text style={styles.pickupAddr} numberOfLines={2}>
                {pickup.address}
              </Text>
              {locationError ? <Text style={styles.locationError}>{locationError}</Text> : null}
            </View>
            {isLocating ? <ActivityIndicator size="small" color={COLORS.blue500} /> : null}
          </View>

          <View style={styles.destBox}>
            <View style={styles.destAccent} />
            <View style={styles.destDot} />
            <TextInput
              style={styles.input}
              placeholder="Destino"
              placeholderTextColor={COLORS.slate400}
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCorrect={false}
              autoCapitalize="sentences"
              returnKeyType="search"
            />
            <TouchableOpacity
              style={styles.destMapBtn}
              onPress={() => setMapPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Escolher destino no mapa"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="map" size={20} color={COLORS.emerald600} />
            </TouchableOpacity>
            {isSearching ? (
              <ActivityIndicator size="small" color={COLORS.emerald500} style={styles.inlineSpinner} />
            ) : null}
          </View>

          {queryActive ? (
            <View style={styles.resultBlock}>
              {isSearching && suggestions.length === 0 ? (
                <View style={styles.searchingRow}>
                  <ActivityIndicator size="small" color={COLORS.emerald500} />
                  <Text style={styles.searchingHint}>A procurar…</Text>
                </View>
              ) : null}
              {!isSearching && suggestions.length === 0 ? (
                <View style={styles.emptyBlock}>
                  <Ionicons name="search-outline" size={32} color={COLORS.slate200} />
                  <Text style={styles.emptyTitle}>Nenhum resultado encontrado.</Text>
                  <Text style={styles.emptyHint}>Use o mapa para marcar o local.</Text>
                </View>
              ) : null}
              {suggestions.length > 0
                ? suggestions.map((item, idx) => {
                  const main =
                    item.structured_formatting?.main_text ?? item.name ?? item.description ?? '';
                  const sub = item.structured_formatting?.secondary_text ?? item.address ?? '';
                  const dist = formatDistance(item.distance_meters);
                  const isLast = idx === suggestions.length - 1;
                  return (
                    <TouchableOpacity
                      key={`${item.place_id}-${idx}`}
                      style={styles.predRow}
                      onPress={() => handlePredictionPress(item)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.predIconBox}>
                        <Ionicons name="location-sharp" size={15} color={COLORS.slate400} />
                      </View>
                      <View style={[styles.predMid, isLast && styles.predMidLast]}>
                        <HighlightedPlaceName
                          text={main}
                          query={queryTrimmed}
                          baseStyle={styles.predMain}
                          numberOfLines={2}
                        />
                        {sub ? (
                          <Text style={styles.predSub} numberOfLines={2}>
                            {sub}
                          </Text>
                        ) : null}
                      </View>
                      <View
                        style={[styles.distChip, dist ? styles.distChipEmerald : styles.distChipMuted]}
                      >
                        <Text
                          style={[
                            styles.distChipText,
                            dist ? styles.distChipTextEmerald : styles.distChipTextMuted,
                          ]}
                        >
                          {dist ?? '—'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                  })
                : null}
            </View>
          ) : (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionKicker}>Pesquisas recentes</Text>
              <View style={styles.recentsWrap}>
                {historyItems.length === 0 ? (
                  <Text style={styles.emptyRecents}>Ainda não há pesquisas recentes</Text>
                ) : (
                  historyItems.map((item, idx) => {
                    const distM = haversineM(pickup.lat, pickup.lng, item.lat, item.lng);
                    const distLabel = formatDistance(distM) ?? '—';
                    const primary =
                      item.place_name && item.place_name.trim() !== ''
                        ? item.place_name
                        : item.address;
                    const isLast = idx === historyItems.length - 1;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.predRow}
                        onPress={() => handleHistoryPress(item)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.historyIconBox}>
                          <Ionicons name="time-outline" size={15} color={COLORS.slate400} />
                        </View>
                        <View style={[styles.predMid, isLast && styles.predMidLast]}>
                          <Text style={styles.predMain} numberOfLines={2}>
                            {primary}
                          </Text>
                          <Text style={styles.predSub} numberOfLines={2}>
                            {item.address}
                          </Text>
                        </View>
                        <View style={[styles.distChip, styles.distChipBlue]}>
                          <Text style={[styles.distChipText, styles.distChipTextBlue]}>{distLabel}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </View>

      <DestinationMapPickerModal
        visible={mapPickerOpen}
        onClose={() => setMapPickerOpen(false)}
        initialLat={pickup.lat}
        initialLng={pickup.lng}
        onPick={(dest) => {
          setMapPickerOpen(false);
          setQuery(dest.place_name || dest.address);
          applySelection(dest);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  highlightGreen: {
    color: COLORS.emerald600,
    fontWeight: '700',
  },
  root: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },
  safeTop: {
    flex: 1,
    backgroundColor: COLORS.pageBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderStrong,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.slate50,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.slate900,
    letterSpacing: -0.4,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },

  pickupBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: COLORS.slate50,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    marginBottom: 10,
  },
  pickupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.blue500,
    marginTop: 3,
  },
  pickupCol: { flex: 1, minWidth: 0 },
  pickupKicker: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.slate400,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: 3,
  },
  pickupAddr: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.slate500,
    lineHeight: 18,
  },
  locationError: {
    marginTop: 6,
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '600',
  },

  destBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8ECF0',
    backgroundColor: COLORS.white,
    marginBottom: 12,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  destAccent: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: COLORS.emerald500,
  },
  destDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.slate900,
    marginLeft: 4,
  },
  input: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.slate900,
    padding: 0,
    minHeight: 24,
  },
  destMapBtn: {
    padding: 6,
    borderRadius: 10,
  },
  inlineSpinner: { marginLeft: 2 },

  resultBlock: {
    marginTop: 2,
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  searchingHint: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.slate400,
  },
  predRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 2,
    minHeight: 48,
  },
  predIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.slate100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.slate100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  predMid: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 6,
    paddingTop: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  predMidLast: {
    borderBottomWidth: 0,
    paddingBottom: 2,
  },
  predMain: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.slate900,
    lineHeight: 20,
    marginBottom: 1,
  },
  predSub: {
    fontSize: 11,
    fontWeight: '400',
    color: COLORS.slate400,
    lineHeight: 14,
  },
  distChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  distChipEmerald: {
    backgroundColor: COLORS.emerald50,
  },
  distChipMuted: {
    backgroundColor: COLORS.slate100,
  },
  distChipBlue: {
    backgroundColor: COLORS.blue50,
  },
  distChipText: {
    fontSize: 9,
    fontWeight: '800',
  },
  distChipTextEmerald: {
    color: COLORS.emerald600,
  },
  distChipTextMuted: {
    color: COLORS.slate400,
  },
  distChipTextBlue: {
    color: COLORS.blue500,
  },

  emptyBlock: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 12,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.slate400,
  },
  emptyHint: {
    fontSize: 12,
    color: COLORS.slate400,
    textAlign: 'center',
  },

  sectionBlock: {
    marginTop: 2,
  },
  sectionKicker: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.slate400,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  recentsWrap: {},
  emptyRecents: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.slate400,
    textAlign: 'center',
    paddingVertical: 14,
  },
});

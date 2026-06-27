import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
  InteractionManager,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  getSelectedDestination,
  getSelectedPickup,
  setSelectedPickup,
  buildTripDraft,
  getTripDraft,
  saveTripDraft,
  type SelectedPickup,
} from '@/services/searchFlowStore';
import { assertDraftRestoration, logCategoryRetry } from '@/lib/categoryRetry';
import type { SelectedDestination } from '@/services/googlePlaces';
import { GOOGLE_MAPS_API_KEY } from '@/lib/env';
import { rideService, type VehicleCategory } from '@/services/rideService';
import { reverseGeocode } from '@/services/googleGeocoding';
import { fitMapCamera } from '@/utils/mapCamera';
import { ANDROID_MAPVIEW_TILE_PROPS } from '@/lib/mapViewAndroid';
import { ROUTE_POLYLINE_COLOR } from '@/lib/tripMapTheme';
import { MAP_STYLE_CLEAN } from '@/lib/mapStyleClean';
import { mapCacheService } from '@/services/cache/mapCacheService';
import { getPrimedInitialRegion } from '@/services/mapLocationMemory';
import { decodePolyline, downsampleRouteCoordinates } from '@/utils/polylineDecode';

/** Mapa nativo Android: chave do SDK = `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` em build (`app.config.ts`). */
const { width: SCREEN_W } = Dimensions.get('window');

const FALLBACK_MAP_CENTER = { lat: -25.9692, lng: 32.5732 };

function sanitizeLatLng(lat: number, lng: number) {
  return {
    latitude: Number.isFinite(lat) ? lat : FALLBACK_MAP_CENTER.lat,
    longitude: Number.isFinite(lng) ? lng : FALLBACK_MAP_CENTER.lng,
  };
}

const ROUTE_GREEN = ROUTE_POLYLINE_COLOR;

const C = {
  bg: '#F7F8FA',
  surface: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  emerald: '#10B981',
  emeraldDark: '#059669',
  emeraldDeep: '#047857',
  emeraldBg: '#ECFDF5',
  emeraldBorder: '#D1FAE5',
};

const CATEGORY_META: Record<string, {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  bgColor: string;
  iconColor: string;
}> = {
  economico: { label: 'Económico', icon: 'taxi',          color: '#D97706', bgColor: '#FFFBEB', iconColor: '#F59E0B' },
  conforto:  { label: 'Conforto',  icon: 'car-sports',    color: '#1E293B', bgColor: '#F1F5F9', iconColor: '#0F172A' },
  moto:      { label: 'Moto',      icon: 'motorbike',     color: '#EA580C', bgColor: '#FFF7ED', iconColor: '#F97316' },
  txopela:   { label: 'Txopela',   icon: 'rickshaw',      color: '#B45309', bgColor: '#FEF3C7', iconColor: '#D97706' },
};

const FALLBACK_META = {
  label: 'Outro',
  icon: 'car-side' as keyof typeof MaterialCommunityIcons.glyphMap,
  color: '#6B7280', bgColor: '#F9FAFB', iconColor: '#6B7280',
};

interface CategoryDisplay {
  id: string;
  slug: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  bgColor: string;
  iconColor: string;
  price: number | null;
}

function toCategoryDisplay(cat: VehicleCategory, price: number | null): CategoryDisplay {
  const slug = cat.vehicle_category || cat.id;
  const meta = CATEGORY_META[slug] ?? FALLBACK_META;
  return { id: cat.id, slug, label: meta.label, icon: meta.icon, color: meta.color, bgColor: meta.bgColor, iconColor: meta.iconColor, price };
}

function toNumber(value: string | string[] | undefined) {
  if (Array.isArray(value)) return Number(value[0]);
  return Number(value);
}

function toText(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

interface DirectionsResult {
  coordinates: { latitude: number; longitude: number }[];
  distanceKm: number;
  durationMin: number;
}

async function fetchDirectionsRoute(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
): Promise<DirectionsResult | null> {
  const cached = await mapCacheService.getDirections(origin.lat, origin.lng, dest.lat, dest.lng);
  if (cached && cached.coordinates.length >= 2) {
    return {
      coordinates: downsampleRouteCoordinates(cached.coordinates),
      distanceKm: cached.distanceKm,
      durationMin: cached.durationMin,
    };
  }

  const url =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${origin.lat},${origin.lng}` +
    `&destination=${dest.lat},${dest.lng}` +
    `&mode=driving` +
    `&key=${GOOGLE_MAPS_API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.routes?.length > 0) {
    const leg = data.routes[0].legs[0];
    const dense = decodePolyline(data.routes[0].overview_polyline.points);
    const coordinates = downsampleRouteCoordinates(dense);
    const result = {
      coordinates,
      distanceKm: leg?.distance?.value ? leg.distance.value / 1000 : 0,
      durationMin: leg?.duration?.value ? Math.round(leg.duration.value / 60) : 0,
    };
    if (result.coordinates.length >= 2) {
      void mapCacheService.setDirections(origin.lat, origin.lng, dest.lat, dest.lng, {
        coordinates: dense,
        distanceKm: result.distanceKm,
        durationMin: result.durationMin,
      });
    }
    return result;
  }
  return null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function MapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const mapRef = useRef<MapView | null>(null);

  const [categories, setCategories] = useState<CategoryDisplay[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryDisplay | null>(null);
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [routeDistance, setRouteDistance] = useState({ distanceKm: 0, durationMin: 0 });
  const [mapReady, setMapReady] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<{ latitude: number; longitude: number }[]>([]);
  const [polylineKey, setPolylineKey] = useState(0);
  const [panelHeight, setPanelHeight] = useState(0);

  const pickupFromStore = getSelectedPickup();
  const destinationFromStore = getSelectedDestination();
  const tripDraft = getTripDraft();
  const isCategoryRetry = toText(params.retryCategory) === '1';
  const [pickupAddress, setPickupAddress] = useState('');

  const pickup: SelectedPickup = useMemo(() => {
    const lat = toNumber(params.originLat);
    const lng = toNumber(params.originLng);
    const address = toText(params.originAddress);

    if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat !== 0) {
      const displayAddr = pickupAddress || (address.trim() !== '' ? address : `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      return { lat, lng, address: displayAddr };
    }

    if (tripDraft) {
      return { ...tripDraft.pickup, address: pickupAddress || tripDraft.pickup.address };
    }

    if (pickupFromStore) {
      return { ...pickupFromStore, address: pickupAddress || pickupFromStore.address };
    }

    const primed = getPrimedInitialRegion();
    return {
      lat: primed.latitude,
      lng: primed.longitude,
      address: pickupAddress || 'Localização Actual',
    };
  }, [params.originLat, params.originLng, params.originAddress, tripDraft, pickupFromStore, pickupAddress]);

  useEffect(() => {
    const isPlaceholder = (a: string) =>
      !a || a === 'A obter localização…' || a === 'A obter localização...' || /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(a);

    const draft = getTripDraft();
    const paramAddr = toText(params.originAddress);
    const draftOrStoreAddr = draft?.pickup.address || pickupFromStore?.address || '';
    const currentAddr = paramAddr || draftOrStoreAddr;

    if (draft || paramAddr) {
      if (!isPlaceholder(currentAddr)) {
        setPickupAddress(currentAddr);
      }
      return;
    }

    if (!isPlaceholder(currentAddr)) {
      setPickupAddress(currentAddr);
      return;
    }

    const lat = toNumber(params.originLat) || pickupFromStore?.lat || -25.9692;
    const lng = toNumber(params.originLng) || pickupFromStore?.lng || 32.5732;

    reverseGeocode(lat, lng)
      .then((addr) => {
        setPickupAddress(addr);
        setSelectedPickup({ lat, lng, address: addr });
      })
      .catch(() => {
        setPickupAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      });
  }, [params.originLat, params.originLng, params.originAddress, pickupFromStore?.address]);

  const destination: SelectedDestination = useMemo(() => {
    const lat = toNumber(params.destLat);
    const lng = toNumber(params.destLng);
    const address = toText(params.destAddress);
    const name = toText(params.destName);

    if (!Number.isNaN(lat) && !Number.isNaN(lng) && address.trim() !== '') {
      return { lat, lng, address, place_name: name || address };
    }

    if (tripDraft) return tripDraft.destination;

    if (destinationFromStore) return destinationFromStore;

    return {
      lat: pickup.lat + 0.01,
      lng: pickup.lng + 0.01,
      address: 'Destino',
      place_name: 'Destino',
    };
  }, [
    params.destLat, params.destLng, params.destAddress, params.destName,
    tripDraft, destinationFromStore, pickup.lat, pickup.lng,
  ]);

  useEffect(() => {
    if (!isCategoryRetry) return;
    const draft = getTripDraft();
    if (!draft) return;

    assertDraftRestoration(draft, pickup, destination);

    logCategoryRetry('restored pickup', {
      lat: pickup.lat,
      lng: pickup.lng,
      address: pickup.address,
    });
    logCategoryRetry('restored destination', {
      lat: destination.lat,
      lng: destination.lng,
      address: destination.address,
    });
    if (draft.estimatedDistanceKm > 0) {
      logCategoryRetry('restored distance', { km: draft.estimatedDistanceKm });
    }
    if (draft.estimatedDurationMin > 0) {
      logCategoryRetry('restored duration', { min: draft.estimatedDurationMin });
    }
    if (draft.routeCoordinates?.length) {
      logCategoryRetry('restored route polyline', { points: draft.routeCoordinates.length });
    }
  }, [isCategoryRetry, pickup.lat, pickup.lng, pickup.address, destination.lat, destination.lng, destination.address]);

  /* ── Rota: linha recta já na 1.ª frame; Directions só depois (não bloqueia o mapa) ── */
  useEffect(() => {
    let cancelled = false;
    let rafId: number | null = null;

    const draft = getTripDraft();
    const draftMatchesTrip =
      draft != null &&
      Math.abs(draft.pickup.lat - pickup.lat) < 0.0001 &&
      Math.abs(draft.pickup.lng - pickup.lng) < 0.0001 &&
      Math.abs(draft.destination.lat - destination.lat) < 0.0001 &&
      Math.abs(draft.destination.lng - destination.lng) < 0.0001;

    const fallback = [
      { latitude: pickup.lat, longitude: pickup.lng },
      { latitude: destination.lat, longitude: destination.lng },
    ];

    if (draftMatchesTrip && draft.routeCoordinates && draft.routeCoordinates.length >= 2) {
      setRouteCoordinates(draft.routeCoordinates);
    } else {
      setRouteCoordinates(fallback);
    }
    setPolylineKey((k) => k + 1);

    if (draftMatchesTrip && draft.estimatedDistanceKm > 0) {
      setRouteDistance({
        distanceKm: draft.estimatedDistanceKm,
        durationMin: draft.estimatedDurationMin,
      });
    } else {
      const distKm = haversineKm(pickup.lat, pickup.lng, destination.lat, destination.lng);
      const durMin = Math.max(2, Math.round((distKm / 28) * 60));
      setRouteDistance({ distanceKm: distKm, durationMin: durMin });
    }

    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (cancelled) return;
        void fetchDirectionsRoute(
          { lat: pickup.lat, lng: pickup.lng },
          { lat: destination.lat, lng: destination.lng },
        )
          .then((result) => {
            if (cancelled || !result) return;
            if (result.coordinates.length > 0) {
              setRouteCoordinates(result.coordinates);
              setPolylineKey((k) => k + 1);
            }
            if (result.distanceKm > 0) {
              setRouteDistance({ distanceKm: result.distanceKm, durationMin: result.durationMin });
            }
          })
          .catch(() => { /* haversine/draft fallback already set */ });
      });
    });

    return () => {
      cancelled = true;
      task.cancel?.();
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [pickup.lat, pickup.lng, destination.lat, destination.lng]);

  /* ── fit camera: curta espera; animar só quando a rota refinada tiver muitos pontos ── */
  useEffect(() => {
    if (!mapReady || routeCoordinates.length < 2 || panelHeight === 0) return;
    const refinedRoute = routeCoordinates.length > 3;
    const t = setTimeout(
      () => fitMapCamera(mapRef, routeCoordinates, { animated: refinedRoute }),
      refinedRoute ? 220 : 56,
    );
    return () => clearTimeout(t);
  }, [mapReady, routeCoordinates, panelHeight]);

  /* ── build a strokeColors array so Android applies green reliably ── */
  const polylineColors = useMemo(() => {
    if (routeCoordinates.length < 2) return [];
    return new Array(routeCoordinates.length).fill(ROUTE_GREEN);
  }, [routeCoordinates.length]);

  const durationText = useMemo(() => {
    const m = routeDistance.durationMin > 0
      ? routeDistance.durationMin
      : Math.max(2, Math.round((haversineKm(pickup.lat, pickup.lng, destination.lat, destination.lng) / 28) * 60));
    return `${m} min`;
  }, [pickup.lat, pickup.lng, destination.lat, destination.lng, routeDistance.durationMin]);

  const distanceText = useMemo(() => {
    const km = routeDistance.distanceKm;
    if (km <= 0) return '';
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  }, [routeDistance.distanceKm]);

  /* ── categories & prices ── */
  const categoriesRef = useRef<CategoryDisplay[]>([]);
  const priceVersionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      void rideService.getVehicleCategories().then((cats) => {
        if (cancelled) return;
        const display = cats.map((c) => toCategoryDisplay(c, null));
        setCategories(display);
        categoriesRef.current = display;
        if (display.length > 0) setSelectedCategory(display[0]);
      });
    });
    return () => {
      cancelled = true;
      task.cancel?.();
    };
  }, []);

  const fetchPrices = useCallback(
    async (cats: CategoryDisplay[], distKm: number, durMin: number) => {
      if (cats.length === 0 || distKm <= 0) return;
      const version = ++priceVersionRef.current;
      setIsLoadingPrices(true);
      try {
        const updated = await Promise.all(
          cats.map(async (cat) => {
            const fare = await rideService.calculateRideFare(cat.slug, distKm, durMin);
            return { ...cat, price: fare };
          }),
        );
        if (version !== priceVersionRef.current) return;
        setCategories(updated);
        categoriesRef.current = updated;
        setSelectedCategory((prev) => {
          if (!prev) return updated[0];
          return updated.find((c) => c.id === prev.id) ?? updated[0];
        });
      } catch { /* silent */ }
      finally {
        if (version === priceVersionRef.current) setIsLoadingPrices(false);
      }
    },
    [],
  );

  useEffect(() => {
    const cats = categoriesRef.current;
    if (cats.length > 0 && routeDistance.distanceKm > 0) {
      fetchPrices(cats, routeDistance.distanceKm, routeDistance.durationMin);
    }
  }, [routeDistance.distanceKm, routeDistance.durationMin, fetchPrices]);

  useEffect(() => {
    if (categories.length > 0 && routeDistance.distanceKm > 0) {
      const allPriced = categories.every((c) => c.price != null);
      if (!allPriced) {
        fetchPrices(categories, routeDistance.distanceKm, routeDistance.durationMin);
      }
    }
  }, [categories.length]);

  const PANEL_PAD = 20;
  const CARD_GAP = 8;
  const count = categories.length || 4;
  const cardW = (SCREEN_W - PANEL_PAD * 2 - CARD_GAP * (count - 1)) / count;

  const originMapCoord = useMemo(
    () => sanitizeLatLng(pickup.lat, pickup.lng),
    [pickup.lat, pickup.lng],
  );

  const destMapCoord = useMemo(() => {
    const lat = Number.isFinite(destination.lat)
      ? destination.lat
      : originMapCoord.latitude + 0.01;
    const lng = Number.isFinite(destination.lng)
      ? destination.lng
      : originMapCoord.longitude + 0.01;
    return { latitude: lat, longitude: lng };
  }, [destination.lat, destination.lng, originMapCoord.latitude, originMapCoord.longitude]);

  const initialRegion = useMemo(
    () => ({
      ...originMapCoord,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }),
    [originMapCoord.latitude, originMapCoord.longitude],
  );

  useEffect(() => {
    void mapCacheService.setLastMapRegion({
      latitude: initialRegion.latitude,
      longitude: initialRegion.longitude,
      latitudeDelta: initialRegion.latitudeDelta,
      longitudeDelta: initialRegion.longitudeDelta,
    });
  }, [
    initialRegion.latitude,
    initialRegion.longitude,
    initialRegion.latitudeDelta,
    initialRegion.longitudeDelta,
  ]);

  /* ═══════════════════  RENDER  ═══════════════════ */

  return (
    <View style={st.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        mapPadding={{
          top: insets.top + 56,
          right: 0,
          bottom: panelHeight,
          left: 0,
        }}
        customMapStyle={MAP_STYLE_CLEAN}
        {...(Platform.OS === 'ios' ? { userInterfaceStyle: 'light' as const } : {})}
        {...ANDROID_MAPVIEW_TILE_PROPS}
        showsCompass={false}
        showsTraffic={false}
        showsIndoors={false}
        toolbarEnabled={false}
        onMapReady={() => setMapReady(true)}
      >
        {routeCoordinates.length >= 2 && (
          <Polyline
            key={`route-${polylineKey}`}
            coordinates={routeCoordinates}
            strokeColor={ROUTE_GREEN}
            strokeColors={polylineColors}
            strokeWidth={4}
            geodesic
            zIndex={999}
          />
        )}

        <Marker
          coordinate={destMapCoord}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={st.destMarkerOuter}>
            <View style={st.destMarkerInner}>
              <Ionicons name="flag" size={11} color="#FFF" />
            </View>
          </View>
        </Marker>

        <Marker
          coordinate={originMapCoord}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={st.originMarkerOuter}>
            <View style={st.originMarkerInner} />
          </View>
        </Marker>
      </MapView>

      {/* ── Top bar ── */}
      <View style={[st.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={st.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* ── Bottom panel ── */}
      <View
        style={[st.panel, { paddingBottom: insets.bottom + 12 }]}
        onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
      >
        <View style={st.grabber} />

        <View style={st.routeRow}>
          <View style={st.dotsCol}>
            <View style={st.dotOrigin} />
            <View style={st.dotsLine} />
            <View style={st.dotDest} />
          </View>

          <View style={st.routeText}>
            <View style={st.destRow}>
              <Text style={st.destLabel} numberOfLines={1}>
                {destination.place_name || destination.address}
              </Text>
              <View style={st.durationPill}>
                <Ionicons name="time-outline" size={11} color={C.emeraldDark} />
                <Text style={st.durationValue}>{durationText}</Text>
              </View>
            </View>
            <View style={st.originRow}>
              <Text style={st.originLabel} numberOfLines={1}>{pickup.address}</Text>
              {distanceText !== '' && (
                <Text style={st.distLabel}>{distanceText}</Text>
              )}
            </View>
          </View>
        </View>

        <View style={st.separator} />

        <Text style={st.catHeading}>Escolha a categoria</Text>

        <View style={st.catRow}>
          {categories.map((cat, idx) => {
            const active = selectedCategory?.id === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  st.catCard,
                  { width: cardW },
                  idx < categories.length - 1 && { marginRight: CARD_GAP },
                  active && { borderColor: cat.color, backgroundColor: cat.bgColor },
                ]}
                activeOpacity={0.8}
                onPress={() => setSelectedCategory(cat)}
              >
                <View
                  style={[
                    st.catIconCircle,
                    { backgroundColor: active ? cat.bgColor : '#F8FAFC' },
                    active && { borderColor: cat.color },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={cat.icon}
                    size={26}
                    color={cat.iconColor}
                  />
                </View>

                <Text
                  style={[st.catLabel, active && { color: cat.color }]}
                  numberOfLines={1}
                >
                  {cat.label}
                </Text>

                {isLoadingPrices ? (
                  <ActivityIndicator size="small" color={C.textMuted} style={{ marginTop: 2 }} />
                ) : (
                  <Text style={[st.catPrice, active && { color: cat.color }]}>
                    {cat.price != null ? `${Math.round(cat.price)} MT` : '—'}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[st.requestBtn, isRequesting && { opacity: 0.6 }]}
          disabled={isRequesting || !selectedCategory}
          activeOpacity={0.85}
          onPress={async () => {
            if (!selectedCategory) return;
            setIsRequesting(true);
            try {
              saveTripDraft(
                buildTripDraft({
                  pickup,
                  destination,
                  estimatedDistanceKm: routeDistance.distanceKm,
                  estimatedDurationMin: routeDistance.durationMin,
                  routeCoordinates,
                  selectedCategorySlug: selectedCategory.slug,
                }),
              );

              const result = await rideService.requestRideV2({
                p_pickup_lat: pickup.lat,
                p_pickup_lng: pickup.lng,
                p_pickup_address: pickup.address,
                p_destination_lat: destination.lat,
                p_destination_lng: destination.lng,
                p_dropoff_address: destination.address,
                p_vehicle_category: selectedCategory.slug,
                p_estimated_distance_km: routeDistance.distanceKm,
                p_estimated_duration_min: routeDistance.durationMin,
              });
              router.push({
                pathname: '/searchingDriver' as any,
                params: {
                  rideId: result.id,
                  pickupLat: String(pickup.lat),
                  pickupLng: String(pickup.lng),
                  pickupAddress: pickup.address,
                  vehicleCategory: selectedCategory.slug,
                },
              });
            } catch (err: any) {
              Alert.alert('Erro', err?.message ?? 'Não foi possível pedir a corrida.');
            } finally {
              setIsRequesting(false);
            }
          }}
        >
          {isRequesting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={st.requestBtnText}>
              Pedir {selectedCategory?.label ?? 'corrida'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const SHADOW_SM = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4 },
  android: { elevation: 3 },
}) as any;

const SHADOW_LG = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.1, shadowRadius: 20 },
  android: { elevation: 16 },
}) as any;

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  destMarkerOuter: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(16,185,129,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  destMarkerInner: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: C.emerald,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFF',
    ...SHADOW_SM,
  },
  originMarkerOuter: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#FFF', borderWidth: 2.5, borderColor: C.text,
    alignItems: 'center', justifyContent: 'center',
    ...SHADOW_SM,
  },
  originMarkerInner: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: C.text,
  },

  topBar: { position: 'absolute', top: 0, left: 16, right: 16, zIndex: 10 },
  backBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
    ...SHADOW_SM,
  },

  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    backgroundColor: C.surface,
    paddingHorizontal: 20, paddingTop: 10,
    ...SHADOW_LG,
  },
  grabber: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border, alignSelf: 'center', marginBottom: 14,
  },

  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dotsCol: { alignItems: 'center', paddingTop: 4, width: 14 },
  dotOrigin: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: C.text, borderWidth: 2, borderColor: C.surface,
    ...SHADOW_SM,
  },
  dotsLine: { width: 2, height: 18, backgroundColor: C.border, marginVertical: 2 },
  dotDest: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: C.emerald, borderWidth: 2, borderColor: C.surface,
    ...SHADOW_SM,
  },
  routeText: { flex: 1, minWidth: 0 },
  destRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  destLabel: { fontSize: 15, fontWeight: '700', color: C.text, flexShrink: 1, letterSpacing: 0.1 },
  durationPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: C.emeraldBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  durationValue: { fontSize: 11, fontWeight: '700', color: C.emeraldDark },
  originRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  originLabel: { fontSize: 13, fontWeight: '500', color: C.textSecondary, flexShrink: 1 },
  distLabel: { fontSize: 11, fontWeight: '600', color: C.textMuted, marginLeft: 8 },

  separator: { height: 1, backgroundColor: C.borderLight, marginVertical: 12 },

  catHeading: { fontSize: 13, fontWeight: '700', color: C.textSecondary, marginBottom: 10, letterSpacing: 0.2 },
  catRow: { flexDirection: 'row', alignItems: 'stretch' },
  catCard: {
    paddingVertical: 10, paddingHorizontal: 4,
    borderRadius: 14, borderWidth: 1.5, borderColor: C.borderLight,
    backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center',
  },
  catIconCircle: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.borderLight,
    marginBottom: 5,
  },
  catLabel: { fontSize: 10, fontWeight: '600', color: C.text, textAlign: 'center', marginBottom: 3 },
  catPrice: { fontSize: 13, fontWeight: '700', color: C.text, textAlign: 'center' },

  requestBtn: {
    marginTop: 12, height: 52, borderRadius: 14,
    backgroundColor: C.emerald, alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#059669', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  requestBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF', letterSpacing: 0.3 },
});

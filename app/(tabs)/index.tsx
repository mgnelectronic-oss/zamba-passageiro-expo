import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import Feather from '@expo/vector-icons/Feather';
import { authService, type UserProfile } from '@/services/authService';
import type { SavedAddress, RecentDestination } from '@/services/addressService';
import { reverseGeocode } from '@/services/googleGeocoding';
import DrawerMenu from '@/components/DrawerMenu';
import { AppBannersSection } from '@/components/AppBannersSection';
import { useAppBootstrap } from '@/contexts/AppBootstrapContext';
import { mapCacheService } from '@/services/cache/mapCacheService';
import { primeMapCenter } from '@/services/mapLocationMemory';

/* ── palette ── */
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
  emeraldLight: '#D1FAE5',
  emeraldBg: '#ECFDF5',
  blue: '#3B82F6',
  blueBg: '#EFF6FF',
  blueBorder: '#DBEAFE',
  green: '#22C55E',
  greenBg: '#F0FDF4',
  amber: '#F59E0B',
  amberBg: '#FFFBEB',
  amberBorder: '#FEF3C7',
  red: '#EF4444',
  redBg: '#FEF2F2',
  redBorder: '#FEE2E2',
  redDark: '#DC2626',
  redDeep: '#991B1B',
  purple: '#8B5CF6',
  indigo: '#6366F1',
};

const DEFAULT_QUICK: Record<
  'home' | 'work' | 'airport',
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  home:    { label: 'Casa',     icon: 'home',          color: C.blue,  bg: C.blueBg },
  work:    { label: 'Trabalho', icon: 'briefcase',     color: C.green, bg: C.greenBg },
  airport: { label: 'Aeroporto', icon: 'airplane',     color: C.amber, bg: C.amberBg },
};

const SAVED_ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  home: 'home',
  work: 'briefcase',
  airport: 'airplane',
  church: 'business',
  school: 'school',
  pin: 'location',
  star: 'star',
  user: 'person',
  mosque: 'business',
  office: 'business',
  market: 'cart',
  hospital: 'medkit',
  family: 'heart',
};

function savedIcon(name: string): keyof typeof Ionicons.glyphMap {
  return SAVED_ICON_MAP[name] ?? 'location';
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    user: ctxUser,
    initialBanners,
    initialBannerSettings,
    initialProfile,
    initialSavedAddresses,
    initialRecentDestinations,
  } = useAppBootstrap();
  const [menuOpen, setMenuOpen] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(() => initialProfile);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>(() => initialSavedAddresses);
  const [recentDestinations, setRecentDestinations] = useState<RecentDestination[]>(
    () => initialRecentDestinations,
  );
  const [recentsExpanded, setRecentsExpanded] = useState(false);
  const [pickup, setPickup] = useState({
    lat: -25.9692,
    lng: 32.5732,
    address: 'A obter localização…',
  });

  useEffect(() => {
    let mounted = true;

    void mapCacheService.getLastKnownLocation().then((last) => {
      if (!mounted || !last) return;
      primeMapCenter(last.lat, last.lng);
      setPickup({ lat: last.lat, lng: last.lng, address: last.address });
    });

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (mounted) {
            setPickup((p) => ({ ...p, address: 'Maputo (localização padrão)' }));
            setAppError('Permissão de localização negada.');
          }
        } else {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          if (mounted) {
            primeMapCenter(lat, lng);
            setPickup({ lat, lng, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
          }

          reverseGeocode(lat, lng)
            .then((addr) => {
              if (mounted) {
                setPickup((p) => ({ ...p, address: addr }));
                void mapCacheService.setLastKnownLocation(lat, lng, addr);
              }
            })
            .catch(() => {
              if (mounted) {
                setPickup((p) => {
                  const nextAddr = p.address.includes(',') ? p.address : 'Localização Actual';
                  void mapCacheService.setLastKnownLocation(lat, lng, nextAddr);
                  return { ...p, address: nextAddr };
                });
              }
            });
        }
      } catch {
        if (mounted) {
          setPickup((p) => ({ ...p, address: 'Maputo (localização padrão)' }));
        }
      }
    })();

    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (recentDestinations.length <= 1) setRecentsExpanded(false);
  }, [recentDestinations.length]);

  const lastError = appError;

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    const period = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const n = profile?.full_name?.trim();
    return n ? `${period}, ${n.split(' ')[0]}` : period;
  }, [profile?.full_name]);

  const customQuick = useMemo(
    () =>
      savedAddresses
        .filter((a) => a.address_type === 'custom' && a.is_quick_access)
        .sort((a, b) => a.display_order - b.display_order),
    [savedAddresses],
  );

  const refreshLocation = useCallback(() => {
    setAppError(null);
    setPickup((p) => ({ ...p, address: 'A obter localização…' }));
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setPickup({ lat, lng, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
        reverseGeocode(lat, lng)
          .then((addr) => {
            setPickup((p) => ({ ...p, address: addr }));
            void mapCacheService.setLastKnownLocation(lat, lng, addr);
          })
          .catch(() => {});
      })
      .catch(() => {
        setAppError('Não foi possível obter a localização.');
        setPickup((p) => ({ ...p, address: 'Maputo (localização padrão)' }));
      });
  }, []);

  const navigateToMap = useCallback(
    (destLat: number, destLng: number, destAddress: string, destName: string) => {
      router.push({
        pathname: '/map' as any,
        params: {
          originLat: String(pickup.lat),
          originLng: String(pickup.lng),
          originAddress: pickup.address,
          destLat: String(destLat),
          destLng: String(destLng),
          destAddress,
          destName,
        },
      });
    },
    [pickup, router],
  );

  const handleQuickType = useCallback(
    (type: 'home' | 'work' | 'airport') => {
      const saved = savedAddresses.find((a) => a.address_type === type);
      if (saved) {
        navigateToMap(saved.latitude, saved.longitude, saved.address, saved.label);
      } else {
        router.push('/saved-addresses' as any);
      }
    },
    [savedAddresses, navigateToMap, router],
  );

  const handleCustomQuick = useCallback(
    (addr: SavedAddress) => {
      navigateToMap(addr.latitude, addr.longitude, addr.address, addr.label);
    },
    [navigateToMap],
  );

  const handleRecentClick = useCallback(
    (dest: RecentDestination) => {
      navigateToMap(dest.lat, dest.lng, dest.full_address, dest.place_name);
    },
    [navigateToMap],
  );

  const clearRecents = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRecentsExpanded(false);
    setRecentDestinations([]);
  }, []);

  const toggleRecentsExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRecentsExpanded((v) => !v);
  }, []);

  const recentDestinationsVisible = useMemo(() => {
    const cap = recentsExpanded ? 4 : 1;
    return recentDestinations.slice(0, cap);
  }, [recentDestinations, recentsExpanded]);

  const canToggleRecents = recentDestinations.length > 1;

  return (
    <SafeAreaView style={st.screen} edges={['top', 'left', 'right']}>
      <View style={st.mainColumn}>
      <ScrollView
        style={st.scroll}
        contentContainerStyle={[
          st.scrollContent,
          initialBanners.length > 0 && st.scrollContentWithBanner,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ── */}
        <View style={st.header}>
          <View style={st.headerLeft}>
            <View style={st.logoRow}>
              <View style={st.logoBadge}>
                <Text style={st.logoBadgeLetter}>Z</Text>
              </View>
              <Text style={st.logoName}>ZAMBA</Text>
            </View>
            <Text style={st.greeting} numberOfLines={1}>{greeting}</Text>
          </View>
          <TouchableOpacity
            style={st.menuBtn}
            onPress={() => setMenuOpen(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Abrir menu"
          >
            <Feather name="menu" size={22} color={C.text} />
          </TouchableOpacity>
        </View>

        <View style={st.body}>
          {/* ── Error banner ── */}
          {lastError ? (
            <View style={st.errorBanner}>
              <View style={st.errorIconBox}>
                <Ionicons name="alert-circle" size={20} color={C.red} />
              </View>
              <View style={st.errorCol}>
                <Text style={st.errorMsg}>{lastError}</Text>
                <View style={st.errorActions}>
                  {typeof lastError === 'string' && lastError.includes('localização') && (
                    <TouchableOpacity onPress={refreshLocation} hitSlop={8}>
                      <Text style={st.errorAction}>Tentar novamente</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => setAppError(null)} hitSlop={8}>
                    <Text style={st.errorAction}>Fechar</Text>
                  </TouchableOpacity>
                  {typeof lastError === 'string' && lastError.includes('localização') && (
                    <TouchableOpacity
                      hitSlop={8}
                      onPress={() => {
                        setAppError(null);
                        setPickup((p) => ({ ...p, lat: -25.9692, lng: 32.5732, address: 'Maputo (padrão)' }));
                      }}
                    >
                      <Text style={[st.errorAction, { color: C.textMuted }]}>Usar padrão</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          ) : null}

          {/* ── Search card ── */}
          <TouchableOpacity
            style={st.searchCard}
            onPress={() => router.push('/search')}
            activeOpacity={0.85}
          >
            <View style={st.searchIcon}>
              <Ionicons name="search" size={22} color="#FFF" />
            </View>
            <View style={st.searchText}>
              <Text style={st.searchTitle}>Para onde vai?</Text>
              <Text style={st.searchSub}>Pesquise o destino ou escolha no mapa</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.textMuted} />
          </TouchableOpacity>

          {/* ── Quick shortcuts ── */}
          <View style={st.quickRow}>
            {(['home', 'work', 'airport'] as const).map((type) => {
              const saved = savedAddresses.find((a) => a.address_type === type);
              const def = DEFAULT_QUICK[type];
              const lbl = saved ? saved.label : def.label;
              const iconName = saved ? savedIcon(saved.icon) : def.icon;
              const clr = saved ? (saved.icon_color || def.color) : def.color;

              return (
                <TouchableOpacity
                  key={type}
                  style={st.quickItem}
                  onPress={() => handleQuickType(type)}
                  activeOpacity={0.8}
                >
                  <View style={st.quickCard}>
                    <View style={[st.quickIconCircle, { backgroundColor: def.bg }]}>
                      <Ionicons name={iconName} size={22} color={clr} />
                    </View>
                  </View>
                  <Text style={st.quickLabel} numberOfLines={1}>{lbl}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Custom quick-access chips ── */}
          {customQuick.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={st.chipsScroll}
              contentContainerStyle={st.chipsInner}
            >
              {customQuick.map((addr, idx) => (
                <TouchableOpacity
                  key={`${addr.id}-${idx}`}
                  style={st.chip}
                  onPress={() => handleCustomQuick(addr)}
                  activeOpacity={0.8}
                >
                  <View style={st.chipIcon}>
                    <Ionicons name={savedIcon(addr.icon)} size={16} color={addr.icon_color || C.emerald} />
                  </View>
                  <Text style={st.chipLabel} numberOfLines={1}>{addr.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* ── Recents ── */}
          <View style={st.recentSection}>
            <View style={st.recentHeader}>
              <Text style={st.recentHeading}>Destinos recentes</Text>
              {recentDestinations.length > 0 && (
                <TouchableOpacity onPress={clearRecents} hitSlop={12}>
                  <Text style={st.recentClear}>Limpar</Text>
                </TouchableOpacity>
              )}
            </View>

            {recentDestinations.length === 0 ? (
              <View style={st.recentEmpty}>
                <Ionicons name="time-outline" size={18} color={C.textMuted} />
                <Text style={st.recentEmptyText}>Nenhum destino recente</Text>
              </View>
            ) : (
              <View style={st.recentListWrap}>
                <View style={st.recentList}>
                  {recentDestinationsVisible.map((dest, idx) => {
                    const singleLine =
                      dest.place_name?.trim() !== '' ? dest.place_name.trim() : dest.full_address;
                    return (
                      <TouchableOpacity
                        key={`${dest.id}-${idx}`}
                        style={st.recentRow}
                        onPress={() => handleRecentClick(dest)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={singleLine}
                      >
                        <View style={st.recentIconBox}>
                          <Ionicons name="time-outline" size={15} color={C.textMuted} />
                        </View>
                        <Text style={st.recentSingleLine} numberOfLines={1}>
                          {singleLine}
                        </Text>
                        <Ionicons name="chevron-forward" size={15} color={C.textMuted} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {canToggleRecents ? (
                  <TouchableOpacity
                    style={st.recentToggle}
                    onPress={toggleRecentsExpanded}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={recentsExpanded ? 'Fechar destinos recentes' : 'Ver mais destinos recentes'}
                  >
                    <Text style={st.recentToggleText}>
                      {recentsExpanded ? 'Fechar' : 'Ver mais'}
                    </Text>
                    <Ionicons
                      name={recentsExpanded ? 'chevron-up' : 'chevron-down'}
                      size={14}
                      color={C.textMuted}
                    />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>

        </View>
      </ScrollView>

      {initialBanners.length > 0 ? (
        <View style={[st.bannerDock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <AppBannersSection banners={initialBanners} settings={initialBannerSettings} />
        </View>
      ) : null}
      </View>

      <DrawerMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={ctxUser}
        profile={profile}
        router={router}
        onLogout={() => authService.signOut().catch(() => {})}
      />

    </SafeAreaView>
  );
}

/* ── styles ── */
const SHADOW_SM = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
  android: { elevation: 2 },
}) as any;

const SHADOW_MD = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
  android: { elevation: 4 },
}) as any;

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  mainColumn: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  /** Com banner fixo em baixo: margem final do scroll para não “colar” o conteúdo à área do banner. */
  scrollContentWithBanner: { paddingBottom: 22 },
  bannerDock: {
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: C.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.borderLight,
  },

  /* header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  headerLeft: { flex: 1, paddingRight: 16 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW_SM,
  },
  logoBadgeLetter: { color: '#FFF', fontSize: 18, fontWeight: '800', lineHeight: 20 },
  logoName: { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: 1.5 },
  greeting: { fontSize: 26, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW_SM,
  },

  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },

  /* error */
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: C.redBg,
    borderWidth: 1,
    borderColor: C.redBorder,
  },
  errorIconBox: { marginTop: 1 },
  errorCol: { flex: 1 },
  errorMsg: { fontSize: 13, fontWeight: '600', color: C.redDeep, lineHeight: 18 },
  errorActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8 },
  errorAction: { fontSize: 11, fontWeight: '700', color: C.redDark, textTransform: 'uppercase', letterSpacing: 0.8 },

  /* search */
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.borderLight,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 28,
    ...SHADOW_MD,
  },
  searchIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW_SM,
  },
  searchText: { flex: 1, minWidth: 0 },
  searchTitle: { fontSize: 17, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
  searchSub: { marginTop: 3, fontSize: 12, fontWeight: '500', color: C.textMuted },

  /* quick shortcuts */
  quickRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  quickItem: { flex: 1, alignItems: 'center', gap: 8 },
  quickCard: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: C.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW_MD,
  },
  quickIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    width: '100%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: C.text,
    letterSpacing: 0.3,
  },

  /* chips */
  chipsScroll: { marginBottom: 28, marginHorizontal: -20 },
  chipsInner: { paddingHorizontal: 20, gap: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 16,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    ...SHADOW_SM,
  },
  chipIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: { fontSize: 13, fontWeight: '600', color: C.text },

  /* recents */
  recentSection: { paddingBottom: 4 },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  recentHeading: { fontSize: 13, fontWeight: '700', color: C.textSecondary, letterSpacing: 0.3 },
  recentClear: { fontSize: 12, fontWeight: '600', color: C.emeraldDark },

  recentEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.borderLight,
  },
  recentEmptyText: { fontSize: 13, fontWeight: '500', color: C.textSecondary, flex: 1 },

  recentListWrap: { width: '100%' },
  recentList: { gap: 6 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 10,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderLight,
    ...SHADOW_SM,
  },
  recentIconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentSingleLine: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
    letterSpacing: -0.1,
  },
  recentToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    alignSelf: 'flex-end',
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  recentToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textMuted,
    letterSpacing: 0.2,
  },
});

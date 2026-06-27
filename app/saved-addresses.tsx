import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Switch,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import Feather from '@expo/vector-icons/Feather';
import { authService } from '@/services/authService';
import { addressService, type SavedAddress } from '@/services/addressService';
import { searchPredictions, resolvePredictionToDestination, type PlacePrediction } from '@/services/googlePlaces';
import { reverseGeocode } from '@/services/googleGeocoding';
import { usePassengerLocation } from '@/hooks/usePassengerLocation';

const ICON_OPTIONS: { id: string; icon: keyof typeof Ionicons.glyphMap; label: string; color: string }[] = [
  { id: 'home',     icon: 'home',        label: 'Casa',          color: '#3B82F6' },
  { id: 'work',     icon: 'briefcase',   label: 'Trabalho',      color: '#22C55E' },
  { id: 'airport',  icon: 'airplane',    label: 'Aeroporto',     color: '#EAB308' },
  { id: 'church',   icon: 'business',    label: 'Igreja',        color: '#A855F7' },
  { id: 'school',   icon: 'school',      label: 'Escola',        color: '#F97316' },
  { id: 'mosque',   icon: 'business',    label: 'Mesquita',      color: '#15803D' },
  { id: 'office',   icon: 'business',    label: 'Escritório',    color: '#64748B' },
  { id: 'market',   icon: 'cart',        label: 'Mercado',       color: '#EC4899' },
  { id: 'hospital', icon: 'medkit',      label: 'Hospital',      color: '#EF4444' },
  { id: 'family',   icon: 'heart',       label: 'Família',       color: '#F43F5E' },
  { id: 'user',     icon: 'person',      label: 'Personalizado', color: '#64748B' },
  { id: 'star',     icon: 'star',        label: 'Favorito',      color: '#F59E0B' },
  { id: 'pin',      icon: 'location',    label: 'Localização',   color: '#000000' },
];

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {};
ICON_OPTIONS.forEach((o) => { ICON_MAP[o.id] = o.icon; });

const DEFAULT_TYPES = ['home', 'work', 'airport'] as const;
const DEFAULT_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  home:    { label: 'CASA',     icon: 'home',      color: '#3B82F6' },
  work:    { label: 'TRABALHO', icon: 'briefcase',  color: '#22C55E' },
  airport: { label: 'AERO',     icon: 'airplane',   color: '#EAB308' },
};

const MAPUTO = { latitude: -25.9667, longitude: 32.5833 };

function resolveIcon(name: string): keyof typeof Ionicons.glyphMap {
  return ICON_MAP[name] ?? 'location';
}

export default function SavedAddressesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { currentLocation, getFreshPosition } = usePassengerLocation();
  const mapRef = useRef<MapView>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);

  const [isAdding, setIsAdding] = useState(false);
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null);

  const [label, setLabel] = useState('');
  const [addressText, setAddressText] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [selectedIcon, setSelectedIcon] = useState('pin');
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [selectedType, setSelectedType] = useState<SavedAddress['address_type']>('custom');
  const [isQuickAccess, setIsQuickAccess] = useState(true);
  const [selectedViaMap, setSelectedViaMap] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isSelectingOnMap, setIsSelectingOnMap] = useState(false);
  const [markerCoord, setMarkerCoord] = useState(MAPUTO);

  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const user = await authService.getCurrentUser();
      if (user) setUserId(user.id);
    })();
  }, []);

  const fetchAddresses = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await addressService.getSavedAddresses(userId);
      setAddresses(data);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) fetchAddresses();
  }, [userId, fetchAddresses]);

  const resetForm = () => {
    setLabel('');
    setAddressText('');
    setLat(null);
    setLng(null);
    setSelectedIcon('pin');
    setSelectedColor('#000000');
    setSelectedType('custom');
    setIsQuickAccess(true);
    setSelectedViaMap(false);
    setIsSelectingOnMap(false);
    setErrorMsg(null);
    setPredictions([]);
  };

  const handleAddClick = (type?: SavedAddress['address_type']) => {
    setEditingAddress(null);
    resetForm();
    if (type && type !== 'custom') {
      setLabel(type === 'home' ? 'Casa' : type === 'work' ? 'Trabalho' : 'Aeroporto');
      setSelectedType(type);
      const opt = ICON_OPTIONS.find((o) => o.id === type);
      if (opt) { setSelectedIcon(opt.id); setSelectedColor(opt.color); }
    }
    setIsAdding(true);
  };

  const handleEditClick = (addr: SavedAddress) => {
    setEditingAddress(addr);
    setLabel(addr.label);
    setAddressText(addr.address);
    setLat(addr.latitude);
    setLng(addr.longitude);
    setSelectedIcon(addr.icon);
    setSelectedColor(addr.icon_color || '#000000');
    setSelectedType(addr.address_type);
    setIsQuickAccess(addr.is_quick_access);
    setSelectedViaMap(addr.selected_via_map);
    setIsSelectingOnMap(false);
    setErrorMsg(null);
    setPredictions([]);
    setIsAdding(true);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await addressService.deleteAddress(deleteConfirmId);
      fetchAddresses();
      setDeleteConfirmId(null);
    } catch {
      setErrorMsg('Erro ao apagar endereço.');
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    if (!label || !addressText || lat === null || lng === null) {
      setErrorMsg('Preencha todos os campos e selecione um endereço válido.');
      return;
    }
    const isDuplicate = addresses.some(
      (a) => a.address.toLowerCase() === addressText.toLowerCase() && a.id !== editingAddress?.id,
    );
    if (isDuplicate) { setErrorMsg('Este endereço já está na sua lista.'); return; }

    setIsSaving(true);
    setErrorMsg(null);
    try {
      await addressService.saveAddress({
        user_id: userId,
        label,
        address: addressText,
        latitude: lat,
        longitude: lng,
        icon: selectedIcon,
        icon_color: selectedColor,
        address_type: selectedType,
        display_order: editingAddress?.display_order ?? addresses.length,
        is_quick_access: isQuickAccess,
        selected_via_map: selectedViaMap,
      });
      setIsAdding(false);
      fetchAddresses();
    } catch {
      setErrorMsg('Erro ao guardar endereço.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenMap = async () => {
    setIsSelectingOnMap(true);
    if (lat && lng) {
      setMarkerCoord({ latitude: lat, longitude: lng });
    } else {
      const pos = await getFreshPosition();
      if (pos) {
        setMarkerCoord({ latitude: pos.latitude, longitude: pos.longitude });
      } else if (currentLocation) {
        setMarkerCoord({ latitude: currentLocation.latitude, longitude: currentLocation.longitude });
      } else {
        setMarkerCoord(MAPUTO);
      }
    }
  };

  const handleMapConfirm = async () => {
    setLat(markerCoord.latitude);
    setLng(markerCoord.longitude);
    setSelectedViaMap(true);
    try {
      const addr = await reverseGeocode(markerCoord.latitude, markerCoord.longitude);
      setAddressText(addr);
    } catch { /* keep existing */ }
    setIsSelectingOnMap(false);
  };

  const handleRecenterMap = async () => {
    const pos = await getFreshPosition();
    if (!pos) return;
    const coord = { latitude: pos.latitude, longitude: pos.longitude };
    setMarkerCoord(coord);
    mapRef.current?.animateToRegion({ ...coord, latitudeDelta: 0.002, longitudeDelta: 0.002 }, 500);
  };

  const handleSearchChange = (text: string) => {
    setAddressText(text);
    if (!text.trim()) { setPredictions([]); return; }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    setIsSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const center = lat && lng ? { lat, lng } : { lat: MAPUTO.latitude, lng: MAPUTO.longitude };
        const results = await searchPredictions(text, center);
        setPredictions(results);
      } catch { setPredictions([]); }
      finally { setIsSearching(false); }
    }, 400);
  };

  const handlePredictionSelect = async (p: PlacePrediction) => {
    try {
      const dest = await resolvePredictionToDestination(p);
      setAddressText(dest.address);
      setLat(dest.lat);
      setLng(dest.lng);
      setSelectedViaMap(false);
      setPredictions([]);
    } catch { /* silent */ }
  };

  /* ── back handler ── */
  const handleBack = () => {
    if (isSelectingOnMap) { setIsSelectingOnMap(false); return; }
    if (isAdding) { setIsAdding(false); setErrorMsg(null); return; }
    if (deleteConfirmId) { setDeleteConfirmId(null); return; }
    router.back();
  };

  const headerTitle = isAdding
    ? editingAddress ? 'Editar Endereço' : 'Novo Endereço'
    : 'Endereços Guardados';

  /* ═══════════════════════════  RENDER  ═══════════════════════════ */

  const renderDeleteConfirm = () => (
    <View style={s.centeredSection}>
      <View style={s.deleteCircle}>
        <Ionicons name="trash-outline" size={36} color="#EF4444" />
      </View>
      <Text style={s.deleteTitle}>Apagar Endereço?</Text>
      <Text style={s.deleteBody}>Tem certeza que deseja apagar este endereço? Esta ação não pode ser desfeita.</Text>
      <TouchableOpacity style={s.btnDanger} onPress={confirmDelete} activeOpacity={0.85}>
        <Text style={s.btnDangerText}>Sim, Apagar</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.btnGhost} onPress={() => setDeleteConfirmId(null)} activeOpacity={0.85}>
        <Text style={s.btnGhostText}>Cancelar</Text>
      </TouchableOpacity>
    </View>
  );

  const renderList = () => {
    if (loading) {
      return (
        <View style={s.centeredSection}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={s.loadingLabel}>Carregando endereços...</Text>
        </View>
      );
    }
    const custom = addresses.filter((a) => a.address_type === 'custom');

    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.listPad}>
        {/* default type cards */}
        <View style={s.typeGrid}>
          {DEFAULT_TYPES.map((type) => {
            const addr = addresses.find((a) => a.address_type === type);
            const meta = DEFAULT_META[type];
            return (
              <View key={type} style={s.typeCardWrap}>
                <TouchableOpacity
                  style={[s.typeCard, addr ? s.typeCardFilled : s.typeCardEmpty]}
                  onPress={() => (addr ? handleEditClick(addr) : handleAddClick(type))}
                  activeOpacity={0.8}
                >
                  <View style={[s.typeIconCircle, { backgroundColor: addr ? `${meta.color}14` : '#F1F5F9' }]}>
                    <Ionicons name={addr ? resolveIcon(addr.icon) : meta.icon} size={22} color={meta.color} />
                  </View>
                  <Text style={s.typeLabel}>{meta.label}</Text>
                  {addr && <Text style={s.typeAddr} numberOfLines={1}>{addr.address}</Text>}
                </TouchableOpacity>
                {addr && (
                  <View style={s.typeActions}>
                    <TouchableOpacity style={s.miniActionBtn} onPress={() => handleEditClick(addr)} hitSlop={8}>
                      <Feather name="edit-2" size={12} color="#64748B" />
                    </TouchableOpacity>
                    <TouchableOpacity style={s.miniActionBtn} onPress={() => setDeleteConfirmId(addr.id)} hitSlop={8}>
                      <Feather name="trash-2" size={12} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* custom addresses */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Outros locais</Text>
          <TouchableOpacity onPress={() => handleAddClick()} activeOpacity={0.8} style={s.addBtn}>
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={s.addBtnLabel}>Adicionar</Text>
          </TouchableOpacity>
        </View>

        {custom.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="location-outline" size={32} color="#CBD5E1" />
            <Text style={s.emptyText}>Nenhum endereço personalizado guardado.</Text>
          </View>
        ) : (
          custom.map((addr) => (
            <View key={addr.id} style={s.customRow}>
              <View style={[s.customIcon, { backgroundColor: `${addr.icon_color || '#64748B'}14` }]}>
                <Ionicons name={resolveIcon(addr.icon)} size={20} color={addr.icon_color || '#64748B'} />
              </View>
              <View style={s.customText}>
                <Text style={s.customName} numberOfLines={1}>{addr.label}</Text>
                <Text style={s.customAddr} numberOfLines={1}>{addr.address}</Text>
              </View>
              <TouchableOpacity style={s.rowAction} onPress={() => handleEditClick(addr)} hitSlop={8}>
                <Feather name="edit-2" size={16} color="#94A3B8" />
              </TouchableOpacity>
              <TouchableOpacity style={s.rowAction} onPress={() => setDeleteConfirmId(addr.id)} hitSlop={8}>
                <Feather name="trash-2" size={16} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    );
  };

  const renderMapSelection = () => (
    <View style={s.mapSection}>
      <View style={s.mapFrame}>
        <MapView
          ref={mapRef}
          style={s.mapView}
          provider={PROVIDER_GOOGLE}
          mapType="satellite"
          initialRegion={{ ...markerCoord, latitudeDelta: 0.002, longitudeDelta: 0.002 }}
          onPress={(e) => setMarkerCoord(e.nativeEvent.coordinate)}
        >
          <Marker
            coordinate={markerCoord}
            draggable
            onDragEnd={(e) => setMarkerCoord(e.nativeEvent.coordinate)}
            pinColor="#10B981"
          />
        </MapView>
        <TouchableOpacity style={s.recenterBtn} onPress={handleRecenterMap} activeOpacity={0.85}>
          <Ionicons name="locate" size={16} color="#10B981" />
          <Text style={s.recenterLabel}>ATUALIZAR</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.mapHint}>Arraste o mapa ou toque para ajustar a localização</Text>
      <Text style={s.mapSubHint}>Use imagens reais para maior precisão</Text>
      <View style={s.mapButtons}>
        <TouchableOpacity style={s.btnOutline} onPress={() => setIsSelectingOnMap(false)} activeOpacity={0.85}>
          <Text style={s.btnOutlineText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnPrimary} onPress={handleMapConfirm} activeOpacity={0.85}>
          <Ionicons name="checkmark" size={18} color="#FFF" />
          <Text style={s.btnPrimaryText}>Confirmar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderForm = () => {
    if (isSelectingOnMap) return renderMapSelection();

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.formPad}
        keyboardShouldPersistTaps="handled"
      >
        {/* mark on map */}
        <TouchableOpacity style={s.mapPickCard} onPress={handleOpenMap} activeOpacity={0.85}>
          <View style={s.mapPickIcon}>
            <Ionicons name="map" size={24} color="#FFF" />
          </View>
          <Text style={s.mapPickTitle}>Marcar no mapa</Text>
          <Text style={s.mapPickSub}>Escolha o ponto exato no mapa</Text>
        </TouchableOpacity>

        <View style={s.dividerRow}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>OU PESQUISE UM ENDEREÇO</Text>
          <View style={s.dividerLine} />
        </View>

        {/* label */}
        <Text style={s.fieldLabel}>NOME DO LOCAL</Text>
        <TextInput
          style={s.input}
          value={label}
          onChangeText={setLabel}
          placeholder="Ex: Casa da Mãe, Ginásio..."
          placeholderTextColor="#94A3B8"
        />

        {/* address search */}
        <Text style={s.fieldLabel}>ENDEREÇO</Text>
        <View style={s.searchRow}>
          <Ionicons name="search" size={18} color="#94A3B8" style={{ marginLeft: 16 }} />
          <TextInput
            style={s.searchInput}
            value={addressText}
            onChangeText={handleSearchChange}
            placeholder="Pesquisar endereço em Moçambique..."
            placeholderTextColor="#94A3B8"
          />
        </View>

        {(isSearching || predictions.length > 0) && (
          <View style={s.predictions}>
            {isSearching ? (
              <View style={s.predLoading}>
                <ActivityIndicator size="small" color="#10B981" />
                <Text style={s.predLoadingText}>Buscando...</Text>
              </View>
            ) : (
              predictions.map((p, idx) => (
                <TouchableOpacity
                  key={`${p.place_id}-${idx}`}
                  style={s.predRow}
                  onPress={() => handlePredictionSelect(p)}
                  activeOpacity={0.8}
                >
                  <View style={s.predIcon}>
                    <Ionicons name="location-outline" size={16} color="#94A3B8" />
                  </View>
                  <View style={s.predText}>
                    <Text style={s.predName} numberOfLines={1}>
                      {p.name || p.structured_formatting?.main_text || p.description}
                    </Text>
                    <Text style={s.predAddr} numberOfLines={1}>
                      {p.address || p.structured_formatting?.secondary_text || ''}
                    </Text>
                  </View>
                  {p.distance_meters != null && (
                    <View style={s.predDist}>
                      <Text style={s.predDistText}>
                        {p.distance_meters < 1000
                          ? `${Math.round(p.distance_meters)}m`
                          : `${(p.distance_meters / 1000).toFixed(1)}km`}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {lat != null && (
          <View style={s.confirmedRow}>
            <Ionicons name="checkmark-circle" size={16} color="#10B981" />
            <Text style={s.confirmedText}>
              {selectedViaMap ? 'Localização marcada no mapa' : 'Localização confirmada'}
            </Text>
          </View>
        )}

        {/* icon picker */}
        <Text style={[s.fieldLabel, { marginTop: 24 }]}>ESCOLHER ÍCONE</Text>
        <View style={s.iconGrid}>
          {ICON_OPTIONS.map((opt) => {
            const active = selectedIcon === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[s.iconCell, active ? s.iconCellActive : s.iconCellInactive]}
                onPress={() => { setSelectedIcon(opt.id); setSelectedColor(opt.color); }}
                activeOpacity={0.8}
              >
                <Ionicons name={opt.icon} size={20} color={active ? '#FFF' : opt.color} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* quick access */}
        <View style={s.toggleRow}>
          <View>
            <Text style={s.toggleTitle}>Acesso Rápido</Text>
            <Text style={s.toggleSub}>Mostrar atalho na tela inicial</Text>
          </View>
          <Switch
            value={isQuickAccess}
            onValueChange={setIsQuickAccess}
            trackColor={{ false: '#E2E8F0', true: '#10B981' }}
            thumbColor="#FFF"
          />
        </View>

        {/* save */}
        <TouchableOpacity
          style={[s.btnPrimary, s.saveBtn, isSaving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.85}
        >
          {isSaving ? (
            <View style={s.savingRow}>
              <ActivityIndicator size="small" color="#FFF" />
              <Text style={s.btnPrimaryText}>Guardando...</Text>
            </View>
          ) : (
            <Text style={s.btnPrimaryText}>Guardar Endereço</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[s.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Top bar ── */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.topBarBtn} onPress={handleBack} activeOpacity={0.7} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={s.topBarTitle} numberOfLines={1}>{headerTitle}</Text>
        <TouchableOpacity style={s.topBarBtn} onPress={() => router.back()} activeOpacity={0.7} hitSlop={8}>
          <Ionicons name="close" size={22} color="#0F172A" />
        </TouchableOpacity>
      </View>

      {/* error bar */}
      {errorMsg && (
        <View style={s.errorBar}>
          <Ionicons name="alert-circle" size={16} color="#EF4444" />
          <Text style={s.errorText}>{errorMsg}</Text>
          <TouchableOpacity onPress={() => setErrorMsg(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color="#F87171" />
          </TouchableOpacity>
        </View>
      )}

      {/* content */}
      <View style={[s.content, { paddingBottom: insets.bottom }]}>
        {deleteConfirmId ? renderDeleteConfirm() : isAdding ? renderForm() : renderList()}
      </View>
    </KeyboardAvoidingView>
  );
}

const { width: SW } = Dimensions.get('window');

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' },

  /* top bar */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  topBarBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F7F8FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0F172A' },

  /* error */
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FEE2E2',
  },
  errorText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#DC2626' },

  content: { flex: 1 },

  /* centered (loading / delete) */
  centeredSection: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  loadingLabel: { marginTop: 8, fontSize: 14, fontWeight: '500', color: '#94A3B8' },

  deleteCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#FEF2F2',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  deleteTitle: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  deleteBody: { fontSize: 13, fontWeight: '400', color: '#64748B', textAlign: 'center', lineHeight: 20 },

  /* list */
  listPad: { padding: 20, paddingBottom: 40 },

  typeGrid: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  typeCardWrap: { flex: 1, position: 'relative' },
  typeCard: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, paddingHorizontal: 8,
    borderRadius: 18, borderWidth: 1,
  },
  typeCardFilled: { borderColor: '#E2E8F0', backgroundColor: '#FFF' },
  typeCardEmpty: { borderColor: '#E2E8F0', backgroundColor: '#F7F8FA' },
  typeIconCircle: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  typeLabel: { fontSize: 10, fontWeight: '700', color: '#0F172A', textTransform: 'uppercase', letterSpacing: 1 },
  typeAddr: { fontSize: 9, fontWeight: '400', color: '#94A3B8', marginTop: 4, textAlign: 'center' },
  typeActions: { position: 'absolute', top: -6, right: -2, flexDirection: 'row', gap: 4, zIndex: 10 },
  miniActionBtn: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E2E8F0',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 },
      android: { elevation: 2 },
    }),
  },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#0F172A', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10,
  },
  addBtnLabel: { fontSize: 12, fontWeight: '600', color: '#FFF' },

  emptyBox: {
    alignItems: 'center', paddingVertical: 40, gap: 10,
    backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1, borderColor: '#E2E8F0', borderStyle: 'dashed',
  },
  emptyText: { fontSize: 13, fontWeight: '500', color: '#94A3B8' },

  customRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, backgroundColor: '#FFF', borderRadius: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  customIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  customText: { flex: 1, minWidth: 0 },
  customName: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  customAddr: { fontSize: 11, fontWeight: '400', color: '#94A3B8', marginTop: 2 },
  rowAction: { padding: 8 },

  /* form */
  formPad: { padding: 20, paddingBottom: 40 },

  mapPickCard: {
    alignItems: 'center', justifyContent: 'center', padding: 24,
    backgroundColor: '#ECFDF5', borderRadius: 20, borderWidth: 1, borderColor: '#D1FAE5', gap: 8,
  },
  mapPickIcon: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
      android: { elevation: 6 },
    }),
  },
  mapPickTitle: { fontSize: 17, fontWeight: '700', color: '#064E3B' },
  mapPickSub: { fontSize: 12, fontWeight: '500', color: '#047857' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { fontSize: 10, fontWeight: '700', color: '#CBD5E1', letterSpacing: 1 },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: '#FFF', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14,
    fontSize: 15, fontWeight: '500', color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0',
  },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
    borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, paddingHorizontal: 10, paddingVertical: 14, fontSize: 15, fontWeight: '500', color: '#0F172A' },

  predictions: {
    backgroundColor: '#FFF', borderRadius: 14, marginTop: 8,
    borderWidth: 1, borderColor: '#E2E8F0', maxHeight: 240, overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  predLoading: { alignItems: 'center', padding: 20, gap: 8 },
  predLoadingText: { fontSize: 11, fontWeight: '600', color: '#94A3B8' },
  predRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  predIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  predText: { flex: 1, minWidth: 0 },
  predName: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  predAddr: { fontSize: 10, fontWeight: '400', color: '#94A3B8', marginTop: 1 },
  predDist: { backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  predDistText: { fontSize: 10, fontWeight: '700', color: '#059669' },

  confirmedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 4 },
  confirmedText: { fontSize: 12, fontWeight: '600', color: '#10B981' },

  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  iconCell: {
    width: (SW - 40 - 30) / 4, aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 2,
  },
  iconCellActive: { borderColor: '#0F172A', backgroundColor: '#0F172A' },
  iconCellInactive: { borderColor: '#F1F5F9', backgroundColor: '#F7F8FA' },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginTop: 24,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  toggleTitle: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  toggleSub: { fontSize: 11, fontWeight: '400', color: '#94A3B8', marginTop: 2 },

  /* map */
  mapSection: { flex: 1, padding: 20, gap: 12 },
  mapFrame: { flex: 1, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0' },
  mapView: { width: '100%', height: '100%' },
  recenterBtn: {
    position: 'absolute', bottom: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFF', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 24,
    borderWidth: 1, borderColor: '#E2E8F0',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6 },
      android: { elevation: 4 },
    }),
  },
  recenterLabel: { fontSize: 10, fontWeight: '700', color: '#0F172A', letterSpacing: 0.5 },
  mapHint: { fontSize: 13, fontWeight: '600', color: '#0F172A', textAlign: 'center' },
  mapSubHint: { fontSize: 11, fontWeight: '400', color: '#94A3B8', textAlign: 'center' },
  mapButtons: { flexDirection: 'row', gap: 12 },

  /* shared buttons */
  btnPrimary: {
    flex: 1, height: 52, borderRadius: 14, backgroundColor: '#0F172A',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  btnPrimaryText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  btnOutline: {
    flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  btnOutlineText: { color: '#64748B', fontSize: 15, fontWeight: '600' },
  btnDanger: {
    width: '100%', height: 52, borderRadius: 14, backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  btnDangerText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  btnGhost: { width: '100%', height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnGhostText: { color: '#94A3B8', fontSize: 15, fontWeight: '600' },

  saveBtn: { marginTop: 24, flex: 0, height: 56 },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
  KeyboardAvoidingView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { rideService } from '@/services/rideService';
import { usePassengerLocation } from '@/hooks/usePassengerLocation';

const FONT_BODY = Platform.select({
  ios: undefined,
  android: 'sans-serif',
  default: undefined,
});

type SosStep = 'main' | 'emergency_contacts' | 'zamba_alert' | 'success';

type EmergencyContact = {
  contact_type?: string;
  contact_label?: string;
  phone_number?: string;
};

type SosReason = {
  reason_code: string;
  reason_label: string;
  requires_details?: boolean;
};

function asContacts(rows: Record<string, unknown>[]): EmergencyContact[] {
  return rows.map((r) => ({
    contact_type: r.contact_type != null ? String(r.contact_type) : undefined,
    contact_label: r.contact_label != null ? String(r.contact_label) : '',
    phone_number: r.phone_number != null ? String(r.phone_number) : '',
  }));
}

function asReasons(rows: Record<string, unknown>[]): SosReason[] {
  return rows
    .map((r) => ({
      reason_code: r.reason_code != null ? String(r.reason_code) : '',
      reason_label: r.reason_label != null ? String(r.reason_label) : '',
      requires_details: Boolean(r.requires_details),
    }))
    .filter((x) => x.reason_code);
}

function parseAlertIdFromCreateResult(result: unknown): string | null {
  if (result == null) return null;
  if (typeof result === 'string') return result;
  if (typeof result === 'object' && result !== null) {
    const o = result as Record<string, unknown>;
    if (o.alert_id != null) return String(o.alert_id);
  }
  return null;
}

export function EmergencySosModal({
  visible,
  onClose,
  rideId,
}: {
  visible: boolean;
  onClose: () => void;
  rideId: string;
}) {
  const insets = useSafeAreaInsets();
  const { getFreshPosition } = usePassengerLocation();

  const [sosStep, setSosStep] = useState<SosStep>('main');
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [sosReasons, setSosReasons] = useState<SosReason[]>([]);
  const [selectedSosReason, setSelectedSosReason] = useState<SosReason | null>(null);
  const [sosDetails, setSosDetails] = useState('');
  const [isSendingSos, setIsSendingSos] = useState(false);
  const [isLoadingSosData, setIsLoadingSosData] = useState(false);
  const [activeSosAlertId, setActiveSosAlertId] = useState<string | null>(null);
  const [sosError, setSosError] = useState<string | null>(null);

  useEffect(() => {
    setActiveSosAlertId(null);
  }, [rideId]);

  useEffect(() => {
    if (!visible) {
      setSosStep('main');
      setSelectedSosReason(null);
      setSosDetails('');
      setSosError(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!activeSosAlertId || !visible) return;
    const tick = async () => {
      try {
        const pos = await getFreshPosition();
        if (!pos) return;
        await rideService.updateSosAlertLocation(activeSosAlertId, pos.latitude, pos.longitude);
      } catch (err) {
        console.error('[sos] error updating location:', err);
      }
    };
    void tick();
    const id = setInterval(() => {
      void tick();
    }, 7000);
    return () => clearInterval(id);
  }, [activeSosAlertId, visible, getFreshPosition]);

  const handleFetchEmergencyContacts = useCallback(async () => {
    setSosStep('emergency_contacts');
    setIsLoadingSosData(true);
    setSosError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSosError('Sessão expirada. Entre novamente para continuar.');
        setIsLoadingSosData(false);
        return;
      }

      const contacts = await rideService.getEmergencyContacts();
      setEmergencyContacts(asContacts(contacts));
    } catch (err: unknown) {
      console.error('[sos] error fetching contacts:', err);
      const errorMessage = err instanceof Error ? err.message : '';
      if (
        errorMessage.includes('Invalid Refresh Token') ||
        errorMessage.includes('Refresh Token Not Found') ||
        errorMessage.includes('JWT expired')
      ) {
        setSosError('Sessão expirada. Entre novamente para continuar.');
      } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Network')) {
        setSosError('Não foi possível carregar os contactos de emergência.');
      } else {
        setSosError('Erro ao carregar contactos de emergência.');
      }
    } finally {
      setIsLoadingSosData(false);
    }
  }, []);

  const handleFetchSosReasons = useCallback(async () => {
    setIsLoadingSosData(true);
    setSosError(null);
    try {
      const reasons = await rideService.getSosReasons();
      setSosReasons(asReasons(reasons));
      setSosStep('zamba_alert');
    } catch (err) {
      console.error('[sos] error fetching reasons:', err);
      setSosError('Erro ao carregar motivos de segurança.');
    } finally {
      setIsLoadingSosData(false);
    }
  }, []);

  const handleConfirmZambaAlert = useCallback(async () => {
    if (!selectedSosReason) {
      setSosError('Selecione um motivo antes de continuar.');
      return;
    }
    if (selectedSosReason.requires_details && !sosDetails.trim()) {
      setSosError('Preencha os detalhes deste alerta.');
      return;
    }

    let lat: number;
    let lng: number;
    try {
      const pos = await getFreshPosition();
      if (!pos) {
        setSosError('Não foi possível obter a sua localização.');
        return;
      }
      lat = pos.latitude;
      lng = pos.longitude;
    } catch {
      setSosError('Não foi possível obter a sua localização.');
      return;
    }

    setIsSendingSos(true);
    setSosError(null);

    try {
      if (activeSosAlertId) {
        setSosStep('success');
        return;
      }

      const result = await rideService.createSosAlert(
        rideId,
        'zamba_alert',
        selectedSosReason.reason_code,
        sosDetails || '',
        lat,
        lng,
      );

      const r = result as Record<string, unknown> | null;
      if (r && r.already_exists && r.alert_id != null) {
        setActiveSosAlertId(String(r.alert_id));
      } else {
        const id = parseAlertIdFromCreateResult(result);
        if (id) setActiveSosAlertId(id);
      }

      setSosStep('success');
    } catch (err: unknown) {
      console.error('SOS create_sos_alert error:', err);
      const errorMessage = err instanceof Error ? err.message : '';
      if (
        errorMessage.includes('Invalid Refresh Token') ||
        errorMessage.includes('Refresh Token Not Found')
      ) {
        setSosError('Sessão expirada. Entre novamente para continuar.');
      } else {
        setSosError(errorMessage || 'Erro ao enviar alerta. Tente novamente.');
      }
    } finally {
      setIsSendingSos(false);
    }
  }, [activeSosAlertId, rideId, selectedSosReason, sosDetails, getFreshPosition]);

  const goBack = () => setSosStep('main');

  const title =
    sosStep === 'main'
      ? 'Centro de Emergência'
      : sosStep === 'emergency_contacts'
        ? 'Ligar para Emergência'
        : sosStep === 'zamba_alert'
          ? 'Alertar Equipa Zamba'
          : 'Alerta Enviado';

  const titleColor = sosStep === 'success' ? '#059669' : '#DC2626';

  const closeIfAllowed = () => {
    if (!isSendingSos) onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={closeIfAllowed}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.wrap}>
          <Pressable
            style={styles.backdrop}
            onPress={closeIfAllowed}
            disabled={isSendingSos}
          />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            <View style={styles.dragBar} />
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                {sosStep !== 'main' && sosStep !== 'success' && (
                  <TouchableOpacity
                    onPress={goBack}
                    hitSlop={12}
                    style={styles.iconBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Voltar"
                  >
                    <Ionicons name="chevron-back" size={22} color="#475569" />
                  </TouchableOpacity>
                )}
                <Text style={[styles.headerTitle, { color: titleColor }]} numberOfLines={1}>
                  {title}
                </Text>
              </View>
              <TouchableOpacity
                onPress={closeIfAllowed}
                hitSlop={12}
                style={styles.iconBtn}
                disabled={isSendingSos}
                accessibilityRole="button"
                accessibilityLabel="Fechar"
              >
                <Ionicons name="close" size={22} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {sosStep === 'main' && (
                <View style={styles.section}>
                  <View style={styles.heroCard}>
                    <View style={styles.heroIconCircle}>
                      <Ionicons name="shield" size={26} color="#FFF" />
                    </View>
                    <Text style={styles.heroTitle}>Precisa de ajuda?</Text>
                    <Text style={styles.heroBody}>
                      Ao ativar o SOS, a sua localização será enviada imediatamente para a nossa equipa
                      de segurança e autoridades locais.
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.btnPrimary, styles.btnRed]}
                    onPress={handleFetchEmergencyContacts}
                    disabled={isLoadingSosData}
                    activeOpacity={0.9}
                  >
                    <Ionicons name="call" size={18} color="#FFF" />
                    <Text style={styles.btnPrimaryText}>Ligar para Emergência</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.btnPrimary, styles.btnEmerald]}
                    onPress={handleFetchSosReasons}
                    disabled={isLoadingSosData}
                    activeOpacity={0.9}
                  >
                    {isLoadingSosData && sosStep === 'main' ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <Ionicons name="warning" size={18} color="#FFF" />
                    )}
                    <Text style={styles.btnPrimaryText}>Alertar Equipa Zamba</Text>
                  </TouchableOpacity>

                  {sosError ? <Text style={styles.errorSmall}>{sosError}</Text> : null}
                </View>
              )}

              {sosStep === 'emergency_contacts' && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Contactos Oficiais</Text>
                  {isLoadingSosData ? (
                    <View style={styles.skeletonStack}>
                      {[1, 2, 3].map((i) => (
                        <View key={i} style={styles.skeletonRow}>
                          <View style={styles.skeletonIcon} />
                          <View style={styles.skeletonTextCol}>
                            <View style={styles.skeletonLineWide} />
                            <View style={styles.skeletonLineNarrow} />
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : sosError ? (
                    <View style={styles.errorCard}>
                      <View style={styles.errorIconWrap}>
                        <Ionicons name="alert-circle" size={22} color="#DC2626" />
                      </View>
                      <Text style={styles.errorTitle}>{sosError}</Text>
                      <Text style={styles.errorSub}>
                        Verifique a sua ligação ou tente novamente.
                      </Text>
                      <TouchableOpacity
                        style={[styles.btnPrimary, styles.btnRed, { marginTop: 12 }]}
                        onPress={handleFetchEmergencyContacts}
                      >
                        <Text style={styles.btnPrimaryText}>Tentar novamente</Text>
                      </TouchableOpacity>
                    </View>
                  ) : emergencyContacts.length === 0 ? (
                    <View style={styles.emptyContacts}>
                      <Ionicons name="call-outline" size={28} color="#CBD5E1" />
                      <Text style={styles.emptyText}>Nenhum contacto de emergência configurado.</Text>
                    </View>
                  ) : (
                    emergencyContacts.map((contact, idx) => (
                      <TouchableOpacity
                        key={`${contact.contact_type}-${contact.phone_number}-${idx}`}
                        style={styles.contactRow}
                        onPress={() => {
                          const raw = (contact.phone_number || '').replace(/\s/g, '');
                          if (raw) void Linking.openURL(`tel:${raw}`);
                        }}
                        activeOpacity={0.85}
                      >
                        <View style={styles.contactIconBox}>
                          <Ionicons name="call" size={18} color="#EF4444" />
                        </View>
                        <View style={styles.contactTextCol}>
                          <Text style={styles.contactLabel}>{contact.contact_label || '—'}</Text>
                          <Text style={styles.contactPhone}>{contact.phone_number}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}

              {sosStep === 'zamba_alert' && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Qual é o problema?</Text>
                  {!isLoadingSosData && sosReasons.length === 0 ? (
                    <View style={styles.emptyContacts}>
                      <Ionicons name="list-outline" size={28} color="#CBD5E1" />
                      <Text style={styles.emptyText}>Nenhum motivo disponível.</Text>
                    </View>
                  ) : null}
                  {sosReasons.map((reason, idx) => {
                    const selected = selectedSosReason?.reason_code === reason.reason_code;
                    return (
                      <TouchableOpacity
                        key={`${reason.reason_code}-${idx}`}
                        style={[styles.reasonRow, selected && styles.reasonRowSelected]}
                        onPress={() => {
                          setSelectedSosReason(reason);
                          setSosError(null);
                        }}
                        activeOpacity={0.88}
                      >
                        <Text style={[styles.reasonLabel, selected && styles.reasonLabelSelected]}>
                          {reason.reason_label}
                        </Text>
                        <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
                          {selected ? (
                            <Ionicons name="checkmark" size={14} color="#FFF" />
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  <Text style={styles.sectionLabel}>
                    Descreva o que está a acontecer{' '}
                    {selectedSosReason?.requires_details ? '(Obrigatório)' : ''}
                  </Text>
                  <TextInput
                    style={styles.textArea}
                    value={sosDetails}
                    onChangeText={(t) => {
                      setSosDetails(t);
                      setSosError(null);
                    }}
                    placeholder="Ex: O motorista está a conduzir de forma perigosa..."
                    placeholderTextColor="#94A3B8"
                    multiline
                    textAlignVertical="top"
                  />

                  {sosError ? <Text style={styles.errorSmallCenter}>{sosError}</Text> : null}

                  <TouchableOpacity
                    style={[
                      styles.btnPrimary,
                      styles.btnBlack,
                      (!selectedSosReason ||
                        (selectedSosReason.requires_details && !sosDetails.trim()) ||
                        isSendingSos) &&
                        styles.btnDisabled,
                    ]}
                    onPress={handleConfirmZambaAlert}
                    disabled={
                      !selectedSosReason ||
                      Boolean(selectedSosReason.requires_details && !sosDetails.trim()) ||
                      isSendingSos
                    }
                    activeOpacity={0.9}
                  >
                    {isSendingSos ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <Ionicons name="warning" size={18} color="#FFF" />
                    )}
                    <Text style={styles.btnPrimaryText}>
                      {isSendingSos ? 'Enviando Alerta...' : 'Confirmar Alerta SOS'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {sosStep === 'success' && (
                <View style={styles.successBlock}>
                  <View style={styles.successIconCircle}>
                    <Ionicons name="checkmark-circle" size={44} color="#059669" />
                  </View>
                  <Text style={styles.successTitle}>Alerta Enviado</Text>
                  <Text style={styles.successBody}>
                    A equipa Zamba foi notificada e está a monitorizar a sua viagem em tempo real.
                  </Text>
                  <TouchableOpacity
                    style={[styles.btnPrimary, styles.btnEmerald, styles.successBtn]}
                    onPress={onClose}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.btnPrimaryText}>Entendido</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  dragBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F8FAFC',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  headerTitle: {
    fontFamily: FONT_BODY,
    fontSize: 16,
    fontWeight: '900',
    flexShrink: 1,
  },
  iconBtn: {
    padding: 6,
    borderRadius: 999,
  },
  scroll: { maxHeight: 520 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  section: { gap: 12 },
  heroCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    gap: 10,
  },
  heroIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#DC2626',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  heroTitle: {
    fontFamily: FONT_BODY,
    fontSize: 16,
    fontWeight: '900',
    color: '#7F1D1D',
    textAlign: 'center',
  },
  heroBody: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(185, 28, 28, 0.85)',
    textAlign: 'center',
    lineHeight: 15,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  btnRed: {
    backgroundColor: '#DC2626',
    ...Platform.select({
      ios: {
        shadowColor: '#FECACA',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  btnEmerald: {
    backgroundColor: '#059669',
    ...Platform.select({
      ios: {
        shadowColor: '#A7F3D0',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.9,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  btnBlack: {
    backgroundColor: '#0F172A',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnPrimaryText: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#FFF',
    textTransform: 'uppercase',
  },
  errorSmall: {
    fontFamily: FONT_BODY,
    fontSize: 10,
    fontWeight: '800',
    color: '#EF4444',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  errorSmallCenter: {
    fontFamily: FONT_BODY,
    fontSize: 10,
    fontWeight: '800',
    color: '#EF4444',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 4,
  },
  sectionLabel: {
    fontFamily: FONT_BODY,
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginLeft: 4,
    marginTop: 4,
  },
  skeletonStack: { gap: 8 },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  skeletonIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  skeletonTextCol: { flex: 1, gap: 8 },
  skeletonLineWide: {
    height: 12,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    width: '45%',
  },
  skeletonLineNarrow: {
    height: 10,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    width: '28%',
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
  },
  errorIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  errorTitle: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '900',
    color: '#7F1D1D',
    textAlign: 'center',
  },
  errorSub: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(185, 28, 28, 0.75)',
    textAlign: 'center',
    marginTop: 4,
  },
  emptyContacts: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  emptyText: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
    textAlign: 'center',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  contactIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
    }),
  },
  contactTextCol: { flex: 1, minWidth: 0 },
  contactLabel: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  contactPhone: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#F1F5F9',
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
  },
  reasonRowSelected: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(254, 242, 242, 0.5)',
  },
  reasonLabel: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    flex: 1,
    paddingRight: 8,
  },
  reasonLabelSelected: { color: '#B91C1C' },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterOn: {
    borderColor: '#EF4444',
    backgroundColor: '#EF4444',
  },
  textArea: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '500',
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    minHeight: 88,
  },
  successBlock: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontFamily: FONT_BODY,
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  successBody: {
    fontFamily: FONT_BODY,
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
  successBtn: {
    marginTop: 8,
    minWidth: 200,
  },
});

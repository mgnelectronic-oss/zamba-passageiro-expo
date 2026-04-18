import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Share,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rideService } from '@/services/rideService';

const FONT_BODY = Platform.select({
  ios: undefined,
  android: 'sans-serif',
  default: undefined,
});

type ShareResult = {
  success?: boolean;
  already_exists?: boolean;
  reason?: string;
  share_invite_message?: string;
};

function parseShareResult(raw: unknown): ShareResult | null {
  if (raw == null || typeof raw !== 'object') return null;
  return raw as ShareResult;
}

export function ShareTripModal({
  visible,
  onClose,
  rideId,
}: {
  visible: boolean;
  onClose: () => void;
  rideId: string;
}) {
  const insets = useSafeAreaInsets();
  const [sharePhone, setSharePhone] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [shareAlreadyExists, setShareAlreadyExists] = useState(false);
  const [shareNotRegistered, setShareNotRegistered] = useState(false);
  const [shareInviteMessage, setShareInviteMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setShareError(null);
      setShareSuccess(false);
      setShareAlreadyExists(false);
      setShareNotRegistered(false);
      setShareInviteMessage(null);
    }
  }, [visible]);

  const handleShareRide = async () => {
    const phone = sharePhone.trim();
    if (!phone || !rideId) return;

    setIsSharing(true);
    setShareError(null);
    setShareSuccess(false);
    setShareAlreadyExists(false);
    setShareNotRegistered(false);
    setShareInviteMessage(null);

    try {
      const raw = await rideService.createRideShare(rideId, phone);
      const result = parseShareResult(raw);

      if (!result) {
        setShareError('Erro ao partilhar viagem. Tente novamente.');
        return;
      }

      if (result.success) {
        if (result.already_exists) {
          setShareAlreadyExists(true);
        } else {
          setShareSuccess(true);
          setSharePhone('');
        }
      } else if (result.reason === 'contact_not_registered') {
        setShareNotRegistered(true);
        setShareInviteMessage(result.share_invite_message ?? null);
      } else {
        setShareError('Erro ao partilhar viagem. Tente novamente.');
      }
    } catch (err: unknown) {
      console.error('[share] error sharing ride:', err);
      const msg = err instanceof Error ? err.message.trim() : '';
      setShareError(
        msg && msg.length > 0 && msg.length < 220
          ? msg
          : 'Erro ao partilhar viagem. Tente novamente.',
      );
    } finally {
      setIsSharing(false);
    }
  };

  const handleShareInviteMessage = async () => {
    if (!shareInviteMessage) return;
    try {
      await Share.share({ message: shareInviteMessage });
    } catch (err: unknown) {
      const e = err as { name?: string };
      if (e?.name === 'AbortError' || e?.name === 'CANCELLED') return;
      console.error('[share] Share invite message:', err);
    }
  };

  const closeIfAllowed = () => {
    if (!isSharing) onClose();
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
          <Pressable style={styles.backdrop} onPress={closeIfAllowed} disabled={isSharing} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollPad}
            >
              <View style={styles.headerRow}>
                <Text style={styles.title}>Partilhar Viagem</Text>
                <TouchableOpacity
                  onPress={closeIfAllowed}
                  hitSlop={12}
                  disabled={isSharing}
                  accessibilityRole="button"
                  accessibilityLabel="Fechar"
                >
                  <Ionicons name="close" size={26} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <Text style={styles.intro}>
                Partilhe a sua localização em tempo real com amigos ou familiares para uma viagem mais
                segura.
              </Text>

              {shareNotRegistered ? (
                <View style={styles.notRegCard}>
                  <View style={styles.notRegTitleRow}>
                    <Ionicons name="alert-circle" size={22} color="#D97706" />
                    <Text style={styles.notRegTitle}>Número não registado</Text>
                  </View>
                  <Text style={styles.notRegBold}>O número não está registado no Zamba.</Text>
                  <Text style={styles.notRegSub}>
                    Para acompanhar a viagem em tempo real, a pessoa precisa instalar o app Zamba.
                  </Text>
                  <TouchableOpacity style={styles.btnEmerald} onPress={handleShareInviteMessage} activeOpacity={0.9}>
                    <Text style={styles.btnEmeraldText}>Partilhar mensagem</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShareNotRegistered(false)}
                    style={styles.linkMuted}
                    accessibilityRole="button"
                  >
                    <Text style={styles.linkMutedText}>Tentar outro número</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.fieldLabel}>Contacto</Text>
                  <TextInput
                    style={styles.input}
                    value={sharePhone}
                    onChangeText={(t) => {
                      setSharePhone(t);
                      setShareError(null);
                    }}
                    placeholder="Número de telefone"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                    editable={!isSharing && !shareSuccess}
                    autoCorrect={false}
                  />

                  {shareError ? (
                    <View style={styles.bannerErr}>
                      <Ionicons name="alert-circle" size={20} color="#DC2626" />
                      <Text style={styles.bannerErrText}>{shareError}</Text>
                    </View>
                  ) : null}

                  {shareAlreadyExists ? (
                    <View style={styles.bannerWarn}>
                      <Ionicons name="information-circle" size={20} color="#B45309" />
                      <Text style={styles.bannerWarnText}>
                        Esta viagem já está partilhada com este contacto
                      </Text>
                    </View>
                  ) : null}

                  {shareSuccess ? (
                    <View style={styles.bannerOk}>
                      <Ionicons name="checkmark-circle" size={20} color="#059669" />
                      <Text style={styles.bannerOkText}>
                        Viagem partilhada com sucesso! A pessoa receberá a partilha na página
                        &quot;Viagem Partilhada&quot;
                      </Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.btnBlack,
                      (isSharing || !sharePhone.trim() || shareSuccess) && styles.btnDisabled,
                    ]}
                    onPress={handleShareRide}
                    disabled={isSharing || !sharePhone.trim() || shareSuccess}
                    activeOpacity={0.9}
                  >
                    {isSharing ? (
                      <View style={styles.btnBlackInner}>
                        <ActivityIndicator color="#FFF" size="small" />
                        <Text style={styles.btnBlackLoadingLabel}>A partilhar…</Text>
                      </View>
                    ) : (
                      <Text style={styles.btnBlackText}>Partilhar Localização</Text>
                    )}
                  </TouchableOpacity>
                </>
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
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '88%',
    overflow: 'hidden',
    marginHorizontal: 0,
  },
  scrollPad: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontFamily: FONT_BODY,
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    flex: 1,
    paddingRight: 12,
  },
  intro: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 22,
  },
  fieldLabel: {
    fontFamily: FONT_BODY,
    fontSize: 10,
    fontWeight: '900',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginLeft: 2,
  },
  input: {
    fontFamily: FONT_BODY,
    height: 56,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    paddingHorizontal: 20,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 14,
  },
  bannerErr: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  bannerErrText: {
    fontFamily: FONT_BODY,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    lineHeight: 17,
  },
  bannerWarn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  bannerWarnText: {
    fontFamily: FONT_BODY,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
    lineHeight: 17,
  },
  bannerOk: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  bannerOkText: {
    fontFamily: FONT_BODY,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
    lineHeight: 17,
  },
  btnBlack: {
    height: 56,
    borderRadius: 16,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  btnDisabled: { opacity: 0.5 },
  btnBlackInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  btnBlackLoadingLabel: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.6,
  },
  btnBlackText: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  notRegCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 24,
    padding: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F3F4F6',
    gap: 10,
  },
  notRegTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  notRegTitle: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '900',
    color: '#D97706',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  notRegBold: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  notRegSub: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    lineHeight: 18,
  },
  btnEmerald: {
    marginTop: 8,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#6EE7B7',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  btnEmeraldText: {
    fontFamily: FONT_BODY,
    fontSize: 10,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  linkMuted: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  linkMutedText: {
    fontFamily: FONT_BODY,
    fontSize: 10,
    fontWeight: '900',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

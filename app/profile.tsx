import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import Feather from '@expo/vector-icons/Feather';
import { authService, type UserProfile } from '@/services/authService';
import { CachedRemoteImage } from '@/components/CachedRemoteImage';

const C = {
  bg: '#F7F8FA',
  surface: '#FFFFFF',
  text: '#000000',
  textMuted: '#888888',
  label: '#9CA3AF',
  border: '#E5E7EB',
  headerBg: '#F9FAFB',
  cardBorder: '#F3F4F6',
  emerald: '#10B981',
  blue: '#3B82F6',
  red: '#DC2626',
  redBg: '#FEF2F2',
  redBorder: '#FECACA',
};

function statusLabel(v: UserProfile['verification_status']) {
  if (v === 'approved') return { text: 'Verificada', color: C.emerald };
  if (v === 'pending') return { text: 'Pendente', color: C.blue };
  if (v === 'rejected') return { text: 'Rejeitada', color: C.red };
  return { text: 'Não verificada', color: C.textMuted };
}

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadProfile = useCallback(async () => {
    const u = await authService.getCurrentUser();
    if (!u) {
      setLoading(false);
      return;
    }
    setUser({ id: u.id, email: u.email ?? undefined });
    const p = await authService.getUserProfile(u.id);
    setProfile(p);
    if (p) {
      setFullName(p.full_name ?? '');
      setPhone(p.phone ?? '');
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadProfile();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadProfile]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth');
    }
  }, [loading, user, router]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await authService.updateProfile(fullName.trim(), phone.trim());
      await loadProfile();
      setIsEditing(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar perfil';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setPhone(profile.phone ?? '');
    }
    setIsEditing(false);
    setError(null);
  };

  const handleLogout = async () => {
    await authService.signOut();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]} edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color={C.emerald} />
      </SafeAreaView>
    );
  }

  if (!user) {
    return null;
  }

  const emailDisplay = user?.email ?? '—';
  const stInfo = statusLabel(profile?.verification_status ?? null);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Top bar */}
          <View style={styles.topBar}>
            <View style={styles.topBarLeft}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => router.back()}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Voltar"
              >
                <Feather name="arrow-left" size={22} color={C.text} />
              </TouchableOpacity>
              <Text style={styles.pageTitle} numberOfLines={1}>
                Perfil do Usuário
              </Text>
            </View>
            {!isEditing && (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => setIsEditing(true)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Editar perfil"
              >
                <Feather name="edit-2" size={18} color={C.text} />
              </TouchableOpacity>
            )}
          </View>

          {/* Card */}
          <View style={styles.card}>
            {/* Header band */}
            <View style={styles.cardHeader}>
              <View style={styles.avatarBox}>
                <CachedRemoteImage
                  uri={profile?.avatar_url}
                  style={styles.avatarImg}
                  cacheScope="profile_avatar"
                  fallback={<Ionicons name="person" size={40} color="#6B7280" />}
                />
              </View>

              {isEditing ? (
                <TextInput
                  style={styles.nameInput}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Nome completo"
                  placeholderTextColor={C.label}
                  autoCapitalize="words"
                />
              ) : (
                <>
                  <Text style={styles.displayName}>
                    {profile?.full_name?.trim() || 'Usuário'}
                  </Text>
                  <Text style={styles.roleTag}>PASSAGEIRO ZAMBA</Text>
                </>
              )}
            </View>

            <View style={styles.cardBody}>
              {/* Email */}
              <View style={styles.infoRow}>
                <Ionicons name="mail-outline" size={20} color={C.textMuted} />
                <View style={styles.infoTextCol}>
                  <Text style={styles.infoLabel}>EMAIL</Text>
                  <Text style={styles.infoValue}>{emailDisplay}</Text>
                </View>
              </View>

              {/* Contacto */}
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={20} color={C.textMuted} />
                <View style={styles.infoTextCol}>
                  <Text style={styles.infoLabel}>CONTACTO</Text>
                  {isEditing ? (
                    <TextInput
                      style={styles.inlineInput}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="Contacto"
                      placeholderTextColor={C.label}
                      keyboardType="phone-pad"
                    />
                  ) : (
                    <Text style={styles.infoValue}>{profile?.phone?.trim() || 'Não definido'}</Text>
                  )}
                </View>
              </View>

              {/* Status */}
              <View style={styles.infoRow}>
                <Ionicons name="shield-checkmark-outline" size={20} color={C.textMuted} />
                <View style={styles.infoTextCol}>
                  <Text style={styles.infoLabel}>STATUS DA CONTA</Text>
                  <Text style={[styles.infoValue, { color: stInfo.color }]}>{stInfo.text}</Text>
                </View>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {success ? <Text style={styles.successText}>Perfil atualizado com sucesso!</Text> : null}

              {isEditing ? (
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={styles.btnCancel}
                    onPress={handleCancelEdit}
                    disabled={saving}
                    activeOpacity={0.8}
                  >
                    <Feather name="x" size={18} color={C.text} />
                    <Text style={styles.btnCancelText}>CANCELAR</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnSave, saving && styles.btnDisabled]}
                    onPress={handleSave}
                    disabled={saving}
                    activeOpacity={0.85}
                  >
                    {saving ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <>
                        <Feather name="save" size={18} color="#FFF" />
                        <Text style={styles.btnSaveText}>GUARDAR</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
                  <Feather name="log-out" size={18} color={C.red} />
                  <Text style={styles.logoutText}>SAIR DA CONTA</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
      android: { elevation: 2 },
    }),
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: C.text,
    letterSpacing: -0.3,
    flexShrink: 1,
  },

  card: {
    backgroundColor: C.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 20 },
      android: { elevation: 6 },
    }),
  },
  cardHeader: {
    backgroundColor: C.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  avatarBox: {
    width: 96,
    height: 96,
    borderRadius: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  avatarImg: { width: 96, height: 96, borderRadius: 16 },
  displayName: {
    fontSize: 22,
    fontWeight: '900',
    color: C.text,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  roleTag: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '800',
    color: C.textMuted,
    letterSpacing: 2,
  },
  nameInput: {
    width: '100%',
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
  },

  cardBody: {
    padding: 20,
    gap: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: C.headerBg,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  infoTextCol: { flex: 1, minWidth: 0 },
  infoLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: C.label,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
  },
  inlineInput: {
    marginTop: 2,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
  },

  errorText: { fontSize: 12, fontWeight: '700', color: C.red, textAlign: 'center' },
  successText: { fontSize: 12, fontWeight: '700', color: C.emerald, textAlign: 'center' },

  editActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  btnCancel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  btnCancelText: {
    fontSize: 14,
    fontWeight: '900',
    color: C.text,
    letterSpacing: 1.2,
  },
  btnSave: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: C.text,
  },
  btnDisabled: { opacity: 0.6 },
  btnSaveText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 1.2,
  },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 6,
    paddingVertical: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.redBorder,
    backgroundColor: C.redBg,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '900',
    color: C.red,
    letterSpacing: 1.2,
  },
});

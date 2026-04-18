import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { UserProfile } from '@/services/authService';

const C = {
  blueBg: '#EFF6FF',
  blueBorder: '#DBEAFE',
  blue: '#3B82F6',
  amberBg: '#FFFBEB',
  amberBorder: '#FEF3C7',
  amber: '#F59E0B',
  redBg: '#FEF2F2',
  redBorder: '#FEE2E2',
  red: '#EF4444',
};

type Props = {
  profile: UserProfile | null;
  onPress: () => void;
  /** Igual à home: viagens completas para texto de aviso (default 0). */
  completedRidesCount?: number;
  /** Lista plana sem cartão (ex.: ecrã de pesquisa de destino). */
  variant?: 'card' | 'inline';
};

export function VerificationAccountCard({
  profile,
  onPress,
  completedRidesCount = 0,
  variant = 'card',
}: Props) {
  const verificationCopy = useMemo(() => {
    const v = profile?.verification_status;
    if (v === 'pending') return 'Aguardando a verificação da sua conta.';
    if (v === 'rejected')
      return 'A sua verificação foi rejeitada. Toque para corrigir e reenviar.';
    if (completedRidesCount === 0)
      return 'Pode realizar 2 viagens antes da verificação obrigatória.';
    if (completedRidesCount === 1)
      return 'Você ainda pode realizar 1 viagem antes da verificação obrigatória.';
    return 'A verificação da sua conta agora é obrigatória para continuar.';
  }, [profile?.verification_status, completedRidesCount]);

  const verTheme = useMemo(() => {
    const v = profile?.verification_status;
    if (v === 'rejected')
      return { bg: C.redBg, border: C.redBorder, icon: C.red, title: '#991B1B', body: '#B91C1C', chev: C.red };
    if (v === 'pending')
      return { bg: C.blueBg, border: C.blueBorder, icon: C.blue, title: '#1E40AF', body: '#1D4ED8', chev: C.blue };
    return { bg: C.amberBg, border: C.amberBorder, icon: C.amber, title: '#92400E', body: '#B45309', chev: C.amber };
  }, [profile?.verification_status]);

  if (!profile || profile.verification_status === 'approved') {
    return null;
  }

  if (variant === 'inline') {
    return (
      <TouchableOpacity
        style={[styles.inlineRow, { borderBottomColor: '#EEEEEE' }]}
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Verificação de conta"
      >
        <Ionicons name="shield-checkmark" size={18} color={verTheme.icon} />
        <View style={styles.textCol}>
          <Text style={[styles.inlineTitle, { color: verTheme.title }]}>Verificação de Conta</Text>
          <Text style={[styles.inlineBody, { color: verTheme.body }]} numberOfLines={2}>
            {verificationCopy}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: verTheme.bg, borderColor: verTheme.border }]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Verificação de conta"
    >
      <View style={[styles.iconBox, { backgroundColor: verTheme.border }]}>
        <Ionicons name="shield-checkmark" size={17} color={verTheme.icon} />
      </View>
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: verTheme.title }]}>Verificação de Conta</Text>
        <Text style={[styles.body, { color: verTheme.body }]} numberOfLines={3}>
          {verificationCopy}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={verTheme.chev} />
    </TouchableOpacity>
  );
}

const SHADOW = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
  android: { elevation: 1 },
});

const styles = StyleSheet.create({
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#FFFFFF',
  },
  inlineTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  inlineBody: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    ...SHADOW,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  body: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 17,
  },
});

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import Feather from '@expo/vector-icons/Feather';
import type { UserProfile } from '@/services/authService';
import { CachedRemoteImage } from '@/components/CachedRemoteImage';

type Props = {
  user: { email?: string | null } | null;
  profile: UserProfile | null;
  onClose: () => void;
};

/**
 * Cabeçalho espelhando `PassengerSideMenu` (web): fundo cinza-escuro, avatar 16 (64px),
 * nome em destaque, email/telefone em branco/60, botão fechar, decoração circular.
 */
export function DrawerMenuHeader({ user, profile, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const avatarUri = profile?.avatar_url;
  const displayName = profile?.full_name?.trim() || 'Utilizador';
  const displaySub = user?.email || profile?.phone || 'Bem-vindo ao ZAMBA';

  return (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
      <TouchableOpacity
        style={[styles.closeBtn, { top: Math.max(insets.top, 12) }]}
        onPress={onClose}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Fechar menu"
      >
        <Feather name="x" size={22} color="rgba(255,255,255,0.92)" />
      </TouchableOpacity>

      <View style={styles.decor} pointerEvents="none" />

      <View style={styles.headerInner}>
        <View style={styles.avatarWrap}>
          <CachedRemoteImage
            uri={avatarUri}
            style={styles.avatarImg}
            cacheScope="drawer_avatar"
            fallback={
              <Ionicons name="person-circle-outline" size={40} color="rgba(255,255,255,0.5)" />
            }
          />
        </View>

        <View>
          <Text style={styles.userName} numberOfLines={2}>
            {displayName}
          </Text>
          <Text style={styles.userSub} numberOfLines={2}>
            {displaySub}
          </Text>
        </View>
      </View>
    </View>
  );
}

const HEADER_BG = '#111827';

const styles = StyleSheet.create({
  header: {
    backgroundColor: HEADER_BG,
    paddingHorizontal: 24,
    paddingBottom: 24,
    overflow: 'hidden',
  },
  decor: {
    position: 'absolute',
    bottom: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.05)',
    ...Platform.select({
      ios: { shadowColor: '#fff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.15, shadowRadius: 40 },
      default: {},
    }),
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerInner: {
    gap: 16,
    zIndex: 2,
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: 64, height: 64, borderRadius: 16 },
  userName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  userSub: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
});

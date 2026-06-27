import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

const C = {
  bg: '#F8F9FA',
  accent: '#198754',
  text: '#0F172A',
  textSecondary: '#475569',
  onAccent: '#FFFFFF',
  secondaryBtnBg: '#F3F4F6',
  secondaryBtnText: '#111827',
  border: '#E2E8F0',
};

type LocationRequiredScreenProps = {
  /** 'permission' = permissão negada; 'gps' = GPS desligado / falha ao obter posição. */
  variant: 'permission' | 'gps';
  /** Permissão bloqueada permanentemente — mostra "Abrir definições". */
  permissionBlocked?: boolean;
  onRetry: () => void;
  isRetrying?: boolean;
};

export function LocationRequiredScreen({
  variant,
  permissionBlocked = false,
  onRetry,
  isRetrying = false,
}: LocationRequiredScreenProps) {
  const isPermission = variant === 'permission';

  const title = isPermission ? 'Localização necessária' : 'Não foi possível obter a sua localização';
  const subtitle = isPermission
    ? 'O Zamba precisa da sua localização para encontrar motoristas próximos e definir o seu ponto de partida.'
    : 'Verifique se o GPS está ligado e tente novamente.';
  const primaryLabel = isPermission ? 'Permitir localização' : 'Tentar novamente';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons
            name={isPermission ? 'location-outline' : 'navigate-circle-outline'}
            size={72}
            color={C.accent}
          />
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <TouchableOpacity
          style={[styles.button, isRetrying && styles.buttonDisabled]}
          onPress={onRetry}
          disabled={isRetrying}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
        >
          {isRetrying ? (
            <ActivityIndicator color={C.onAccent} />
          ) : (
            <Text style={styles.buttonText}>{primaryLabel}</Text>
          )}
        </TouchableOpacity>

        {isPermission && permissionBlocked ? (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => void Linking.openSettings()}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Abrir definições"
          >
            <Text style={styles.secondaryButtonText}>Abrir definições</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const SHADOW_SM = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  android: { elevation: 3 },
}) as object;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(25,135,84,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    ...SHADOW_SM,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 36,
    maxWidth: 320,
  },
  button: {
    minWidth: 220,
    height: 52,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    ...SHADOW_SM,
  },
  buttonDisabled: {
    opacity: 0.85,
  },
  buttonText: {
    color: C.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    minWidth: 220,
    height: 52,
    borderRadius: 14,
    backgroundColor: C.secondaryBtnBg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    marginTop: 12,
  },
  secondaryButtonText: {
    color: C.secondaryBtnText,
    fontSize: 16,
    fontWeight: '700',
  },
});

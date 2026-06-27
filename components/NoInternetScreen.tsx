import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
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
};

type NoInternetScreenProps = {
  onRetry: () => void;
  isRetrying?: boolean;
};

export function NoInternetScreen({ onRetry, isRetrying = false }: NoInternetScreenProps) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="cloud-offline-outline" size={72} color={C.accent} />
        </View>

        <Text style={styles.title}>Sem conexão com a internet</Text>
        <Text style={styles.subtitle}>
          Verifique os seus dados móveis ou Wi-Fi e tente novamente.
        </Text>

        <TouchableOpacity
          style={[styles.button, isRetrying && styles.buttonDisabled]}
          onPress={onRetry}
          disabled={isRetrying}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Tentar novamente"
        >
          {isRetrying ? (
            <ActivityIndicator color={C.onAccent} />
          ) : (
            <Text style={styles.buttonText}>Tentar novamente</Text>
          )}
        </TouchableOpacity>
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
});

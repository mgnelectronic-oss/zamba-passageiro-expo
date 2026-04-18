import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';

const C = {
  bg: '#F7F8FA',
  emerald: '#10B981',
  text: '#0F172A',
  muted: '#64748B',
};

export function BootScreen() {
  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.logoRow}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoLetter}>Z</Text>
        </View>
        <Text style={styles.logoName}>ZAMBA</Text>
      </View>

      <View style={styles.carWrap}>
        <Ionicons name="car-sport" size={56} color={C.emerald} />
      </View>

      <ActivityIndicator size="large" color={C.emerald} style={styles.spinner} />

      <Text style={styles.caption}>Preparando a sua viagem…</Text>
    </View>
  );
}

const SHADOW_SM = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
  android: { elevation: 3 },
}) as object;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 36,
  },
  logoBadge: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: C.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW_SM,
  },
  logoLetter: {
    color: '#FFF',
    fontSize: 26,
    fontWeight: '800',
  },
  logoName: {
    fontSize: 28,
    fontWeight: '800',
    color: C.text,
    letterSpacing: 2,
  },
  carWrap: {
    marginBottom: 28,
    opacity: 0.95,
  },
  spinner: {
    marginBottom: 20,
  },
  caption: {
    fontSize: 15,
    fontWeight: '600',
    color: C.muted,
    textAlign: 'center',
  },
});

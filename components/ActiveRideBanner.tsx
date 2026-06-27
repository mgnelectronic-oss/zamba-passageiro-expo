import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePassengerActiveRide } from '@/hooks/usePassengerActiveRide';
import { activeRideSubtitle } from '@/services/passengerActiveRideService';

const C = {
  emeraldDark: '#059669',
  text: '#0F172A',
  textSecondary: '#475569',
  surface: '#FFFFFF',
  border: '#D1FAE5',
  bg: '#ECFDF5',
};

export function ActiveRideBanner() {
  const router = useRouter();
  const { activeRide, isLoading, hasActiveRide } = usePassengerActiveRide();

  if (isLoading || !hasActiveRide || !activeRide) return null;

  const subtitle = activeRideSubtitle(activeRide);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() =>
        router.push({
          pathname: '/currentRide',
          params: { rideId: activeRide.id },
        })
      }
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel="Voltar à viagem em andamento"
    >
      <View style={styles.iconWrap}>
        <Ionicons name="car-sport" size={22} color={C.emeraldDark} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title}>Viagem em andamento</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
        {activeRide.driver_name ? (
          <Text style={styles.meta} numberOfLines={1}>
            {activeRide.driver_name}
            {activeRide.vehicle_plate ? ` · ${activeRide.vehicle_plate}` : ''}
          </Text>
        ) : null}
      </View>
      <View style={styles.action}>
        <Text style={styles.actionText}>Voltar{'\n'}à viagem</Text>
        <Ionicons name="chevron-forward" size={18} color={C.emeraldDark} />
      </View>
    </TouchableOpacity>
  );
}

const SHADOW = Platform.select({
  ios: {
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  android: { elevation: 3 },
}) as object;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 14,
    ...SHADOW,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: C.emeraldDark,
  },
  meta: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '500',
    color: C.textSecondary,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 4,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.emeraldDark,
    textAlign: 'right',
    lineHeight: 14,
  },
});

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { DrawerMenuEntry } from './drawerMenuConfig';

const ICON_BOX = 44;

type Props = {
  item: DrawerMenuEntry;
  onPress: () => void;
};

export function DrawerMenuItem({ item, onPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      <View style={[styles.iconBox, { backgroundColor: item.bgColor }]}>
        <Ionicons name={item.icon} size={22} color={item.color} />
      </View>
      <Text style={styles.label}>{item.label}</Text>
      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
    </TouchableOpacity>
  );
}

type LogoutProps = { onPress: () => void };

export function DrawerMenuLogoutItem({ onPress }: LogoutProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel="Sair"
    >
      <View style={[styles.iconBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
        <Ionicons name="log-out-outline" size={22} color="#EF4444" />
      </View>
      <Text style={styles.label}>Sair</Text>
      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
    </TouchableOpacity>
  );
}

const ROW_SHADOW = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  android: { elevation: 0 },
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  iconBox: {
    width: ICON_BOX,
    height: ICON_BOX,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...ROW_SHADOW,
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
    letterSpacing: -0.2,
  },
});

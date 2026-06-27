import React from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

const C = {
  text: '#0F172A',
  emerald: '#059669',
  surface: '#FFFFFF',
};

type MapCurrentLocationButtonProps = {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

/** Botão flutuante para centralizar o mapa na localização GPS do passageiro. */
export function MapCurrentLocationButton({
  onPress,
  loading = false,
  disabled = false,
  style,
}: MapCurrentLocationButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.fab, (loading || disabled) && styles.fabDisabled, style]}
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Centralizar na minha localização"
    >
      {loading ? (
        <ActivityIndicator size="small" color={C.emerald} />
      ) : (
        <Ionicons name="locate" size={22} color={C.emerald} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.14,
        shadowRadius: 8,
      },
      android: { elevation: 5 },
    }),
  },
  fabDisabled: {
    opacity: 0.75,
  },
});

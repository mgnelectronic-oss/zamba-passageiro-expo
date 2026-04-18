import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rideService } from '@/services/rideService';

type RideVisualState =
  | 'searching'
  | 'driver_assigned'
  | 'driver_arrived'
  | 'on_trip'
  | 'completed'
  | 'cancelled'
  | 'no_driver';

interface RideSnapshot {
  status?: string;
  search_status?: string;
  driver_name?: string;
  driver_phone?: string;
  vehicle_plate?: string;
  vehicle_model?: string;
  price_estimate?: number;
  fare_estimate?: number;
  final_fare?: number;
  pickup_address?: string;
  dropoff_address?: string;
}

function resolveVisualState(snapshot: RideSnapshot | null): RideVisualState {
  if (!snapshot) return 'searching';
  const s = snapshot.status;
  const ss = snapshot.search_status;
  if (s === 'cancelled') return 'cancelled';
  if (s === 'completed') return 'completed';
  if (s === 'ontrip') return 'on_trip';
  if (s === 'arrived') return 'driver_arrived';
  if (s === 'arriving' || s === 'accepted') return 'driver_assigned';
  if (ss === 'no_driver_found') return 'no_driver';
  return 'searching';
}

const STATE_CONFIG: Record<RideVisualState, { title: string; subtitle: string; icon: string }> = {
  searching:       { title: 'A procurar motorista…', subtitle: 'Aguarde enquanto encontramos o melhor motorista para si.', icon: '🔍' },
  driver_assigned: { title: 'Motorista a caminho', subtitle: 'O motorista está a dirigir-se ao local de recolha.', icon: '🚗' },
  driver_arrived:  { title: 'Motorista chegou', subtitle: 'O seu motorista está à sua espera no local.', icon: '📍' },
  on_trip:         { title: 'Em viagem', subtitle: 'Aproveite a viagem! Estamos a caminho do destino.', icon: '🛣️' },
  completed:       { title: 'Viagem concluída', subtitle: 'Obrigado por viajar com a Zamba!', icon: '✅' },
  cancelled:       { title: 'Viagem cancelada', subtitle: 'Esta viagem foi cancelada.', icon: '❌' },
  no_driver:       { title: 'Nenhum motorista disponível', subtitle: 'Tente novamente em alguns minutos.', icon: '😞' },
};

export default function RideActiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [snapshot, setSnapshot] = useState<RideSnapshot | null>(null);
  const [visualState, setVisualState] = useState<RideVisualState>('searching');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncStatus = useCallback(async () => {
    if (!rideId) return;
    const result = await rideService.getRideSearchStatus(rideId);
    if (result) {
      setSnapshot(result);
      setVisualState(resolveVisualState(result));
    }
  }, [rideId]);

  useEffect(() => {
    syncStatus();

    pollRef.current = setInterval(syncStatus, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [syncStatus]);

  useEffect(() => {
    if (!rideId) return;
    const unsub = rideService.subscribeToRide(rideId, () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      realtimeDebounceRef.current = setTimeout(() => {
        realtimeDebounceRef.current = null;
        syncStatus();
      }, 220);
    });
    return () => {
      unsub();
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    };
  }, [rideId, syncStatus]);

  useEffect(() => {
    if (visualState === 'completed' || visualState === 'cancelled' || visualState === 'no_driver') {
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [visualState]);

  const handleCancel = () => {
    Alert.alert('Cancelar viagem', 'Tem a certeza que deseja cancelar?', [
      { text: 'Não', style: 'cancel' },
      {
        text: 'Sim, cancelar',
        style: 'destructive',
        onPress: async () => {
          try {
            await rideService.cancelRide(rideId!);
            setVisualState('cancelled');
          } catch {
            Alert.alert('Erro', 'Não foi possível cancelar.');
          }
        },
      },
    ]);
  };

  const cfg = STATE_CONFIG[visualState];
  const fare = snapshot?.final_fare ?? snapshot?.price_estimate ?? snapshot?.fare_estimate;
  const isTerminal = visualState === 'completed' || visualState === 'cancelled' || visualState === 'no_driver';

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.content}>
        <Text style={styles.icon}>{cfg.icon}</Text>

        {visualState === 'searching' && (
          <ActivityIndicator size="large" color="#10B981" style={{ marginBottom: 16 }} />
        )}

        <Text style={styles.title}>{cfg.title}</Text>
        <Text style={styles.subtitle}>{cfg.subtitle}</Text>

        {snapshot?.driver_name && visualState !== 'searching' && (
          <View style={styles.driverCard}>
            <Text style={styles.driverLabel}>MOTORISTA</Text>
            <Text style={styles.driverName}>{snapshot.driver_name}</Text>
            {snapshot.vehicle_model && (
              <Text style={styles.driverDetail}>
                {snapshot.vehicle_model} • {snapshot.vehicle_plate}
              </Text>
            )}
            {snapshot.driver_phone && (
              <Text style={styles.driverPhone}>{snapshot.driver_phone}</Text>
            )}
          </View>
        )}

        {fare != null && fare > 0 && (
          <View style={styles.fareCard}>
            <Text style={styles.fareLabel}>
              {visualState === 'completed' ? 'VALOR FINAL' : 'ESTIMATIVA'}
            </Text>
            <Text style={styles.fareValue}>{Math.round(fare)} MT</Text>
          </View>
        )}

        {snapshot?.pickup_address && (
          <View style={styles.addressRow}>
            <View style={[styles.dot, { backgroundColor: '#3B82F6' }]} />
            <Text style={styles.addressText} numberOfLines={1}>{snapshot.pickup_address}</Text>
          </View>
        )}
        {snapshot?.dropoff_address && (
          <View style={styles.addressRow}>
            <View style={[styles.dot, { backgroundColor: '#000' }]} />
            <Text style={styles.addressText} numberOfLines={1}>{snapshot.dropoff_address}</Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        {!isTerminal && (
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.cancelText}>CANCELAR VIAGEM</Text>
          </TouchableOpacity>
        )}

        {isTerminal && (
          <TouchableOpacity
            style={styles.homeBtn}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.homeBtnText}>VOLTAR AO INÍCIO</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: { fontSize: 48, marginBottom: 16 },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  driverCard: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    alignItems: 'center',
    marginBottom: 16,
  },
  driverLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#9CA3AF',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  driverDetail: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 2,
  },
  driverPhone: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10B981',
    marginTop: 4,
  },
  fareCard: {
    width: '100%',
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  fareLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: 2,
    marginBottom: 4,
  },
  fareValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#047857',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    paddingVertical: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  actions: {
    paddingTop: 12,
  },
  cancelBtn: {
    width: '100%',
    height: 50,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#EF4444',
    letterSpacing: 1.5,
  },
  homeBtn: {
    width: '100%',
    height: 50,
    borderRadius: 16,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
});

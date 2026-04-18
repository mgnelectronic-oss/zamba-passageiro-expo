import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

/**
 * Deep link `/ride/[id]` (notificações, links). Reutiliza o ecrã de corrida activa.
 */
export default function RideDeepLinkScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const rideId = Array.isArray(id) ? id[0] : id;

  useEffect(() => {
    if (rideId && String(rideId).trim() !== '') {
      router.replace({
        pathname: '/currentRide',
        params: { rideId: String(rideId).trim() },
      });
    } else {
      router.replace('/(tabs)');
    }
  }, [rideId, router]);

  return (
    <View style={styles.centered}>
      <ActivityIndicator size="small" color="#10B981" />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F8FA',
  },
});

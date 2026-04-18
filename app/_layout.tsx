import { useCallback, useEffect, useRef } from 'react';
import { AppState, View, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';
import { AppBootstrapProvider, useAppBootstrap } from '@/contexts/AppBootstrapContext';
import { BootScreen } from '@/components/BootScreen';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { rideService } from '@/services/rideService';
import { MapEnginePreloader } from '@/components/MapEnginePreloader';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigation() {
  const { sessionReady, user, isHomeDataReady } = useAppBootstrap();
  const segments = useSegments();
  const router = useRouter();
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const lastActiveRideResolveAt = useRef(0);

  const canNavigate = sessionReady && isHomeDataReady;

  usePushNotifications(user?.id, sessionReady, canNavigate && !!user);

  /** Mesma regra que Zamba-Mocambique `PassengerProvider.initializeUserData`: última corrida + estado RPC. */
  const redirectToActiveRideIfNeeded = useCallback(
    async (opts?: { bypassThrottle?: boolean }) => {
      if (!user?.id || !canNavigate) return;
      const top = segmentsRef.current[0];
      if (top === 'currentRide' || top === 'searchingDriver') return;
      if (top && top !== '(tabs)') return;

      const now = Date.now();
      if (!opts?.bypassThrottle && now - lastActiveRideResolveAt.current < 1800) return;
      lastActiveRideResolveAt.current = now;

      try {
        const rideId = await rideService.resolveActivePassengerRideId(user.id);
        if (!rideId) return;
        router.replace({ pathname: '/currentRide', params: { rideId } });
      } catch (e) {
        console.warn('[navigation] resolveActivePassengerRideId', e);
      }
    },
    [user?.id, canNavigate, router],
  );

  useEffect(() => {
    if (!canNavigate) return;
    const seg = segments[0];
    if (user && seg === 'auth') {
      router.replace('/(tabs)');
      return;
    }
    if (!user && seg !== undefined && seg !== 'auth') {
      router.replace('/auth');
    }
  }, [canNavigate, user, segments, router]);

  useEffect(() => {
    if (!user?.id || !canNavigate) return;
    void redirectToActiveRideIfNeeded();
  }, [user?.id, canNavigate, segments, redirectToActiveRideIfNeeded]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && user?.id) {
        void redirectToActiveRideIfNeeded({ bypassThrottle: true });
      }
    });
    return () => sub.remove();
  }, [user?.id, redirectToActiveRideIfNeeded]);

  if (!sessionReady) {
    return <View style={styles.sessionProbe} />;
  }

  if (user && !isHomeDataReady) {
    return <BootScreen />;
  }

  return (
    <>
      {user && isHomeDataReady ? <MapEnginePreloader /> : null}
      <Stack>
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="map" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="searchingDriver" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="ride/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="currentRide" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="ride-active" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="history" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="profile" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="saved-addresses" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="verification" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="shared-rides" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}

const styles = StyleSheet.create({
  sessionProbe: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },
});

export default function RootLayout() {
  return (
    <AppBootstrapProvider>
      <SafeAreaProvider>
        <RootNavigation />
      </SafeAreaProvider>
    </AppBootstrapProvider>
  );
}

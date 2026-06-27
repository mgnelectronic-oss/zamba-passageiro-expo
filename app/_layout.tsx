import 'react-native-gesture-handler';
import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { AppBootstrapProvider, useAppBootstrap } from '@/contexts/AppBootstrapContext';
import { PassengerLocationProvider, usePassengerLocation } from '@/contexts/PassengerLocationContext';
import { PassengerActiveRideProvider } from '@/contexts/PassengerActiveRideContext';
import { BootScreen } from '@/components/BootScreen';
import { NoInternetScreen } from '@/components/NoInternetScreen';
import { LocationRequiredScreen } from '@/components/LocationRequiredScreen';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { MapEnginePreloader } from '@/components/MapEnginePreloader';
import { PassengerIncomingCallHost } from '@/components/PassengerIncomingCallHost';
import { usePassengerAppRestore } from '@/hooks/usePassengerAppRestore';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigation() {
  const { sessionReady, user, isHomeDataReady } = useAppBootstrap();
  const {
    locationPermissionStatus,
    hasLocation,
    isLoadingLocation,
    locationError,
    refreshLocation,
  } = usePassengerLocation();
  const segments = useSegments();
  const router = useRouter();
  const locationBootstrapDoneRef = useRef(false);
  const [locationBootstrapDone, setLocationBootstrapDone] = useState(false);

  const canNavigate = sessionReady && isHomeDataReady;

  useEffect(() => {
    if (user && hasLocation && locationPermissionStatus === 'granted') {
      if (!locationBootstrapDoneRef.current) {
        locationBootstrapDoneRef.current = true;
        setLocationBootstrapDone(true);
      }
    }
    if (!user) {
      locationBootstrapDoneRef.current = false;
      setLocationBootstrapDone(false);
    }
  }, [user, hasLocation, locationPermissionStatus]);

  usePassengerAppRestore({
    enabled: canNavigate && !!user,
    locationBootstrapDone: !user || locationBootstrapDone,
  });

  usePushNotifications(user?.id, sessionReady, canNavigate && !!user);

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

  if (!sessionReady) {
    return <View style={styles.sessionProbe} />;
  }

  if (user && !isHomeDataReady) {
    return <BootScreen />;
  }

  // Gate de localização só no arranque inicial — não desmonta a app ao voltar do background.
  if (user && !locationBootstrapDone) {
    if (locationPermissionStatus === 'denied' || locationPermissionStatus === 'blocked') {
      return (
        <LocationRequiredScreen
          variant="permission"
          permissionBlocked={locationPermissionStatus === 'blocked'}
          onRetry={() => void refreshLocation()}
          isRetrying={isLoadingLocation}
        />
      );
    }
    if (!hasLocation) {
      if (isLoadingLocation || locationPermissionStatus === 'undetermined') {
        return <BootScreen />;
      }
      if (locationError) {
        return (
          <LocationRequiredScreen
            variant="gps"
            onRetry={() => void refreshLocation()}
            isRetrying={isLoadingLocation}
          />
        );
      }
    }
  }

  return (
    <>
      {user && isHomeDataReady ? <MapEnginePreloader /> : null}
      {user?.id ? <PassengerIncomingCallHost userId={user.id} /> : null}
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="auth" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="search" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="map" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="searchingDriver" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ride/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="currentRide" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ride-call" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ride-active" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="history" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="saved-addresses" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="verification" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="shared-rides" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="support" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="about" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="dark" translucent={false} />
    </>
  );
}

const styles = StyleSheet.create({
  ghRoot: {
    flex: 1,
  },
  sessionProbe: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },
});

function AppShell() {
  const { isOffline, hasResolvedInitial, refresh, isRefreshing } = useNetworkStatus();

  if (!hasResolvedInitial) {
    return <View style={styles.sessionProbe} />;
  }

  if (isOffline) {
    return <NoInternetScreen onRetry={refresh} isRetrying={isRefreshing} />;
  }

  return <RootNavigation />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.ghRoot}>
      <AppBootstrapProvider>
        <PassengerActiveRideProvider>
          <PassengerLocationProvider>
            <SafeAreaProvider>
              <AppShell />
            </SafeAreaProvider>
          </PassengerLocationProvider>
        </PassengerActiveRideProvider>
      </AppBootstrapProvider>
    </GestureHandlerRootView>
  );
}

import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import type { PassengerActiveRideMapProps } from '@/components/maps/types';
import { isExpoGoEnvironment } from '@/lib/isExpoGoEnvironment';
import { initMapbox, isMapboxConfigured, isMapboxNativeAvailable } from '@/lib/mapboxInit';

type TripMapComponent = React.ComponentType<PassengerActiveRideMapProps>;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PassengerGoogleTripView = require('@/components/maps/PassengerGoogleTripView')
  .PassengerGoogleTripView as TripMapComponent;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PassengerMapboxTripView = isMapboxNativeAvailable()
  ? (require('@/components/maps/PassengerMapboxTripView.impl')
      .PassengerMapboxTripView as TripMapComponent)
  : null;

const LOG = '[PASSENGER MAP]';

export function PassengerActiveRideMap(props: PassengerActiveRideMapProps) {
  useEffect(() => {
    console.log(LOG, 'mounted');
  }, []);

  if (Platform.OS === 'web') {
    return <PassengerGoogleTripView {...props} />;
  }

  if (isExpoGoEnvironment() || !isMapboxConfigured() || !PassengerMapboxTripView) {
    return <PassengerGoogleTripView {...props} />;
  }

  initMapbox();
  return <PassengerMapboxTripView {...props} />;
}

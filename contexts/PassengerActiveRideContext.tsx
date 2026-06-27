import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { useAppBootstrap } from '@/contexts/AppBootstrapContext';
import {
  fetchActivePassengerRide,
  type PassengerActiveRide,
} from '@/services/passengerActiveRideService';

type PassengerActiveRideContextValue = {
  activeRide: PassengerActiveRide | null;
  isLoading: boolean;
  refreshActiveRide: () => Promise<void>;
  hasActiveRide: boolean;
};

const defaultValue: PassengerActiveRideContextValue = {
  activeRide: null,
  isLoading: true,
  refreshActiveRide: async () => {},
  hasActiveRide: false,
};

const PassengerActiveRideContext = createContext<PassengerActiveRideContextValue>(defaultValue);

const POLL_MS = 4000;

export function PassengerActiveRideProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAppBootstrap();
  const [activeRide, setActiveRide] = useState<PassengerActiveRide | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const refreshActiveRide = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const promise = (async () => {
      if (!user?.id) {
        setActiveRide(null);
        setIsLoading(false);
        return;
      }
      try {
        const ride = await fetchActivePassengerRide(user.id);
        setActiveRide(ride);
      } catch (e) {
        console.warn('[PassengerActiveRide] refreshActiveRide', e);
      } finally {
        setIsLoading(false);
      }
    })();

    refreshInFlightRef.current = promise;
    try {
      await promise;
    } finally {
      refreshInFlightRef.current = null;
    }
  }, [user?.id]);

  useEffect(() => {
    setIsLoading(true);
    void refreshActiveRide();
  }, [refreshActiveRide]);

  useEffect(() => {
    if (!user?.id) return;
    const id = setInterval(() => {
      void refreshActiveRide();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [user?.id, refreshActiveRide]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        console.log('[PASSENGER APP RESTORE] reactivar refresh corrida activa (AppState active)');
        void refreshActiveRide();
      }
    });
    return () => sub.remove();
  }, [refreshActiveRide]);

  const value = useMemo(
    () => ({
      activeRide,
      isLoading,
      refreshActiveRide,
      hasActiveRide: activeRide != null,
    }),
    [activeRide, isLoading, refreshActiveRide],
  );

  return (
    <PassengerActiveRideContext.Provider value={value}>
      {children}
    </PassengerActiveRideContext.Provider>
  );
}

export function usePassengerActiveRide(): PassengerActiveRideContextValue {
  return useContext(PassengerActiveRideContext);
}

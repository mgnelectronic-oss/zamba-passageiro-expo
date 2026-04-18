import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AppBanner, AppBannerSettings } from '@/services/appBannerService';
import type { UserProfile } from '@/services/authService';
import type { SavedAddress, RecentDestination } from '@/services/addressService';
import {
  resolveSessionUser,
  loadLoggedInAppData,
} from '@/services/appBootstrap';
import type { RideHistoryItem, RpcHistoryError } from '@/services/passengerRideHistoryModel';
import { clearPassengerHistoryCache } from '@/services/passengerHistoryCacheStorage';
import { syncPassengerHistory } from '@/services/passengerHistorySync';
import { deactivateRegisteredPushTokenOnLogout } from '@/services/pushNotificationService';

type AppBootstrapState = {
  /** Sessão local já verificada (getSession / getUser). */
  sessionReady: boolean;
  user: User | null;
  /**
   * Com utilizador autenticado: true só depois de loadLoggedInAppData.
   * Sem utilizador: true logo após sessionReady (não há dados de home a pré-carregar).
   */
  isHomeDataReady: boolean;
  initialBanners: AppBanner[];
  initialBannerSettings: AppBannerSettings | null;
  initialProfile: UserProfile | null;
  initialSavedAddresses: SavedAddress[];
  initialRecentDestinations: RecentDestination[];
  passengerHistoryRides: RideHistoryItem[];
  passengerHistoryError: RpcHistoryError | null;
  /** False até a primeira sincronização do histórico terminar (com utilizador autenticado). */
  passengerHistoryFirstSyncDone: boolean;
  /** Revalida contagem + histórico (RPC só se a contagem de concluídas mudou). */
  refreshPassengerHistory: () => Promise<void>;
};

const defaultState: AppBootstrapState = {
  sessionReady: false,
  user: null,
  isHomeDataReady: false,
  initialBanners: [],
  initialBannerSettings: null,
  initialProfile: null,
  initialSavedAddresses: [],
  initialRecentDestinations: [],
  passengerHistoryRides: [],
  passengerHistoryError: null,
  passengerHistoryFirstSyncDone: true,
  refreshPassengerHistory: async () => {},
};

const AppBootstrapContext = createContext<AppBootstrapState>(defaultState);

export function AppBootstrapProvider({ children }: { children: React.ReactNode }) {
  const [sessionReady, setSessionReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isHomeDataReady, setIsHomeDataReady] = useState(false);
  const [initialBanners, setInitialBanners] = useState<AppBanner[]>([]);
  const [initialBannerSettings, setInitialBannerSettings] = useState<AppBannerSettings | null>(null);
  const [initialProfile, setInitialProfile] = useState<UserProfile | null>(null);
  const [initialSavedAddresses, setInitialSavedAddresses] = useState<SavedAddress[]>([]);
  const [initialRecentDestinations, setInitialRecentDestinations] = useState<RecentDestination[]>([]);
  const [passengerHistoryRides, setPassengerHistoryRides] = useState<RideHistoryItem[]>([]);
  const [passengerHistoryError, setPassengerHistoryError] = useState<RpcHistoryError | null>(null);
  const [passengerHistoryFirstSyncDone, setPassengerHistoryFirstSyncDone] = useState(false);

  const refreshPassengerHistory = useCallback(async () => {
    if (!user?.id) return;
    const result = await syncPassengerHistory(user.id);
    setPassengerHistoryRides(result.rides);
    setPassengerHistoryError(result.error);
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const u = await resolveSessionUser();
      if (cancelled) return;

      setUser(u);
      setSessionReady(true);

      if (!u) {
        void deactivateRegisteredPushTokenOnLogout();
        setInitialBanners([]);
        setInitialBannerSettings(null);
        setInitialProfile(null);
        setInitialSavedAddresses([]);
        setInitialRecentDestinations([]);
        setPassengerHistoryRides([]);
        setPassengerHistoryError(null);
        setPassengerHistoryFirstSyncDone(true);
        setIsHomeDataReady(true);
        return;
      }

      setIsHomeDataReady(false);
      setPassengerHistoryFirstSyncDone(false);
      try {
        const data = await loadLoggedInAppData(u.id);
        if (cancelled) return;
        setInitialBanners(data.initialBanners);
        setInitialBannerSettings(data.initialBannerSettings);
        setInitialProfile(data.initialProfile);
        setInitialSavedAddresses(data.initialSavedAddresses);
        setInitialRecentDestinations(data.initialRecentDestinations);
        setPassengerHistoryRides(data.initialPassengerHistory);
        setPassengerHistoryError(null);

        void syncPassengerHistory(u.id)
          .then((result) => {
            if (cancelled) return;
            setPassengerHistoryRides(result.rides);
            setPassengerHistoryError(result.error);
          })
          .finally(() => {
            if (!cancelled) setPassengerHistoryFirstSyncDone(true);
          });
      } catch {
        if (!cancelled) setPassengerHistoryFirstSyncDone(true);
      } finally {
        if (!cancelled) setIsHomeDataReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;

      const next = session?.user ?? null;
      setUser(next);

      if (!next) {
        void deactivateRegisteredPushTokenOnLogout();
        void clearPassengerHistoryCache();
        setInitialBanners([]);
        setInitialBannerSettings(null);
        setInitialProfile(null);
        setInitialSavedAddresses([]);
        setInitialRecentDestinations([]);
        setPassengerHistoryRides([]);
        setPassengerHistoryError(null);
        setPassengerHistoryFirstSyncDone(true);
        setIsHomeDataReady(true);
        return;
      }

      setIsHomeDataReady(false);
      setPassengerHistoryFirstSyncDone(false);
      try {
        const data = await loadLoggedInAppData(next.id);
        setInitialBanners(data.initialBanners);
        setInitialBannerSettings(data.initialBannerSettings);
        setInitialProfile(data.initialProfile);
        setInitialSavedAddresses(data.initialSavedAddresses);
        setInitialRecentDestinations(data.initialRecentDestinations);
        setPassengerHistoryRides(data.initialPassengerHistory);
        setPassengerHistoryError(null);

        void syncPassengerHistory(next.id)
          .then((result) => {
            setPassengerHistoryRides(result.rides);
            setPassengerHistoryError(result.error);
          })
          .finally(() => {
            setPassengerHistoryFirstSyncDone(true);
          });
      } catch {
        setPassengerHistoryFirstSyncDone(true);
      } finally {
        setIsHomeDataReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [sessionReady]);

  const value = useMemo(
    () => ({
      sessionReady,
      user,
      isHomeDataReady,
      initialBanners,
      initialBannerSettings,
      initialProfile,
      initialSavedAddresses,
      initialRecentDestinations,
      passengerHistoryRides,
      passengerHistoryError,
      passengerHistoryFirstSyncDone,
      refreshPassengerHistory,
    }),
    [
      sessionReady,
      user,
      isHomeDataReady,
      initialBanners,
      initialBannerSettings,
      initialProfile,
      initialSavedAddresses,
      initialRecentDestinations,
      passengerHistoryRides,
      passengerHistoryError,
      passengerHistoryFirstSyncDone,
      refreshPassengerHistory,
    ],
  );

  return (
    <AppBootstrapContext.Provider value={value}>{children}</AppBootstrapContext.Provider>
  );
}

export function useAppBootstrap() {
  return useContext(AppBootstrapContext);
}

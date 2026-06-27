import { useCallback, useEffect, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

function isDeviceOffline(state: NetInfoState): boolean {
  if (state.isConnected === false) return true;
  if (state.isInternetReachable === false) return true;
  return false;
}

export function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState(false);
  const [hasResolvedInitial, setHasResolvedInitial] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const applyState = useCallback((state: NetInfoState) => {
    setIsOffline(isDeviceOffline(state));
    setHasResolvedInitial(true);
    setIsRefreshing(false);
  }, []);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const state = await NetInfo.fetch();
      applyState(state);
    } catch {
      setIsRefreshing(false);
    }
  }, [applyState]);

  useEffect(() => {
    void NetInfo.fetch().then(applyState);

    const unsubscribe = NetInfo.addEventListener(applyState);
    return () => unsubscribe();
  }, [applyState]);

  return {
    isOffline,
    isOnline: !isOffline,
    hasResolvedInitial,
    isRefreshing,
    refresh,
  };
}

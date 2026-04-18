import { useEffect, useState, useCallback } from 'react';
import { authService, type UserProfile } from '@/services/authService';

interface UserState {
  user: any;
  profile: UserProfile | null;
  loading: boolean;
}

export function useUser() {
  const [state, setState] = useState<UserState>({
    user: null,
    profile: null,
    loading: true,
  });

  const load = useCallback(async () => {
    try {
      const user = await authService.getCurrentUser();
      if (!user) {
        setState({ user: null, profile: null, loading: false });
        return;
      }
      const profile = await authService.getUserProfile(user.id);
      setState({ user, profile, loading: false });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    load();
    const sub = authService.onAuthStateChange((u) => {
      if (u) load();
      else setState({ user: null, profile: null, loading: false });
    });
    return () => sub.unsubscribe();
  }, [load]);

  return { ...state, reload: load };
}

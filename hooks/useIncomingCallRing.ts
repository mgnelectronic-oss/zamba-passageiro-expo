import { useEffect, useRef } from 'react';
import { startIncomingCallRing, stopIncomingCallRing } from '@/services/incomingCallRing';

/**
 * Inicia ringtone + vibração quando `active` e limpa ao desactivar ou desmontar.
 */
export function useIncomingCallRing(active: boolean): void {
  const startedRef = useRef(false);

  useEffect(() => {
    if (active) {
      startedRef.current = true;
      void startIncomingCallRing();
      return () => {
        startedRef.current = false;
        void stopIncomingCallRing();
      };
    }

    if (startedRef.current) {
      startedRef.current = false;
      void stopIncomingCallRing();
    }
  }, [active]);
}

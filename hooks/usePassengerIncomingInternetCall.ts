import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  isIncomingInitiatedInternetCall,
  rideCallRowStatus,
  rideCallService,
  rideCallUserMessage,
  type RideCallRow,
} from '@/services/rideCallService';
import { rideStateService } from '@/services/rideStateService';
import { stopIncomingCallRing } from '@/services/incomingCallRing';
import {
  parseSignalPayload,
  subscribeRideCallSignals,
  type RideCallSignalRow,
} from '@/services/webrtcService';
import { clearIncomingOffer, rememberIncomingOffer } from '@/lib/webrtcOfferBuffer';
import { logWebrtcCallDebug } from '@/lib/webrtcCallDebug';

export type IncomingInternetCallState = {
  call: RideCallRow;
  callerLabel: string;
  callerAvatarUrl: string | null;
  markingRinging: boolean;
  accepting: boolean;
  rejecting: boolean;
};

const TERMINAL_STATUSES = new Set(['ended', 'rejected', 'failed', 'missed', 'cancelled']);

function normSignalType(t: string | undefined): string {
  return (t ?? '').toLowerCase().trim();
}

export function usePassengerIncomingInternetCall(selfUserId: string | null | undefined) {
  const router = useRouter();
  const [incoming, setIncoming] = useState<IncomingInternetCallState | null>(null);
  const ringingMarkedRef = useRef<Set<string>>(new Set());
  const activeCallIdRef = useRef<string | null>(null);
  const incomingSignalsUnsubRef = useRef<(() => void) | null>(null);

  const clearIncoming = useCallback((callId?: string | null) => {
    if (callId && activeCallIdRef.current && activeCallIdRef.current !== callId) return;
    incomingSignalsUnsubRef.current?.();
    incomingSignalsUnsubRef.current = null;
    clearIncomingOffer(callId ?? activeCallIdRef.current);
    activeCallIdRef.current = null;
    setIncoming(null);
    void stopIncomingCallRing();
  }, []);

  const subscribeIncomingOfferBuffer = useCallback(
    (callId: string) => {
      incomingSignalsUnsubRef.current?.();
      const uid = selfUserId?.trim();
      if (!uid) return;
      incomingSignalsUnsubRef.current = subscribeRideCallSignals(callId, uid, (row: RideCallSignalRow) => {
        if (normSignalType(row.signal_type) !== 'offer') return;
        const pl = parseSignalPayload(row.payload);
        if (!pl) return;
        rememberIncomingOffer(callId, pl);
        logWebrtcCallDebug('incoming_offer_buffered', { call_id: callId });
      });
    },
    [selfUserId],
  );

  const markRinging = useCallback(async (row: RideCallRow) => {
    if (!row.id || ringingMarkedRef.current.has(row.id)) return;
    ringingMarkedRef.current.add(row.id);
    try {
      await rideCallService.markInternetCallRinging({ p_call_id: row.id });
      if (__DEV__) {
        console.log('[rideCall] marcar_chamada_internet_como_tocando', { p_call_id: row.id });
      }
    } catch (e) {
      ringingMarkedRef.current.delete(row.id);
      console.error('[rideCall] marcar_chamada_internet_como_tocando erro técnico:', e);
    }
  }, []);

  const handleIncomingRow = useCallback(
    async (row: RideCallRow) => {
      if (!selfUserId || !isIncomingInitiatedInternetCall(row, selfUserId)) return;
      if (activeCallIdRef.current === row.id) return;

      activeCallIdRef.current = row.id;
      subscribeIncomingOfferBuffer(row.id);

      let callerLabel = 'Motorista';
      let callerAvatarUrl: string | null = null;
      try {
        const info = await rideStateService.getDriverInfo(row.ride_id);
        if (info?.full_name?.trim()) callerLabel = info.full_name.trim();
        if (info?.avatar_url?.trim()) callerAvatarUrl = info.avatar_url.trim();
      } catch {
        /* ignore */
      }

      setIncoming({
        call: row,
        callerLabel,
        callerAvatarUrl,
        markingRinging: true,
        accepting: false,
        rejecting: false,
      });

      await markRinging(row);
      setIncoming((prev) =>
        prev?.call.id === row.id ? { ...prev, markingRinging: false } : prev,
      );
    },
    [selfUserId, markRinging, subscribeIncomingOfferBuffer],
  );

  const handleUpdatedRow = useCallback(
    (row: RideCallRow) => {
      if (!row.id) return;
      const status = (rideCallRowStatus(row) ?? '').toLowerCase();
      if (activeCallIdRef.current !== row.id) return;

      if (TERMINAL_STATUSES.has(status)) {
        clearIncoming(row.id);
        return;
      }

      if (status === 'ringing') {
        setIncoming((prev) =>
          prev?.call.id === row.id ? { ...prev, call: row, markingRinging: false } : prev,
        );
      }
    },
    [clearIncoming],
  );

  useEffect(() => {
    if (!selfUserId?.trim()) {
      clearIncoming();
      return;
    }

    const unsub = rideCallService.subscribeIncomingInternetCalls(selfUserId, {
      onIncoming: (row) => {
        void handleIncomingRow(row);
      },
      onUpdated: handleUpdatedRow,
    });

    return unsub;
  }, [selfUserId, handleIncomingRow, handleUpdatedRow, clearIncoming]);

  const acceptIncoming = useCallback(async () => {
    if (!incoming?.call.id) return;
    const acceptedCallId = incoming.call.id;
    setIncoming((prev) => (prev ? { ...prev, accepting: true } : prev));
    await stopIncomingCallRing();
    try {
      await rideCallService.acceptInternetCall({ p_call_id: acceptedCallId });
      const rideId = incoming.call.ride_id;
      const callerId =
        incoming.call.caller_user_id != null ? String(incoming.call.caller_user_id) : '';

      incomingSignalsUnsubRef.current?.();
      incomingSignalsUnsubRef.current = null;
      activeCallIdRef.current = null;
      setIncoming(null);

      logWebrtcCallDebug('incoming_accept_navigate', { call_id: acceptedCallId });

      router.push({
        pathname: '/ride-call',
        params: {
          rideId,
          driverUserId: callerId,
          driverName: encodeURIComponent(incoming.callerLabel),
          callId: acceptedCallId,
          incoming: '1',
        },
      });
    } catch (e) {
      console.error('[rideCall] aceitar_chamada_internet erro técnico:', e);
      setIncoming((prev) => (prev ? { ...prev, accepting: false } : prev));
      throw new Error(rideCallUserMessage(e, 'start'));
    }
  }, [incoming, router]);

  const rejectIncoming = useCallback(async () => {
    if (!incoming?.call.id) return;
    setIncoming((prev) => (prev ? { ...prev, rejecting: true } : prev));
    await stopIncomingCallRing();
    try {
      await rideCallService.rejectInternetCall({ p_call_id: incoming.call.id });
      clearIncoming(incoming.call.id);
    } catch (e) {
      console.error('[rideCall] rejeitar_chamada_internet erro técnico:', e);
      setIncoming((prev) => (prev ? { ...prev, rejecting: false } : prev));
      throw new Error(rideCallUserMessage(e, 'end'));
    }
  }, [incoming, clearIncoming]);

  return {
    incoming,
    acceptIncoming,
    rejectIncoming,
    dismissIncoming: () => clearIncoming(activeCallIdRef.current),
  };
}

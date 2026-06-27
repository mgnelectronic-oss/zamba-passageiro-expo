import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  rideCallRowStatus,
  rideCallService,
  rideCallUserMessage,
  type RideCallRow,
} from '@/services/rideCallService';
import { authService } from '@/services/authService';
import { useWebRTC } from '@/hooks/useWebRTC';
import {
  setWebrtcCallSpeakerphoneOn,
  startWebrtcCallAudioSession,
  stopWebrtcCallAudioSession,
} from '@/services/webrtcCallAudioControls';

export type PassengerOutboundCallPhase =
  | 'idle'
  | 'calling'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'failed';

export type PassengerOutboundCallCopy = {
  phase: PassengerOutboundCallPhase;
  title: string;
  subtitle: string;
};

type StartCallParams = {
  rideId: string;
  receiverUserId: string;
  driverName?: string | null;
  driverAvatarUrl?: string | null;
};

const TERMINAL_STATUSES = new Set(['ended', 'rejected', 'failed', 'missed', 'cancelled']);

function deriveCallCopy(
  phase: PassengerOutboundCallPhase,
  serverStatus: string,
  webrtcPhase: string,
  errorMessage?: string | null,
): { title: string; subtitle: string } {
  if (phase === 'connected') {
    return { title: 'Conectado', subtitle: 'Chamada em curso' };
  }
  if (phase === 'connecting') {
    return { title: 'A conectar…', subtitle: 'Estabelecendo ligação' };
  }
  if (phase === 'calling') {
    if (serverStatus === 'ringing') {
      return { title: 'A chamar…', subtitle: 'Aguardando resposta' };
    }
    return { title: 'Chamando…', subtitle: 'Aguardando atendimento' };
  }
  if (phase === 'failed') {
    return {
      title: 'Falha na ligação',
      subtitle:
        errorMessage ??
        'Não foi possível completar a chamada. Verifique a ligação e tente novamente.',
    };
  }
  if (phase === 'ended') {
    if (serverStatus === 'rejected') {
      return { title: 'Chamada recusada', subtitle: 'O motorista recusou a chamada' };
    }
    return { title: 'Chamada terminada', subtitle: 'A ligação terminou' };
  }
  if (webrtcPhase === 'requesting_mic') {
    return { title: 'A conectar…', subtitle: 'Estabelecendo ligação' };
  }
  return { title: 'Chamando…', subtitle: 'Aguardando atendimento' };
}

function derivePhase(
  visible: boolean,
  starting: boolean,
  serverStatus: string,
  webrtcPhase: string,
  webrtcError: string | null,
  terminalDismiss: boolean,
): PassengerOutboundCallPhase {
  if (!visible || terminalDismiss) return 'idle';
  if (webrtcError || webrtcPhase === 'failed') return 'failed';
  if (TERMINAL_STATUSES.has(serverStatus)) return 'ended';
  if (webrtcPhase === 'connected') return 'connected';
  if (
    serverStatus === 'accepted' ||
    webrtcPhase === 'negotiating' ||
    webrtcPhase === 'waiting_answer' ||
    webrtcPhase === 'requesting_mic'
  ) {
    return 'connecting';
  }
  if (starting || serverStatus === 'initiated' || serverStatus === 'ringing' || !serverStatus) {
    return 'calling';
  }
  return 'calling';
}

export function usePassengerOutboundInternetCall() {
  const mountedRef = useRef(true);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectedSinceRef = useRef<number | null>(null);

  const [visible, setVisible] = useState(false);
  const [starting, setStarting] = useState(false);
  const [rideId, setRideId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [callRow, setCallRow] = useState<RideCallRow | null>(null);
  const [selfUserId, setSelfUserId] = useState<string | null>(null);
  const [driverName, setDriverName] = useState('Motorista');
  const [driverAvatarUrl, setDriverAvatarUrl] = useState<string | null>(null);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [durationSec, setDurationSec] = useState(0);
  const [hangupBusy, setHangupBusy] = useState(false);
  const [terminalDismiss, setTerminalDismiss] = useState(false);

  const serverStatus = (rideCallRowStatus(callRow) ?? '').toLowerCase();
  const webrtcEnabled =
    Platform.OS !== 'web' && visible && !!callId && !!selfUserId && !terminalDismiss;

  const {
    remoteStream,
    phase: webrtcPhase,
    error: webrtcError,
    micMuted,
    toggleMicMuted,
    releaseWebRTC,
  } = useWebRTC({
    rideCallId: callId,
    selfUserId,
    enabled: webrtcEnabled,
    role: 'caller',
  });

  const uiPhase = derivePhase(
    visible,
    starting,
    serverStatus,
    webrtcPhase,
    webrtcError,
    terminalDismiss,
  );

  const copy = deriveCallCopy(uiPhase, serverStatus, webrtcPhase, webrtcError);

  const resetSession = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    connectedSinceRef.current = null;
    releaseWebRTC();
    void stopWebrtcCallAudioSession();
    setCallId(null);
    setCallRow(null);
    setRideId(null);
    setStarting(false);
    setHangupBusy(false);
    setDurationSec(0);
    setSpeakerOn(true);
    setTerminalDismiss(false);
  }, [releaseWebRTC]);

  const closeModal = useCallback(() => {
    resetSession();
    if (mountedRef.current) setVisible(false);
  }, [resetSession]);

  const hangUp = useCallback(async () => {
    const id = callId ?? callRow?.id;
    if (!id || hangupBusy) return;
    setHangupBusy(true);
    try {
      releaseWebRTC();
      await stopWebrtcCallAudioSession();
      await rideCallService.endInternetCall({ p_call_id: id });
    } catch (e) {
      console.error('[outboundCall] encerrar_chamada_internet erro técnico:', e);
    } finally {
      if (mountedRef.current) closeModal();
    }
  }, [callId, callRow?.id, hangupBusy, releaseWebRTC, closeModal]);

  const toggleSpeaker = useCallback(async () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    try {
      await setWebrtcCallSpeakerphoneOn(next);
    } catch (e) {
      console.warn('[outboundCall] speaker toggle', e);
    }
  }, [speakerOn]);

  const startCall = useCallback(async (params: StartCallParams) => {
    if (!params.rideId?.trim()) {
      throw new Error('Identificador da viagem em falta.');
    }
    const user = await authService.getCurrentUser();
    if (!user?.id?.trim()) {
      throw new Error('Inicie sessão para ligar.');
    }
    if (!params.receiverUserId?.trim()) {
      throw new Error('Não foi possível obter o motorista desta viagem.');
    }

    resetSession();
    setVisible(true);
    setStarting(true);
    setRideId(params.rideId);
    setSelfUserId(user.id);
    setDriverName(params.driverName?.trim() || 'Motorista');
    setDriverAvatarUrl(params.driverAvatarUrl?.trim() || null);

    try {
      const { call_id } = await rideCallService.startInternetCall({
        p_ride_id: params.rideId,
        p_caller_user_id: user.id,
        p_receiver_user_id: params.receiverUserId,
        p_call_mode: 'internet_voice',
      });
      if (!call_id) throw new Error('Identificador da chamada em falta.');
      if (!mountedRef.current) return;
      setCallId(call_id);
      setStarting(false);
      await startWebrtcCallAudioSession();
      if (speakerOn) {
        await setWebrtcCallSpeakerphoneOn(true);
      }
    } catch (e) {
      console.error('[outboundCall] iniciar_chamada_internet erro técnico:', e);
      if (mountedRef.current) closeModal();
      throw new Error(rideCallUserMessage(e, 'start'));
    }
  }, [resetSession, speakerOn, closeModal]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      releaseWebRTC();
      void stopWebrtcCallAudioSession();
    };
  }, [releaseWebRTC]);

  useEffect(() => {
    if (!selfUserId?.trim() || !visible || !callId) return;
    const unsub = rideCallService.subscribeCallerInternetCalls(selfUserId, (row) => {
      if (row.id !== callId) return;
      if (mountedRef.current) setCallRow(row);
    });
    return unsub;
  }, [selfUserId, visible, callId]);

  useEffect(() => {
    if (!rideId || !callId || !visible) return;
    let cancelled = false;
    void rideCallService.fetchLatestRideCall(rideId, callId).then((row) => {
      if (!cancelled && row && mountedRef.current) setCallRow(row);
    });
    return () => {
      cancelled = true;
    };
  }, [rideId, callId, visible]);

  useEffect(() => {
    if (uiPhase !== 'connected') {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      connectedSinceRef.current = null;
      if (mountedRef.current) setDurationSec(0);
      return;
    }

    if (connectedSinceRef.current == null) {
      connectedSinceRef.current = Date.now();
    }

    durationTimerRef.current = setInterval(() => {
      if (connectedSinceRef.current == null) return;
      const sec = Math.floor((Date.now() - connectedSinceRef.current) / 1000);
      if (mountedRef.current) setDurationSec(sec);
    }, 1000);

    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    };
  }, [uiPhase]);

  useEffect(() => {
    if (uiPhase !== 'ended' && uiPhase !== 'failed') return;
    const t = setTimeout(() => {
      if (mountedRef.current) closeModal();
    }, 2600);
    return () => clearTimeout(t);
  }, [uiPhase, closeModal]);

  useEffect(() => {
    if (!visible || uiPhase === 'idle') return;
    void setWebrtcCallSpeakerphoneOn(speakerOn);
  }, [visible, uiPhase, speakerOn]);

  return {
    visible,
    uiPhase,
    title: copy.title,
    subtitle: copy.subtitle,
    driverName,
    driverAvatarUrl,
    durationSec,
    micMuted,
    speakerOn,
    hangupBusy,
    starting,
    remoteStreamUrl: remoteStream?.toURL() ?? null,
    showControls: visible && uiPhase !== 'idle',
    showDuration: uiPhase === 'connected',
    isWaiting: uiPhase === 'calling' || uiPhase === 'connecting' || starting,
    startCall,
    hangUp,
    toggleMicMuted,
    toggleSpeaker,
    dismiss: closeModal,
  };
}

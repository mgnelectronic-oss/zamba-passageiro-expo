import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  BackHandler,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { rideCallService, rideCallRowStatus, rideCallUserMessage, type RideCallRow, type RideCallStatus } from '@/services/rideCallService';
import { authService } from '@/services/authService';
import { useWebRTC } from '@/hooks/useWebRTC';

const EMERALD = '#10B981';

function normalizeStatus(raw: string | null | undefined): RideCallStatus | 'connecting' | 'unknown' {
  const s = (raw ?? '').toLowerCase().trim();
  if (s === 'initiated' || s === 'ringing' || s === 'accepted' || s === 'ended' || s === 'rejected') {
    return s as RideCallStatus;
  }
  if (!s) return 'connecting';
  return 'unknown';
}

function decodeRouteParam(s: string | undefined, fallback: string): string {
  if (s == null || s === '') return fallback;
  try {
    const t = decodeURIComponent(s).trim();
    return t || fallback;
  } catch {
    const t = String(s).trim();
    return t || fallback;
  }
}

function statusLabel(s: ReturnType<typeof normalizeStatus>): string {
  switch (s) {
    case 'initiated':
      return 'A ligar…';
    case 'ringing':
      return 'A tocar…';
    case 'accepted':
      return 'Aceite';
    case 'ended':
      return 'Chamada terminada';
    case 'rejected':
      return 'Chamada recusada';
    case 'connecting':
      return 'A estabelecer…';
    default:
      return 'Estado da chamada';
  }
}

function displayCallStatusLabel(
  uiStatus: ReturnType<typeof normalizeStatus>,
  webrtcEnabled: boolean,
  webrtcPhase: string,
  peerState: string,
): string {
  if (webrtcEnabled) {
    if (webrtcPhase === 'connected') return 'Conectado';
    if (uiStatus === 'accepted' || uiStatus === 'ringing' || uiStatus === 'initiated') {
      return 'A conectar…';
    }
  }
  if (uiStatus === 'accepted') return 'A conectar…';
  return statusLabel(uiStatus);
}

const HIDDEN_RTC = {
  position: 'absolute' as const,
  width: 1,
  height: 1,
  opacity: 0.01,
  left: 0,
  top: 0,
};

function NativeRtcAudio({ streamUrl }: { streamUrl: string | null }) {
  if (Platform.OS === 'web' || !streamUrl) return null;
  const { RTCView } = require('react-native-webrtc') as typeof import('react-native-webrtc');
  return <RTCView streamURL={streamUrl} style={HIDDEN_RTC} objectFit="cover" />;
}

function webrtcPhaseLabel(phase: string, peerState: string, isIncoming: boolean): string {
  switch (phase) {
    case 'requesting_mic':
      return 'Microfone…';
    case 'negotiating':
      return 'A negociar áudio…';
    case 'waiting_offer':
      return isIncoming ? 'À espera do motorista…' : 'À espera de oferta…';
    case 'waiting_answer':
      return 'À espera do motorista…';
    case 'connected':
      return peerState === 'connected' ? 'Áudio activo' : 'A conectar áudio…';
    case 'failed':
      return 'Falha na ligação de áudio';
    default:
      return '';
  }
}

export default function RideCallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rideId, driverUserId, driverName, callId: callIdParam, incoming: incomingParam } =
    useLocalSearchParams<{
      rideId: string;
      driverUserId: string;
      driverName?: string;
      callId?: string;
      incoming?: string;
    }>();

  const callId = callIdParam && callIdParam.length > 0 ? callIdParam : null;
  const isIncoming = incomingParam === '1';
  const webrtcRole = isIncoming ? 'callee' : 'caller';
  const displayName = decodeRouteParam(driverName, 'Motorista');

  const [row, setRow] = useState<RideCallRow | null>(null);
  const [ending, setEnding] = useState(false);
  const [selfUserId, setSelfUserId] = useState<string | null>(null);

  const uiStatus = useMemo(() => normalizeStatus(rideCallRowStatus(row)), [row]);

  const effectiveCallId = useMemo(() => row?.id ?? callId ?? null, [row?.id, callId]);

  const webrtcEnabled = Platform.OS !== 'web' && !!effectiveCallId && !!selfUserId;

  const { remoteStream, phase: webrtcPhase, peerState, error: webrtcErr, releaseWebRTC } = useWebRTC({
    rideCallId: effectiveCallId,
    selfUserId,
    enabled: webrtcEnabled,
    role: webrtcRole,
  });

  useEffect(() => {
    let mounted = true;
    void authService.getCurrentUser().then((u) => {
      if (mounted) setSelfUserId(u?.id ?? null);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    void rideCallService.fetchLatestRideCall(rideId, callId).then((r) => {
      if (!cancelled && r) setRow(r);
    });
    return () => {
      cancelled = true;
    };
  }, [rideId, callId]);

  useEffect(() => {
    if (!rideId) return;
    const unsub = rideCallService.subscribeRideCall(
      rideId,
      (r) => {
        if (r) setRow(r);
      },
      { callId },
    );
    return unsub;
  }, [rideId, callId]);

  useEffect(() => {
    if (isIncoming || !selfUserId?.trim()) return;
    const unsub = rideCallService.subscribeCallerInternetCalls(selfUserId, (r) => {
      if (callId && r.id !== callId) return;
      setRow(r);
    });
    return unsub;
  }, [isIncoming, selfUserId, callId]);

  useEffect(() => {
    const status = uiStatus;
    if (status === 'ended' || status === 'rejected') {
      releaseWebRTC();
      router.back();
    }
  }, [uiStatus, releaseWebRTC, router]);

  const handleEnd = useCallback(async () => {
    if (!rideId || ending) return;
    const id = row?.id ?? callId ?? null;
    if (!id) {
      Alert.alert('Erro', 'Identificador da chamada em falta.');
      return;
    }
    setEnding(true);
    try {
      releaseWebRTC();
      await rideCallService.endInternetCall({ p_call_id: id });
      router.back();
    } catch (e: unknown) {
      Alert.alert('Erro', rideCallUserMessage(e, 'end'));
    } finally {
      setEnding(false);
    }
  }, [rideId, callId, row?.id, ending, router, releaseWebRTC]);

  const confirmLeave = useCallback(() => {
    Alert.alert(
      'Sair da chamada',
      'A sessão por internet continua activa no motorista até encerrar.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Encerrar e sair', style: 'destructive', onPress: () => void handleEnd() },
      ],
    );
  }, [handleEnd]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        confirmLeave();
        return true;
      });
      return () => sub.remove();
    }, [confirmLeave]),
  );

  const subline = webrtcPhaseLabel(webrtcPhase, peerState, isIncoming);
  const showRtcError = !!webrtcErr && webrtcPhase === 'failed';
  const mainStatusLabel = displayCallStatusLabel(uiStatus, webrtcEnabled, webrtcPhase, peerState);

  if (!rideId || !driverUserId) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.muted}>Dados da chamada inválidos.</Text>
        <TouchableOpacity style={styles.hangup} onPress={() => router.back()}>
          <Text style={styles.hangupText}>Fechar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
      <StatusBar style="dark" />
      <NativeRtcAudio streamUrl={remoteStream?.toURL() ?? null} />

      <TouchableOpacity
        style={styles.backHit}
        onPress={confirmLeave}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
      >
        <Ionicons name="chevron-back" size={26} color="#0F172A" />
      </TouchableOpacity>

      <View style={styles.centerBlock}>
        <View style={styles.avatarRing}>
          <Ionicons name="person" size={48} color="#64748B" />
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {displayName}
        </Text>
        <Text style={styles.status}>{mainStatusLabel}</Text>
        {webrtcEnabled && subline ? <Text style={styles.subline}>{subline}</Text> : null}
        {showRtcError ? <Text style={styles.errText}>{webrtcErr}</Text> : null}
        {webrtcPhase === 'idle' && Platform.OS !== 'web' ? (
          <Text style={styles.subline}>A preparar áudio…</Text>
        ) : null}
      </View>

      <TouchableOpacity
        style={[styles.hangup, ending && styles.hangupDisabled]}
        onPress={() => void handleEnd()}
        disabled={ending}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Encerrar chamada"
      >
        {ending ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name="call" size={22} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
            <Text style={styles.hangupText}>Encerrar chamada</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 24,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#64748B', fontSize: 15, fontWeight: '600' },
  backHit: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingRight: 12,
    marginBottom: 8,
  },
  centerBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  avatarRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 3,
    borderColor: '#FFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  status: {
    fontSize: 17,
    fontWeight: '600',
    color: EMERALD,
    marginBottom: 8,
  },
  subline: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  errText: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  hangup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#DC2626',
    paddingVertical: 16,
    borderRadius: 16,
    minHeight: 56,
  },
  hangupDisabled: { opacity: 0.7 },
  hangupText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  WEBRTC_ICE_SERVERS,
  parseSignalPayload,
  sendWebRtcSignal,
  signalReceiverId,
  signalSenderId,
  subscribeRideCallSignals,
  type RideCallSignalRow,
} from '@/services/webrtcService';
import { logWebrtcCallDebug } from '@/lib/webrtcCallDebug';
import { consumeIncomingOffer } from '@/lib/webrtcOfferBuffer';
import { shouldProcessWebrtcSignal } from '@/lib/webrtcSessionGuard';

export type WebRtcPhase =
  | 'idle'
  | 'requesting_mic'
  | 'negotiating'
  | 'waiting_offer'
  | 'waiting_answer'
  | 'connected'
  | 'failed';

export type WebRtcRole = 'caller' | 'callee';

function normType(t: string | undefined): string {
  return (t ?? '').toLowerCase().trim();
}

type MediaStreamLike = {
  toURL: () => string;
  getTracks: () => { stop: () => void; kind?: string }[];
  release: () => void;
};

/**
 * WebRTC por internet: caller envia offer; callee recebe offer e envia answer.
 * `react-native-webrtc` é carregado só em runtime (evita crash na web / sem módulo nativo).
 */
export function useWebRTC(opts: {
  rideCallId: string | null | undefined;
  selfUserId: string | null | undefined;
  enabled: boolean;
  role?: WebRtcRole;
}) {
  const { rideCallId, selfUserId, enabled, role = 'caller' } = opts;

  const [remoteStream, setRemoteStream] = useState<MediaStreamLike | null>(null);
  const [phase, setPhase] = useState<WebRtcPhase>('idle');
  const [peerState, setPeerState] = useState<string>('new');
  const [error, setError] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);

  const pcRef = useRef<{ close: () => void } | null>(null);
  const localStreamRef = useRef<MediaStreamLike | null>(null);
  const remoteDescSetRef = useRef(false);
  const offerAppliedRef = useRef(false);
  const answerAppliedRef = useRef(false);
  const iceBufferRef = useRef<Record<string, unknown>[]>([]);
  const pendingSignalsRef = useRef<RideCallSignalRow[]>([]);
  const processedSignalIdsRef = useRef<Set<string>>(new Set());
  const pcReadyRef = useRef(false);
  const unsubRef = useRef<(() => void) | null>(null);
  const rideCallIdRef = useRef<string | null>(null);
  const roleRef = useRef<WebRtcRole>(role);

  roleRef.current = role;

  const releaseWebRTC = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;

    const pc = pcRef.current as { close: () => void } | null;
    pcRef.current = null;
    pcReadyRef.current = false;
    try {
      pc?.close();
    } catch {
      /* ignore */
    }

    const loc = localStreamRef.current;
    localStreamRef.current = null;
    if (loc) {
      loc.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      });
      try {
        loc.release();
      } catch {
        /* ignore */
      }
    }

    setRemoteStream(null);
    remoteDescSetRef.current = false;
    offerAppliedRef.current = false;
    answerAppliedRef.current = false;
    iceBufferRef.current = [];
    pendingSignalsRef.current = [];
    processedSignalIdsRef.current.clear();
    rideCallIdRef.current = null;
    setPhase('idle');
    setPeerState('closed');
    setMicMuted(false);
  }, []);

  const toggleMicMuted = useCallback(() => {
    const loc = localStreamRef.current;
    if (!loc) return;
    setMicMuted((prev) => {
      const next = !prev;
      loc.getTracks()
        .filter((t) => t.kind === 'audio')
        .forEach((t) => {
          try {
            (t as { enabled?: boolean }).enabled = !next;
          } catch {
            /* ignore */
          }
        });
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') {
      if (Platform.OS === 'web' && enabled) setError('WebRTC não está disponível na web.');
      return;
    }

    let webrtc: typeof import('react-native-webrtc');
    try {
      webrtc = require('react-native-webrtc');
    } catch {
      setError('Módulo WebRTC não disponível. Use um development build (prebuild).');
      setPhase('failed');
      return;
    }

    const {
      RTCPeerConnection,
      RTCSessionDescription,
      RTCIceCandidate,
      mediaDevices,
      permissions,
    } = webrtc;

    const rcid = rideCallId?.trim();
    const uid = selfUserId?.trim();
    if (!rcid || !uid) return;

    let cancelled = false;
    rideCallIdRef.current = rcid;
    processedSignalIdsRef.current.clear();
    offerAppliedRef.current = false;
    answerAppliedRef.current = false;
    remoteDescSetRef.current = false;
    iceBufferRef.current = [];
    pendingSignalsRef.current = [];
    pcReadyRef.current = false;

    logWebrtcCallDebug('session_start', {
      call_id: rcid,
      role: roleRef.current,
    });

    const resolveCallId = (): string => rideCallIdRef.current ?? rcid;

    const flushIce = async (pc: InstanceType<typeof RTCPeerConnection>) => {
      const buf = [...iceBufferRef.current];
      iceBufferRef.current = [];
      for (const init of buf) {
        try {
          if (init.candidate != null) {
            await pc.addIceCandidate(new RTCIceCandidate(init as any));
          }
        } catch (e) {
          console.warn('[useWebRTC] addIceCandidate', e);
        }
      }
    };

    const applyRemoteAnswer = async (
      pc: InstanceType<typeof RTCPeerConnection>,
      pl: Record<string, unknown>,
    ) => {
      if (answerAppliedRef.current) return;
      const sdp = pl.sdp as string | undefined;
      const typ = (pl.type as string) || 'answer';
      if (!sdp) return;
      logWebrtcCallDebug('answer_apply_start', {
        call_id: resolveCallId(),
        answer_type: typ,
        sdp_chars: sdp.length,
      });
      await pc.setRemoteDescription(new RTCSessionDescription({ type: typ as any, sdp }));
      remoteDescSetRef.current = true;
      answerAppliedRef.current = true;
      await flushIce(pc);
      setPhase('negotiating');
    };

    const applyRemoteOffer = async (
      pc: InstanceType<typeof RTCPeerConnection>,
      pl: Record<string, unknown>,
    ) => {
      if (offerAppliedRef.current) return;
      const sdp = pl.sdp as string | undefined;
      const typ = (pl.type as string) || 'offer';
      if (!sdp) return;
      logWebrtcCallDebug('offer_apply_start', {
        call_id: resolveCallId(),
        offer_type: typ,
        sdp_chars: sdp.length,
      });
      await pc.setRemoteDescription(new RTCSessionDescription({ type: typ as any, sdp }));
      remoteDescSetRef.current = true;
      offerAppliedRef.current = true;
      const answer = await pc.createAnswer();
      if (cancelled) return;
      await pc.setLocalDescription(answer);
      const sendCallId = resolveCallId();
      if (!sendCallId) {
        logWebrtcCallDebug('answer_send_skipped_no_call_id', {
          expected_call_id: rcid,
        });
        return;
      }
      await sendWebRtcSignal({
        p_call_id: sendCallId,
        p_signal_type: 'answer',
        p_payload: { type: answer.type, sdp: (answer as { sdp?: string }).sdp ?? '' },
      });
      logWebrtcCallDebug('answer_sent', {
        call_id: sendCallId,
        answer_type: answer.type,
        sdp_chars: (answer as { sdp?: string }).sdp?.length ?? 0,
      });
      await flushIce(pc);
      setPhase('negotiating');
    };

    const markConnectedIfReady = (pc: InstanceType<typeof RTCPeerConnection>) => {
      const connOk = pc.connectionState === 'connected';
      const iceOk =
        pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed';
      if (connOk || iceOk) {
        logWebrtcCallDebug('peer_connected', {
          call_id: resolveCallId(),
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
        });
        setPhase('connected');
      }
    };

    const onRemoteSignal = async (
      row: RideCallSignalRow,
      pc: InstanceType<typeof RTCPeerConnection>,
    ) => {
      const activeCallId = resolveCallId();
      if (
        !shouldProcessWebrtcSignal({
          row,
          activeCallId,
          processedSignalIds: processedSignalIdsRef.current,
        })
      ) {
        return;
      }

      const st = normType(row.signal_type);
      const pl = parseSignalPayload(row.payload);
      if (!pl) return;

      logWebrtcCallDebug('signal_received', {
        call_id: activeCallId,
        signal_type: st,
        signal_id: row.id ?? null,
        sender_user_id: signalSenderId(row) ?? null,
        receiver_user_id: signalReceiverId(row) ?? null,
      });

      if (st === 'offer' && roleRef.current === 'callee') {
        try {
          setPhase('negotiating');
          await applyRemoteOffer(pc, pl);
        } catch (e) {
          logWebrtcCallDebug('offer_apply_failed', {
            call_id: activeCallId,
            error: e instanceof Error ? e.message : String(e),
          });
          console.warn('[useWebRTC] setRemoteDescription offer', e);
          setError('Falha ao receber chamada do motorista.');
          setPhase('failed');
        }
        return;
      }

      if (st === 'answer' && roleRef.current === 'caller') {
        try {
          await applyRemoteAnswer(pc, pl);
        } catch (e) {
          logWebrtcCallDebug('answer_apply_failed', {
            call_id: activeCallId,
            error: e instanceof Error ? e.message : String(e),
          });
          console.warn('[useWebRTC] setRemoteDescription answer', e);
          setError('Falha ao aplicar resposta do motorista.');
          setPhase('failed');
        }
        return;
      }

      if (st === 'ice_candidate' || st === 'ice') {
        const init = pl as Record<string, unknown>;
        if (!remoteDescSetRef.current) {
          iceBufferRef.current.push(init);
          logWebrtcCallDebug('ice_candidate_buffered', {
            call_id: activeCallId,
            buffer_size: iceBufferRef.current.length,
          });
          return;
        }
        try {
          if (init.candidate != null) {
            await pc.addIceCandidate(new RTCIceCandidate(init as any));
            logWebrtcCallDebug('ice_candidate_applied', {
              call_id: activeCallId,
            });
          }
        } catch (e) {
          logWebrtcCallDebug('ice_candidate_failed', {
            call_id: activeCallId,
            error: e instanceof Error ? e.message : String(e),
          });
          console.warn('[useWebRTC] remote ICE', e);
        }
      }
    };

    const flushPendingSignals = (pc: InstanceType<typeof RTCPeerConnection>) => {
      const pending = [...pendingSignalsRef.current];
      pendingSignalsRef.current = [];
      for (const row of pending) {
        void onRemoteSignal(row, pc);
      }
    };

    unsubRef.current = subscribeRideCallSignals(rcid, uid, (row) => {
      const pc = pcRef.current as InstanceType<typeof RTCPeerConnection> | null;
      if (!pcReadyRef.current || !pc) {
        pendingSignalsRef.current.push(row);
        logWebrtcCallDebug('signal_buffered_until_pc_ready', {
          call_id: rcid,
          signal_type: row.signal_type ?? null,
          buffer_size: pendingSignalsRef.current.length,
        });
        return;
      }
      void onRemoteSignal(row, pc);
    });

    void (async () => {
      try {
        setError(null);
        setPhase('requesting_mic');

        const granted = await permissions.request({ name: 'microphone' });
        if (!granted) {
          setError('Permissão de microfone negada.');
          setPhase('failed');
          return;
        }

        const local = (await mediaDevices.getUserMedia({
          audio: true,
          video: false,
        })) as MediaStreamLike;
        if (cancelled) {
          local.getTracks().forEach((t) => t.stop());
          local.release();
          return;
        }
        localStreamRef.current = local;

        const pc = new RTCPeerConnection({
          iceServers: [...WEBRTC_ICE_SERVERS],
        });
        pcRef.current = pc;

        const pcEv = pc as InstanceType<typeof RTCPeerConnection> & {
          addEventListener(type: 'connectionstatechange', listener: () => void): void;
          addEventListener(type: 'iceconnectionstatechange', listener: () => void): void;
          addEventListener(
            type: 'track',
            listener: (ev: { streams?: MediaStreamLike[] }) => void,
          ): void;
          addEventListener(
            type: 'icecandidate',
            listener: (ev: { candidate: InstanceType<typeof RTCIceCandidate> | null }) => void,
          ): void;
        };

        pcEv.addEventListener('connectionstatechange', () => {
          setPeerState(pc.connectionState);
          logWebrtcCallDebug('peer_connection_state', {
            call_id: resolveCallId(),
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
            signalingState: pc.signalingState,
          });
          markConnectedIfReady(pc);
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            setPhase((p) => (p === 'connected' ? p : 'failed'));
          }
        });

        pcEv.addEventListener('iceconnectionstatechange', () => {
          logWebrtcCallDebug('ice_connection_state', {
            call_id: resolveCallId(),
            iceConnectionState: pc.iceConnectionState,
          });
          markConnectedIfReady(pc);
        });

        local
          .getTracks()
          .filter((t) => t.kind === 'audio')
          .forEach((track) => {
            pc.addTrack(track as any, local as any);
          });

        pcEv.addEventListener('track', (ev) => {
          const rs = ev.streams?.[0];
          if (rs) {
            setRemoteStream(rs);
            logWebrtcCallDebug('remote_track_received', {
              call_id: resolveCallId(),
              audio_tracks: rs.getTracks().filter((t) => t.kind === 'audio').length,
            });
            markConnectedIfReady(pc);
          }
        });

        pcEv.addEventListener('icecandidate', async (ev) => {
          const c = ev.candidate;
          const sendCallId = resolveCallId();
          if (!c || !sendCallId) return;
          try {
            const json = c.toJSON
              ? c.toJSON()
              : {
                  candidate: c.candidate,
                  sdpMid: c.sdpMid,
                  sdpMLineIndex: c.sdpMLineIndex,
                };
            await sendWebRtcSignal({
              p_call_id: sendCallId,
              p_signal_type: 'ice_candidate',
              p_payload: json as Record<string, unknown>,
            });
            logWebrtcCallDebug('ice_candidate_sent', { call_id: sendCallId });
          } catch (e) {
            logWebrtcCallDebug('ice_send_failed', {
              call_id: sendCallId,
              error: e instanceof Error ? e.message : String(e),
            });
            console.warn('[useWebRTC] send ICE', e);
          }
        });

        pcReadyRef.current = true;
        flushPendingSignals(pc);

        if (roleRef.current === 'caller') {
          setPhase('negotiating');
          const offer = await pc.createOffer({ offerToReceiveAudio: true });
          if (cancelled) return;
          await pc.setLocalDescription(offer);

          await sendWebRtcSignal({
            p_call_id: rcid,
            p_signal_type: 'offer',
            p_payload: { type: offer.type, sdp: (offer as { sdp?: string }).sdp ?? '' },
          });
          logWebrtcCallDebug('offer_sent', {
            call_id: rcid,
            offer_type: offer.type,
            sdp_chars: (offer as { sdp?: string }).sdp?.length ?? 0,
          });

          setPhase('waiting_answer');
        } else {
          setPhase('waiting_offer');
          const bufferedOffer = consumeIncomingOffer(rcid);
          if (bufferedOffer) {
            logWebrtcCallDebug('offer_apply_buffered', { call_id: rcid });
            try {
              await applyRemoteOffer(pc, bufferedOffer);
            } catch (e) {
              logWebrtcCallDebug('offer_apply_failed', {
                call_id: rcid,
                source: 'incoming_modal_buffer',
                error: e instanceof Error ? e.message : String(e),
              });
              console.warn('[useWebRTC] buffered offer', e);
            }
          } else {
            logWebrtcCallDebug('offer_buffer_empty', {
              call_id: rcid,
              note: 'awaiting offer via realtime replay',
            });
          }
        }
      } catch (e: unknown) {
        if (cancelled) return;
        console.error('[useWebRTC] erro técnico:', e);
        setError(
          'Não foi possível iniciar a chamada pelo Zamba. Tente novamente ou use a opção ligar por telefone.',
        );
        setPhase('failed');
        releaseWebRTC();
      }
    })();

    return () => {
      cancelled = true;
      releaseWebRTC();
    };
  }, [enabled, rideCallId, selfUserId, role, releaseWebRTC]);

  return {
    remoteStream,
    phase,
    peerState,
    error,
    micMuted,
    toggleMicMuted,
    releaseWebRTC,
  };
}

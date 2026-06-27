import React from 'react';
import { Platform } from 'react-native';

const HIDDEN_RTC = {
  position: 'absolute' as const,
  width: 1,
  height: 1,
  opacity: 0.01,
  left: 0,
  top: 0,
};

type Props = {
  streamUrl: string | null | undefined;
};

/** Reproduz áudio remoto WebRTC (stream oculto). */
export function InternetCallRemoteAudio({ streamUrl }: Props) {
  if (Platform.OS === 'web' || !streamUrl) return null;
  const { RTCView } = require('react-native-webrtc') as typeof import('react-native-webrtc');
  return <RTCView streamURL={streamUrl} style={HIDDEN_RTC} objectFit="cover" />;
}

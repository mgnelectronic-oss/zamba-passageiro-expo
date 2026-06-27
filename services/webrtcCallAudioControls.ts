import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { Platform } from 'react-native';

export type CallAudioRoute = 'earpiece' | 'speaker';

type InCallManagerLike = {
  start: (opts: { media: string; auto?: boolean; ringback?: string }) => void;
  stop: () => void;
  setSpeakerphoneOn: (on: boolean) => void;
  setForceSpeakerphoneOn: (on: boolean) => void;
};

let inCallManager: InCallManagerLike | null | undefined;

function getInCallManager(): InCallManagerLike | null {
  if (inCallManager !== undefined) return inCallManager;
  try {
    const mod = require('react-native-incall-manager') as { default?: InCallManagerLike };
    inCallManager = mod?.default ?? (mod as unknown as InCallManagerLike);
  } catch {
    inCallManager = null;
  }
  return inCallManager;
}

let sessionActive = false;

async function applyExpoAudioRoute(route: CallAudioRoute): Promise<void> {
  const earpiece = route === 'earpiece';
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: earpiece,
    });
  } catch {
    /* noop */
  }
}

export async function startWebrtcCallAudioSession(): Promise<void> {
  if (sessionActive) return;
  sessionActive = true;

  const incall = getInCallManager();
  try {
    incall?.start({ media: 'audio', auto: false, ringback: '' });
    incall?.setSpeakerphoneOn(false);
    incall?.setForceSpeakerphoneOn(false);
  } catch {
    /* noop */
  }

  await applyExpoAudioRoute('earpiece');
}

export async function stopWebrtcCallAudioSession(): Promise<void> {
  const incall = getInCallManager();
  try {
    incall?.stop();
  } catch {
    /* noop */
  }

  sessionActive = false;

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    /* noop */
  }
}

export async function setWebrtcCallSpeakerphoneOn(speakerOn: boolean): Promise<void> {
  const route: CallAudioRoute = speakerOn ? 'speaker' : 'earpiece';
  const incall = getInCallManager();

  try {
    if (incall) {
      incall.setSpeakerphoneOn(speakerOn);
      incall.setForceSpeakerphoneOn(speakerOn);
    }
  } catch {
    /* noop */
  }

  await applyExpoAudioRoute(route);

  if (Platform.OS === 'android' && !incall) {
    /* expo-av playThroughEarpieceAndroid já aplicado */
  }
}

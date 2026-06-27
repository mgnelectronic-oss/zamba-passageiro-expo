import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { Platform, Vibration } from 'react-native';

const INCOMING_RING = require('@/assets/sounds/incoming-call-ring.mp3');

let loopingSound: Audio.Sound | null = null;
let iosVibrateTimer: ReturnType<typeof setInterval> | null = null;
let active = false;

function stopIosVibrateLoop(): void {
  if (iosVibrateTimer != null) {
    clearInterval(iosVibrateTimer);
    iosVibrateTimer = null;
  }
}

function startIosVibrateLoop(): void {
  stopIosVibrateLoop();
  Vibration.vibrate(400);
  iosVibrateTimer = setInterval(() => {
    Vibration.vibrate(400);
  }, 700);
}

async function configureRingAudioMode(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    });
  } catch {
    /* noop */
  }
}

/** Toca ringtone em loop e vibra enquanto a chamada recebida está activa. */
export async function startIncomingCallRing(): Promise<void> {
  if (active) return;
  active = true;

  await configureRingAudioMode();

  try {
    const { sound } = await Audio.Sound.createAsync(INCOMING_RING, {
      shouldPlay: false,
      volume: 1,
      isLooping: true,
    });
    loopingSound = sound;
    await loopingSound.setIsLoopingAsync(true);
    await loopingSound.playAsync();
  } catch (e) {
    if (__DEV__) console.warn('[incomingCallRing] play', e);
  }

  if (Platform.OS === 'android') {
    try {
      Vibration.cancel();
      Vibration.vibrate([0, 500, 400], true);
    } catch {
      /* noop */
    }
  } else {
    try {
      Vibration.cancel();
      startIosVibrateLoop();
    } catch {
      /* noop */
    }
  }
}

/** Para ringtone, vibração e timers. */
export async function stopIncomingCallRing(): Promise<void> {
  active = false;
  stopIosVibrateLoop();

  try {
    Vibration.cancel();
  } catch {
    /* noop */
  }

  if (loopingSound) {
    try {
      await loopingSound.stopAsync();
    } catch {
      /* noop */
    }
    try {
      await loopingSound.unloadAsync();
    } catch {
      /* noop */
    }
    loopingSound = null;
  }
}

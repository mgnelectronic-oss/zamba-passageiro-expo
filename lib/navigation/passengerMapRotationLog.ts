const LOG = '[PASSENGER MAP ROTATION]';

let lastLogAt = 0;
const THROTTLE_MS = 1200;

export function logPassengerMapRotation(message: string, extra?: Record<string, unknown>): void {
  if (!__DEV__) return;
  const now = Date.now();
  if (now - lastLogAt < THROTTLE_MS && message.includes('camera updated')) return;
  if (message.includes('camera updated')) lastLogAt = now;
  if (extra) console.log(LOG, message, extra);
  else console.log(LOG, message);
}

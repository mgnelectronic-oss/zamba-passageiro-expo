/** Buffer transitório de offer WebRTC (ex.: chamada recebida antes de abrir ride-call). */
const offersByCallId = new Map<string, Record<string, unknown>>();

export function rememberIncomingOffer(callId: string, payload: Record<string, unknown>): void {
  if (!callId.trim()) return;
  offersByCallId.set(callId.trim(), payload);
}

export function consumeIncomingOffer(callId: string): Record<string, unknown> | null {
  const key = callId.trim();
  if (!key) return null;
  const payload = offersByCallId.get(key) ?? null;
  offersByCallId.delete(key);
  return payload;
}

export function clearIncomingOffer(callId?: string | null): void {
  if (!callId?.trim()) {
    offersByCallId.clear();
    return;
  }
  offersByCallId.delete(callId.trim());
}

/** Logs de diagnóstico WebRTC (chamadas por internet). */
export function logWebrtcCallDebug(
  event: string,
  payload: Record<string, unknown> = {},
): void {
  console.log('[WEBRTC CALL DEBUG]', event, payload);
}

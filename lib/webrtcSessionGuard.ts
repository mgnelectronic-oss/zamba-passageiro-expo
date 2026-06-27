import type { RideCallSignalRow } from '@/services/webrtcService';
import { signalCallId } from '@/services/webrtcService';
import { logWebrtcCallDebug } from '@/lib/webrtcCallDebug';

export function shouldProcessWebrtcSignal(input: {
  row: RideCallSignalRow;
  activeCallId: string | null;
  processedSignalIds: Set<string>;
}): boolean {
  const { row, activeCallId, processedSignalIds } = input;
  const signalId = row.id != null ? String(row.id) : null;

  if (!activeCallId?.trim()) {
    logWebrtcCallDebug('signal_ignored_no_call_id', {
      signal_type: row.signal_type ?? null,
      signal_id: signalId,
    });
    return false;
  }

  const rowCallId = signalCallId(row);
  if (rowCallId && rowCallId !== activeCallId) {
    logWebrtcCallDebug('signal_ignored_call_id_mismatch', {
      expected_call_id: activeCallId,
      row_call_id: rowCallId,
      signal_type: row.signal_type ?? null,
      signal_id: signalId,
    });
    return false;
  }

  if (signalId && processedSignalIds.has(signalId)) {
    logWebrtcCallDebug('signal_ignored_duplicate', {
      call_id: activeCallId,
      signal_type: row.signal_type ?? null,
      signal_id: signalId,
    });
    return false;
  }

  if (signalId) processedSignalIds.add(signalId);
  return true;
}

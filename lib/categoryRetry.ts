import type { RideState } from '@/services/rideStateService';
import {
  buildTripDraft,
  getTripDraft,
  restoreSearchFlowFromDraft,
  saveTripDraft,
  type TripDraft,
} from '@/services/searchFlowStore';

const LOG_PREFIX = '[CATEGORY RETRY]';

export function logCategoryRetry(message: string, extra?: Record<string, unknown>) {
  if (__DEV__) {
    if (extra) {
      console.log(LOG_PREFIX, message, extra);
    } else {
      console.log(LOG_PREFIX, message);
    }
  }
}

export type CategoryRetryRideParams = {
  pickupLat?: string;
  pickupLng?: string;
  pickupAddress?: string;
  vehicleCategory?: string;
};

function isValidCoord(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat !== 0 &&
    lng !== 0
  );
}

function draftSummary(draft: TripDraft) {
  return {
    pickup: {
      lat: draft.pickup.lat,
      lng: draft.pickup.lng,
      address: draft.pickup.address,
    },
    destination: {
      lat: draft.destination.lat,
      lng: draft.destination.lng,
      address: draft.destination.address,
      place_name: draft.destination.place_name,
    },
    estimatedDistanceKm: draft.estimatedDistanceKm,
    estimatedDurationMin: draft.estimatedDurationMin,
    selectedCategorySlug: draft.selectedCategorySlug,
    routePointCount: draft.routeCoordinates?.length ?? 0,
  };
}

export function resolveTripDraftForCategoryRetry(
  rideState: RideState | null,
  params: CategoryRetryRideParams,
): TripDraft | null {
  const existing = getTripDraft();
  if (existing) {
    logCategoryRetry('draft before retry (existing trip draft)', draftSummary(existing));
    return existing;
  }

  const pickupLat = rideState?.pickup_lat ?? Number(params.pickupLat);
  const pickupLng = rideState?.pickup_lng ?? Number(params.pickupLng);
  const destLat = rideState?.destination_lat;
  const destLng = rideState?.destination_lng;

  if (
    !isValidCoord(pickupLat, pickupLng) ||
    destLat == null ||
    destLng == null ||
    !isValidCoord(destLat, destLng)
  ) {
    logCategoryRetry('draft before retry — insufficient ride data', {
      pickupLat,
      pickupLng,
      destLat,
      destLng,
    });
    return null;
  }

  const pickupAddress =
    rideState?.pickup_address?.trim() ||
    params.pickupAddress?.trim() ||
    `${pickupLat.toFixed(4)}, ${pickupLng.toFixed(4)}`;

  const destAddress =
    rideState?.dropoff_address?.trim() ||
    `${destLat.toFixed(4)}, ${destLng.toFixed(4)}`;

  const draft = buildTripDraft({
    pickup: { lat: pickupLat, lng: pickupLng, address: pickupAddress },
    destination: {
      lat: destLat,
      lng: destLng,
      address: destAddress,
      place_name: destAddress,
    },
    selectedCategorySlug: rideState?.vehicle_category ?? params.vehicleCategory,
  });

  logCategoryRetry('draft before retry (built from ride state)', draftSummary(draft));
  return draft;
}

export function buildMapNavigationParamsFromDraft(draft: TripDraft) {
  return {
    originLat: String(draft.pickup.lat),
    originLng: String(draft.pickup.lng),
    originAddress: draft.pickup.address,
    destLat: String(draft.destination.lat),
    destLng: String(draft.destination.lng),
    destAddress: draft.destination.address,
    destName: draft.destination.place_name || draft.destination.address,
    retryCategory: '1',
  };
}

export function prepareCategoryRetryNavigation(
  rideState: RideState | null,
  params: CategoryRetryRideParams,
): { draft: TripDraft; mapParams: ReturnType<typeof buildMapNavigationParamsFromDraft> } | null {
  logCategoryRetry('select another category clicked');

  const draft = resolveTripDraftForCategoryRetry(rideState, params);
  if (!draft) {
    logCategoryRetry('unable to resolve trip draft for category retry');
    return null;
  }

  saveTripDraft(draft);
  restoreSearchFlowFromDraft(draft);

  logCategoryRetry('restored pickup', {
    lat: draft.pickup.lat,
    lng: draft.pickup.lng,
    address: draft.pickup.address,
  });
  logCategoryRetry('restored destination', {
    lat: draft.destination.lat,
    lng: draft.destination.lng,
    address: draft.destination.address,
  });
  if (draft.estimatedDistanceKm > 0) {
    logCategoryRetry('restored distance', { km: draft.estimatedDistanceKm });
  }
  if (draft.estimatedDurationMin > 0) {
    logCategoryRetry('restored duration', { min: draft.estimatedDurationMin });
  }
  if (draft.routeCoordinates?.length) {
    logCategoryRetry('restored route polyline', { points: draft.routeCoordinates.length });
  }

  const mapParams = buildMapNavigationParamsFromDraft(draft);
  logCategoryRetry('navigating to category selection', mapParams);
  return { draft, mapParams };
}

export function assertDraftRestoration(
  draft: TripDraft | null,
  pickup: { lat: number; lng: number; address?: string },
  destination: { lat: number; lng: number; address?: string },
) {
  if (!__DEV__ || !draft) return;

  const pickupMoved =
    Math.abs(draft.pickup.lat - pickup.lat) > 0.0001 ||
    Math.abs(draft.pickup.lng - pickup.lng) > 0.0001;

  const destinationMoved =
    Math.abs(draft.destination.lat - destination.lat) > 0.0001 ||
    Math.abs(draft.destination.lng - destination.lng) > 0.0001;

  if (pickupMoved) {
    logCategoryRetry('pickup changed unexpectedly', {
      expected: { lat: draft.pickup.lat, lng: draft.pickup.lng },
      actual: { lat: pickup.lat, lng: pickup.lng },
    });
  }

  if (destinationMoved) {
    logCategoryRetry('destination changed unexpectedly', {
      expected: { lat: draft.destination.lat, lng: draft.destination.lng },
      actual: { lat: destination.lat, lng: destination.lng },
    });
  }
}

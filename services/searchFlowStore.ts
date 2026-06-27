import type { SelectedDestination } from '@/services/googlePlaces';

export type SelectedPickup = {
  lat: number;
  lng: number;
  address: string;
};

export type TripDraftRouteCoordinate = {
  latitude: number;
  longitude: number;
};

export type TripDraft = {
  pickup: SelectedPickup;
  destination: SelectedDestination;
  estimatedDistanceKm: number;
  estimatedDurationMin: number;
  routeCoordinates?: TripDraftRouteCoordinate[];
  selectedCategorySlug?: string;
  createdAt: number;
};

let selectedDestination: SelectedDestination | null = null;
let selectedPickup: SelectedPickup | null = null;
let tripDraft: TripDraft | null = null;

export function setSelectedDestination(destination: SelectedDestination) {
  selectedDestination = destination;
}

export function getSelectedDestination() {
  return selectedDestination;
}

export function setSelectedPickup(pickup: SelectedPickup) {
  selectedPickup = pickup;
}

export function getSelectedPickup() {
  return selectedPickup;
}

export function saveTripDraft(draft: TripDraft) {
  tripDraft = draft;
  setSelectedPickup(draft.pickup);
  setSelectedDestination(draft.destination);
}

export function getTripDraft(): TripDraft | null {
  return tripDraft;
}

export function clearTripDraft() {
  tripDraft = null;
}

export function restoreSearchFlowFromDraft(draft: TripDraft) {
  saveTripDraft(draft);
}

export function buildTripDraft(input: {
  pickup: SelectedPickup;
  destination: SelectedDestination;
  estimatedDistanceKm?: number;
  estimatedDurationMin?: number;
  routeCoordinates?: TripDraftRouteCoordinate[];
  selectedCategorySlug?: string;
}): TripDraft {
  return {
    pickup: input.pickup,
    destination: input.destination,
    estimatedDistanceKm: input.estimatedDistanceKm ?? 0,
    estimatedDurationMin: input.estimatedDurationMin ?? 0,
    routeCoordinates: input.routeCoordinates,
    selectedCategorySlug: input.selectedCategorySlug,
    createdAt: Date.now(),
  };
}

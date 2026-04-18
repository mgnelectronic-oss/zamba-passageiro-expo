import type { SelectedDestination } from '@/services/googlePlaces';

export type SelectedPickup = {
  lat: number;
  lng: number;
  address: string;
};

let selectedDestination: SelectedDestination | null = null;
let selectedPickup: SelectedPickup | null = null;

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

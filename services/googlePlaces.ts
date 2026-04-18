import { GOOGLE_MAPS_API_KEY } from '@/lib/env';

export type LatLng = { lat: number; lng: number };

export type PlacePrediction = {
  place_id: string;
  name?: string;
  address?: string;
  description?: string;
  structured_formatting?: {
    main_text: string;
    secondary_text?: string;
  };
  distance_meters?: number;
  location?: LatLng;
};

export type SelectedDestination = {
  place_id?: string;
  place_name: string;
  address: string;
  lat: number;
  lng: number;
};

const MOZAMBIQUE_COMPONENT = 'country:mz';

function haversineDistance(a: LatLng, b: LatLng) {
  const R = 6371e3;
  const phi1 = (a.lat * Math.PI) / 180;
  const phi2 = (b.lat * Math.PI) / 180;
  const dPhi = ((b.lat - a.lat) * Math.PI) / 180;
  const dLambda = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function requireApiKey() {
  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY.trim() === '') {
    throw new Error('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY não configurada.');
  }
}

async function jsonRequest(url: string, signal?: AbortSignal) {
  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) {
    throw new Error(`Google Places HTTP ${response.status}`);
  }
  return response.json();
}

export async function searchPredictions(
  input: string,
  pickup: LatLng,
  signal?: AbortSignal,
): Promise<PlacePrediction[]> {
  const trimmed = input.trim();
  if (!trimmed) return [];
  requireApiKey();

  const textSearchParams = new URLSearchParams({
    query: `${trimmed}, Mozambique`,
    location: `${pickup.lat},${pickup.lng}`,
    radius: '50000',
    key: GOOGLE_MAPS_API_KEY,
  });

  const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?${textSearchParams.toString()}`;
  const textSearch = await jsonRequest(textSearchUrl, signal);

  if (textSearch.status === 'OK' && Array.isArray(textSearch.results) && textSearch.results.length > 0) {
    const mapped = textSearch.results.map((result: any) => {
      const lat = Number(result?.geometry?.location?.lat ?? 0);
      const lng = Number(result?.geometry?.location?.lng ?? 0);
      const location = { lat, lng };
      const distance = haversineDistance(pickup, location);
      return {
        place_id: String(result.place_id),
        name: result.name,
        address: result.formatted_address,
        location,
        distance_meters: distance,
        structured_formatting: {
          main_text: result.name ?? '',
          secondary_text: result.formatted_address ?? '',
        },
      } satisfies PlacePrediction;
    });

    mapped.sort(
      (a: PlacePrediction, b: PlacePrediction) =>
        (a.distance_meters ?? 0) - (b.distance_meters ?? 0),
    );
    return mapped;
  }

  const autocompleteParams = new URLSearchParams({
    input: trimmed,
    components: MOZAMBIQUE_COMPONENT,
    location: `${pickup.lat},${pickup.lng}`,
    radius: '50000',
    key: GOOGLE_MAPS_API_KEY,
  });
  const autocompleteUrl =
    `https://maps.googleapis.com/maps/api/place/autocomplete/json?${autocompleteParams.toString()}`;
  const autocomplete = await jsonRequest(autocompleteUrl, signal);

  if (autocomplete.status === 'OK' && Array.isArray(autocomplete.predictions)) {
    return autocomplete.predictions.map((item: any) => ({
      place_id: String(item.place_id),
      description: item.description,
      structured_formatting: item.structured_formatting,
    }));
  }

  return [];
}

export async function resolvePredictionToDestination(
  prediction: PlacePrediction,
): Promise<SelectedDestination> {
  if (prediction.location) {
    return {
      place_id: prediction.place_id,
      place_name:
        prediction.name ??
        prediction.structured_formatting?.main_text ??
        prediction.description ??
        'Destino',
      address: prediction.address ?? prediction.description ?? 'Endereço não disponível',
      lat: prediction.location.lat,
      lng: prediction.location.lng,
    };
  }

  requireApiKey();
  const params = new URLSearchParams({
    place_id: prediction.place_id,
    fields: 'place_id,name,formatted_address,geometry',
    key: GOOGLE_MAPS_API_KEY,
  });
  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
  const details = await jsonRequest(url);

  if (details.status !== 'OK' || !details.result?.geometry?.location) {
    throw new Error('Não foi possível obter detalhes do destino.');
  }

  return {
    place_id: details.result.place_id,
    place_name:
      details.result.name ??
      prediction.structured_formatting?.main_text ??
      prediction.description ??
      'Destino',
    address: details.result.formatted_address ?? prediction.description ?? 'Endereço não disponível',
    lat: Number(details.result.geometry.location.lat),
    lng: Number(details.result.geometry.location.lng),
  };
}

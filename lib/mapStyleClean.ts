/**
 * Estilo Google Maps alinhado entre iOS e Android (POIs/transit reduzidos, ruas legíveis).
 * Usar com `customMapStyle` + `mapType="standard"` e props Android em `mapViewAndroid`.
 */
export const MAP_STYLE_CLEAN = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#1A1A1A' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#1A1A1A' }] },
  { featureType: 'road.highway', elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

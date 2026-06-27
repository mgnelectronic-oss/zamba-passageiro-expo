/**
 * Câmera de navegação activa — valores alinhados com Zamba-Motorista-Expo.
 * Estilo Google Maps Navigation: veículo no terço inferior, câmera inclinada.
 */

/** Zoom de seguimento nativo — perto para ver a rua, sem visão global. */
export const NAV_FOLLOW_ZOOM = 16.8;

/** Inclinação 3D do modo de seguimento — imersão sem desorientar. */
export const NAV_FOLLOW_PITCH = 50;

/** Fração da altura útil — padding superior ~68% coloca o marcador a ~70% da altura (parte inferior). */
export const NAV_FOLLOW_TOP_PADDING_RATIO = 0.68;

/** Limites (px) do padding superior do seguimento. */
export const NAV_FOLLOW_TOP_PADDING_MIN = 120;
export const NAV_FOLLOW_TOP_PADDING_MAX = 420;

/** Animação normal — recentrar ou primeiro posicionamento. */
export const NAV_CAMERA_ANIM_MS = 850;

/** Animação curta — seguimento contínuo de GPS. */
export const NAV_CAMERA_FOLLOW_MS = 850;

/** Deslocamento da câmera à frente do indicador (metros). */
export const NAV_CAMERA_CENTER_OFFSET_M = 95;

/** Limiar de movimento (m) para permitir update da câmera. */
export const NAV_CAMERA_MIN_MOVE_M = 5;

/** Limiar de rotação (°) para permitir update da câmera. */
export const NAV_CAMERA_MIN_HEADING_DEG = 4;

/** Limiar de rotação (°) quando quase não há movimento — curvas lentas. */
export const NAV_CAMERA_HEADING_ONLY_DEG = 2;

/** Tempo máximo (ms) entre actualizações da câmera — força re-frame. */
export const NAV_CAMERA_MAX_IDLE_MS = 1000;

/** Distância (m) abaixo da qual usa animação curta (follow). */
export const NAV_CAMERA_FOLLOW_DIST_THRESHOLD_M = 20;

/** Lookahead na polyline para bearing (m) — ponto futuro 20–60 m. */
export const NAV_ROUTE_HEADING_LOOKAHEAD_M = 40;

/** Polyline visível começa estes metros à frente do marcador (evita cobrir o puck). */
export const NAV_ROUTE_LINE_START_OFFSET_M = 8;

/** Alpha de suavização do heading do marcador (0–1). */
export const NAV_HEADING_SMOOTH_ALPHA = 0.18;

/** Alpha de suavização do heading da câmera — mais responsivo em curvas. */
export const NAV_CAMERA_HEADING_SMOOTH_ALPHA = 0.34;

/** Animação curta quando só a rotação muda (curva). */
export const NAV_CAMERA_ROTATION_MS = 650;

/** Visão geral da rota — bearing norte (sem rotação). */
export const MAPBOX_ROUTE_OVERVIEW_BEARING = 0 as const;

/** Visão geral da rota — sem inclinação 3D. */
export const MAPBOX_ROUTE_OVERVIEW_PITCH = 0 as const;

import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { EAS_PROJECT_ID as EAS_PROJECT_ID_ENV } from '@/lib/env';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const TABLE = 'device_push_tokens';

/** Coluna única do valor Expo Push (constraint `ux_device_push_tokens_token` na BD). */
const TOKEN_CONFLICT_COLUMN = 'device_token' as const;

/** Último utilizador para o qual tentámos registo push (logout inativa no servidor). */
let lastRegisteredUserId: string | null = null;

/** Payload `data` enviado pelo backend (ajuste conforme o servidor). */
export type PushNotificationData = {
  screen?: string;
  ride_id?: string;
  /** Ex.: `zamba://ride/<uuid>`, `https://…/ride/<uuid>` ou `/ride/<uuid>` */
  deep_link?: string;
  [key: string]: unknown;
};

/**
 * projectId obrigatório para `getExpoPushTokenAsync({ projectId })`.
 * 1) `EXPO_PUBLIC_EAS_PROJECT_ID` (Metro injeta em tempo de bundle — fonte principal).
 * 2) `Constants.expoConfig.extra.eas.projectId` (vindo de `app.config.ts` / build).
 * Sem cadeias extra de manifest que costumavam falhar em runtime.
 */
function getEasProjectIdForPush(): string | null {
  const fromEnv = EAS_PROJECT_ID_ENV.trim();
  if (fromEnv) return fromEnv;

  const fromAppConfig = (
    Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  )?.eas?.projectId?.trim();
  if (fromAppConfig) return fromAppConfig;

  return null;
}

function isLikelyExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

function resolvePlatform(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

function buildDeviceName(): string {
  const base = Device.deviceName ?? Device.modelName ?? 'Dispositivo';
  const os =
    Device.osName && Device.osVersion != null
      ? `${Device.osName} ${Device.osVersion}`
      : '';
  return os ? `${base} (${os})` : base;
}

function buildAppName(): string {
  return (
    Application.applicationName ??
    (Constants.expoConfig?.name as string | undefined) ??
    'zamba-passageiro'
  );
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Predefinido',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#10B981',
    sound: 'default',
  });
}

/**
 * Regista o token Expo Push (`ExpoPushToken[...]`) em `public.device_push_tokens`.
 * Colunas: `device_token`, `platform`, `app_name`, `device_name`, `is_active`, `last_seen_at`, `updated_at`, `user_id`.
 * Usa upsert na unicidade do token (constraint `ux_device_push_tokens_token`) para nunca falhar por duplicado e atualizar utilizador/dados do dispositivo.
 */
export async function registerDevicePushToken(userId: string): Promise<void> {
  if (!isSupabaseConfigured || !userId) return;
  if (Platform.OS === 'web') return;

  lastRegisteredUserId = userId;

  try {
    await ensureAndroidChannel();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let status = existingStatus;
    if (existingStatus !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') {
      console.warn('[push] permissão de notificações não concedida');
      return;
    }

    if (!Device.isDevice) {
      console.warn('[push] push real requer dispositivo físico — a ignorar registo');
      return;
    }

    if (isLikelyExpoGo()) {
      console.warn(
        '[push] Expo Go: envio remoto de push é limitado; para push fiável use development build (`npx expo run:ios` / `run:android`) ou EAS Build.',
      );
    }

    const projectId = getEasProjectIdForPush();
    if (!projectId) {
      console.error(
        '[push] ERRO: falta EXPO_PUBLIC_EAS_PROJECT_ID. Sem projectId o SDK devolve "No projectId found". ' +
          'Adicione no .env na raiz do projeto: EXPO_PUBLIC_EAS_PROJECT_ID=<UUID do projeto em expo.dev → Project settings → Project ID>. ' +
          'Reinicie com: npx expo start -c',
      );
      return;
    }

    if (__DEV__ && Platform.OS === 'android') {
      console.log(
        '[push] Android: a pedir token Expo Push (FCM). O nativo usa o google-services.json ' +
          'embebido no último prebuild/build (app Android com.zamba.passageiro no Firebase).',
      );
    }

    let expoToken: string;
    try {
      const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
      expoToken = tokenRes.data?.trim() ?? '';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        '[push] ERRO: getExpoPushTokenAsync falhou. projectId usado (prefixo):',
        projectId.slice(0, 8) + '…',
        '| Erro:',
        msg,
      );
      const looksLikeFirebaseApiKey =
        /valid API key|Please set a valid API key|API key|FirebaseApp|FCM/i.test(msg);
      if (Platform.OS === 'android' && looksLikeFirebaseApiKey) {
        console.error(
          '[push] Diagnóstico provável: chave API do Firebase em google-services.json inválida, ' +
            'placeholder, ou restrita na Google Cloud Console. Substitui google-services.json na raiz ' +
            'pelo ficheiro descarregado do Firebase (app Android com.zamba.passageiro) e gera novo build Android.',
        );
      }
      return;
    }

    if (!expoToken) {
      console.warn('[push] ERRO: token vazio após getExpoPushTokenAsync');
      return;
    }

    if (__DEV__) {
      console.log('[push] Token Expo Push obtido com sucesso (getExpoPushTokenAsync + projectId).');
    }

    const platform = resolvePlatform();
    const now = new Date().toISOString();

    const basePayload = {
      device_token: expoToken,
      platform,
      app_name: buildAppName(),
      device_name: buildDeviceName(),
      is_active: true,
      last_seen_at: now,
      updated_at: now,
    };

    const fullPayload = { user_id: userId, ...basePayload };

    const { data: existingByToken, error: selErr } = await supabase
      .from(TABLE)
      .select('id')
      .eq(TOKEN_CONFLICT_COLUMN, expoToken)
      .maybeSingle();

    if (selErr) {
      console.warn('[push] leitura device_push_tokens:', selErr.message);
    }

    const { error: upsertErr } = await supabase.from(TABLE).upsert(fullPayload, {
      onConflict: TOKEN_CONFLICT_COLUMN,
    });

    if (upsertErr) {
      console.error('[push] erro ao guardar token push:', upsertErr.message);
      return;
    }

  } catch (e) {
    console.warn('[push] registo falhou', e);
  }
}

/** Chamar no logout para inativar o token associado ao último registo neste dispositivo. */
export async function deactivateRegisteredPushTokenOnLogout(): Promise<void> {
  if (!lastRegisteredUserId) return;
  const uid = lastRegisteredUserId;
  lastRegisteredUserId = null;
  await deactivateDevicePushToken(uid);
}

/** Marca o token desta plataforma como inativo (logout). */
export async function deactivateDevicePushToken(userId: string): Promise<void> {
  if (!isSupabaseConfigured || !userId) return;
  if (Platform.OS === 'web') return;
  try {
    const now = new Date().toISOString();
    const platform = resolvePlatform();
    await supabase
      .from(TABLE)
      .update({ is_active: false, updated_at: now })
      .eq('user_id', userId)
      .eq('platform', platform);
  } catch {
    /* ignore */
  }
}

/** Extrai id de corrida de `deep_link` (path `/ride/:id` ou query `ride_id`). */
function extractRideIdFromDeepLink(link: string): string | null {
  const trimmed = link.trim();
  if (!trimmed) return null;

  const pathMatch = trimmed.match(/\/ride\/([^/?#]+)/i);
  if (pathMatch?.[1]) {
    try {
      return decodeURIComponent(pathMatch[1]);
    } catch {
      return pathMatch[1];
    }
  }

  try {
    const withScheme = trimmed.includes('://') ? trimmed : `https://placeholder.local${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
    const u = new URL(withScheme);
    const q = u.searchParams.get('ride_id');
    if (q) return q;
  } catch {
    /* ignore */
  }

  return null;
}

function navigateFromPushData(data: Record<string, unknown> | undefined): void {
  if (!data || typeof data !== 'object') return;
  const screen = typeof data.screen === 'string' ? data.screen : null;

  const deepLink = typeof data.deep_link === 'string' ? data.deep_link : null;
  let rideId: string | null = data.ride_id != null ? String(data.ride_id).trim() : null;
  if (!rideId && deepLink) {
    rideId = extractRideIdFromDeepLink(deepLink);
  }

  try {
    if (rideId && screen === 'searchingDriver') {
      router.push({ pathname: '/searchingDriver', params: { rideId } });
      return;
    }
    if (rideId && screen === 'ride-active') {
      router.push({ pathname: '/ride-active', params: { rideId } });
      return;
    }

    if (rideId) {
      router.push({ pathname: '/ride/[id]', params: { id: rideId } });
      return;
    }

    switch (screen) {
      case 'currentRide':
      case 'ride':
        router.push('/currentRide');
        break;
      case 'ride-active':
        router.push('/ride-active');
        break;
      case 'searchingDriver':
        router.push('/searchingDriver');
        break;
      case 'history':
        router.push('/history');
        break;
      case 'shared-rides':
        router.push('/shared-rides');
        break;
      default:
        break;
    }
  } catch {
    /* ignore */
  }
}

/** Configura apresentação em foreground. */
export function configurePushNotificationForegroundBehavior(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Notificação recebida em foreground + utilizador tocou na notificação.
 */
export function attachPushNotificationListeners(
  onForeground?: (notification: Notifications.Notification) => void,
): () => void {
  const subReceive = Notifications.addNotificationReceivedListener((notification) => {
    onForeground?.(notification);
  });

  const subResponse = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    navigateFromPushData(data);
  });

  return () => {
    subReceive.remove();
    subResponse.remove();
  };
}

/** Cold start após toque numa notificação. */
export function scheduleNavigationFromInitialNotificationResponse(delayMs = 400): void {
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (!response?.notification) return;
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    setTimeout(() => navigateFromPushData(data), delayMs);
  });
}

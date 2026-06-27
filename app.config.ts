import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import type { ExpoConfig, ConfigContext } from 'expo/config';

const ANDROID_PACKAGE = 'com.zamba.passageiro';
const GOOGLE_SERVICES_REL = './google-services.json';
const GOOGLE_SERVICES_ABS = path.join(process.cwd(), GOOGLE_SERVICES_REL);

const APP_ICON = './assets/images/icon.png';
const APP_SPLASH_IMAGE = './assets/images/splash.png';

const ICON_ABS = path.join(process.cwd(), 'assets', 'images', 'icon.png');
const SPLASH_ABS = path.join(process.cwd(), 'assets', 'images', 'splash.png');
if (!fs.existsSync(ICON_ABS)) {
  console.error(`[app.config] ENOENT: icon não encontrado em ${ICON_ABS} (config: ${APP_ICON})`);
}
if (!fs.existsSync(SPLASH_ABS)) {
  console.error(`[app.config] ENOENT: splash não encontrado em ${SPLASH_ABS} (config: ${APP_SPLASH_IMAGE})`);
}

/**
 * Em `npx expo prebuild` / EAS Build, confirma que o Expo vai embutir o mesmo ficheiro
 * referido em `android.googleServicesFile` (raiz do projeto = ao lado de app.config.ts).
 */
function logGoogleServicesForAndroidBuild(): void {
  const exists = fs.existsSync(GOOGLE_SERVICES_ABS);
  console.log(
    `[app.config] Firebase Android: google-services.json em "${GOOGLE_SERVICES_REL}" → ` +
      `caminho resolvido: ${GOOGLE_SERVICES_ABS}`,
  );
  console.log(
    `[app.config] Firebase Android: ficheiro na raiz do projeto ${exists ? 'encontrado' : 'AUSENTE'} ` +
      '(deve estar ao lado de app.config.ts / package.json).',
  );
  console.log(`[app.config] Android package (app.config): ${ANDROID_PACKAGE}`);

  if (!exists) {
    console.warn(
      '[app.config] Sem google-services.json na raiz, o prebuild Android não aplica Firebase corretamente — getExpoPushTokenAsync pode falhar.',
    );
    return;
  }

  try {
    const raw = fs.readFileSync(GOOGLE_SERVICES_ABS, 'utf8');
    const j = JSON.parse(raw) as {
      project_info?: { project_id?: string };
      client?: Array<{
        api_key?: Array<{ current_key?: string }>;
        client_info?: {
          android_client_info?: { package_name?: string };
        };
      }>;
    };
    const projectId = j.project_info?.project_id;
    const pkg = j.client?.[0]?.client_info?.android_client_info?.package_name;
    const currentKey = j.client?.[0]?.api_key?.[0]?.current_key ?? '';

    console.log(
      `[app.config] Firebase (google-services.json): project_id=${projectId ?? '(em falta)'}`,
    );
    console.log(
      `[app.config] Firebase (google-services.json): package_name=${pkg ?? '(em falta)'} ` +
        `(deve coincidir com android.package: ${ANDROID_PACKAGE}).`,
    );

    if (pkg && pkg !== ANDROID_PACKAGE) {
      console.warn(
        `[app.config] AVISO: package_name em google-services.json (${pkg}) ≠ ${ANDROID_PACKAGE}. ` +
          'O FCM pode falhar com API key inválida até alinhar a app Android no Firebase.',
      );
    }

    const keyLooksInvalid =
      !currentKey ||
      currentKey.length < 30 ||
      !currentKey.startsWith('AIza') ||
      /substituir/i.test(currentKey);

    if (keyLooksInvalid) {
      console.warn(
        '[app.config] AVISO: `current_key` em google-services.json parece placeholder ou inválida. ' +
          'No dispositivo verás erros como "Please set a valid API key" ao obter o token push. ' +
          'Descarrega um google-services.json novo: Firebase Console → Definições do projeto → ' +
          'As tuas apps → Android (package ' +
          ANDROID_PACKAGE +
          '). Depois: novo prebuild + build Android.',
      );
    } else {
      console.log(
        '[app.config] Firebase (google-services.json): current_key com formato esperado (prefixo AIza…, comprimento OK).',
      );
    }
  } catch (e) {
    console.warn('[app.config] Não foi possível analisar google-services.json:', e);
  }
}

logGoogleServicesForAndroidBuild();

const GOOGLE_MAPS_KEY = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim();
const MAPBOX_ACCESS_TOKEN = (process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '').trim();

if (MAPBOX_ACCESS_TOKEN) {
  console.log(
    `[app.config] EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: definida (comprimento ${MAPBOX_ACCESS_TOKEN.length}).`,
  );
} else {
  console.warn(
    '[app.config] AVISO: EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ausente. ' +
      'O mapa profissional Mapbox na viagem ativa usará fallback Google Maps.',
  );
}

const isEasBuild = process.env.EAS_BUILD === 'true';

if (GOOGLE_MAPS_KEY) {
  console.log(
    `[app.config] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: definida (comprimento ${GOOGLE_MAPS_KEY.length}).`,
  );
} else {
  console.warn(
    '[app.config] AVISO: EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ausente. ' +
      'Mapas nativos e Geocoding falham. Para EAS Build: defina em expo.dev → Project → Environment variables ' +
      'ou `eas env:create` / secrets, com o mesmo nome.',
  );
  if (isEasBuild) {
    console.error(
      '[app.config] ERRO (EAS Build): sem EXPO_PUBLIC_GOOGLE_MAPS_API_KEY o Android não recebe a API key no manifest.',
    );
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const inheritedExtra =
    typeof config.extra === 'object' && config.extra ? config.extra : {};
  const inheritedEas =
    'eas' in inheritedExtra &&
    typeof (inheritedExtra as { eas?: Record<string, unknown> }).eas === 'object'
      ? (inheritedExtra as { eas: Record<string, unknown> }).eas
      : {};

  const basePlugins = config.plugins ?? [];
  const hasMapboxPlugin = basePlugins.some(
    (p) => p === '@rnmapbox/maps' || (Array.isArray(p) && p[0] === '@rnmapbox/maps'),
  );
  const pluginsWithMapbox = hasMapboxPlugin ? basePlugins : [...basePlugins, '@rnmapbox/maps'];

  return {
    ...config,
    name: config.name ?? 'zamba-passageiro',
    slug: config.slug ?? 'zamba-passageiro',
    icon: './assets/images/icon.png',
    splash: {
      image: './assets/images/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    web: {
      ...config.web,
      favicon: APP_ICON,
    },
    extra: {
      ...inheritedExtra,
      eas: {
        ...inheritedEas,
        projectId: '36d622ec-38d4-45c6-99b5-4a1c3eb6d983',
      },
    },
    plugins: [
      ...pluginsWithMapbox,
      [
        'expo-build-properties',
        {
          ios: { deploymentTarget: '15.1' },
        },
      ],
      'expo-notifications',
    ],
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        NSMicrophoneUsageDescription:
          'O Zamba precisa do microfone para chamadas de voz com o motorista.',
      },
      config: {
        ...config.ios?.config,
        ...(GOOGLE_MAPS_KEY ? { googleMapsApiKey: GOOGLE_MAPS_KEY } : {}),
      },
    },
    android: {
      ...config.android,
      package: ANDROID_PACKAGE,
      permissions: [
        ...new Set([
          ...(config.android?.permissions ?? []),
          'android.permission.RECORD_AUDIO',
          'android.permission.MODIFY_AUDIO_SETTINGS',
        ]),
      ],
      googleServicesFile: GOOGLE_SERVICES_REL,
      adaptiveIcon: {
        foregroundImage: APP_ICON,
        backgroundColor: '#ffffff',
      },
      config: {
        ...config.android?.config,
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        },
      },
    },
  };
};

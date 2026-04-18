import { Alert } from 'react-native';

/** Rotas já implementadas no stack Expo (equivalente às páginas web). */
const IMPLEMENTED = new Set([
  '/profile',
  '/shared-rides',
  '/verification',
  '/saved-addresses',
  '/history',
]);

/**
 * Navegação alinhada ao web (`PassengerSideMenu` + `router.push`),
 * com destinos ainda não criados no nativo a mostrarem feedback igual ao comportamento anterior do app.
 */
export function pushDrawerRoute(router: { push: (href: string) => void }, nativePath: string) {
  if (IMPLEMENTED.has(nativePath)) {
    router.push(nativePath as any);
    return;
  }
  Alert.alert('Em breve', 'Esta secção estará disponível em breve.');
}

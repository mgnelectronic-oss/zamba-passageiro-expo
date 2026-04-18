import { useEffect, useRef } from 'react';
import {
  attachPushNotificationListeners,
  configurePushNotificationForegroundBehavior,
  registerDevicePushToken,
  scheduleNavigationFromInitialNotificationResponse,
} from '@/services/pushNotificationService';

/**
 * Registo do token Expo Push após sessão válida + listeners (foreground e toque).
 * Não altera UI.
 */
export function usePushNotifications(
  userId: string | null | undefined,
  sessionReady: boolean,
  appReady: boolean,
) {
  const foregroundConfigured = useRef(false);
  const initialNavHandled = useRef(false);

  useEffect(() => {
    if (!userId) initialNavHandled.current = false;
  }, [userId]);

  useEffect(() => {
    if (foregroundConfigured.current) return;
    foregroundConfigured.current = true;
    configurePushNotificationForegroundBehavior();
    return attachPushNotificationListeners();
  }, []);

  useEffect(() => {
    if (!sessionReady || !appReady || !userId) return;
    void registerDevicePushToken(userId);
  }, [sessionReady, appReady, userId]);

  useEffect(() => {
    if (!sessionReady || !appReady || !userId || initialNavHandled.current) return;
    initialNavHandled.current = true;
    scheduleNavigationFromInitialNotificationResponse();
  }, [sessionReady, appReady, userId]);
}

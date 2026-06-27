import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  Animated,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { UserProfile } from '@/services/authService';
import { DrawerMenuHeader } from '@/components/drawer/DrawerMenuHeader';
import { DrawerMenuItem, DrawerMenuLogoutItem } from '@/components/drawer/DrawerMenuItem';
import { DRAWER_MENU_ITEMS } from '@/components/drawer/drawerMenuConfig';
import { pushDrawerRoute } from '@/components/drawer/pushDrawerRoute';
import { ConfirmModal } from '@/components/ConfirmModal';

const { width: SCREEN_W } = Dimensions.get('window');
/** `w-[80vw] max-w-[320px]` em PassengerSideMenu (web) */
export const DRAWER_WIDTH = Math.min(320, SCREEN_W * 0.8);

interface DrawerMenuProps {
  visible: boolean;
  onClose: () => void;
  user: { email?: string | null } | null;
  profile: UserProfile | null;
  onLogout: () => void | Promise<void>;
  /** Router Expo (mesmas rotas que `router.push` no web). */
  router: { push: (href: string) => void };
}

/**
 * Menu lateral alinhado a Zamba-Mocambique `components/PassengerSideMenu.tsx`:
 * mesma ordem de itens, cores, cabeçalho e lista; animação slide da esquerda + backdrop.
 */
export default function DrawerMenu({
  visible,
  onClose,
  user,
  profile,
  onLogout,
  router,
}: DrawerMenuProps) {
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  useLayoutEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;

    if (visible) {
      translateX.setValue(-DRAWER_WIDTH);
      backdropOpacity.setValue(0);
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            friction: 7,
            tension: 72,
          }),
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -DRAWER_WIDTH,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, mounted, translateX, backdropOpacity]);

  const handleItemPress = (nativePath: string) => {
    onClose();
    pushDrawerRoute(router, nativePath);
  };

  const openLogoutModal = () => {
    setLogoutConfirm(true);
  };

  const handleConfirmLogout = async () => {
    try {
      await onLogout();
    } catch {
      // ignorar: auth pode já ter desligado
    } finally {
      setLogoutConfirm(false);
      onClose();
    }
  };

  if (!visible && !mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={() => {
        if (logoutConfirm) setLogoutConfirm(false);
        else onClose();
      }}
    >
      <View style={styles.root} collapsable={false}>
        <Pressable style={styles.backdropPress} onPress={onClose}>
          <Animated.View
            pointerEvents="none"
            style={[styles.backdropFill, { opacity: backdropOpacity }]}
          />
        </Pressable>

        <Animated.View
          style={[
            styles.drawer,
            {
              width: DRAWER_WIDTH,
              transform: [{ translateX }],
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <DrawerMenuHeader user={user} profile={profile} onClose={onClose} />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.listGap}>
              {DRAWER_MENU_ITEMS.map((item) => (
                <DrawerMenuItem
                  key={item.id}
                  item={item}
                  onPress={() => handleItemPress(item.nativePath)}
                />
              ))}
              <DrawerMenuLogoutItem onPress={openLogoutModal} />
            </View>
          </ScrollView>
        </Animated.View>
        <ConfirmModal
          mode="inline"
          visible={logoutConfirm}
          onClose={() => setLogoutConfirm(false)}
          onConfirm={handleConfirmLogout}
          title="Tens certeza que queres sair?"
          confirmLabel="Sair"
          cancelLabel="Cancelar"
        />
      </View>
    </Modal>
  );
}

const SHADOW_DRAWER = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
  },
  android: { elevation: 24 },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  backdropFill: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 101,
    ...SHADOW_DRAWER,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  listGap: {
    gap: 4,
  },
});

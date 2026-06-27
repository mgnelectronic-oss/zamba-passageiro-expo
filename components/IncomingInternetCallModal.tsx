import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  BackHandler,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CachedRemoteImage } from '@/components/CachedRemoteImage';
import type { IncomingInternetCallState } from '@/hooks/usePassengerIncomingInternetCall';

const EMERALD = '#10B981';
const BG = '#051A14';

type Props = {
  visible: boolean;
  incoming: IncomingInternetCallState | null;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
};

function CallerAvatar({ uri }: { uri: string | null | undefined }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1200,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  return (
    <View style={styles.avatarWrap}>
      <Animated.View
        style={[
          styles.avatarPulse,
          { transform: [{ scale: ringScale }], opacity: ringOpacity },
        ]}
      />
      <View style={styles.avatarRing}>
        <CachedRemoteImage
          uri={uri}
          style={styles.avatarImage}
          cacheScope="incoming-call-driver"
          fallback={<Ionicons name="person" size={72} color="#94A3B8" />}
        />
      </View>
    </View>
  );
}

export function IncomingInternetCallModal({ visible, incoming, onAccept, onReject }: Props) {
  const insets = useSafeAreaInsets();
  const busy = incoming?.accepting || incoming?.rejecting;
  const isRinging = !incoming?.markingRinging && !busy;

  const handleAccept = () => {
    void onAccept().catch((e: unknown) => {
      Alert.alert('Erro', e instanceof Error ? e.message : 'Não foi possível atender a chamada.');
    });
  };

  const handleReject = () => {
    void onReject().catch((e: unknown) => {
      Alert.alert('Erro', e instanceof Error ? e.message : 'Não foi possível recusar a chamada.');
    });
  };

  useEffect(() => {
    if (!visible || !incoming) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      void handleReject();
      return true;
    });
    return () => sub.remove();
  }, [visible, incoming]);

  const statusLine = incoming?.markingRinging
    ? 'A preparar chamada…'
    : incoming?.accepting
      ? 'A atender…'
      : incoming?.rejecting
        ? 'A recusar…'
        : 'Chamada de voz Zamba';

  return (
    <Modal
      visible={visible && !!incoming}
      animationType="fade"
      statusBarTranslucent
      presentationStyle="fullScreen"
      onRequestClose={() => void handleReject()}
    >
      <StatusBar style="light" />
      <View
        style={[
          styles.screen,
          {
            paddingTop: insets.top + 28,
            paddingBottom: Math.max(insets.bottom, 20) + 16,
          },
        ]}
      >
        <View style={styles.topBlock}>
          <Text style={styles.brand}>Zamba</Text>
          <Text style={styles.incomingLabel}>
            {isRinging ? 'Chamada recebida' : statusLine}
          </Text>

          <CallerAvatar uri={incoming?.callerAvatarUrl} />

          <Text style={styles.name} numberOfLines={2}>
            {incoming?.callerLabel ?? 'Motorista'}
          </Text>
          <Text style={styles.subtitle}>
            {isRinging ? 'A tocar…' : statusLine}
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionCol, busy && styles.btnDisabled]}
            onPress={handleReject}
            disabled={!!busy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Recusar chamada"
          >
            <View style={styles.rejectBtn}>
              {incoming?.rejecting ? (
                <ActivityIndicator color="#FFF" size="large" />
              ) : (
                <Ionicons name="close" size={36} color="#FFF" />
              )}
            </View>
            <Text style={styles.actionLabel}>Recusar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCol, busy && styles.btnDisabled]}
            onPress={handleAccept}
            disabled={!!busy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Atender chamada"
          >
            <View style={styles.acceptBtn}>
              {incoming?.accepting ? (
                <ActivityIndicator color="#FFF" size="large" />
              ) : (
                <Ionicons name="call" size={34} color="#FFF" />
              )}
            </View>
            <Text style={styles.actionLabel}>Atender</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  topBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
  },
  brand: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  incomingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 36,
  },
  avatarWrap: {
    width: 168,
    height: 168,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  avatarPulse: {
    position: 'absolute',
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: EMERALD,
  },
  avatarRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.12)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
    }),
  },
  avatarImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  name: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
    paddingHorizontal: 12,
  },
  subtitle: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    paddingHorizontal: 8,
  },
  actionCol: {
    alignItems: 'center',
    minWidth: 120,
    gap: 12,
  },
  rejectBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  acceptBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: EMERALD,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: EMERALD,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  btnDisabled: { opacity: 0.65 },
  actionLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

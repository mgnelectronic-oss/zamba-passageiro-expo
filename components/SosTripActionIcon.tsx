import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

const CIRCLE = 48;
/** Escala máxima das ondas para caber no slot sem clip (layout fixo 84×72). */
const RING_SCALE_MAX = 1.62;

/** Uma onda concêntrica que expande e desvanece (efeito radar), sem alterar layout. */
function RadarRing({ delayMs }: { delayMs: number }) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const expand = Animated.timing(v, {
      toValue: 1,
      duration: 2000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const reset = Animated.timing(v, {
      toValue: 0,
      duration: 0,
      useNativeDriver: true,
    });
    const loop = Animated.loop(
      Animated.sequence([Animated.delay(delayMs), expand, reset]),
    );
    loop.start();
    return () => loop.stop();
  }, [delayMs, v]);

  const scale = v.interpolate({
    inputRange: [0, 1],
    outputRange: [1, RING_SCALE_MAX],
  });
  const opacity = v.interpolate({
    inputRange: [0, 0.08, 0.45, 1],
    outputRange: [0, 0.38, 0.18, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

/** Ícone SOS da viagem ativa: halos circulares concêntricos (radar), layout fixo. */
export function SosTripActionIcon() {
  return (
    <View style={styles.wrap}>
      <RadarRing delayMs={0} />
      <RadarRing delayMs={1000} />
      <View style={styles.circle}>
        <Ionicons name="shield-checkmark" size={26} color="#FFF" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 84,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    overflow: 'visible',
  },
  ring: {
    position: 'absolute',
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    borderWidth: 2,
    borderColor: 'rgba(252, 165, 165, 0.95)',
    backgroundColor: 'transparent',
    zIndex: 0,
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#B91C1C',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
});

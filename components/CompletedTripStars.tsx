import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

const STAR_GOLD = '#CA8A04';
const STAR_MUTED = '#94A3B8';

type Props = {
  rating: number;
  onSelect: (n: number) => void;
  size?: number;
  gap?: number;
};

export function CompletedTripStars({ rating, onSelect, size = 30, gap = 10 }: Props) {
  const scales = useRef([1, 2, 3, 4, 5].map(() => new Animated.Value(1))).current;

  const bump = (index: number) => {
    Animated.sequence([
      Animated.spring(scales[index], {
        toValue: 1.14,
        friction: 5,
        tension: 280,
        useNativeDriver: true,
      }),
      Animated.spring(scales[index], {
        toValue: 1,
        friction: 6,
        tension: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return (
    <View style={[styles.row, { gap }]}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Pressable
          key={s}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`${s} estrelas`}
          onPress={() => {
            bump(s - 1);
            onSelect(s);
          }}
          style={styles.hit}
        >
          <Animated.View style={{ transform: [{ scale: scales[s - 1] }] }}>
            <Ionicons
              name={rating >= s ? 'star' : 'star-outline'}
              size={size}
              color={rating >= s ? STAR_GOLD : STAR_MUTED}
            />
          </Animated.View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hit: { padding: 2 },
});

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';

const EMERALD = '#10B981';
const LABEL_VISIBLE_MS = 6000;
const EXPAND_MS = 420;
const COLLAPSE_MS = 480;

type Props = {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  variant?: 'default' | 'sos';
  iconName?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  imageUri?: string | null;
  animateLabel?: boolean;
  labelVisibleMs?: number;
  staggerIndex?: number;
  style?: ViewStyle;
};

export function AnimatedSideActionButton({
  label,
  onPress,
  accessibilityLabel,
  variant = 'default',
  iconName = 'locate',
  iconColor = EMERALD,
  imageUri,
  animateLabel = true,
  labelVisibleMs = LABEL_VISIBLE_MS,
  staggerIndex = 0,
  style,
}: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const startedRef = useRef(false);

  useEffect(() => {
    if (!animateLabel || startedRef.current) return;
    startedRef.current = true;

    const staggerDelay = staggerIndex * 120;
    const timer = setTimeout(() => {
      const animation = Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: EXPAND_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(labelVisibleMs),
        Animated.timing(progress, {
          toValue: 0,
          duration: COLLAPSE_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);
      animation.start();
    }, staggerDelay);

    return () => {
      clearTimeout(timer);
      progress.stopAnimation();
    };
  }, [animateLabel, labelVisibleMs, progress, staggerIndex]);

  const labelStyle = {
    opacity: progress,
    transform: [
      {
        translateX: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
      {
        scaleX: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.85, 1],
        }),
      },
    ],
  };

  const isSos = variant === 'sos';
  const btnStyle = isSos ? styles.btnSos : styles.btn;

  return (
    <View style={[styles.row, style]}>
      {animateLabel ? (
        <Animated.View style={[styles.labelWrap, labelStyle]} pointerEvents="none">
          <View style={[styles.labelPill, isSos && styles.labelPillSos]}>
            <Text style={[styles.labelText, isSos && styles.labelTextSos]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        </Animated.View>
      ) : null}
      <TouchableOpacity
        style={btnStyle}
        onPress={onPress}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.avatar} contentFit="cover" />
        ) : isSos ? (
          <Text style={styles.sosText}>SOS</Text>
        ) : (
          <Ionicons name={iconName} size={20} color={iconColor} />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 8,
  },
  labelWrap: {
    maxWidth: 168,
  },
  labelPill: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
    }),
  },
  labelPillSos: {
    backgroundColor: 'rgba(229, 38, 46, 0.95)',
    borderColor: 'rgba(229, 38, 46, 0.3)',
  },
  labelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  labelTextSos: {
    color: '#FFFFFF',
  },
  btn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.14,
        shadowRadius: 6,
      },
      android: { elevation: 5 },
    }),
  },
  btnSos: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E5262E',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.14,
        shadowRadius: 6,
      },
      android: { elevation: 5 },
    }),
  },
  sosText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: '#FFFFFF',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
});

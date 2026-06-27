import React, { memo, useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const EMERALD = '#10B981';
const DOT_RADIUS = 9;
const PROGRESS_ANIM_MS = 900;

type Props = {
  startLabel: string;
  centerLabel: string;
  arrivalLabel: string;
  /** 0..1 — fracção do percurso concluída. */
  progress: number;
  compact?: boolean;
};

/**
 * Timeline de progresso da viagem activa do passageiro.
 * Baseada no ActiveRideTimeline do motorista, adaptada ao passageiro.
 */
export const PassengerTripTimeline = memo(function PassengerTripTimeline({
  startLabel,
  centerLabel,
  arrivalLabel,
  progress,
  compact = false,
}: Props) {
  const trackWidthSv = useSharedValue(0);
  const progressSv = useSharedValue(0);

  useEffect(() => {
    const target = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    progressSv.value = withTiming(target, {
      duration: PROGRESS_ANIM_MS,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [progress, progressSv]);

  const fillStyle = useAnimatedStyle(() => ({
    width: trackWidthSv.value * progressSv.value,
  }));

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: trackWidthSv.value * progressSv.value - DOT_RADIUS }],
  }));

  return (
    <View style={[s.wrap, compact && s.wrapCompact]} pointerEvents="box-none">
      <View
        style={[s.track, compact && s.trackCompact]}
        pointerEvents="none"
        onLayout={(e) => {
          trackWidthSv.value = e.nativeEvent.layout.width;
        }}
      >
        <View style={s.baseline} />
        <Animated.View style={[s.fill, fillStyle]} />
        <View style={s.dotStart} />
        <View style={s.midDotA} />
        <View style={s.midDotB} />
        <View style={s.dotEnd} />
        <Animated.View style={[s.dotCurrent, dotStyle]} />
      </View>
      <View style={[s.labelsRow, compact && s.labelsRowCompact]}>
        <View style={s.colLeft}>
          <Text style={s.labelMuted}>Partida</Text>
          <Text style={[s.labelVal, compact && s.labelValSm]}>{startLabel}</Text>
        </View>
        <View style={s.colCenter}>
          <Text style={[s.labelMuted, s.labelMutedCenter]}>Duração</Text>
          <Text style={[s.centerVal, compact && s.centerValSm]}>{centerLabel}</Text>
        </View>
        <View style={s.colRight}>
          <Text style={s.labelMuted}>Chegada</Text>
          <Text style={[s.labelValRed, compact && s.labelValSm]}>{arrivalLabel}</Text>
        </View>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  wrap: { paddingTop: 4, paddingBottom: 2, paddingHorizontal: 2 },
  wrapCompact: { paddingTop: 0, paddingBottom: 0 },
  track: { height: 16, justifyContent: 'center', marginHorizontal: 6 },
  trackCompact: { height: 14 },
  baseline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: EMERALD,
  },
  dotStart: {
    position: 'absolute',
    left: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: EMERALD,
    backgroundColor: '#FFF',
    marginLeft: -1,
  },
  dotEnd: {
    position: 'absolute',
    right: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: '#DC2626',
    backgroundColor: '#FFF',
    marginRight: -1,
  },
  midDotA: {
    position: 'absolute',
    left: '62%',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#94A3B8',
  },
  midDotB: {
    position: 'absolute',
    left: '80%',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#94A3B8',
  },
  dotCurrent: {
    position: 'absolute',
    left: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: EMERALD,
    borderWidth: 3,
    borderColor: '#FFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.28,
        shadowRadius: 3,
      },
      android: { elevation: 4 },
    }),
  },
  labelsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  labelsRowCompact: { marginTop: 6 },
  colLeft: { flex: 1, alignItems: 'flex-start' },
  colCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  colRight: { flex: 1, alignItems: 'flex-end' },
  labelMuted: { fontSize: 12, fontWeight: '400', color: '#94A3B8' },
  labelMutedCenter: { textAlign: 'center', alignSelf: 'stretch' },
  labelVal: { marginTop: 2, fontSize: 13, fontWeight: '700', color: '#0F172A' },
  labelValRed: { marginTop: 2, fontSize: 13, fontWeight: '700', color: '#DC2626' },
  labelValSm: { marginTop: 1 },
  centerVal: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '800',
    color: EMERALD,
    textAlign: 'center',
  },
  centerValSm: { marginTop: 1, fontSize: 14 },
});

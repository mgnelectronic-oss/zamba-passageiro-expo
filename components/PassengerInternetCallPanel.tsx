import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedRemoteImage } from '@/components/CachedRemoteImage';
import { InternetCallRemoteAudio } from '@/components/InternetCallRemoteAudio';
import { formatCallDuration } from '@/lib/formatCallDuration';
import type { PassengerOutboundCallPhase } from '@/hooks/usePassengerOutboundInternetCall';

const EMERALD = '#10B981';

type Props = {
  visible: boolean;
  uiPhase: PassengerOutboundCallPhase;
  title: string;
  subtitle: string;
  driverName: string;
  driverAvatarUrl?: string | null;
  durationSec: number;
  showDuration: boolean;
  isWaiting: boolean;
  micMuted: boolean;
  speakerOn: boolean;
  hangupBusy: boolean;
  remoteStreamUrl?: string | null;
  onToggleMic: () => void;
  onToggleSpeaker: () => void;
  onHangUp: () => void;
  onDismiss: () => void;
};

function ControlButton({
  label,
  icon,
  active,
  activeBg,
  activeBorder,
  onPress,
  disabled,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  active?: boolean;
  activeBg?: string;
  activeBorder?: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.controlItem}>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.controlBtn,
          active && {
            backgroundColor: activeBg ?? '#D1FAE5',
            borderColor: activeBorder ?? EMERALD,
          },
          disabled && styles.controlBtnDisabled,
          pressed && !disabled && styles.btnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons
          name={icon}
          size={22}
          color={disabled ? '#94A3B8' : active ? '#065F46' : '#0F172A'}
        />
      </Pressable>
      <Text style={[styles.controlLabel, disabled && styles.controlLabelDisabled]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

export function PassengerInternetCallPanel({
  visible,
  uiPhase,
  title,
  subtitle,
  driverName,
  driverAvatarUrl,
  durationSec,
  showDuration,
  isWaiting,
  micMuted,
  speakerOn,
  hangupBusy,
  remoteStreamUrl,
  onToggleMic,
  onToggleSpeaker,
  onHangUp,
  onDismiss,
}: Props) {
  const insets = useSafeAreaInsets();

  const displayName = driverName?.trim() || 'Motorista';
  const initial = displayName.charAt(0).toUpperCase();
  const isTerminal = uiPhase === 'ended' || uiPhase === 'failed';
  const showControls = !isTerminal;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={isTerminal ? onDismiss : () => void onHangUp()}
    >
      <InternetCallRemoteAudio streamUrl={remoteStreamUrl} />
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
      >
        <View style={styles.panel}>
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          <Text style={styles.panelEyebrow}>CHAMADA DE INTERNET</Text>

          <View style={styles.avatarWrap}>
            {driverAvatarUrl?.trim() ? (
              <CachedRemoteImage
                uri={driverAvatarUrl.trim()}
                style={styles.avatarImage}
                cacheScope="outbound-call-driver"
                fallback={
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitial}>{initial}</Text>
                  </View>
                }
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
            {isWaiting ? (
              <View style={styles.avatarPulse}>
                <ActivityIndicator color={EMERALD} size="small" />
              </View>
            ) : null}
          </View>

          <Text style={styles.contactName} numberOfLines={2}>
            {displayName}
          </Text>

          <Text style={styles.statusTitle}>{title}</Text>
          {showDuration ? (
            <Text style={styles.durationText}>{formatCallDuration(durationSec)}</Text>
          ) : subtitle ? (
            <Text style={styles.statusSubtitle}>{subtitle}</Text>
          ) : null}

          {showControls ? (
            <View style={styles.controlsRow}>
              <ControlButton
                label={micMuted ? 'Microfone off' : 'Silenciar'}
                icon={micMuted ? 'mic-off' : 'mic'}
                active={micMuted}
                activeBg="#FEE2E2"
                activeBorder="#EF4444"
                onPress={onToggleMic}
              />

              <View style={styles.hangupWrap}>
                <Pressable
                  accessibilityLabel="Desligar chamada"
                  onPress={() => void onHangUp()}
                  disabled={hangupBusy}
                  style={({ pressed }) => [
                    styles.hangupBtn,
                    hangupBusy && styles.controlBtnDisabled,
                    pressed && !hangupBusy && styles.hangupBtnPressed,
                  ]}
                >
                  {hangupBusy ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Ionicons name="call" size={28} color="#FFFFFF" style={styles.hangupIcon} />
                  )}
                </Pressable>
                <Text style={styles.hangupLabel}>DESLIGAR</Text>
              </View>

              <ControlButton
                label={speakerOn ? 'Viva voz ligado' : 'Viva voz'}
                icon={speakerOn ? 'volume-high' : 'volume-medium-outline'}
                active={speakerOn}
                onPress={() => void onToggleSpeaker()}
              />
            </View>
          ) : null}

          {isTerminal ? (
            <Pressable onPress={onDismiss} style={({ pressed }) => [styles.dismissBtn, pressed && styles.btnPressed]}>
              <Text style={styles.dismissBtnText}>Fechar</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(8, 15, 30, 0.72)',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 22,
    alignItems: 'center',
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
      },
      android: { elevation: 16 },
    }),
  },
  handleWrap: {
    alignItems: 'center',
    paddingBottom: 10,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  panelEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#94A3B8',
    marginBottom: 20,
    textAlign: 'center',
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#F1F5F9',
  },
  avatarFallback: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
    borderWidth: 3,
    borderColor: '#F1F5F9',
  },
  avatarInitial: {
    fontSize: 38,
    fontWeight: '800',
    color: '#475569',
  },
  avatarPulse: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
    marginBottom: 10,
    textAlign: 'center',
    maxWidth: '100%',
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  statusSubtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 21,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  durationText: {
    marginTop: 10,
    fontSize: 34,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
    color: EMERALD,
  },
  controlsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 4,
    marginTop: 28,
  },
  controlItem: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
    minWidth: 72,
  },
  controlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  controlBtnDisabled: {
    opacity: 0.55,
  },
  controlLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  controlLabelDisabled: {
    color: '#94A3B8',
  },
  hangupWrap: {
    alignItems: 'center',
    gap: 10,
  },
  hangupBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#DC2626',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  hangupBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.96 }],
  },
  hangupIcon: {
    transform: [{ rotate: '135deg' }],
  },
  hangupLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  dismissBtn: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  dismissBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
  },
  btnPressed: {
    opacity: 0.9,
  },
});

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CompletedTripStars } from '@/components/CompletedTripStars';
import { authService } from '@/services/authService';
import { rideService } from '@/services/rideService';

const FONT_BODY = Platform.select({
  ios: undefined,
  android: 'sans-serif',
  default: undefined,
});

type Props = {
  rideId: string;
  driverId?: string | null;
  compact?: boolean;
  prompt?: string;
  onSubmitted?: () => void;
  /** false durante on_trip — avaliação só após viagem concluída (RLS/backend). */
  submitAllowed?: boolean;
  blockedMessage?: string;
};

const DEFAULT_BLOCKED_MESSAGE =
  'Poderá avaliar o motorista após a finalização da viagem.';

export function DriverRatingSection({
  rideId,
  driverId,
  compact = false,
  prompt = 'Como foi o motorista?',
  onSubmitted,
  submitAllowed = true,
  blockedMessage = DEFAULT_BLOCKED_MESSAGE,
}: Props) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!rideId) return;
    let cancelled = false;
    void rideService.checkDriverRatingExists(rideId).then((exists) => {
      if (cancelled) return;
      setHasExisting(exists);
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [rideId]);

  const handleSubmit = useCallback(async () => {
    if (!rating || !driverId?.trim() || !rideId) return;
    const user = await authService.getCurrentUser();
    if (!user) {
      Alert.alert('Erro', 'Inicie sessão para avaliar.');
      return;
    }
    setSubmitting(true);
    try {
      await rideService.submitDriverRating({
        driver_id: driverId.trim(),
        ride_id: rideId,
        passenger_id: user.id,
        rating,
        comment: comment.trim() || undefined,
      });
      setSuccess(true);
      setHasExisting(true);
      onSubmitted?.();
    } catch (err: unknown) {
      if (__DEV__) {
        console.warn('[driver_rating] submit failed', err);
      }
      Alert.alert('Erro', 'Não foi possível enviar a avaliação.');
    } finally {
      setSubmitting(false);
    }
  }, [rating, driverId, rideId, comment, onSubmitted]);

  if (!checked) return null;

  if (hasExisting || success) {
    return (
      <View style={[styles.thanksBox, compact && styles.thanksBoxCompact]}>
        <View style={styles.thanksIcon}>
          <Ionicons name="checkmark" size={compact ? 16 : 18} color="#FFF" />
        </View>
        <Text style={[styles.thanksText, compact && styles.thanksTextCompact]}>
          {success ? 'Obrigado pela sua avaliação!' : 'Já avaliou este motorista nesta viagem.'}
        </Text>
      </View>
    );
  }

  if (!submitAllowed) {
    return (
      <View style={[styles.blockedBox, compact && styles.blockedBoxCompact]}>
        <Ionicons name="time-outline" size={compact ? 18 : 20} color="#64748B" />
        <Text style={[styles.blockedText, compact && styles.blockedTextCompact]}>
          {blockedMessage}
        </Text>
      </View>
    );
  }

  if (!driverId?.trim()) {
    return (
      <Text style={styles.unavailableText}>
        Avaliação indisponível — identificador do motorista em falta.
      </Text>
    );
  }

  return (
    <View style={[styles.block, compact && styles.blockCompact]}>
      <Text style={[styles.prompt, compact && styles.promptCompact]}>{prompt}</Text>
      <CompletedTripStars rating={rating} onSelect={setRating} size={compact ? 26 : 30} gap={compact ? 8 : 10} />
      <Text style={[styles.commentLabel, compact && styles.commentLabelCompact]}>
        Comentário (opcional)
      </Text>
      <TextInput
        style={[styles.commentInput, compact && styles.commentInputCompact]}
        placeholder="Partilhe a sua experiência…"
        placeholderTextColor="#64748B"
        value={comment}
        onChangeText={setComment}
        multiline
        maxLength={500}
      />
      <TouchableOpacity
        style={[styles.sendBtn, (!rating || submitting) && styles.sendBtnDisabled]}
        disabled={!rating || submitting}
        onPress={() => void handleSubmit()}
        activeOpacity={0.92}
      >
        <Text style={[styles.sendBtnText, (!rating || submitting) && styles.sendBtnTextDisabled]}>
          {submitting ? 'A enviar…' : 'Enviar avaliação'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
    marginTop: 4,
  },
  blockCompact: {
    paddingTop: 8,
    marginTop: 2,
    borderTopWidth: 0,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  prompt: {
    fontFamily: FONT_BODY,
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.15,
  },
  promptCompact: {
    fontSize: 13,
    marginBottom: 4,
  },
  commentLabel: {
    fontFamily: FONT_BODY,
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.5,
    marginTop: 6,
    marginBottom: 4,
    alignSelf: 'flex-start',
    textTransform: 'uppercase',
  },
  commentLabelCompact: {
    fontSize: 10,
    marginTop: 4,
  },
  commentInput: {
    fontFamily: FONT_BODY,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 52,
    maxHeight: 68,
    fontSize: 14,
    fontWeight: '500',
    color: '#0F172A',
    marginBottom: 8,
    textAlignVertical: 'top',
  },
  commentInputCompact: {
    minHeight: 44,
    maxHeight: 56,
    fontSize: 13,
    marginBottom: 6,
    borderRadius: 12,
  },
  sendBtn: {
    width: '100%',
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    ...Platform.select({
      ios: {
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  sendBtnDisabled: {
    backgroundColor: '#E2E8F0',
    shadowOpacity: 0,
    elevation: 0,
  },
  sendBtnText: {
    fontFamily: FONT_BODY,
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  sendBtnTextDisabled: {
    color: '#64748B',
  },
  thanksBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#A7F3D0',
  },
  thanksBoxCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 2,
  },
  thanksIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thanksText: {
    flex: 1,
    fontFamily: FONT_BODY,
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
    lineHeight: 18,
  },
  thanksTextCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
  unavailableText: {
    fontFamily: FONT_BODY,
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 8,
  },
  blockedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    marginTop: 2,
  },
  blockedBoxCompact: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  blockedText: {
    flex: 1,
    fontFamily: FONT_BODY,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    lineHeight: 18,
  },
  blockedTextCompact: {
    fontSize: 12,
    lineHeight: 16,
  },
});

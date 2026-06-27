import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const OVERLAY = 'rgba(0,0,0,0.5)';

export type ConfirmModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Pode ser async; o modal trata de estado “busy” no botão de confirmação. */
  onConfirm: () => void | Promise<void>;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Estilo destrutivo (vermelho) no botão principal. */
  confirmDestructive?: boolean;
  /** Não mostrar ícone de carro no topo (ex.: reutilizar noutro fluxo). */
  hideTopIcon?: boolean;
  /**
   * `inline` = mesmo conteúdo, sem 2.º `Modal` nativo (usar no menu drawer).
   * Dois `Modal` irmãos no Android bloqueiam toques no diálogo.
   */
  mode?: 'modal' | 'inline';
};

/**
 * Confirmação com overlay escuro, cartão branco, animação fade + scale.
 * Use `mode="inline"` quando já estiver dentro de outro `Modal` (ex.: drawer).
 */
export function ConfirmModal({
  visible,
  onClose,
  onConfirm,
  title = 'Tens certeza que queres sair?',
  confirmLabel = 'Sair',
  cancelLabel = 'Cancelar',
  confirmDestructive = true,
  hideTopIcon = false,
  mode = 'modal',
}: ConfirmModalProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (visible) {
      setOpen(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!open) return;
    if (visible) {
      opacity.setValue(0);
      scale.setValue(0.92);
      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            friction: 7,
            tension: 80,
          }),
        ]).start();
      });
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.94, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) {
          setOpen(false);
          setSubmitting(false);
        }
      });
    }
  }, [open, visible, opacity, scale]);

  const runConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await Promise.resolve(onConfirm());
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return null;
  }

  const dialog = (
    <View style={styles.root} accessibilityViewIsModal>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Fechar"
      />
      <Animated.View
        style={[styles.cardWrap, { opacity, transform: [{ scale }] }]}
        pointerEvents="box-none"
      >
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {!hideTopIcon ? (
            <View style={styles.iconCircle}>
              <Ionicons name="car-sport" size={40} color="#1E293B" />
            </View>
          ) : null}
          <Text style={styles.title} allowFontScaling={false}>
            {title}
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={runConfirm}
              disabled={submitting}
              style={({ pressed }) => [
                confirmDestructive ? styles.btnConfirmDanger : styles.btnConfirmPrimary,
                { opacity: pressed && !submitting ? 0.88 : 1 },
                submitting && styles.btnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
            >
              {submitting ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.btnConfirmText} allowFontScaling={false}>
                  {confirmLabel}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={onClose}
              disabled={submitting}
              style={({ pressed }) => [
                styles.btnCancel,
                { opacity: pressed && !submitting ? 0.7 : 1 },
                submitting && styles.btnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
            >
              <Text style={styles.btnCancelText} allowFontScaling={false}>
                {cancelLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );

  if (mode === 'inline') {
    return (
      <View
        style={[StyleSheet.absoluteFill, styles.inlineHost]}
        pointerEvents="box-none"
      >
        {dialog}
      </View>
    );
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {dialog}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: OVERLAY,
  },
  /** Por cima do conteúdo do drawer, sem segundo Modal. */
  inlineHost: {
    zIndex: 2000,
    elevation: 32,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 360,
    zIndex: 2,
    elevation: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  iconCircle: {
    alignSelf: 'center',
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 22,
    paddingHorizontal: 4,
  },
  actions: { gap: 10 },
  btnCancel: {
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  btnCancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  btnConfirmDanger: {
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  btnConfirmPrimary: {
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  btnConfirmText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  btnDisabled: { opacity: 0.6 },
});

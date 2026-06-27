import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  StyleSheet,
  type ViewStyle,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing as ReEasing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { createSettingsStyles } from '@/components/settings/createSettingsStyles';
import {
  apagarMensagemPassageiro,
  enviarMensagemPassageiro,
  inscreverMensagensPassageiro,
  listarMensagensPassageiro,
  marcarConversaComoLidaPassageiro,
  resolverChatIdPassageiro,
  uploadImagemCloudinary,
  type SupportPassengerRealtimeSubscription,
} from '@/services/supportPassengerService';
import { passengerSupportLightPalette } from '@/theme/palettes';
import { createSupportChatStyles } from '@/theme/screens/supportChatStyles';
import {
  getReplyPreviewForTarget,
  toPassengerChatReplyTarget,
  type PassengerChatReplyTarget,
  type PassengerMessageRow,
  type SupportMessageStatus,
} from '@/types/supportPassenger';

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function SupportOnlinePulsingDot({ dotStyle }: { dotStyle: ViewStyle }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 1700, easing: ReEasing.inOut(ReEasing.ease) }),
        withTiming(1, { duration: 1700, easing: ReEasing.inOut(ReEasing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const dotAnim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[dotStyle, dotAnim]} importantForAccessibility="no" />;
}

function SupportChatHeaderCenter({
  title,
  settingsStyles,
  supportStyles,
}: {
  title: string;
  settingsStyles: ReturnType<typeof createSettingsStyles>;
  supportStyles: ReturnType<typeof createSupportChatStyles>;
}) {
  return (
    <View
      style={supportStyles.headerTitleCenter}
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${title}, online`}
    >
      <Text style={settingsStyles.topTitle} numberOfLines={1} allowFontScaling={false}>
        {title}
      </Text>
      <View style={supportStyles.headerOnlineRow} importantForAccessibility="no">
        <Text style={supportStyles.headerOnlineText} allowFontScaling={false}>
          online
        </Text>
        <SupportOnlinePulsingDot dotStyle={supportStyles.headerOnlineDot} />
      </View>
    </View>
  );
}

function MessageTicks({
  status,
  deliveredColor,
  readColor,
}: {
  status: SupportMessageStatus;
  deliveredColor: string;
  readColor: string;
}) {
  if (status === 'sent') {
    return <Ionicons name="checkmark" size={15} color="rgba(255,255,255,0.88)" />;
  }
  if (status === 'delivered') {
    return <Ionicons name="checkmark-done" size={15} color={deliveredColor} />;
  }
  return <Ionicons name="checkmark-done" size={15} color={readColor} />;
}

function sortMessages(a: PassengerMessageRow, b: PassengerMessageRow) {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

/** Garante acesso à galeria (incl. acesso “limitado” iOS / Android 34+). */
function galeriaPodeSelecionarFotos(
  perm: Awaited<ReturnType<typeof ImagePicker.getMediaLibraryPermissionsAsync>>,
) {
  if (perm.granted) return true;
  const p = (perm as { accessPrivileges?: 'all' | 'limited' | 'none' }).accessPrivileges;
  return p === 'all' || p === 'limited';
}

const SWIPE_REPLY_THRESHOLD = 48;
const SWIPE_REPLY_VELOCITY = 380;
const SWIPE_MAX_SHIFT = 11;

type ChatMessageRowProps = {
  item: PassengerMessageRow;
  messageImageWidth: number;
  styles: ReturnType<typeof createSupportChatStyles>;
  colors: { info: string };
  onLongPressOpenMenu: (m: PassengerMessageRow) => void;
  onImagePress: (uri: string) => void;
  onReplySwipe: (m: PassengerMessageRow) => void;
};

function ChatMessageRow({
  item,
  messageImageWidth,
  styles,
  colors,
  onLongPressOpenMenu,
  onImagePress,
  onReplySwipe,
}: ChatMessageRowProps) {
  const isPassenger = item.sender === 'passenger';
  const isImage = item.type === 'image';
  const hasReply = Boolean(item.reply_to_message_id && item.reply_preview);
  const time = formatTime(item.created_at);

  const tickDeliveredColor = 'rgba(255,255,255,0.55)';
  const tickReadColor = colors.info;

  const tx = useSharedValue(0);
  const triggerReply = useCallback(() => onReplySwipe(item), [item, onReplySwipe]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-16, 16])
        .failOffsetY([-12, 12])
        .onUpdate((e) => {
          'worklet';
          const x = e.translationX;
          if (isPassenger) {
            tx.value = x < 0 ? Math.max(-SWIPE_MAX_SHIFT, x * 0.4) : x * 0.12;
          } else {
            tx.value = x > 0 ? Math.min(SWIPE_MAX_SHIFT, x * 0.4) : x * 0.12;
          }
        })
        .onEnd((e) => {
          'worklet';
          const x = e.translationX;
          const vx = e.velocityX;
          let fire = false;
          if (isPassenger) {
            fire = x < -SWIPE_REPLY_THRESHOLD || (x < -22 && vx < -SWIPE_REPLY_VELOCITY);
          } else {
            fire = x > SWIPE_REPLY_THRESHOLD || (x > 22 && vx > SWIPE_REPLY_VELOCITY);
          }
          if (fire) {
            runOnJS(triggerReply)();
          }
          tx.value = withSpring(0, { damping: 18, stiffness: 220 });
        }),
    [isPassenger, triggerReply],
  );

  const rowAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));

  const quoteBlock = hasReply ? (
    <View
      style={[
        styles.replyQuoteInBubble,
        isPassenger ? styles.replyQuoteInBubbleUser : styles.replyQuoteInBubbleSupport,
      ]}
    >
      <Text
        numberOfLines={2}
        style={[
          styles.replyQuoteInBubbleText,
          isPassenger ? styles.replyQuoteInBubbleTextUser : styles.replyQuoteInBubbleTextSupport,
        ]}
        allowFontScaling={false}
      >
        {item.reply_preview}
      </Text>
    </View>
  ) : null;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[styles.row, isPassenger ? styles.rowUser : styles.rowSupport, rowAnimStyle]}
      >
        <Pressable
          onLongPress={() => onLongPressOpenMenu(item)}
          onPress={isImage ? () => onImagePress(item.message) : undefined}
          delayLongPress={400}
          style={({ pressed }) => [
            isPassenger ? styles.bubbleUser : styles.bubbleSupport,
            isPassenger ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' },
            isImage && (isPassenger ? styles.bubbleUserImagePadding : styles.bubbleSupportImagePadding),
            pressed && !isImage ? { opacity: 0.9 } : false,
          ]}
        >
          {quoteBlock}
          {isImage ? (
            <Image
              source={{ uri: item.message }}
              style={{
                width: messageImageWidth,
                height: 210,
                borderRadius: 10,
                backgroundColor: 'rgba(0,0,0,0.08)',
              }}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <Text
              style={isPassenger ? styles.bubbleTextUser : styles.bubbleTextSupport}
              allowFontScaling={false}
            >
              {item.message}
            </Text>
          )}
          {isPassenger ? (
            <View style={styles.metaRow}>
              <Text style={styles.timeInBubble} allowFontScaling={false}>
                {time}
              </Text>
              <View style={styles.ticksWrap}>
                <MessageTicks
                  status={item.status}
                  deliveredColor={tickDeliveredColor}
                  readColor={tickReadColor}
                />
              </View>
            </View>
          ) : (
            <Text style={styles.timeInBubbleSupport} allowFontScaling={false}>
              {time}
            </Text>
          )}
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

type ActionModalProps = {
  visible: boolean;
  onClose: () => void;
  onReply: () => void;
  onSaveImage?: () => void;
  onDelete?: () => void;
  canSaveImage: boolean;
  canDelete: boolean;
  styles: ReturnType<typeof createSupportChatStyles>;
};

function SupportMessageActionModal({
  visible,
  onClose,
  onReply,
  onSaveImage,
  onDelete,
  canSaveImage,
  canDelete,
  styles,
}: ActionModalProps) {
  const fade = useRef(new RNAnimated.Value(0)).current;
  const translateY = useRef(new RNAnimated.Value(32)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(32);
      fade.setValue(0);
      RNAnimated.parallel([
        RNAnimated.timing(fade, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        RNAnimated.timing(translateY, {
          toValue: 0,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fade, translateY]);

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.actionSheetContainer}>
        <RNAnimated.View
          style={[styles.actionSheetBackdrop, styles.actionSheetLayerFill, { opacity: fade }]}
        />
        <Pressable
          onPress={onClose}
          style={styles.actionSheetDismiss}
          accessibilityLabel="Fechar menu"
        />
        <View style={styles.actionSheetCardWrap} pointerEvents="box-none">
          <RNAnimated.View
            style={[
              styles.actionSheetCard,
              { transform: [{ translateY }], opacity: fade },
            ]}
          >
            <Text style={styles.actionSheetTitle} allowFontScaling={false}>
              Opções
            </Text>
            <Pressable
              onPress={() => {
                onClose();
                onReply();
              }}
              style={({ pressed }) => [styles.actionSheetRow, { opacity: pressed ? 0.55 : 1 }]}
            >
              <Text style={styles.actionSheetRowText} allowFontScaling={false}>
                Responder
              </Text>
            </Pressable>
            {canSaveImage && onSaveImage ? (
              <>
                <View style={styles.actionSheetSeparator} />
                <Pressable
                  onPress={() => {
                    onClose();
                    onSaveImage();
                  }}
                  style={({ pressed }) => [styles.actionSheetRow, { opacity: pressed ? 0.55 : 1 }]}
                >
                  <Text style={styles.actionSheetRowText} allowFontScaling={false}>
                    Guardar imagem
                  </Text>
                </Pressable>
              </>
            ) : null}
            {canDelete && onDelete ? (
              <>
                <View style={styles.actionSheetSeparator} />
                <Pressable
                  onPress={() => {
                    onClose();
                    onDelete();
                  }}
                  style={({ pressed }) => [styles.actionSheetRow, { opacity: pressed ? 0.55 : 1 }]}
                >
                  <Text style={[styles.actionSheetRowText, styles.actionSheetRowDanger]} allowFontScaling={false}>
                    Eliminar
                  </Text>
                </Pressable>
              </>
            ) : null}
            <View style={styles.actionSheetCancelBlock}>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.actionSheetCancelRow, { opacity: pressed ? 0.55 : 1 }]}
              >
                <Text style={styles.actionSheetCancelText} allowFontScaling={false}>
                  Cancelar
                </Text>
              </Pressable>
            </View>
          </RNAnimated.View>
        </View>
      </View>
    </Modal>
  );
}

type ImageViewerProps = {
  uri: string | null;
  onClose: () => void;
};

function ImageViewerModal({ uri, onClose }: ImageViewerProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  useEffect(() => {
    if (uri) {
      scale.value = 1;
      savedScale.value = 1;
    }
  }, [uri]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = Math.min(5, Math.max(1, savedScale.value * e.scale));
      scale.value = next;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1.05) {
        scale.value = withTiming(1);
        savedScale.value = 1;
      }
    });

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!uri) {
    return null;
  }

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'black' }}>
        <RNStatusBar barStyle="light-content" />
        <Pressable
          onPress={onClose}
          style={{
            position: 'absolute',
            top: insets.top + 6,
            right: 10,
            zIndex: 20,
            padding: 8,
          }}
          hitSlop={10}
        >
          <Ionicons name="close" size={30} color="#fff" />
        </Pressable>
        <View
          style={{
            flex: 1,
            paddingTop: 44 + insets.top,
            paddingBottom: insets.bottom,
            flexDirection: 'column',
          }}
        >
          <Pressable onPress={onClose} style={{ height: 32 }} />
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <Pressable onPress={onClose} style={{ width: 16 }} />
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} pointerEvents="box-none">
              <GestureDetector gesture={pinch}>
                <Animated.View style={[{ maxWidth: '100%', maxHeight: '100%' }, zoomStyle]}>
                  <Image
                    source={{ uri }}
                    contentFit="contain"
                    style={{ width: width - 32, height: height * 0.7 }}
                    transition={200}
                  />
                </Animated.View>
              </GestureDetector>
            </View>
            <Pressable onPress={onClose} style={{ width: 16 }} />
          </View>
          <Pressable onPress={onClose} style={{ height: 48 }} />
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export default function SupportChatScreen() {
  const insets = useSafeAreaInsets();
  const colors = useMemo(() => passengerSupportLightPalette, []);
  const settingsStyles = useMemo(() => createSettingsStyles(colors), [colors]);
  const styles = useMemo(() => createSupportChatStyles(colors), [colors]);

  const { chatId: chatIdParam } = useLocalSearchParams<{ chatId?: string | string[] }>();
  const explicitChatId = useMemo(() => {
    const p = chatIdParam;
    if (typeof p === 'string' && p.trim()) return p.trim();
    if (Array.isArray(p) && typeof p[0] === 'string' && p[0].trim()) return p[0].trim();
    return null;
  }, [chatIdParam]);

  const listRef = useRef<FlatList<PassengerMessageRow>>(null);
  const inputRef = useRef<TextInput>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loadingInit, setLoadingInit] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PassengerMessageRow[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [supportTyping, setSupportTyping] = useState(false);
  const [imageViewer, setImageViewer] = useState<string | null>(null);
  const [menuMessage, setMenuMessage] = useState<PassengerMessageRow | null>(null);
  const [replyMessage, setReplyMessage] = useState<PassengerChatReplyTarget | null>(null);
  const [showGalleryPermissionModal, setShowGalleryPermissionModal] = useState(false);

  const { width: layoutW } = useWindowDimensions();
  const messageImageWidth = useMemo(
    () => Math.max(100, Math.min(Math.floor(layoutW * 0.75) - 20, 280)),
    [layoutW],
  );

  const isFocused = useIsFocused();
  const hadUnfocusedRef = useRef(false);

  useEffect(() => {
    if (!isFocused) {
      hadUnfocusedRef.current = true;
    }
  }, [isFocused]);

  useEffect(() => {
    if (!isFocused || !chatId || loadingInit) {
      return;
    }
    if (!hadUnfocusedRef.current) {
      return;
    }
    hadUnfocusedRef.current = false;
    let cancelled = false;
    void (async () => {
      try {
        const list = await listarMensagensPassageiro(chatId);
        if (cancelled) {
          return;
        }
        setMessages(list);
      } catch {
        /* mantém mensagens atuais */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isFocused, chatId, loadingInit]);

  const scrollToEnd = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const clearTypingTimer = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }, []);

  const showSupportTyping = useCallback(() => {
    clearTypingTimer();
    setSupportTyping(true);
    typingTimerRef.current = setTimeout(() => {
      setSupportTyping(false);
      typingTimerRef.current = null;
    }, 3500);
  }, [clearTypingTimer]);

  const hideSupportTyping = useCallback(() => {
    clearTypingTimer();
    setSupportTyping(false);
  }, [clearTypingTimer]);

  useEffect(() => () => clearTypingTimer(), [clearTypingTimer]);

  const salvarImagem = useCallback(async (msg: PassengerMessageRow) => {
    if (msg.type !== 'image' || !msg.message) {
      return;
    }
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão', 'É necessária permissão para guardar a imagem na galeria.');
        return;
      }
      const name = `zamba-${msg.id}.jpg`;
      const dest = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ''}${name}`;
      const downloaded = await FileSystem.downloadAsync(msg.message, dest);
      const asset = await MediaLibrary.createAssetAsync(downloaded.uri);
      const albums = await MediaLibrary.getAlbumsAsync();
      const zamba = albums.find((a) => a.title === 'Zamba');
      if (zamba) {
        await MediaLibrary.addAssetsToAlbumAsync([asset], zamba, false);
      } else {
        await MediaLibrary.createAlbumAsync('Zamba', asset, false);
      }
      Alert.alert('Concluído', 'Imagem guardada no álbum Zamba.');
    } catch (e) {
      Alert.alert('Erro', e instanceof Error ? e.message : 'Não foi possível guardar a imagem.');
    }
  }, []);

  const eliminarMensagem = useCallback(
    (msg: PassengerMessageRow) => {
      if (msg.sender !== 'passenger') {
        return;
      }
      Alert.alert('Eliminar mensagem', 'Pretende eliminar esta mensagem?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await apagarMensagemPassageiro(msg.id);
                setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                if (replyMessage?.id === msg.id) {
                  setReplyMessage(null);
                }
              } catch (e) {
                Alert.alert('Erro', e instanceof Error ? e.message : 'Não foi possível eliminar.');
              }
            })();
          },
        },
      ]);
    },
    [replyMessage],
  );

  const abrirMenuMensagem = useCallback((msg: PassengerMessageRow) => {
    setMenuMessage(msg);
  }, []);

  const focusComposer = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const handleReplyFromSwipe = useCallback(
    (msg: PassengerMessageRow) => {
      setReplyMessage(toPassengerChatReplyTarget(msg));
      focusComposer();
    },
    [focusComposer],
  );

  useEffect(() => {
    let cancelled = false;
    let sub: SupportPassengerRealtimeSubscription | null = null;

    const run = async () => {
      setLoadingInit(true);
      setInitError(null);
      setChatId(null);
      setMessages([]);
      try {
        const resolved = await resolverChatIdPassageiro(explicitChatId);
        if (cancelled) return;
        setChatId(resolved);
        const list = await listarMensagensPassageiro(resolved);

        if (cancelled) return;
        setMessages(list);

        sub = inscreverMensagensPassageiro(resolved, {
          onInsert: (row) => {
            if (row.sender === 'support') {
              if (typingTimerRef.current) {
                clearTimeout(typingTimerRef.current);
                typingTimerRef.current = null;
              }
              setSupportTyping(false);
            }
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              return [...prev, row].sort(sortMessages);
            });
          },
          onUpdate: (row) => {
            setMessages((prev) => {
              const i = prev.findIndex((m) => m.id === row.id);
              if (i >= 0) {
                const next = [...prev];
                next[i] = { ...next[i], ...row };
                return next;
              }
              if (prev.some((m) => m.id === row.id)) return prev;
              return [...prev, row].sort(sortMessages);
            });
          },
          onDelete: (id) => {
            setMessages((prev) => prev.filter((m) => m.id !== id));
            setReplyMessage((r) => (r?.id === id ? null : r));
          },
        });
      } catch (e) {
        if (!cancelled) {
          setInitError(e instanceof Error ? e.message : 'Não foi possível abrir o chat.');
        }
      } finally {
        if (!cancelled) setLoadingInit(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, [explicitChatId]);

  useFocusEffect(
    useCallback(() => {
      if (!chatId || loadingInit) return;
      void marcarConversaComoLidaPassageiro(chatId).catch(() => {
        /* RLS/RPC ainda não aplicado no projeto */
      });
    }, [chatId, loadingInit]),
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        setShowGalleryPermissionModal(false);
      };
    }, []),
  );

  useEffect(() => {
    if (messages.length > 0 && !loadingInit) {
      scrollToEnd(true);
    }
  }, [messages.length, loadingInit, scrollToEnd]);

  useEffect(() => {
    if (supportTyping) {
      scrollToEnd(true);
    }
  }, [supportTyping, scrollToEnd]);

  const onSend = async () => {
    const text = draft.trim();
    if (!text || !chatId || sending) return;
    setSendingImage(false);
    setSending(true);
    setSendError(null);
    showSupportTyping();
    const reply = replyMessage;
    try {
      const row = await enviarMensagemPassageiro(
        chatId,
        text,
        'text',
        reply
          ? { replyToId: reply.id, replyPreview: getReplyPreviewForTarget(reply) }
          : undefined,
      );
      setDraft('');
      setReplyMessage(null);
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        return [...prev, row].sort(sortMessages);
      });
      scrollToEnd(true);
    } catch (e) {
      hideSupportTyping();
      setSendError(e instanceof Error ? e.message : 'Erro ao enviar.');
    } finally {
      setSending(false);
    }
  };

  const mostrarAlertaPermissaoGaleriaNegada = useCallback(() => {
    Alert.alert(
      'Acesso às fotos',
      'Não temos permissão para aceder à galeria. Para enviar imagens no suporte, ative o acesso às fotos nas definições do telemóvel.',
      [
        { text: 'Agora não', style: 'cancel' },
        { text: 'Abrir definições', onPress: () => void Linking.openSettings() },
      ],
    );
  }, []);

  const selecionarEEnviarImagem = async () => {
    if (!chatId) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
    });

    if (result.canceled) return;

    setSendingImage(true);
    setSending(true);
    setSendError(null);
    showSupportTyping();
    const reply = replyMessage;
    try {
      const imagem = result.assets[0];
      if (!imagem?.uri) {
        throw new Error('Não foi possível ler a imagem.');
      }

      const manipulated = await ImageManipulator.manipulateAsync(
        imagem.uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
      );

      const url = await uploadImagemCloudinary({ uri: manipulated.uri });
      const row = await enviarMensagemPassageiro(
        chatId,
        url,
        'image',
        reply
          ? { replyToId: reply.id, replyPreview: getReplyPreviewForTarget(reply) }
          : undefined,
      );
      setReplyMessage(null);
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        return [...prev, row].sort(sortMessages);
      });
      scrollToEnd(true);
    } catch (e) {
      hideSupportTyping();
      setSendError('Não foi possível enviar a imagem. Tente novamente.');
      Alert.alert(
        'Envio de imagem',
        'Não foi possível concluir o envio. Tente de novo em instantes.',
      );
    } finally {
      setSending(false);
      setSendingImage(false);
    }
  };

  const continuarAposExplicacaoGaleria = async () => {
    setShowGalleryPermissionModal(false);
    const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (galeriaPodeSelecionarFotos(req)) {
      await selecionarEEnviarImagem();
      return;
    }
    mostrarAlertaPermissaoGaleriaNegada();
  };

  const iniciarEnvioDeImagem = async () => {
    if (!chatId || sending) return;

    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (galeriaPodeSelecionarFotos(perm)) {
      await selecionarEEnviarImagem();
      return;
    }
    if (perm.status === 'undetermined') {
      setShowGalleryPermissionModal(true);
      return;
    }
    mostrarAlertaPermissaoGaleriaNegada();
  };

  const renderItem = useCallback(
    ({ item }: { item: PassengerMessageRow }) => (
      <ChatMessageRow
        item={item}
        messageImageWidth={messageImageWidth}
        styles={styles}
        colors={colors}
        onLongPressOpenMenu={abrirMenuMensagem}
        onImagePress={(uri) => setImageViewer(uri)}
        onReplySwipe={handleReplyFromSwipe}
      />
    ),
    [abrirMenuMensagem, messageImageWidth, handleReplyFromSwipe, styles, colors],
  );

  const keyboardOffset = Platform.OS === 'ios' ? insets.top + 52 : 0;

  const listFooter = supportTyping ? (
    <View style={styles.typingFooter}>
      <Text style={styles.typingText} allowFontScaling={false}>
        Suporte está digitando…
      </Text>
    </View>
  ) : null;

  if (loadingInit) {
    return (
      <>
        <ExpoStatusBar style="dark" translucent={false} backgroundColor={colors.bg} />
        <SafeAreaView style={[settingsStyles.root, { flex: 1 }]} edges={['top', 'left', 'right']}>
        <View style={settingsStyles.topBar}>
          <View style={{ width: 40, alignItems: 'flex-start' }}>
            <Pressable onPress={() => router.back()} style={settingsStyles.backBtn} hitSlop={12}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </Pressable>
          </View>
          <SupportChatHeaderCenter
            title="Suporte"
            settingsStyles={settingsStyles}
            supportStyles={styles}
          />
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
      </>
    );
  }

  if (initError && !chatId) {
    return (
      <>
        <ExpoStatusBar style="dark" translucent={false} backgroundColor={colors.bg} />
        <SafeAreaView style={[settingsStyles.root, { flex: 1 }]} edges={['top', 'left', 'right']}>
        <View style={settingsStyles.topBar}>
          <View style={{ width: 40, alignItems: 'flex-start' }}>
            <Pressable onPress={() => router.back()} style={settingsStyles.backBtn} hitSlop={12}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </Pressable>
          </View>
          <SupportChatHeaderCenter
            title="Suporte"
            settingsStyles={settingsStyles}
            supportStyles={styles}
          />
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerFill}>
          <Text style={styles.errorText} allowFontScaling={false}>
            {initError}
          </Text>
        </View>
      </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <ExpoStatusBar style="dark" translucent={false} backgroundColor={colors.bg} />
      <SafeAreaView style={[settingsStyles.root, { flex: 1 }]} edges={['top', 'left', 'right']}>
      <Modal
        visible={showGalleryPermissionModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowGalleryPermissionModal(false)}
        statusBarTranslucent
      >
        <View style={styles.flex1}>
          <Pressable
            style={styles.galleryPermBackdrop}
            onPress={() => setShowGalleryPermissionModal(false)}
            accessibilityLabel="Fechar"
          />
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { justifyContent: 'center' as const, paddingHorizontal: 20 },
            ]}
            pointerEvents="box-none"
          >
            <View style={styles.galleryPermCard}>
              <Text style={styles.galleryPermTitle} allowFontScaling={false}>
                Permitir acesso às fotos
              </Text>
              <Text style={styles.galleryPermMessage} allowFontScaling={false}>
                Para enviar imagens no chat de suporte, precisamos acessar sua galeria.
              </Text>
              <View style={styles.galleryPermRow}>
                <Pressable
                  onPress={() => setShowGalleryPermissionModal(false)}
                  style={({ pressed }) => [styles.galleryPermBtnGhost, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={styles.galleryPermBtnGhostText} allowFontScaling={false}>
                    Cancelar
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void continuarAposExplicacaoGaleria()}
                  style={({ pressed }) => [styles.galleryPermBtnPrimary, { opacity: pressed ? 0.9 : 1 }]}
                >
                  <Text style={styles.galleryPermBtnPrimaryText} allowFontScaling={false}>
                    Continuar
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
      <ImageViewerModal uri={imageViewer} onClose={() => setImageViewer(null)} />
      <SupportMessageActionModal
        visible={!!menuMessage}
        onClose={() => setMenuMessage(null)}
        onReply={() => {
          if (menuMessage) {
            setReplyMessage(toPassengerChatReplyTarget(menuMessage));
            focusComposer();
          }
        }}
        onSaveImage={
          menuMessage?.type === 'image'
            ? () => {
                if (menuMessage) {
                  void salvarImagem(menuMessage);
                }
              }
            : undefined
        }
        onDelete={
          menuMessage?.sender === 'passenger'
            ? () => {
                if (menuMessage) {
                  eliminarMensagem(menuMessage);
                }
              }
            : undefined
        }
        canSaveImage={menuMessage != null && menuMessage.type === 'image'}
        canDelete={menuMessage != null && menuMessage.sender === 'passenger'}
        styles={styles}
      />
      <View style={settingsStyles.topBar}>
        <View style={{ width: 40, alignItems: 'flex-start' }}>
          <Pressable onPress={() => router.back()} style={settingsStyles.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
        </View>
        <SupportChatHeaderCenter
          title="Suporte"
          settingsStyles={settingsStyles}
          supportStyles={styles}
        />
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardOffset}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.messagesContent}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText} allowFontScaling={false}>
                Nenhuma mensagem ainda
              </Text>
            </View>
          }
          ListFooterComponent={listFooter}
          onContentSizeChange={() => scrollToEnd(messages.length > 0 || supportTyping)}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />

        {sending && sendingImage ? (
          <Text style={styles.sendingHint} allowFontScaling={false}>
            A enviar imagem…
          </Text>
        ) : null}
        {sendError ? (
          <Text style={[styles.errorText, { paddingHorizontal: 16, paddingBottom: 4 }]} allowFontScaling={false}>
            {sendError}
          </Text>
        ) : null}

        {replyMessage ? (
          <View style={styles.replyPreviewRow}>
            <View style={styles.replyPreviewContent}>
              <Text style={styles.replyPreviewLabel} allowFontScaling={false}>
                {replyMessage.sender === 'passenger' ? 'A responder a ti' : 'A responder a suporte'}
              </Text>
              {replyMessage.type === 'image' ? (
                <View style={styles.replyPreviewTextRow}>
                  <Ionicons
                    name="image-outline"
                    size={17}
                    color={colors.textMuted}
                    style={styles.replyPreviewIcon}
                  />
                  <Text style={styles.replyPreviewText} numberOfLines={1} allowFontScaling={false}>
                    Imagem
                  </Text>
                </View>
              ) : (
                <Text style={styles.replyPreviewText} numberOfLines={2} allowFontScaling={false}>
                  {replyMessage.content}
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => setReplyMessage(null)}
              style={styles.replyPreviewCancel}
              hitSlop={8}
              accessibilityLabel="Cancelar resposta"
            >
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            onPress={() => void iniciarEnvioDeImagem()}
            disabled={sending || !chatId}
            style={({ pressed }) => [
              styles.attachBtn,
              (sending || !chatId || pressed) && styles.attachBtnDisabled,
            ]}
            hitSlop={6}
            accessibilityLabel="Enviar imagem"
          >
            {sending && sendingImage ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <Text style={{ fontSize: 22 }} allowFontScaling={false}>
                📷
              </Text>
            )}
          </Pressable>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            placeholder="Mensagem"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            maxLength={4000}
            editable={!sending && !!chatId}
          />
          <Pressable
            onPress={() => void onSend()}
            disabled={sending || !draft.trim() || !chatId}
            style={({ pressed }) => [
              styles.sendBtn,
              (sending || !draft.trim() || !chatId || pressed) && styles.sendBtnDisabled,
            ]}
          >
            {sending && !sendingImage ? (
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : (
              <Ionicons name="send" size={20} color={colors.onAccent} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </>
  );
}

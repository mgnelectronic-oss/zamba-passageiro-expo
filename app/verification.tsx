import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { authService, formatErrorMessage, type UserProfile } from '@/services/authService';
import { rideService } from '@/services/rideService';

type DocumentType = 'BI' | 'Passaporte';

const { width: SCREEN_W } = Dimensions.get('window');

const C = {
  bg: '#F7F8FA',
  surface: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  emerald: '#10B981',
  emeraldBg: '#ECFDF5',
  amber: '#F59E0B',
  amberBg: '#FFFBEB',
  amberBorder: '#FEF3C7',
  red: '#EF4444',
  redBg: '#FEF2F2',
  redBorder: '#FEE2E2',
};

const SHADOW = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 3 },
}) as any;

export default function VerificationPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [completedRides, setCompletedRides] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [step, setStep] = useState(1);
  const [docType, setDocType] = useState<DocumentType | null>(null);
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const user = await authService.getCurrentUser();
      if (!user) { router.replace('/auth'); return; }
      setUserId(user.id);
    })();
  }, []);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [p, rides] = await Promise.all([
        authService.getUserProfile(userId),
        rideService.getCompletedRidesCount(userId),
      ]);
      setProfile(p);
      setCompletedRides(rides);
    } catch (e) {
      console.error('Error loading verification data:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  const pickImage = async (facing: 'front' | 'back') => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera para capturar o documento.');
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      cameraType: facing === 'front' ? ImagePicker.CameraType.back : ImagePicker.CameraType.back,
    });

    if (result.canceled || !result.assets?.[0]) return null;

    const manipulated = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
    );

    return manipulated.uri;
  };

  const pickSelfie = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera para capturar a selfie.');
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      cameraType: ImagePicker.CameraType.front,
    });

    if (result.canceled || !result.assets?.[0]) return null;

    const manipulated = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
    );

    return manipulated.uri;
  };

  const handleCaptureFront = async () => {
    const uri = await pickImage('front');
    if (uri) setFrontUri(uri);
  };

  const handleCaptureBack = async () => {
    const uri = await pickImage('back');
    if (uri) setBackUri(uri);
  };

  const handleCaptureSelfie = async () => {
    const uri = await pickSelfie();
    if (uri) setSelfieUri(uri);
  };

  const handleSubmit = async () => {
    if (!userId || !docType || !frontUri || !selfieUri) return;
    if (docType === 'BI' && !backUri) return;

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const frontUrl = await authService.uploadVerificationFile(userId, 'doc_front', frontUri);
      let backUrl = '';
      if (docType === 'BI' && backUri) {
        backUrl = await authService.uploadVerificationFile(userId, 'doc_back', backUri);
      }
      const selfieUrl = await authService.uploadVerificationFile(userId, 'selfie', selfieUri);

      await authService.submitVerification(userId, {
        document_type: docType,
        document_front_url: frontUrl,
        document_back_url: backUrl || undefined,
        selfie_url: selfieUrl,
      });

      const updatedProfile = await authService.getUserProfile(userId);
      setProfile(updatedProfile);
      setStep(6);
    } catch (e) {
      console.error('Verification submit error:', e);
      setErrorMsg(formatErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const resetFlow = () => {
    setStep(1);
    setDocType(null);
    setFrontUri(null);
    setBackUri(null);
    setSelfieUri(null);
    setErrorMsg(null);
  };

  if (loading) {
    return (
      <View style={[st.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={C.emerald} />
      </View>
    );
  }

  const status = profile?.verification_status || 'not_started';
  const isBlocked = completedRides >= 2 && status !== 'approved';
  const remainingRides = Math.max(0, 2 - completedRides);

  const renderStatusScreen = () => {
    if (status === 'pending') {
      return (
        <View style={st.statusCard}>
          <View style={[st.statusIcon, { backgroundColor: C.amberBg }]}>
            <Ionicons name="time" size={40} color={C.amber} />
          </View>
          <Text style={st.statusTitle}>Aguardando a verificação</Text>
          <Text style={st.statusDesc}>
            Os seus documentos foram enviados e estão a ser analisados pela nossa equipa.
            Isto costuma demorar menos de 24 horas.
          </Text>
          <TouchableOpacity style={st.outlineBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={st.outlineBtnText}>Voltar ao Início</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (status === 'approved') {
      return (
        <View style={st.statusCard}>
          <View style={[st.statusIcon, { backgroundColor: C.emeraldBg }]}>
            <Ionicons name="checkmark-circle" size={40} color={C.emerald} />
          </View>
          <Text style={st.statusTitle}>Conta verificada com sucesso</Text>
          <Text style={st.statusDesc}>
            A sua conta está verificada. Agora pode realizar viagens ilimitadas com a Zamba.
          </Text>
          <TouchableOpacity style={st.primaryBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={st.primaryBtnText}>Voltar ao Início</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (status === 'rejected') {
      return (
        <View style={st.statusCard}>
          <View style={[st.statusIcon, { backgroundColor: C.redBg }]}>
            <Ionicons name="alert-circle" size={40} color={C.red} />
          </View>
          <Text style={st.statusTitle}>Verificação Rejeitada</Text>
          <Text style={[st.statusDesc, { color: C.red, fontWeight: '600' }]}>
            Motivo: {profile?.verification_rejected_reason || 'Documentos ilegíveis ou inválidos.'}
          </Text>
          <Text style={st.statusDesc}>
            Por favor, tente novamente garantindo que as fotos estão nítidas e bem iluminadas.
          </Text>
          <TouchableOpacity style={st.primaryBtn} onPress={resetFlow} activeOpacity={0.8}>
            <Text style={st.primaryBtnText}>Tentar Novamente</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  const renderCaptureArea = (
    uri: string | null,
    onCapture: () => void,
    label: string,
    circular?: boolean,
  ) => (
    <TouchableOpacity
      style={[st.captureArea, circular && st.captureCircular]}
      onPress={onCapture}
      activeOpacity={0.8}
    >
      {uri ? (
        <View style={StyleSheet.absoluteFill}>
          <Image
            source={{ uri }}
            style={[StyleSheet.absoluteFill, circular && { borderRadius: 999 }]}
            resizeMode="cover"
          />
          <View style={[st.captureOverlay, circular && { borderRadius: 999 }]}>
            <Ionicons name="refresh" size={28} color="#FFF" />
            <Text style={st.captureOverlayText}>REFAZER FOTO</Text>
          </View>
        </View>
      ) : (
        <>
          <View style={st.captureIconCircle}>
            <Ionicons name={circular ? 'person' : 'camera'} size={28} color={C.textMuted} />
          </View>
          <Text style={st.captureLabel}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View style={st.stepContent}>
            <Text style={st.stepTitle}>Escolha o documento</Text>
            <Text style={st.stepDesc}>Selecione o tipo de documento que deseja usar para verificar a sua conta.</Text>

            <TouchableOpacity
              style={st.docOption}
              onPress={() => { setDocType('BI'); setStep(2); }}
              activeOpacity={0.8}
            >
              <View style={st.docOptionIcon}>
                <Ionicons name="document-text" size={24} color={C.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.docOptionTitle}>Bilhete de Identidade (BI)</Text>
                <Text style={st.docOptionSub}>Requer foto da frente e do verso</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={C.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={st.docOption}
              onPress={() => { setDocType('Passaporte'); setStep(2); }}
              activeOpacity={0.8}
            >
              <View style={st.docOptionIcon}>
                <Ionicons name="image" size={24} color={C.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.docOptionTitle}>Passaporte</Text>
                <Text style={st.docOptionSub}>Requer apenas foto da página principal</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={C.textMuted} />
            </TouchableOpacity>
          </View>
        );

      case 2:
        return (
          <View style={st.stepContent}>
            <Text style={st.stepTitle}>Foto da frente</Text>
            <Text style={st.stepDesc}>Tire uma foto nítida da parte da frente do seu {docType}.</Text>
            {renderCaptureArea(frontUri, handleCaptureFront, 'Tocar para capturar')}
            <View style={st.btnRow}>
              <TouchableOpacity style={st.ghostBtn} onPress={() => setStep(1)} activeOpacity={0.8}>
                <Text style={st.ghostBtnText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.primaryBtn, st.flexBtn, !frontUri && st.disabledBtn]}
                onPress={() => setStep(docType === 'BI' ? 3 : 4)}
                activeOpacity={0.8}
                disabled={!frontUri}
              >
                <Text style={st.primaryBtnText}>Continuar</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 3:
        return (
          <View style={st.stepContent}>
            <Text style={st.stepTitle}>Foto do verso</Text>
            <Text style={st.stepDesc}>Tire uma foto nítida da parte de trás do seu BI.</Text>
            {renderCaptureArea(backUri, handleCaptureBack, 'Tocar para capturar')}
            <View style={st.btnRow}>
              <TouchableOpacity style={st.ghostBtn} onPress={() => setStep(2)} activeOpacity={0.8}>
                <Text style={st.ghostBtnText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.primaryBtn, st.flexBtn, !backUri && st.disabledBtn]}
                onPress={() => setStep(4)}
                activeOpacity={0.8}
                disabled={!backUri}
              >
                <Text style={st.primaryBtnText}>Continuar</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 4:
        return (
          <View style={st.stepContent}>
            <Text style={st.stepTitle}>Tire uma Selfie</Text>
            <Text style={st.stepDesc}>Posicione o seu rosto no centro da moldura. Esta foto será usada no seu perfil.</Text>
            {renderCaptureArea(selfieUri, handleCaptureSelfie, 'Tocar para capturar selfie', true)}
            <View style={st.btnRow}>
              <TouchableOpacity style={st.ghostBtn} onPress={() => setStep(docType === 'BI' ? 3 : 2)} activeOpacity={0.8}>
                <Text style={st.ghostBtnText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.primaryBtn, st.flexBtn, !selfieUri && st.disabledBtn]}
                onPress={() => setStep(5)}
                activeOpacity={0.8}
                disabled={!selfieUri}
              >
                <Text style={st.primaryBtnText}>Revisar</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 5:
        return (
          <View style={st.stepContent}>
            <Text style={st.stepTitle}>Revisar e Enviar</Text>
            <Text style={st.stepDesc}>Verifique se todas as fotos estão nítidas e as informações estão legíveis.</Text>

            <View style={st.reviewGrid}>
              <View style={st.reviewItem}>
                <Text style={st.reviewLabel}>FRENTE DO {docType}</Text>
                <View style={st.reviewThumb}>
                  {frontUri && <Image source={{ uri: frontUri }} style={st.reviewImg} resizeMode="cover" />}
                </View>
              </View>
              {docType === 'BI' && (
                <View style={st.reviewItem}>
                  <Text style={st.reviewLabel}>VERSO DO BI</Text>
                  <View style={st.reviewThumb}>
                    {backUri && <Image source={{ uri: backUri }} style={st.reviewImg} resizeMode="cover" />}
                  </View>
                </View>
              )}
            </View>

            <View style={{ marginTop: 8 }}>
              <Text style={st.reviewLabel}>SELFIE</Text>
              <View style={[st.reviewThumb, { width: 80, height: 80, borderRadius: 16 }]}>
                {selfieUri && <Image source={{ uri: selfieUri }} style={st.reviewImg} resizeMode="cover" />}
              </View>
            </View>

            <View style={st.warningCard}>
              <Text style={st.warningText}>
                Ao enviar, você confirma que as fotos são reais e pertencem a você. Após o envio, não poderá alterar os dados até que a análise seja concluída.
              </Text>
            </View>

            <View style={st.btnRow}>
              <TouchableOpacity
                style={[st.ghostBtn, submitting && st.disabledBtn]}
                onPress={() => setStep(4)}
                disabled={submitting}
                activeOpacity={0.8}
              >
                <Text style={st.ghostBtnText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.primaryBtn, st.flexBtn, submitting && st.disabledBtn]}
                onPress={handleSubmit}
                activeOpacity={0.8}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={st.primaryBtnText}>Enviar Agora</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );

      case 6:
        return (
          <View style={st.statusCard}>
            <View style={[st.statusIcon, { backgroundColor: C.emeraldBg }]}>
              <Ionicons name="checkmark-circle" size={40} color={C.emerald} />
            </View>
            <Text style={st.statusTitle}>Enviado com sucesso!</Text>
            <Text style={st.statusDesc}>
              A sua verificação foi enviada e está em análise. Notificaremos você assim que for concluída.
            </Text>
            <TouchableOpacity style={st.primaryBtn} onPress={() => router.back()} activeOpacity={0.8}>
              <Text style={st.primaryBtnText}>Voltar ao Início</Text>
            </TouchableOpacity>
          </View>
        );

      default:
        return null;
    }
  };

  const showWizard = status === 'not_started' || status === 'rejected';

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity style={st.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Verificação de conta</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Error banner */}
        {errorMsg && (
          <View style={st.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={C.red} />
            <Text style={st.errorText}>{errorMsg}</Text>
            <TouchableOpacity onPress={() => setErrorMsg(null)} hitSlop={8}>
              <Ionicons name="close" size={18} color={C.red} />
            </TouchableOpacity>
          </View>
        )}

        {showWizard && (
          <View style={st.infoBanner}>
            <View style={[st.infoBannerIcon, isBlocked && { backgroundColor: C.redBg }]}>
              <Ionicons name="shield-checkmark" size={22} color={isBlocked ? C.red : '#3B82F6'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.infoBannerLabel}>STATUS DA CONTA</Text>
              <Text style={st.infoBannerText}>
                {isBlocked
                  ? 'Verificação obrigatória para continuar'
                  : remainingRides === 1
                    ? 'Resta 1 viagem antes da verificação'
                    : `Restam ${remainingRides} viagens antes da verificação`}
              </Text>
            </View>
          </View>
        )}

        {showWizard ? renderStep() : renderStatusScreen()}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.borderLight,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: C.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.text, letterSpacing: -0.3 },

  scroll: { flex: 1 },
  scrollContent: { padding: 20 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.redBg, borderWidth: 1, borderColor: C.redBorder,
    borderRadius: 16, padding: 14, marginBottom: 16,
  },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600', color: C.red },

  infoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.surface, borderRadius: 20, padding: 16,
    marginBottom: 20, ...SHADOW,
  },
  infoBannerIcon: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  infoBannerLabel: { fontSize: 9, fontWeight: '800', color: C.textMuted, letterSpacing: 1.5, marginBottom: 2 },
  infoBannerText: { fontSize: 13, fontWeight: '700', color: C.text, lineHeight: 18 },

  statusCard: {
    backgroundColor: C.surface, borderRadius: 24, padding: 32,
    alignItems: 'center', ...SHADOW,
  },
  statusIcon: {
    width: 72, height: 72, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  statusTitle: { fontSize: 22, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 10 },
  statusDesc: { fontSize: 13, color: C.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 8 },

  stepContent: { gap: 16 },
  stepTitle: { fontSize: 22, fontWeight: '800', color: C.text },
  stepDesc: { fontSize: 13, color: C.textSecondary, lineHeight: 20 },

  docOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.surface, borderRadius: 20, padding: 18,
    borderWidth: 2, borderColor: 'transparent', ...SHADOW,
  },
  docOptionIcon: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: C.borderLight,
    alignItems: 'center', justifyContent: 'center',
  },
  docOptionTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  docOptionSub: { fontSize: 11, fontWeight: '500', color: C.textMuted, marginTop: 2 },

  captureArea: {
    aspectRatio: 3 / 2, borderRadius: 24, borderWidth: 2, borderStyle: 'dashed',
    borderColor: C.border, backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  captureCircular: {
    aspectRatio: 1, width: SCREEN_W * 0.6, alignSelf: 'center', borderRadius: 999,
  },
  captureIconCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: C.borderLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  captureLabel: { fontSize: 11, fontWeight: '800', color: C.textMuted, letterSpacing: 1.5, textTransform: 'uppercase' },
  captureOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  captureOverlayText: { color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 6 },

  btnRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  flexBtn: { flex: 1 },
  primaryBtn: {
    height: 52, borderRadius: 16, backgroundColor: C.text,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  primaryBtnText: { fontSize: 13, fontWeight: '800', color: '#FFF', letterSpacing: 0.5, textTransform: 'uppercase' },
  outlineBtn: {
    height: 52, borderRadius: 16, borderWidth: 2, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
    marginTop: 8,
  },
  outlineBtnText: { fontSize: 13, fontWeight: '800', color: C.text, letterSpacing: 0.5, textTransform: 'uppercase' },
  ghostBtn: {
    flex: 1, height: 52, borderRadius: 16, backgroundColor: C.borderLight,
    alignItems: 'center', justifyContent: 'center',
  },
  ghostBtnText: { fontSize: 13, fontWeight: '800', color: C.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' },
  disabledBtn: { opacity: 0.4 },

  reviewGrid: { flexDirection: 'row', gap: 12 },
  reviewItem: { flex: 1 },
  reviewLabel: { fontSize: 9, fontWeight: '800', color: C.textMuted, letterSpacing: 1.5, marginBottom: 6 },
  reviewThumb: {
    aspectRatio: 3 / 2, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: C.borderLight, backgroundColor: C.borderLight,
  },
  reviewImg: { width: '100%', height: '100%' },

  warningCard: {
    backgroundColor: C.amberBg, borderWidth: 1, borderColor: C.amberBorder,
    borderRadius: 16, padding: 14,
  },
  warningText: { fontSize: 12, color: '#92400E', fontWeight: '500', lineHeight: 18 },
});

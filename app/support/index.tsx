import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createSettingsStyles } from '@/components/settings/createSettingsStyles';
import { fetchSupportSettingsPassenger } from '@/services/supportSettingsPassengerService';
import { passengerSupportLightPalette } from '@/theme/palettes';

const FALLBACK = 'Não disponível';

const colors = passengerSupportLightPalette;

function normalizeTel(raw: string | null) {
  if (raw == null) return '';
  return raw.replace(/[\s.-]/g, '');
}

function openMailto(email: string) {
  const e = email.trim();
  if (!e) {
    Alert.alert('Indisponível', 'E-mail de suporte ainda não está configurado.');
    return;
  }
  void Linking.openURL(`mailto:${e}`);
}

function openTel(phone: string) {
  const d = normalizeTel(phone);
  if (!d) {
    Alert.alert('Indisponível', 'Número de suporte ainda não está configurado.');
    return;
  }
  void Linking.openURL(`tel:${d}`);
}

export default function SupportHubScreen() {
  const settingsStyles = useMemo(() => createSettingsStyles(colors), []);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await fetchSupportSettingsPassenger();
    if (error) {
      setLoadError(error.message);
      setEmail(null);
      setPhone(null);
    } else {
      setEmail(data.email?.trim() || null);
      setPhone(data.phone?.trim() || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const emailLine = email || FALLBACK;
  const phoneLine = phone || FALLBACK;

  return (
    <>
      <ExpoStatusBar style="dark" translucent={false} backgroundColor={colors.bg} />
      <SafeAreaView style={[settingsStyles.root, { flex: 1 }]} edges={['top', 'left', 'right']}>
        <View style={settingsStyles.topBar}>
          <View style={{ width: 40, alignItems: 'flex-start' }}>
            <Pressable
              onPress={() => router.back()}
              style={settingsStyles.backBtn}
              hitSlop={12}
            >
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </Pressable>
          </View>
          <Text style={settingsStyles.topTitle} allowFontScaling={false}>
            Suporte
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[settingsStyles.scroll, { paddingBottom: 32 }]}
            keyboardShouldPersistTaps="handled"
          >
            {loadError ? (
              <Text
                style={[settingsStyles.hint, { color: colors.danger, marginBottom: 12 }]}
                allowFontScaling={false}
              >
                {loadError}
              </Text>
            ) : null}

            <View style={settingsStyles.menuCard}>
              <Pressable
                onPress={() => router.push('/support/chat')}
                style={({ pressed }) => [settingsStyles.row, { opacity: pressed ? 0.75 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Conversar agora com a equipa Zamba"
              >
                <View style={settingsStyles.menuLeft}>
                  <View
                    style={[
                      settingsStyles.menuIcon,
                      { backgroundColor: colors.accentMuted },
                    ]}
                  >
                    <Ionicons name="chatbubbles" size={22} color={colors.accent} />
                  </View>
                  <View style={settingsStyles.menuTextCol}>
                    <Text style={settingsStyles.menuTitle} allowFontScaling={false}>
                      Chat
                    </Text>
                    <Text style={settingsStyles.menuSub} allowFontScaling={false} numberOfLines={2}>
                      Conversar agora com a equipa Zamba
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </Pressable>

              <View style={settingsStyles.rowBorder} />
              <Pressable
                onPress={() => openMailto(email ?? '')}
                style={({ pressed }) => [settingsStyles.row, { opacity: pressed ? 0.75 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Enviar e-mail ao suporte"
              >
                <View style={settingsStyles.menuLeft}>
                  <View
                    style={[
                      settingsStyles.menuIcon,
                      { backgroundColor: colors.chipBg },
                    ]}
                  >
                    <Ionicons name="mail" size={22} color={colors.textSecondary} />
                  </View>
                  <View style={settingsStyles.menuTextCol}>
                    <Text style={settingsStyles.menuTitle} allowFontScaling={false}>
                      E-mail
                    </Text>
                    <Text
                      style={settingsStyles.menuSub}
                      numberOfLines={2}
                      allowFontScaling={false}
                    >
                      {emailLine}
                    </Text>
                  </View>
                </View>
                <Ionicons name="open-outline" size={20} color={colors.textMuted} />
              </Pressable>

              <View style={settingsStyles.rowBorder} />
              <Pressable
                onPress={() => openTel(phone ?? '')}
                style={({ pressed }) => [settingsStyles.row, { opacity: pressed ? 0.75 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Ligar para o suporte"
              >
                <View style={settingsStyles.menuLeft}>
                  <View
                    style={[
                      settingsStyles.menuIcon,
                      { backgroundColor: colors.chipBg },
                    ]}
                  >
                    <Ionicons name="call" size={22} color={colors.textSecondary} />
                  </View>
                  <View style={settingsStyles.menuTextCol}>
                    <Text style={settingsStyles.menuTitle} allowFontScaling={false}>
                      Telefone
                    </Text>
                    <Text
                      style={settingsStyles.menuSub}
                      numberOfLines={2}
                      allowFontScaling={false}
                    >
                      {phoneLine}
                    </Text>
                  </View>
                </View>
                <Ionicons name="open-outline" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

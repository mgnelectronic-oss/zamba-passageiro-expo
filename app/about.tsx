import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchAppAboutPassengerContent } from '@/services/appAboutPassengerService';

const C = {
  bg: '#F7F8FA',
  surface: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#64748B',
  border: '#E2E8F0',
  emerald: '#10B981',
};

const ABOUT_FALLBACK =
  'A Zamba é uma plataforma de mobilidade 100% moçambicana, criada para conectar passageiros e motoristas de forma rápida, segura e acessível.';

export default function AboutScreen() {
  const router = useRouter();
  const [content, setContent] = useState(ABOUT_FALLBACK);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { content: body, error } = await fetchAppAboutPassengerContent();
    if (error) {
      setContent(ABOUT_FALLBACK);
    } else {
      const raw = body?.trim();
      setContent(raw && raw.length > 0 ? raw : ABOUT_FALLBACK);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <ExpoStatusBar style="dark" translucent={false} backgroundColor={C.bg} />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'left', 'right']}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: C.border,
            backgroundColor: C.bg,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Feather name="arrow-left" size={22} color={C.text} />
          </Pressable>
          <Text
            style={{ fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.3 }}
            numberOfLines={1}
            allowFontScaling={false}
          >
            Sobre
          </Text>
          <View style={{ width: 44 }} />
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={C.emerald} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 22,
              paddingTop: 24,
              paddingBottom: 40,
            }}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={{
                backgroundColor: C.surface,
                borderRadius: 20,
                padding: 22,
                borderWidth: 1,
                borderColor: C.border,
              }}
            >
              <Text
                allowFontScaling={false}
                style={{
                  fontSize: 16,
                  lineHeight: 28,
                  color: C.text,
                  fontWeight: '400',
                }}
              >
                {content}
              </Text>
            </View>
            <Text
              allowFontScaling={false}
              style={{
                marginTop: 20,
                fontSize: 13,
                lineHeight: 20,
                color: C.textMuted,
                textAlign: 'center',
              }}
            >
              Zamba — mobilidade em Moçambique
            </Text>
          </ScrollView>
        )}
      </SafeAreaView>
    </>
  );
}

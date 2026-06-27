import { Stack } from 'expo-router';

/**
 * Garante que nenhum header nativo (ex.: título "support/index") é mostrado neste grupo.
 * O cabeçalho "Suporte" é apenas o da própria tela.
 */
export default function SupportLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F8F9FA' },
      }}
    />
  );
}

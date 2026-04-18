import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authService } from '@/services/authService';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

type Mode = 'login' | 'register';

type SignUpApiError = {
  message: string;
  code?: string;
  details?: string;
};

function pickAuthErrorFields(err: unknown): SignUpApiError {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const message = typeof e.message === 'string' ? e.message : String(e.message ?? 'Erro desconhecido.');
    const code =
      typeof e.code === 'string'
        ? e.code
        : e.status != null
          ? String(e.status)
          : undefined;
    const details =
      typeof e.details === 'string'
        ? e.details
        : typeof e.hint === 'string'
          ? e.hint
          : undefined;
    return { message, code, details };
  }
  return { message: String(err) };
}

export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [signUpError, setSignUpError] = useState<SignUpApiError | null>(null);

  const clearRegisterErrors = () => {
    setValidationError(null);
    setSignUpError(null);
  };

  const handleSubmit = async () => {
    if (mode === 'login') {
      clearRegisterErrors();
      if (!email.trim() || !password) {
        Alert.alert('Erro', 'Preencha email e password.');
        return;
      }
      setLoading(true);
      try {
        await authService.signIn(email.trim(), password);
        router.replace('/(tabs)');
      } catch (err: unknown) {
        const { message } = pickAuthErrorFields(err);
        Alert.alert('Erro', message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Registo: apenas supabase.auth.signUp com options.data — perfil vem da trigger handle_new_user
    clearRegisterErrors();
    if (!fullName.trim()) {
      setValidationError('Indique o nome completo.');
      return;
    }
    if (!phone.trim()) {
      setValidationError('Indique o telefone.');
      return;
    }
    if (!email.trim()) {
      setValidationError('Indique o email.');
      return;
    }
    if (!password) {
      setValidationError('Indique a password.');
      return;
    }

    if (!isSupabaseConfigured) {
      setSignUpError({
        message: 'Supabase não está configurado.',
        code: 'config',
        details: 'Verifique SUPABASE_URL e SUPABASE_ANON_KEY.',
      });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim(),
          },
        },
      };

      const { error } = await supabase.auth.signUp(payload);

      if (error) {
        setSignUpError({
          message: error.message,
          code: (error as { code?: string }).code ?? String(error.status ?? ''),
          details: (error as { details?: string }).details,
        });
        return;
      }

      // Sucesso: sem erro da API — só então navegar
      router.replace('/(tabs)');
    } catch (err: unknown) {
      setSignUpError(pickAuthErrorFields(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoBadge}>
          <Text style={styles.logoLetter}>Z</Text>
        </View>
        <Text style={styles.logoText}>ZAMBA</Text>
        <Text style={styles.subtitle}>
          {mode === 'login' ? 'Entrar na sua conta' : 'Criar nova conta'}
        </Text>

        {mode === 'register' && (
          <>
            <Text style={styles.label}>Nome completo</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: João Silva"
              placeholderTextColor="#9CA3AF"
              value={fullName}
              onChangeText={(t) => {
                setFullName(t);
                if (validationError) setValidationError(null);
                if (signUpError) setSignUpError(null);
              }}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Telefone</Text>
            <TextInput
              style={styles.input}
              placeholder="+258 84 000 0000"
              placeholderTextColor="#9CA3AF"
              value={phone}
              onChangeText={(t) => {
                setPhone(t);
                if (validationError) setValidationError(null);
                if (signUpError) setSignUpError(null);
              }}
              keyboardType="phone-pad"
            />
          </>
        )}

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="email@exemplo.com"
          placeholderTextColor="#9CA3AF"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            if (validationError) setValidationError(null);
            if (signUpError) setSignUpError(null);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor="#9CA3AF"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            if (validationError) setValidationError(null);
            if (signUpError) setSignUpError(null);
          }}
          secureTextEntry
        />

        {mode === 'register' && validationError ? (
          <Text style={styles.errorBanner}>{validationError}</Text>
        ) : null}

        {mode === 'register' && signUpError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Erro ao criar conta</Text>
            <Text style={styles.errorLine}>{signUpError.message}</Text>
            {signUpError.code ? (
              <Text style={styles.errorMeta}>
                Código: {signUpError.code}
              </Text>
            ) : null}
            {signUpError.details ? (
              <Text style={styles.errorMeta}>Detalhes: {signUpError.details}</Text>
            ) : null}
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>
              {mode === 'login' ? 'ENTRAR' : 'CRIAR CONTA'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchRow}
          onPress={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            clearRegisterErrors();
          }}
        >
          <Text style={styles.switchText}>
            {mode === 'login'
              ? 'Não tem conta? '
              : 'Já tem conta? '}
          </Text>
          <Text style={styles.switchLink}>
            {mode === 'login' ? 'Criar conta' : 'Entrar'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flexGrow: 1, paddingHorizontal: 32, alignItems: 'center' },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoLetter: { color: '#FFF', fontSize: 32, fontWeight: '900' },
  logoText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 32,
  },
  label: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  errorBanner: {
    alignSelf: 'stretch',
    marginTop: 16,
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
  },
  errorBox: {
    alignSelf: 'stretch',
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#991B1B',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  errorLine: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7F1D1D',
    marginBottom: 6,
  },
  errorMeta: {
    fontSize: 12,
    fontWeight: '500',
    color: '#B91C1C',
    marginTop: 4,
  },
  button: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  switchRow: {
    flexDirection: 'row',
    marginTop: 24,
    alignItems: 'center',
  },
  switchText: { fontSize: 14, color: '#9CA3AF', fontWeight: '600' },
  switchLink: { fontSize: 14, color: '#10B981', fontWeight: '800' },
});

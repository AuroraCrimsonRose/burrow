import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { colors } from '../theme/colors';
import { useAuth } from '../auth/AuthContext';
import * as api from '../api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'PairDevice'>;

export default function PairDeviceScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const handlePair = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setStatus('Pairing device...');

    try {
      const result = await api.claimPairingCode({
        code: trimmed,
      });

      await login(result.session_token, result.user);
    } catch (err: unknown) {
      const msg =
        err instanceof api.ApiError
          ? `Pairing failed (${err.status}): ${err.body}`
          : err instanceof Error
            ? err.message
            : 'Pairing failed';
      Alert.alert('Pairing Error', msg);
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Pair to Existing Account</Text>
        <Text style={styles.subtitle}>
          Enter the pairing code shown on your other device. You can find it in Settings → Account → Pair a Device.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="BURROW-XXXX-XXXX"
          placeholderTextColor={colors.textMuted}
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!loading}
        />

        <Text style={styles.hint}>
          Or paste the full QR token
        </Text>

        {status ? <Text style={styles.status}>{status}</Text> : null}

        <TouchableOpacity
          style={[styles.button, (!code.trim() || loading) && styles.buttonDisabled]}
          onPress={handlePair}
          disabled={!code.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.buttonText}>Pair Device</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <Text style={styles.linkText}>Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textHeading,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  input: {
    width: '100%',
    height: 52,
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingHorizontal: 16,
    color: colors.textPrimary,
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 1,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
    marginBottom: 16,
  },
  status: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 12,
  },
  button: {
    width: '100%',
    height: 48,
    backgroundColor: colors.brandPrimary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 16,
  },
  linkText: {
    color: colors.teal,
    fontSize: 14,
  },
});

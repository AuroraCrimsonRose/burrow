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
  ScrollView,
} from 'react-native';
import { colors } from '../theme/colors';
import { useAuth } from '../auth/AuthContext';
import { generateKeyPair, solvePoW, getDeviceFingerprint } from '../crypto';
import * as Device from 'expo-device';
import * as api from '../api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);

  const handleRegister = async () => {
    const name = username.trim();
    if (!name || name.length < 3) {
      Alert.alert('Invalid', 'Username must be at least 3 characters.');
      return;
    }
    setLoading(true);

    try {
      setStatus('Generating device keys...');
      const keys = await generateKeyPair();

      setStatus('Solving proof of work (this may take a moment)...');
      const [nonce, fingerprint] = await Promise.all([
        solvePoW(keys.publicKey),
        getDeviceFingerprint(),
      ]);

      setStatus('Creating account...');
      const deviceLabel = (Device.modelName ?? Platform.OS).slice(0, 64);

      const result = await api.registerAccount({
        public_key: keys.publicKey,
        nonce,
        username: name,
        device_fingerprint_hash: fingerprint,
        device_label: deviceLabel,
      });

      // Show recovery phrase if returned
      if (result.recovery_phrase) {
        setRecoveryPhrase(result.recovery_phrase);
        // Don't auto-login yet — user needs to save phrase
        await login(result.session_token, result.user);
      } else {
        await login(result.session_token, result.user);
      }
    } catch (err: any) {
      const msg = err instanceof api.ApiError
        ? `Registration failed (${err.status}): ${err.body}`
        : err.message ?? 'Registration failed';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  // Recovery phrase display
  if (recoveryPhrase) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.phraseContainer}>
        <Text style={styles.logo}>Save Your Recovery Phrase</Text>
        <Text style={styles.warning}>
          Write this down and store it somewhere safe. This is the ONLY way to recover your account
          if you lose access to this device. It will never be shown again.
        </Text>
        <View style={styles.phraseBox}>
          {recoveryPhrase.split(' ').map((word, i) => (
            <View key={i} style={styles.wordChip}>
              <Text style={styles.wordIndex}>{i + 1}.</Text>
              <Text style={styles.wordText}>{word}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.button} onPress={() => setRecoveryPhrase(null)}>
          <Text style={styles.buttonText}>I've Saved It — Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>Create Account</Text>
        <Text style={styles.tagline}>Choose a username to get started</Text>

        <TextInput
          style={styles.input}
          placeholder="Username (3+ characters)"
          placeholderTextColor={colors.textMuted}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
          maxLength={32}
        />

        {status ? <Text style={styles.status}>{status}</Text> : null}

        <TouchableOpacity
          style={[styles.button, (username.trim().length < 3 || loading) && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={username.trim().length < 3 || loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <Text style={styles.linkText}>Already have an account? Sign In</Text>
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
  logo: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 40,
  },
  input: {
    width: '100%',
    height: 48,
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingHorizontal: 16,
    color: colors.textPrimary,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
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
    marginTop: 20,
  },
  linkText: {
    color: colors.teal,
    fontSize: 14,
  },
  // Recovery phrase styles
  phraseContainer: {
    padding: 24,
    paddingTop: 80,
    alignItems: 'center',
  },
  warning: {
    color: colors.warning,
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 20,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  phraseBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  wordChip: {
    flexDirection: 'row',
    backgroundColor: colors.bgSecondary,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wordIndex: {
    color: colors.textMuted,
    fontSize: 12,
    marginRight: 4,
  },
  wordText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
});

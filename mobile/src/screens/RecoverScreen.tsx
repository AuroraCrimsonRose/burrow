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
import { generateKeyPair, getDeviceFingerprint } from '../crypto';
import * as Device from 'expo-device';
import * as api from '../api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Recover'>;

export default function RecoverScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const handleRecover = async () => {
    const name = username.trim();
    const phrase = mnemonic.trim();
    const wordCount = phrase.split(/\s+/).length;

    if (!name) {
      Alert.alert('Missing', 'Enter your username.');
      return;
    }
    if (wordCount !== 24) {
      Alert.alert('Invalid', `Recovery phrase must be 24 words (got ${wordCount}).`);
      return;
    }

    setLoading(true);
    try {
      setStatus('Generating new device keys...');
      const keys = await generateKeyPair();

      setStatus('Getting device fingerprint...');
      const fingerprint = await getDeviceFingerprint();
      const deviceLabel = (Device.modelName ?? Platform.OS).slice(0, 64);

      setStatus('Recovering account...');
      const result = await api.recoverAccount({
        username: name,
        mnemonic: phrase,
        public_key: keys.publicKey,
        device_fingerprint_hash: fingerprint,
        device_label: deviceLabel,
      });

      await login(result.session_token, result.user);
    } catch (err: any) {
      const msg = err instanceof api.ApiError
        ? `Recovery failed (${err.status}): ${err.body}`
        : err.message ?? 'Recovery failed';
      Alert.alert('Error', msg);
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
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Recover Account</Text>
        <Text style={styles.subtitle}>
          Enter your username and 24-word recovery phrase to restore access on this device.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor={colors.textMuted}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />

        <TextInput
          style={[styles.input, styles.mnemonicInput]}
          placeholder="Enter 24-word recovery phrase..."
          placeholderTextColor={colors.textMuted}
          value={mnemonic}
          onChangeText={setMnemonic}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
          multiline
          textAlignVertical="top"
        />

        {status ? <Text style={styles.status}>{status}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRecover}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.buttonText}>Recover</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <Text style={styles.linkText}>Back to Sign In</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 32,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
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
    height: 48,
    backgroundColor: colors.bgInput,
    borderRadius: 8,
    paddingHorizontal: 16,
    color: colors.textPrimary,
    fontSize: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mnemonicInput: {
    height: 120,
    paddingTop: 12,
    fontSize: 15,
  },
  status: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
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
    alignSelf: 'center',
  },
  linkText: {
    color: colors.teal,
    fontSize: 14,
  },
});

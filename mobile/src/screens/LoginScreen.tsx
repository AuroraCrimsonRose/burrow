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
import { getDeviceKeys } from '../auth/store';
import { generateKeyPair, sign, hexToBytes, getDeviceFingerprint } from '../crypto';
import * as api from '../api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const handleLogin = async () => {
    if (!username.trim()) return;
    setLoading(true);
    setStatus('Requesting challenge...');

    try {
      // Check for existing device keys first
      let keys = await getDeviceKeys();
      if (!keys) {
        Alert.alert(
          'No device keys',
          'No account keys found on this device. Register a new account or recover an existing one.',
        );
        setLoading(false);
        setStatus('');
        return;
      }

      // Get challenge from server
      const { challenge_id, nonce } = await api.createChallenge(username.trim());

      // Sign the challenge nonce with our private key
      setStatus('Signing challenge...');
      const nonceBytes = hexToBytes(nonce);
      const signature = await sign(nonceBytes, keys.privateKey);

      // Verify with server
      setStatus('Verifying...');
      const result = await api.verifyChallenge({
        challenge_id,
        signature,
        public_key: keys.publicKey,
      });

      await login(result.session_token, result.user);
    } catch (err: any) {
      const msg = err instanceof api.ApiError
        ? `Login failed (${err.status}): ${err.body}`
        : err.message ?? 'Login failed';
      Alert.alert('Login Error', msg);
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
        <Text style={styles.logo}>burrow</Text>
        <Text style={styles.tagline}>Your community platform</Text>

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

        {status ? <Text style={styles.status}>{status}</Text> : null}

        <TouchableOpacity
          style={[styles.button, (!username.trim() || loading) && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={!username.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate('Register')}
          disabled={loading}
        >
          <Text style={styles.linkText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate('Recover')}
          disabled={loading}
        >
          <Text style={styles.linkText}>Recover Account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => navigation.navigate('PairDevice')}
          disabled={loading}
        >
          <Text style={styles.linkText}>Pair to Existing Account</Text>
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
    fontSize: 40,
    fontWeight: '700',
    color: colors.brandPrimary,
    marginBottom: 8,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 48,
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
    marginTop: 16,
  },
  linkText: {
    color: colors.teal,
    fontSize: 14,
  },
});

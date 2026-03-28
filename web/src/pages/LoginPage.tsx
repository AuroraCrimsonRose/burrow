import { useState } from 'react';
import { bytesToBase64url, base64urlToBytes, sign, hexToBytes } from '../crypto';
import * as api from '../api';
import { setSession, useStore } from '../store';

export default function LoginPage({ onDone }: { onDone: () => void }) {
  const { keys } = useStore();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const supportsPasskeys = !!window.PublicKeyCredential;

  async function handlePasskeyLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setError('');

    try {
      const beginResult = await api.webauthnLoginBegin(username.trim());
      const opts = beginResult.options;

      const credential = (await navigator.credentials.get({
        publicKey: {
          challenge: base64urlToBytes(opts.challenge),
          rpId: opts.rpId,
          allowCredentials: (opts.allowCredentials || []).map(
            (c: { id: string; type: string }) => ({
              type: c.type,
              id: base64urlToBytes(c.id),
            }),
          ),
          userVerification: opts.userVerification,
          timeout: opts.timeout,
        },
      })) as PublicKeyCredential | null;

      if (!credential) {
        setError('Passkey authentication was cancelled');
        return;
      }

      const assertionResponse = credential.response as AuthenticatorAssertionResponse;

      const result = await api.webauthnLoginComplete({
        challenge_id: beginResult.challenge_id,
        credential: {
          id: credential.id,
          rawId: bytesToBase64url(new Uint8Array(credential.rawId)),
          type: credential.type,
          response: {
            clientDataJSON: bytesToBase64url(new Uint8Array(assertionResponse.clientDataJSON)),
            authenticatorData: bytesToBase64url(
              new Uint8Array(assertionResponse.authenticatorData),
            ),
            signature: bytesToBase64url(new Uint8Array(assertionResponse.signature)),
          },
        },
      });

      setSession(result.session_token, result.user);
      onDone();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleLegacyLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !keys) return;
    setLoading(true);
    setError('');

    try {
      const challenge = await api.createChallenge(username.trim());
      const nonceBytes = hexToBytes(challenge.nonce);
      const signature = await sign(nonceBytes, keys.privateKey);

      const result = await api.verifyChallenge({
        challenge_id: challenge.challenge_id,
        signature,
        public_key: keys.publicKey,
      });

      setSession(result.session_token, result.user);
      onDone();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <h1>burrow</h1>
      <h2>Sign In</h2>
      <form onSubmit={handlePasskeyLogin}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          disabled={loading}
          autoFocus
        />
        <button type="submit" disabled={loading || !supportsPasskeys}>
          {loading ? 'Signing in...' : 'Sign In with Passkey'}
        </button>
      </form>
      {keys && (
        <button
          className="auth-secondary"
          onClick={handleLegacyLogin}
          disabled={loading || !username.trim()}
          style={{ marginTop: '0.5rem', width: '100%', maxWidth: '340px' }}
        >
          Sign In with Saved Keys
        </button>
      )}
      {error && <p className="error">{error}</p>}
      <p className="switch-link">
        Need an account?{' '}
        <a href="/register">Create one</a>
      </p>
      <p className="switch-link">
        Lost access?{' '}
        <a href="/recover">Recover with phrase</a>
      </p>
    </div>
  );
}

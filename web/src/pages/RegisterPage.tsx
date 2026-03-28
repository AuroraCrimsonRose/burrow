import { useState } from 'react';
import { solvePoW, bytesToBase64url, base64urlToBytes, generateKeyPair, getDeviceFingerprint } from '../crypto';
import * as api from '../api';
import { setSession, setKeys } from '../store';

export default function RegisterPage({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string | null>(null);
  const [passkeyFailed, setPasskeyFailed] = useState(false);
  const [ageVerified, setAgeVerified] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const supportsPasskeys = !!window.PublicKeyCredential;
  const gatesOk = ageVerified && tosAccepted && privacyAccepted;

  async function handlePasskeyRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !gatesOk) return;
    setLoading(true);
    setError('');

    try {
      setStatus('Starting registration...');
      const beginResult = await api.webauthnRegisterBegin({
        username: username.trim(),
        age_verified: true,
        tos_accepted: true,
        privacy_accepted: true,
      });

      const challengeId = beginResult.challenge_id;
      const opts = beginResult.options;
      const challengeHex = beginResult.challenge_hex;

      setStatus('Creating passkey & solving proof-of-work...');

      const credentialPromise = navigator.credentials.create({
        publicKey: {
          challenge: base64urlToBytes(opts.challenge),
          rp: opts.rp,
          user: {
            id: base64urlToBytes(opts.user.id),
            name: opts.user.name,
            displayName: opts.user.displayName,
          },
          pubKeyCredParams: opts.pubKeyCredParams,
          authenticatorSelection: opts.authenticatorSelection,
          attestation: opts.attestation,
          timeout: opts.timeout,
        },
      });

      const powPromise = solvePoW(challengeHex);

      const [credential, powNonce] = await Promise.all([
        credentialPromise as Promise<PublicKeyCredential>,
        powPromise,
      ]);

      if (!credential) {
        setPasskeyFailed(true);
        setError('Passkey creation was cancelled.');
        return;
      }

      setStatus('Completing registration...');
      const attestationResponse = credential.response as AuthenticatorAttestationResponse;

      const result = await api.webauthnRegisterComplete({
        challenge_id: challengeId,
        pow_nonce: powNonce,
        credential: {
          id: credential.id,
          rawId: bytesToBase64url(new Uint8Array(credential.rawId)),
          type: credential.type,
          response: {
            clientDataJSON: bytesToBase64url(new Uint8Array(attestationResponse.clientDataJSON)),
            attestationObject: bytesToBase64url(new Uint8Array(attestationResponse.attestationObject)),
          },
        },
        device_label: navigator.userAgent.slice(0, 64),
        age_verified: true,
        tos_accepted: true,
        privacy_accepted: true,
      });

      setSession(result.session_token, result.user);
      setRecoveryPhrase(result.recovery_phrase);
    } catch (err: any) {
      setPasskeyFailed(true);
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
      setStatus('');
    }
  }

  async function handleLegacyRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !gatesOk) return;
    setLoading(true);
    setError('');

    try {
      setStatus('Generating keys & solving proof-of-work...');
      const keys = await generateKeyPair();
      const [nonce, fingerprint] = await Promise.all([
        solvePoW(keys.publicKey),
        getDeviceFingerprint(),
      ]);

      setStatus('Registering...');
      const result = await api.register({
        public_key: keys.publicKey,
        nonce,
        username: username.trim(),
        device_fingerprint_hash: fingerprint,
        device_label: navigator.userAgent.slice(0, 64),
      });

      setKeys(keys);
      setSession(result.session_token, result.user);
      onDone();
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
      setStatus('');
    }
  }

  // Recovery phrase acknowledgement screen
  if (recoveryPhrase) {
    return (
      <div className="auth-page">
        <h1>burrow</h1>
        <h2>Save Your Recovery Phrase</h2>
        <p className="warning" style={{ textAlign: 'left', marginBottom: '1rem' }}>
          Write down these 24 words and keep them safe. This is the <strong>only way</strong> to
          recover your account if you lose access to your passkey.
        </p>
        <div
          style={{
            background: 'var(--violet-muted)',
            border: '1px solid var(--violet)',
            borderRadius: 'var(--radius-lg)',
            padding: '1rem',
            fontFamily: 'monospace',
            fontSize: '0.95rem',
            lineHeight: '1.8',
            wordBreak: 'break-word',
            userSelect: 'all',
            marginBottom: '1rem',
            color: 'var(--text-heading)',
          }}
        >
          {recoveryPhrase}
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          This phrase will <strong>never</strong> be shown again.
        </p>
        <button onClick={onDone} style={{ marginTop: '1rem' }}>
          I've saved my recovery phrase
        </button>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <h1>burrow</h1>
      <h2>Create Account</h2>
      <form onSubmit={supportsPasskeys && !passkeyFailed ? handlePasskeyRegister : handleLegacyRegister}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          minLength={2}
          maxLength={32}
          pattern="^[a-zA-Z0-9_]+$"
          required
          disabled={loading}
          autoFocus
        />
        <label className="auth-checkbox">
          <input
            type="checkbox"
            checked={ageVerified}
            onChange={(e) => setAgeVerified(e.target.checked)}
            disabled={loading}
          />
          I confirm I am 13 years of age or older
        </label>
        <label className="auth-checkbox">
          <input
            type="checkbox"
            checked={tosAccepted}
            onChange={(e) => setTosAccepted(e.target.checked)}
            disabled={loading}
          />
          I accept the Terms of Service
        </label>
        <label className="auth-checkbox">
          <input
            type="checkbox"
            checked={privacyAccepted}
            onChange={(e) => setPrivacyAccepted(e.target.checked)}
            disabled={loading}
          />
          I accept the Privacy Policy
        </label>
        <button type="submit" disabled={loading || !gatesOk}>
          {loading ? status : supportsPasskeys && !passkeyFailed ? 'Create Account with Passkey' : 'Create Account'}
        </button>
      </form>
      {!gatesOk && username.trim() && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
          All checkboxes must be checked to create an account
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {supportsPasskeys && passkeyFailed && (
        <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
          No passkey support?{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setPasskeyFailed(false);
              setError('');
            }}
          >
            Try again
          </a>{' '}or{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              if (!username.trim()) return;
              handleLegacyRegister(e as unknown as React.FormEvent);
            }}
          >
            create with a browser key
          </a>.
        </p>
      )}
      <p className="switch-link">
        Already have an account?{' '}
        <a href="/login">Sign in</a>
      </p>
    </div>
  );
}

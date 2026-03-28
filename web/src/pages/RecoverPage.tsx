import { useState } from 'react';
import { generateKeyPair, getDeviceFingerprint } from '../crypto';
import * as api from '../api';
import { setSession, setKeys } from '../store';

export default function RecoverPage({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !mnemonic.trim()) return;
    setLoading(true);
    setError('');

    try {
      setStatus('Generating new device keys...');
      const [keys, fingerprint] = await Promise.all([
        generateKeyPair(),
        getDeviceFingerprint(),
      ]);

      setStatus('Recovering account...');
      const result = await api.recoverAccount({
        username: username.trim(),
        mnemonic: mnemonic.trim(),
        public_key: keys.publicKey,
        device_fingerprint_hash: fingerprint,
        device_label: navigator.userAgent.slice(0, 64),
      });

      setKeys(keys);
      setSession(result.session_token, result.user);
      onDone();
    } catch (err: any) {
      setError(err.message || 'Recovery failed');
    } finally {
      setLoading(false);
      setStatus('');
    }
  }

  return (
    <div className="auth-page">
      <h1>burrow</h1>
      <h2>Recover Account</h2>
      <p className="auth-subtitle">
        Enter your username and 24-word recovery phrase to sign in on this device.
      </p>
      <form onSubmit={handleRecover}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          disabled={loading}
          autoFocus
        />
        <textarea
          placeholder="Enter your 24-word recovery phrase..."
          value={mnemonic}
          onChange={(e) => setMnemonic(e.target.value)}
          required
          disabled={loading}
          rows={3}
        />
        <button type="submit" disabled={loading}>
          {loading ? status : 'Recover Account'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <p className="switch-link">
        <a href="/login">Back to sign in</a>
      </p>
    </div>
  );
}

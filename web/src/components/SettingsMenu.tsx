import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import { useAnimations, setAnimationsEnabled, useAnimatedEmojis, setAnimatedEmojis, useCustomCSS, setCustomCSS, updateUser, useThemes, useActiveTheme, setActiveTheme, addTheme, removeTheme, exportTheme, importTheme, DEFAULT_THEME, DEFAULT_VARIABLES, VARIABLE_GROUPS, type BurrowTheme } from '../store';
import * as api from '../api';
import { bytesToBase64url, base64urlToBytes } from '../crypto';
import { getAudioPrefs, setAudioPrefs, enumerateAudioDevices, applyOutputDevice, type AudioDevice, type AudioPrefs } from '../voiceEngine';

type SettingsTab = 'account' | 'appearance' | 'voice' | 'video' | 'privacy' | 'notifications' | 'keybinds' | 'sessions' | 'dev' | 'platform-dev';

interface SettingsMenuProps {
  user: { id: string; username: string; trust_tier?: number; is_dev?: boolean } | null;
  onClose: () => void;
  onLogout: () => void;
  heatmapDebug: boolean;
  onHeatmapDebugChange: (v: boolean) => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const TABS: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: 'account', label: 'Account', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> },
  { id: 'appearance', label: 'Appearance', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="2.5" /><path d="M17.08 10.96A7 7 0 116 12" /><path d="M12 2v4M2 12h4M20 12h2M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83" /></svg> },
  { id: 'voice', label: 'Voice', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg> },
  { id: 'video', label: 'Video', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg> },
  { id: 'notifications', label: 'Notifications', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg> },
  { id: 'privacy', label: 'Privacy', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg> },
  { id: 'keybinds', label: 'Keybinds', icon: <Icon d="M20 5H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V7a2 2 0 00-2-2zM6 10h1M10 10h1M14 10h1M18 10h1M8 14h8" /> },
  { id: 'sessions', label: 'Sessions', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg> },
];

export default function SettingsMenu({ user, onClose, onLogout, heatmapDebug, onHeatmapDebugChange }: SettingsMenuProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const isDev = user?.is_dev === true;
  const animationsEnabled = useAnimations();
  const animatedEmojisEnabled = useAnimatedEmojis();
  const customCSS = useCustomCSS();
  const [cssEditorOpen, setCssEditorOpen] = useState(false);
  const [cssDraft, setCssDraft] = useState(customCSS);
  const [profileBio, setProfileBio] = useState('');
  const [profilePronouns, setProfilePronouns] = useState('');
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [friendsOnlyDms, setFriendsOnlyDms] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Recovery phrase state
  const [recoveryStep, setRecoveryStep] = useState<'idle' | 'display' | 'confirm' | 'done'>('idle');
  const [recoveryMnemonic, setRecoveryMnemonic] = useState('');
  const [recoveryConfirmInput, setRecoveryConfirmInput] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  // Passkey management state
  const [passkeyPanel, setPasskeyPanel] = useState(false);
  const [passkeys, setPasskeys] = useState<{ id: string; label: string | null; created_at: string; last_used_at: string | null }[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [passkeyAdding, setPasskeyAdding] = useState(false);
  const [passkeyRenamingId, setPasskeyRenamingId] = useState<string | null>(null);
  const [passkeyRenameDraft, setPasskeyRenameDraft] = useState('');
  const [passkeyError, setPasskeyError] = useState('');
  const [passkeyDeleteConfirm, setPasskeyDeleteConfirm] = useState<string | null>(null);

  // Device pairing state
  const [pairingCode, setPairingCode] = useState('');
  const [pairingToken, setPairingToken] = useState('');
  const [pairingId, setPairingId] = useState('');
  const [pairingExpiresAt, setPairingExpiresAt] = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingStatus, setPairingStatus] = useState<'idle' | 'active' | 'claimed' | 'expired'>('idle');
  const [pairingError, setPairingError] = useState('');

  // Audio device state
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [audioPrefs, setAudioPrefsLocal] = useState<AudioPrefs>(getAudioPrefs);
  const [micTestLevel, setMicTestLevel] = useState(0);
  const [micTesting, setMicTesting] = useState(false);
  const micTestRef = useRef<{ stream: MediaStream; ctx: AudioContext; interval: ReturnType<typeof setInterval> } | null>(null);

  const updateAudioPref = useCallback((update: Partial<AudioPrefs>) => {
    setAudioPrefsLocal((prev) => {
      const next = { ...prev, ...update };
      setAudioPrefs(next);
      return next;
    });
  }, []);

  // Theme state
  const themes = useThemes();
  const activeTheme = useActiveTheme();
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<BurrowTheme | null>(null);
  const [themeImportError, setThemeImportError] = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    if (activeTab === 'account') {
      api.getProfile().then((res) => {
        setProfileBio(res.bio || '');
        setProfilePronouns(res.pronouns || '');
        setProfileDisplayName(res.display_name || '');
      }).catch(() => {});
    }
    if (activeTab === 'privacy') {
      api.getProfile().then((res) => {
        setFriendsOnlyDms(res.friends_only_dms ?? false);
      }).catch(() => {});
    }
    if (activeTab === 'sessions') {
      setSessionsLoading(true);
      api.listSessions().then((res) => {
        setSessions(res.sessions || []);
      }).catch(() => {}).finally(() => setSessionsLoading(false));
    }
  }, [activeTab]);

  async function loadPasskeys() {
    setPasskeysLoading(true);
    try {
      const res = await api.listPasskeys();
      setPasskeys(res.passkeys || []);
    } catch { /* ignore */ } finally {
      setPasskeysLoading(false);
    }
  }

  useEffect(() => {
    if (passkeyPanel) loadPasskeys();
  }, [passkeyPanel]);

  // Poll pairing status when active
  useEffect(() => {
    if (pairingStatus !== 'active' || !pairingId) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.getPairingStatus(pairingId);
        if (res.status === 'claimed') {
          setPairingStatus('claimed');
        } else if (res.status === 'expired') {
          setPairingStatus('expired');
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [pairingStatus, pairingId]);

  async function generatePairingCode() {
    setPairingLoading(true);
    setPairingError('');
    try {
      const res = await api.createPairingCode();
      setPairingCode(res.code);
      setPairingToken(res.token);
      setPairingId(res.pairing_id);
      setPairingExpiresAt(res.expires_at);
      setPairingStatus('active');
    } catch (err: any) {
      setPairingError(err.message || 'Failed to generate pairing code');
    } finally {
      setPairingLoading(false);
    }
  }

  return (
    <div className="settings-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="settings-panel">
        <div className="settings-sidebar">
          <h2>Settings</h2>
          <nav className="settings-nav" onKeyDown={(e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            const btns = Array.from((e.currentTarget as HTMLElement).querySelectorAll('button.settings-tab')) as HTMLElement[];
            const idx = btns.indexOf(e.target as HTMLElement);
            if (idx < 0) return;
            const next = e.key === 'ArrowDown' ? (idx + 1) % btns.length : (idx - 1 + btns.length) % btns.length;
            btns[next]?.focus();
          }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="settings-tab-icon">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
            {isDev && (
              <>
                <div className="settings-nav-divider" />
                <button
                  className={`settings-tab ${activeTab === 'platform-dev' ? 'active' : ''}`}
                  onClick={() => setActiveTab('platform-dev')}
                >
                  <span className="settings-tab-icon"><Icon d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></span>
                  Platform Dev
                </button>
              </>
            )}
            <div className="settings-nav-divider" />
            <button
              className={`settings-tab ${activeTab === 'dev' ? 'active' : ''}`}
              onClick={() => setActiveTab('dev')}
            >
              <span className="settings-tab-icon"><Icon d="M7 8l-4 4 4 4M17 8l4 4-4 4M14 4l-4 16" /></span>
              Dev
            </button>
          </nav>
          <div className="settings-sidebar-footer">
            <button className="btn-danger settings-logout-btn" onClick={onLogout}>
              Log Out
            </button>
          </div>
        </div>

        <div className="settings-content">
          <div className="settings-content-header">
            <h3>{TABS.find((t) => t.id === activeTab)?.label || (activeTab === 'dev' ? 'Dev' : activeTab === 'platform-dev' ? 'Platform Dev' : '')}</h3>
            <button className="settings-close" onClick={onClose} title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="settings-content-body">
            {activeTab === 'account' && (
              <>
                <div className="settings-card">
                  <div className="settings-card-header">
                    <div className="settings-avatar">{user?.username?.charAt(0).toUpperCase()}</div>
                    <div>
                      <div className="settings-display-name">{user?.username}</div>
                      {user?.trust_tier !== undefined && (
                        <span className="settings-badge">Tier {user.trust_tier}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="settings-group">
                  <h4>Profile</h4>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>Username</label>
                      <span className="value">{user?.username}</span>
                    </div>
                    <button className="btn-ghost btn-sm">Edit</button>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>User ID</label>
                      <span className="value mono">{user?.id}</span>
                    </div>
                  </div>
                </div>

                <div className="settings-group">
                  <h4>Profile Customization</h4>
                  <div className="settings-row vertical">
                    <label>Display Name</label>
                    <input
                      className="settings-input"
                      value={profileDisplayName}
                      onChange={(e) => { setProfileDisplayName(e.target.value); setProfileSaved(false); }}
                      placeholder="How others see you"
                      maxLength={64}
                    />
                  </div>
                  <div className="settings-row vertical">
                    <label>Pronouns</label>
                    <input
                      className="settings-input"
                      value={profilePronouns}
                      onChange={(e) => { setProfilePronouns(e.target.value); setProfileSaved(false); }}
                      placeholder="e.g. they/them, she/her, he/him"
                      maxLength={50}
                    />
                  </div>
                  <div className="settings-row vertical">
                    <label>Bio</label>
                    <textarea
                      className="settings-textarea"
                      value={profileBio}
                      onChange={(e) => { setProfileBio(e.target.value); setProfileSaved(false); }}
                      placeholder="Tell others about yourself…"
                      maxLength={2000}
                      rows={4}
                    />
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      {profileSaved && <span className="value" style={{ color: 'var(--moss)' }}>Profile saved</span>}
                    </div>
                    <button
                      className="btn-primary btn-sm"
                      disabled={profileSaving}
                      onClick={async () => {
                        setProfileSaving(true);
                        try {
                          await api.updateProfile({
                            display_name: profileDisplayName,
                            pronouns: profilePronouns,
                            bio: profileBio,
                          });
                          setProfileSaved(true);
                        } catch (err) {
                          console.error('Failed to save profile:', err);
                        } finally {
                          setProfileSaving(false);
                        }
                      }}
                    >
                      {profileSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>

                <div className="settings-group">
                  <h4>Security</h4>

                  {/* ---- Passkeys ---- */}
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>Passkeys</label>
                      <span className="value">Manage your registered passkeys</span>
                    </div>
                    <button className="btn-ghost btn-sm" onClick={() => { setPasskeyPanel(!passkeyPanel); setPasskeyError(''); }}>
                      {passkeyPanel ? 'Close' : 'Manage'}
                    </button>
                  </div>

                  {passkeyPanel && (
                    <div className="passkey-panel">
                      {passkeyError && <div className="settings-error">{passkeyError}</div>}
                      {passkeysLoading ? (
                        <div className="settings-loading">Loading passkeys…</div>
                      ) : passkeys.length === 0 ? (
                        <div className="settings-empty">No passkeys registered.</div>
                      ) : (
                        <div className="passkey-list">
                          {passkeys.map((pk) => (
                            <div key={pk.id} className="passkey-item">
                              {passkeyRenamingId === pk.id ? (
                                <div className="passkey-rename-row">
                                  <input
                                    className="input-sm"
                                    value={passkeyRenameDraft}
                                    onChange={(e) => setPasskeyRenameDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        api.renamePasskey(pk.id, passkeyRenameDraft).then(() => {
                                          setPasskeyRenamingId(null);
                                          loadPasskeys();
                                        }).catch(() => setPasskeyError('Failed to rename'));
                                      }
                                      if (e.key === 'Escape') setPasskeyRenamingId(null);
                                    }}
                                    autoFocus
                                  />
                                  <button className="btn-ghost btn-xs" onClick={() => {
                                    api.renamePasskey(pk.id, passkeyRenameDraft).then(() => {
                                      setPasskeyRenamingId(null);
                                      loadPasskeys();
                                    }).catch(() => setPasskeyError('Failed to rename'));
                                  }}>Save</button>
                                  <button className="btn-ghost btn-xs" onClick={() => setPasskeyRenamingId(null)}>Cancel</button>
                                </div>
                              ) : (
                                <>
                                  <div className="passkey-info">
                                    <span className="passkey-label">{pk.label || 'Unnamed passkey'}</span>
                                    <span className="passkey-meta">
                                      Added {new Date(pk.created_at).toLocaleDateString()}
                                      {pk.last_used_at && ` · Last used ${timeAgo(pk.last_used_at)}`}
                                    </span>
                                  </div>
                                  <div className="passkey-actions">
                                    <button className="btn-ghost btn-xs" onClick={() => {
                                      setPasskeyRenamingId(pk.id);
                                      setPasskeyRenameDraft(pk.label || '');
                                    }}>Rename</button>
                                    {passkeyDeleteConfirm === pk.id ? (
                                      <>
                                        <button className="btn-danger btn-xs" onClick={() => {
                                          api.revokePasskey(pk.id).then(() => {
                                            setPasskeyDeleteConfirm(null);
                                            loadPasskeys();
                                          }).catch(() => setPasskeyError('Failed to revoke'));
                                        }}>Confirm</button>
                                        <button className="btn-ghost btn-xs" onClick={() => setPasskeyDeleteConfirm(null)}>Cancel</button>
                                      </>
                                    ) : (
                                      <button className="btn-danger-ghost btn-xs" onClick={() => setPasskeyDeleteConfirm(pk.id)}>Revoke</button>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <button
                        className="btn-primary btn-sm passkey-add-btn"
                        disabled={passkeyAdding}
                        onClick={async () => {
                          setPasskeyAdding(true);
                          setPasskeyError('');
                          try {
                            const begin = await api.passkeyAddBegin();
                            const opts = begin.options;
                            const credential = await navigator.credentials.create({
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
                            }) as PublicKeyCredential | null;

                            if (!credential) {
                              setPasskeyError('Passkey creation was cancelled.');
                              return;
                            }

                            const attestResp = credential.response as AuthenticatorAttestationResponse;
                            await api.passkeyAddComplete({
                              challenge_id: begin.challenge_id,
                              credential: {
                                id: credential.id,
                                rawId: bytesToBase64url(new Uint8Array(credential.rawId)),
                                type: credential.type,
                                response: {
                                  clientDataJSON: bytesToBase64url(new Uint8Array(attestResp.clientDataJSON)),
                                  attestationObject: bytesToBase64url(new Uint8Array(attestResp.attestationObject)),
                                },
                              },
                              label: navigator.userAgent.slice(0, 64),
                            });

                            loadPasskeys();
                          } catch (err: any) {
                            setPasskeyError(err.message || 'Failed to add passkey');
                          } finally {
                            setPasskeyAdding(false);
                          }
                        }}
                      >
                        {passkeyAdding ? 'Adding…' : '+ Add Passkey'}
                      </button>
                    </div>
                  )}

                  {/* ---- Recovery Phrase ---- */}
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>Recovery Phrase</label>
                      <span className="value">
                        {recoveryStep === 'done' ? 'Recovery phrase confirmed!' : 'Generate a new recovery phrase'}
                      </span>
                    </div>
                    {recoveryStep === 'idle' && (
                      <button
                        className="btn-ghost btn-sm"
                        disabled={recoveryLoading}
                        onClick={async () => {
                          setRecoveryLoading(true);
                          setRecoveryError('');
                          try {
                            const res = await api.generateRecoveryKey();
                            setRecoveryMnemonic(res.mnemonic);
                            setRecoveryStep('display');
                          } catch (err: any) {
                            setRecoveryError(err.message || 'Failed to generate');
                          } finally {
                            setRecoveryLoading(false);
                          }
                        }}
                      >
                        {recoveryLoading ? 'Generating…' : 'Regenerate'}
                      </button>
                    )}
                    {recoveryStep === 'done' && (
                      <button className="btn-ghost btn-sm" onClick={() => setRecoveryStep('idle')}>Done</button>
                    )}
                  </div>

                  {recoveryError && <div className="settings-error">{recoveryError}</div>}

                  {recoveryStep === 'display' && (
                    <div className="recovery-panel">
                      <p className="recovery-warning">
                        Save this 24-word recovery phrase securely. It will <strong>NOT</strong> be shown again.
                      </p>
                      <div className="recovery-words">
                        {recoveryMnemonic.split(' ').map((word, i) => (
                          <span key={i} className="recovery-word">
                            <span className="recovery-word-num">{i + 1}</span>
                            {word}
                          </span>
                        ))}
                      </div>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => {
                          setRecoveryConfirmInput('');
                          setRecoveryStep('confirm');
                        }}
                      >
                        I've saved it — continue
                      </button>
                    </div>
                  )}

                  {recoveryStep === 'confirm' && (
                    <div className="recovery-panel">
                      <p className="recovery-confirm-label">
                        Type your full 24-word recovery phrase to confirm:
                      </p>
                      <textarea
                        className="recovery-confirm-input"
                        rows={3}
                        value={recoveryConfirmInput}
                        onChange={(e) => setRecoveryConfirmInput(e.target.value)}
                        placeholder="word1 word2 word3 …"
                      />
                      <button
                        className="btn-primary btn-sm"
                        disabled={recoveryLoading || !recoveryConfirmInput.trim()}
                        onClick={async () => {
                          setRecoveryLoading(true);
                          setRecoveryError('');
                          try {
                            await api.confirmRecoveryKey(recoveryConfirmInput.trim());
                            setRecoveryStep('done');
                            setRecoveryMnemonic('');
                          } catch (err: any) {
                            setRecoveryError(err.message || 'Confirmation failed — check your phrase');
                          } finally {
                            setRecoveryLoading(false);
                          }
                        }}
                      >
                        {recoveryLoading ? 'Verifying…' : 'Confirm'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="settings-group">
                  <h4>Pair a Device</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 12px' }}>
                    Link a new device (phone, tablet, or another computer) to your account. Generate a pairing code, then enter it on the new device within 5 minutes.
                  </p>

                  {pairingStatus === 'idle' && (
                    <button
                      className="btn-primary btn-sm"
                      disabled={pairingLoading}
                      onClick={generatePairingCode}
                    >
                      {pairingLoading ? 'Generating…' : 'Generate Pairing Code'}
                    </button>
                  )}

                  {pairingError && <div className="settings-error">{pairingError}</div>}

                  {pairingStatus === 'active' && (
                    <div className="pairing-panel">
                      <div className="pairing-code-display">
                        <span className="pairing-code-label">Pairing Code</span>
                        <span className="pairing-code-value">{pairingCode}</span>
                      </div>
                      <div className="pairing-qr-section">
                        <span className="pairing-code-label">QR Token (for scanning)</span>
                        <div className="pairing-token-display">
                          <code className="pairing-token-value">{pairingToken}</code>
                          <button
                            className="btn-ghost btn-xs"
                            onClick={() => {
                              navigator.clipboard.writeText(pairingToken);
                            }}
                          >Copy</button>
                        </div>
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '8px 0 0' }}>
                        Expires {new Date(pairingExpiresAt).toLocaleTimeString()} · Waiting for new device…
                      </p>
                      <button
                        className="btn-ghost btn-sm"
                        style={{ marginTop: '8px' }}
                        onClick={() => {
                          setPairingStatus('idle');
                          setPairingCode('');
                          setPairingToken('');
                          setPairingId('');
                        }}
                      >Cancel</button>
                    </div>
                  )}

                  {pairingStatus === 'claimed' && (
                    <div className="pairing-panel">
                      <div className="pairing-success">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--moss, #a3d9a5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                        <span>Device paired successfully!</span>
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '8px 0 0' }}>
                        You can now add a passkey on the paired device for quick login, or skip this step.
                      </p>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                        <button
                          className="btn-primary btn-sm"
                          disabled={passkeyAdding}
                          onClick={async () => {
                            setPasskeyAdding(true);
                            setPasskeyError('');
                            try {
                              const begin = await api.passkeyAddBegin();
                              const opts = begin.options;
                              const credential = await navigator.credentials.create({
                                publicKey: {
                                  challenge: base64urlToBytes(opts.challenge),
                                  rp: opts.rp,
                                  user: {
                                    id: base64urlToBytes(opts.user.id),
                                    name: opts.user.name,
                                    displayName: opts.user.displayName,
                                  },
                                  pubKeyCredParams: opts.pubKeyCredParams,
                                  authenticatorSelection: {
                                    ...opts.authenticatorSelection,
                                    authenticatorAttachment: 'cross-platform',
                                  },
                                  attestation: opts.attestation,
                                  timeout: opts.timeout,
                                },
                              }) as PublicKeyCredential | null;

                              if (!credential) {
                                setPasskeyError('Passkey creation was cancelled.');
                                return;
                              }

                              const attestResp = credential.response as AuthenticatorAttestationResponse;
                              await api.passkeyAddComplete({
                                challenge_id: begin.challenge_id,
                                credential: {
                                  id: credential.id,
                                  rawId: bytesToBase64url(new Uint8Array(credential.rawId)),
                                  type: credential.type,
                                  response: {
                                    clientDataJSON: bytesToBase64url(new Uint8Array(attestResp.clientDataJSON)),
                                    attestationObject: bytesToBase64url(new Uint8Array(attestResp.attestationObject)),
                                  },
                                },
                                label: 'Paired mobile device',
                              });

                              loadPasskeys();
                              setPairingStatus('idle');
                            } catch (err: any) {
                              setPasskeyError(err.message || 'Failed to add passkey');
                            } finally {
                              setPasskeyAdding(false);
                            }
                          }}
                        >
                          {passkeyAdding ? 'Adding…' : 'Add Passkey on Device'}
                        </button>
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => setPairingStatus('idle')}
                        >Skip</button>
                      </div>
                      {passkeyError && <div className="settings-error" style={{ marginTop: '8px' }}>{passkeyError}</div>}
                    </div>
                  )}

                  {pairingStatus === 'expired' && (
                    <div className="pairing-panel">
                      <p style={{ color: 'var(--text-error, #ff6b6b)', fontSize: '13px' }}>
                        Pairing code expired. Generate a new one.
                      </p>
                      <button
                        className="btn-primary btn-sm"
                        style={{ marginTop: '8px' }}
                        onClick={() => {
                          setPairingStatus('idle');
                          generatePairingCode();
                        }}
                      >Generate New Code</button>
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'appearance' && (
              <>
                <div className="settings-group">
                  <h4>Themes</h4>
                  <div className="theme-list">
                    {/* Default theme */}
                    <button
                      className={`theme-card${activeTheme.id === DEFAULT_THEME.id ? ' active' : ''}`}
                      onClick={() => setActiveTheme(DEFAULT_THEME.id)}
                    >
                      <div className="theme-card-swatches">
                        {['--surface-bedrock', '--surface-cavern', '--amber', '--violet', '--moss', '--teal'].map((v) => (
                          <span key={v} className="theme-swatch" style={{ background: DEFAULT_VARIABLES[v] }} />
                        ))}
                      </div>
                      <div className="theme-card-info">
                        <span className="theme-card-name">{DEFAULT_THEME.name}</span>
                        <span className="theme-card-author">by {DEFAULT_THEME.author}</span>
                      </div>
                      {activeTheme.id === DEFAULT_THEME.id && <span className="theme-card-active">Active</span>}
                    </button>

                    {/* User themes */}
                    {themes.map((t) => (
                      <button
                        key={t.id}
                        className={`theme-card${activeTheme.id === t.id ? ' active' : ''}`}
                        onClick={() => setActiveTheme(t.id)}
                      >
                        <div className="theme-card-swatches">
                          {['--surface-bedrock', '--surface-cavern', '--amber', '--violet', '--moss', '--teal'].map((v) => (
                            <span key={v} className="theme-swatch" style={{ background: t.variables[v] || DEFAULT_VARIABLES[v] }} />
                          ))}
                        </div>
                        <div className="theme-card-info">
                          <span className="theme-card-name">{t.name}</span>
                          <span className="theme-card-author">by {t.author}</span>
                        </div>
                        <div className="theme-card-actions">
                          {activeTheme.id === t.id && <span className="theme-card-active">Active</span>}
                          <button className="btn-ghost btn-xs" title="Edit" onClick={(e) => { e.stopPropagation(); setEditingTheme({ ...t, variables: { ...DEFAULT_VARIABLES, ...t.variables } }); setThemeEditorOpen(true); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button className="btn-ghost btn-xs" title="Export" onClick={(e) => {
                            e.stopPropagation();
                            const blob = new Blob([exportTheme(t)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url; a.download = `${t.name.replace(/\s+/g, '-').toLowerCase()}.burrow-theme.json`;
                            a.click(); URL.revokeObjectURL(url);
                          }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          </button>
                          <button className="btn-ghost btn-xs btn-danger" title="Delete" onClick={(e) => { e.stopPropagation(); removeTheme(t.id); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                          </button>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="theme-actions-bar">
                    <button className="btn-primary btn-sm" onClick={() => {
                      setEditingTheme({
                        id: `theme-${Date.now()}`,
                        name: 'My Theme',
                        author: user?.username || 'Unknown',
                        variables: { ...DEFAULT_VARIABLES },
                      });
                      setThemeEditorOpen(true);
                    }}>New Theme</button>
                    <button className="btn-ghost btn-sm" onClick={() => importFileRef.current?.click()}>Import</button>
                    <input
                      ref={importFileRef}
                      type="file"
                      accept=".json,.burrow-theme.json"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          try {
                            const theme = importTheme(reader.result as string);
                            theme.id = `theme-${Date.now()}`;
                            addTheme(theme);
                            setThemeImportError('');
                          } catch (err: any) {
                            setThemeImportError(err.message || 'Invalid theme file');
                          }
                        };
                        reader.readAsText(file);
                        e.target.value = '';
                      }}
                    />
                  </div>
                  {themeImportError && <div className="theme-import-error">{themeImportError}</div>}
                </div>

                {/* Theme editor modal */}
                {themeEditorOpen && editingTheme && (
                  <div className="theme-editor-overlay" onClick={() => setThemeEditorOpen(false)}>
                    <div className="theme-editor-panel" onClick={(e) => e.stopPropagation()}>
                      <div className="theme-editor-header">
                        <h4>Theme Editor</h4>
                        <button className="btn-ghost btn-xs" onClick={() => setThemeEditorOpen(false)}>✕</button>
                      </div>
                      <div className="theme-editor-meta">
                        <div className="theme-editor-field">
                          <label>Name</label>
                          <input
                            className="settings-input"
                            value={editingTheme.name}
                            maxLength={64}
                            onChange={(e) => setEditingTheme({ ...editingTheme, name: e.target.value })}
                          />
                        </div>
                        <div className="theme-editor-field">
                          <label>Author</label>
                          <input
                            className="settings-input"
                            value={editingTheme.author}
                            maxLength={64}
                            onChange={(e) => setEditingTheme({ ...editingTheme, author: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="theme-editor-body">
                        {VARIABLE_GROUPS.map((group) => (
                          <div key={group.label} className="theme-editor-group">
                            <h5>{group.label}</h5>
                            <div className="theme-editor-vars">
                              {group.vars.map(({ key, label }) => (
                                <div key={key} className="theme-var-row">
                                  <label>{label}</label>
                                  <div className="theme-var-input">
                                    <input
                                      type="color"
                                      value={editingTheme.variables[key] || DEFAULT_VARIABLES[key] || '#000000'}
                                      onChange={(e) => setEditingTheme({ ...editingTheme, variables: { ...editingTheme.variables, [key]: e.target.value } })}
                                    />
                                    <input
                                      type="text"
                                      className="theme-var-hex"
                                      value={editingTheme.variables[key] || DEFAULT_VARIABLES[key] || ''}
                                      onChange={(e) => setEditingTheme({ ...editingTheme, variables: { ...editingTheme.variables, [key]: e.target.value } })}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        <div className="theme-editor-group">
                          <h5>Custom CSS</h5>
                          <textarea
                            className="css-editor-textarea"
                            value={editingTheme.customCSS || ''}
                            onChange={(e) => setEditingTheme({ ...editingTheme, customCSS: e.target.value })}
                            placeholder="/* Additional CSS overrides for this theme */&#10;.chat-bubble { border-radius: 16px; }"
                            spellCheck={false}
                            rows={6}
                          />
                        </div>
                      </div>
                      <div className="theme-editor-footer">
                        <button className="btn-ghost btn-sm" onClick={() => setEditingTheme({ ...editingTheme, variables: { ...DEFAULT_VARIABLES } })}>
                          Reset to Default
                        </button>
                        <div className="theme-editor-footer-right">
                          <button className="btn-ghost btn-sm" onClick={() => setThemeEditorOpen(false)}>Cancel</button>
                          <button className="btn-primary btn-sm" onClick={() => {
                            const trimmed = { ...editingTheme, variables: { ...editingTheme.variables } };
                            // Only store variables that differ from defaults
                            const sparse: Record<string, string> = {};
                            for (const [k, v] of Object.entries(trimmed.variables)) {
                              if (v !== DEFAULT_VARIABLES[k]) sparse[k] = v;
                            }
                            trimmed.variables = sparse;
                            addTheme(trimmed);
                            setActiveTheme(trimmed.id);
                            setThemeEditorOpen(false);
                          }}>Save &amp; Apply</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="settings-group">
                  <h4>Chat Display</h4>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>Message Density</label>
                      <span className="value">Cozy</span>
                    </div>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>Font Size</label>
                      <span className="value">16px</span>
                    </div>
                  </div>
                </div>

                <div className="settings-group">
                  <h4>Advanced</h4>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>Animations</label>
                      <span className="value">Smooth transitions and motion effects</span>
                    </div>
                    <button
                      className={`settings-toggle ${animationsEnabled ? 'active' : ''}`}
                      onClick={() => setAnimationsEnabled(!animationsEnabled)}
                      role="switch"
                      aria-checked={animationsEnabled}
                    >
                      <span className="settings-toggle-knob" />
                    </button>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>Animated Emojis</label>
                      <span className="value">Animate smiley face emojis (Noto Emoji)</span>
                    </div>
                    <button
                      className={`settings-toggle ${animatedEmojisEnabled ? 'active' : ''}`}
                      onClick={() => setAnimatedEmojis(!animatedEmojisEnabled)}
                      role="switch"
                      aria-checked={animatedEmojisEnabled}
                    >
                      <span className="settings-toggle-knob" />
                    </button>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>Custom CSS</label>
                      <span className="value">{customCSS ? 'Active — custom styles applied' : 'Inject your own styles (on top of theme)'}</span>
                    </div>
                    <button className="btn-ghost btn-sm" onClick={() => { setCssDraft(customCSS); setCssEditorOpen(true); }}>Edit</button>
                  </div>
                </div>

                {cssEditorOpen && (
                  <div className="css-editor-panel">
                    <div className="css-editor-header">
                      <h4>Custom CSS Editor</h4>
                      <span className="css-editor-hint">Changes apply in real-time. Override CSS variables or any class.</span>
                    </div>
                    <textarea
                      className="css-editor-textarea"
                      value={cssDraft}
                      onChange={(e) => setCssDraft(e.target.value)}
                      placeholder={`:root {\n  --surface-bedrock: #0a0a1a;\n  --amber: #ff6b6b;\n}\n\n/* Override any styles */\n.chat-bubble {\n  border-radius: 16px;\n}`}
                      spellCheck={false}
                    />
                    <div className="css-editor-actions">
                      <button className="btn-ghost btn-sm" onClick={() => { setCssDraft(''); setCustomCSS(''); }}>
                        Clear
                      </button>
                      <button className="btn-ghost btn-sm" onClick={() => setCssEditorOpen(false)}>
                        Cancel
                      </button>
                      <button className="btn-primary btn-sm" onClick={() => { setCustomCSS(cssDraft); setCssEditorOpen(false); }}>
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === 'voice' && (
              <VoiceSettingsTab
                audioDevices={audioDevices}
                setAudioDevices={setAudioDevices}
                audioPrefs={audioPrefs}
                updateAudioPref={updateAudioPref}
                micTestLevel={micTestLevel}
                setMicTestLevel={setMicTestLevel}
                micTesting={micTesting}
                setMicTesting={setMicTesting}
                micTestRef={micTestRef}
              />
            )}

            {activeTab === 'video' && (
              <div className="settings-group">
                <h4>Video Settings</h4>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label>Camera</label>
                    <span className="value">Default</span>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label>Video Quality</label>
                    <span className="value">Auto (720p)</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="settings-group">
                <h4>Notification Preferences</h4>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label>Desktop Notifications</label>
                    <span className="value">Enabled</span>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label>Notification Sound</label>
                    <span className="value">Default</span>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label>Message Previews</label>
                    <span className="value">Show content</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="settings-group">
                <h4>Direct Messages</h4>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label>Only allow DMs from friends</label>
                    <span className="value">When enabled, only people on your friends list can start a DM with you.</span>
                  </div>
                  <button
                    className={`settings-toggle${friendsOnlyDms ? ' active' : ''}`}
                    onClick={async () => {
                      const val = !friendsOnlyDms;
                      setFriendsOnlyDms(val);
                      try {
                        await api.updateProfile({ friends_only_dms: val });
                      } catch {
                        setFriendsOnlyDms(!val);
                      }
                    }}
                  >
                    <div className="settings-toggle-knob" />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'keybinds' && (
              <>
              <div className="settings-group">
                <h4>Navigation</h4>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label>Quick Switcher</label>
                  </div>
                  <kbd>Ctrl + K</kbd>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label>Settings</label>
                  </div>
                  <kbd>Ctrl + ,</kbd>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label>Close / Back</label>
                  </div>
                  <kbd>Escape</kbd>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label>Cycle Channels</label>
                  </div>
                  <kbd>← →</kbd>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label>Cycle Settings Tabs</label>
                  </div>
                  <kbd>↑ ↓</kbd>
                </div>
              </div>
              <div className="settings-group">
                <h4>Voice</h4>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label>Toggle Mute</label>
                  </div>
                  <kbd>Ctrl + Shift + M</kbd>
                </div>
                <div className="settings-row">
                  <div className="settings-row-info">
                    <label>Toggle Deafen</label>
                  </div>
                  <kbd>Ctrl + Shift + D</kbd>
                </div>
              </div>
              </>
            )}

            {activeTab === 'sessions' && (
              <div className="settings-group">
                <h4>Active Sessions</h4>
                {sessionsLoading ? (
                  <p style={{ color: 'var(--text-muted)' }}>Loading sessions…</p>
                ) : sessions.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)' }}>No active sessions found</p>
                ) : (
                  <>
                    {sessions.map((s) => (
                      <div key={s.id} className={`settings-session-card${s.current ? ' current' : ''}`}>
                        <div className="settings-session-info">
                          <span className="settings-session-label">
                            {s.browser || 'Unknown'} on {s.os || 'Unknown'}
                            {s.current && <span className="settings-session-current-badge">Current</span>}
                          </span>
                          <span className="settings-session-detail">
                            {s.device_type || 'desktop'}
                            {s.ip && ` · ${s.ip}`}
                            {s.city && s.country ? ` · ${s.city}, ${s.country}` : s.country ? ` · ${s.country}` : ''}
                          </span>
                          <span className="settings-session-detail">
                            First seen {s.first_active ? new Date(s.first_active).toLocaleDateString() : '—'}
                            {' · '}
                            Last active {s.last_active ? timeAgo(s.last_active) : '—'}
                          </span>
                        </div>
                        {s.current ? (
                          <span className="settings-session-status">Current</span>
                        ) : (
                          <button
                            className="btn-ghost btn-sm"
                            style={{ color: 'var(--text-error, #ff6b6b)', flexShrink: 0 }}
                            onClick={() => {
                              api.revokeSession(s.id).then(() => {
                                setSessions((prev) => prev.filter((x) => x.id !== s.id));
                              }).catch(console.error);
                            }}
                          >Revoke</button>
                        )}
                      </div>
                    ))}
                    {sessions.filter((s) => !s.current).length > 0 && (
                      <button
                        className="btn-ghost"
                        style={{ color: 'var(--text-error, #ff6b6b)', marginTop: '8px', width: '100%' }}
                        onClick={() => {
                          if (confirm('Revoke all other sessions? You will remain logged in on this device only.')) {
                            api.revokeOtherSessions().then(() => {
                              setSessions((prev) => prev.filter((s) => s.current));
                            }).catch(console.error);
                          }
                        }}
                      >Revoke All Other Sessions</button>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'dev' && (
              <>
                <div className="settings-group">
                  <h4>Topology Debug</h4>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>Heat Map Debug</label>
                      <span className="value">Use static data to test heat map rings</span>
                    </div>
                    <button
                      className={`settings-toggle ${heatmapDebug ? 'active' : ''}`}
                      onClick={() => onHeatmapDebugChange(!heatmapDebug)}
                      role="switch"
                      aria-checked={heatmapDebug}
                    >
                      <span className="settings-toggle-knob" />
                    </button>
                  </div>
                </div>
                <div className="settings-group">
                  <h4>Client State</h4>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>Refresh User State</label>
                      <span className="value">Re-fetch user data from backend (flags, trust tier, etc.)</span>
                    </div>
                    <button className="btn-ghost btn-sm" onClick={async () => {
                      try {
                        const res = await api.getMe();
                        updateUser(res.user);
                      } catch (err) {
                        console.error('Failed to refresh user state:', err);
                      }
                    }}>Refresh</button>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'platform-dev' && isDev && (
              <>
                <div className="settings-group">
                  <h4>Badge Catalog</h4>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>All Platform Badges</label>
                      <span className="value">View badge IDs for granting/revoking</span>
                    </div>
                    <button className="btn-primary btn-sm" onClick={async () => {
                      try {
                        const res = await api.listBadges();
                        const badges = res.badges || res;
                        const el = document.getElementById('badge-catalog-list');
                        if (el) el.style.display = el.style.display === 'none' ? 'block' : 'block';
                        const container = document.getElementById('badge-catalog-data');
                        if (container) {
                          container.innerHTML = badges.map((b: any) =>
                            `<tr>
                              <td style="padding:4px 12px 4px 0;font-family:monospace;color:var(--text-muted)">${b.id}</td>
                              <td style="padding:4px 12px 4px 0;font-weight:600;color:${b.color || 'var(--text-primary)'}">${b.name}</td>
                              <td style="padding:4px 12px 4px 0;color:var(--text-muted)">${b.icon}</td>
                              <td style="padding:4px 12px 4px 0;text-transform:capitalize;color:var(--text-secondary)">${b.rarity}</td>
                              <td style="padding:4px 0;color:var(--text-muted);font-size:0.85em">${b.description || '—'}</td>
                            </tr>`
                          ).join('');
                        }
                      } catch (e: any) { alert(e.message); }
                    }}>Load Badges</button>
                  </div>
                  <div id="badge-catalog-list" style={{ display: 'none', marginTop: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                          <th style={{ padding: '4px 12px 4px 0', color: 'var(--text-muted)', fontWeight: 500 }}>ID</th>
                          <th style={{ padding: '4px 12px 4px 0', color: 'var(--text-muted)', fontWeight: 500 }}>Name</th>
                          <th style={{ padding: '4px 12px 4px 0', color: 'var(--text-muted)', fontWeight: 500 }}>Icon</th>
                          <th style={{ padding: '4px 12px 4px 0', color: 'var(--text-muted)', fontWeight: 500 }}>Rarity</th>
                          <th style={{ padding: '4px 0', color: 'var(--text-muted)', fontWeight: 500 }}>Description</th>
                        </tr>
                      </thead>
                      <tbody id="badge-catalog-data"></tbody>
                    </table>
                  </div>
                </div>
                <div className="settings-group">
                  <h4>Badge Management</h4>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>Grant Badge</label>
                      <span className="value">Award a badge to a user by ID</span>
                    </div>
                  </div>
                  <div className="settings-row" style={{ gap: '8px' }}>
                    <input className="settings-input" placeholder="User ID" id="grant-user-id" style={{ flex: 1 }} />
                    <input className="settings-input" placeholder="Badge ID" id="grant-badge-id" style={{ width: '80px' }} />
                    <button className="btn-primary btn-sm" onClick={async () => {
                      const uid = (document.getElementById('grant-user-id') as HTMLInputElement)?.value;
                      const bid = (document.getElementById('grant-badge-id') as HTMLInputElement)?.value;
                      if (!uid || !bid) return;
                      try { await api.grantBadge(uid, Number(bid)); alert('Badge granted'); } catch (e: any) { alert(e.message); }
                    }}>Grant</button>
                  </div>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>Revoke Badge</label>
                      <span className="value">Remove a badge from a user</span>
                    </div>
                  </div>
                  <div className="settings-row" style={{ gap: '8px' }}>
                    <input className="settings-input" placeholder="User ID" id="revoke-user-id" style={{ flex: 1 }} />
                    <input className="settings-input" placeholder="Badge ID" id="revoke-badge-id" style={{ width: '80px' }} />
                    <button className="btn-danger btn-sm" onClick={async () => {
                      const uid = (document.getElementById('revoke-user-id') as HTMLInputElement)?.value;
                      const bid = (document.getElementById('revoke-badge-id') as HTMLInputElement)?.value;
                      if (!uid || !bid) return;
                      try { await api.revokeBadge(uid, Number(bid)); alert('Badge revoked'); } catch (e: any) { alert(e.message); }
                    }}>Revoke</button>
                  </div>
                </div>
                <div className="settings-group">
                  <h4>Platform Release</h4>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>Ancient Badge Distribution</label>
                      <span className="value">Grant the Ancient badge to all accounts created before launch</span>
                    </div>
                    <button className="btn-danger btn-sm" onClick={async () => {
                      if (!confirm('This will grant the Ancient badge to ALL existing users. Proceed?')) return;
                      try {
                        const res = await api.releaseAncientBadges();
                        alert(`Ancient badge granted to ${res.count} user(s).`);
                      } catch (e: any) { alert(e.message); }
                    }}>Release Ancient Badges</button>
                  </div>
                </div>
                <div className="settings-group">
                  <h4>Trust Management</h4>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>Set Trust Tier</label>
                      <span className="value">Override a user's trust tier (0=New, 1=Verified, 2=Trusted, 3=Established, 4=Veteran, 5=Dev)</span>
                    </div>
                  </div>
                  <div className="settings-row" style={{ gap: '8px' }}>
                    <input className="settings-input" placeholder="User ID" id="set-trust-user-id" style={{ flex: 1 }} />
                    <select className="settings-input" id="set-trust-tier" style={{ width: '150px' }}>
                      <option value="0">0 — New</option>
                      <option value="1">1 — Verified</option>
                      <option value="2">2 — Trusted</option>
                      <option value="3">3 — Established</option>
                      <option value="4">4 — Veteran</option>
                      <option value="5">5 — Dev</option>
                    </select>
                    <button className="btn-primary btn-sm" onClick={async () => {
                      const uid = (document.getElementById('set-trust-user-id') as HTMLInputElement)?.value;
                      const tier = Number((document.getElementById('set-trust-tier') as HTMLSelectElement)?.value);
                      if (!uid) return;
                      try {
                        const res = await api.setTrustTier(uid, tier);
                        alert(`Trust tier set to ${tier} (${res.tier_name})`);
                      } catch (e: any) { alert(e.message); }
                    }}>Set Tier</button>
                  </div>
                </div>
                <div className="settings-group">
                  <h4>Developer Management</h4>
                  <div className="settings-row">
                    <div className="settings-row-info">
                      <label>Assign Developer</label>
                      <span className="value">Grant or revoke developer status (auto-grants Tier 5 trust)</span>
                    </div>
                  </div>
                  <div className="settings-row" style={{ gap: '8px' }}>
                    <input className="settings-input" placeholder="User ID" id="set-dev-user-id" style={{ flex: 1 }} />
                    <button className="btn-primary btn-sm" onClick={async () => {
                      const uid = (document.getElementById('set-dev-user-id') as HTMLInputElement)?.value;
                      if (!uid) return;
                      try { await api.setDev(uid, true); alert('Developer status granted'); } catch (e: any) { alert(e.message); }
                    }}>Grant Dev</button>
                    <button className="btn-danger btn-sm" onClick={async () => {
                      const uid = (document.getElementById('set-dev-user-id') as HTMLInputElement)?.value;
                      if (!uid) return;
                      if (!confirm('Remove developer status from this user?')) return;
                      try { await api.setDev(uid, false); alert('Developer status revoked'); } catch (e: any) { alert(e.message); }
                    }}>Revoke Dev</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Voice Settings Sub-Component ──

interface VoiceSettingsTabProps {
  audioDevices: AudioDevice[];
  setAudioDevices: (d: AudioDevice[]) => void;
  audioPrefs: AudioPrefs;
  updateAudioPref: (u: Partial<AudioPrefs>) => void;
  micTestLevel: number;
  setMicTestLevel: (v: number) => void;
  micTesting: boolean;
  setMicTesting: (v: boolean) => void;
  micTestRef: React.RefObject<{ stream: MediaStream; ctx: AudioContext; interval: ReturnType<typeof setInterval> } | null>;
}

function VoiceSettingsTab({ audioDevices, setAudioDevices, audioPrefs, updateAudioPref, micTestLevel, setMicTestLevel, micTesting, setMicTesting, micTestRef }: VoiceSettingsTabProps) {
  const inputDevices = audioDevices.filter((d) => d.kind === 'audioinput');
  const outputDevices = audioDevices.filter((d) => d.kind === 'audiooutput');

  useEffect(() => {
    enumerateAudioDevices().then(setAudioDevices).catch(() => {});
    return () => stopMicTest();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startMicTest() {
    stopMicTest();
    const deviceId = audioPrefs.inputDeviceId || undefined;
    const constraints: MediaTrackConstraints = {
      echoCancellation: audioPrefs.echoCancellation,
      noiseSuppression: audioPrefs.noiseSuppression,
      autoGainControl: audioPrefs.autoGainControl,
    };
    if (deviceId) constraints.deviceId = { exact: deviceId };

    navigator.mediaDevices.getUserMedia({ audio: constraints, video: false }).then((stream) => {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const dataArray = new Float32Array(analyser.fftSize);
      const interval = setInterval(() => {
        analyser.getFloatTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
        const rms = Math.sqrt(sum / dataArray.length);
        setMicTestLevel(Math.min(1, rms * 10));
      }, 50);

      micTestRef.current = { stream, ctx, interval };
      setMicTesting(true);
    }).catch(() => {
      setMicTesting(false);
    });
  }

  function stopMicTest() {
    if (micTestRef.current) {
      clearInterval(micTestRef.current.interval);
      micTestRef.current.stream.getTracks().forEach((t) => t.stop());
      micTestRef.current.ctx.close().catch(() => {});
      micTestRef.current = null;
    }
    setMicTesting(false);
    setMicTestLevel(0);
  }

  return (
    <>
      <div className="settings-group">
        <h4>Input Device</h4>
        <div className="settings-row">
          <select
            className="settings-input"
            style={{ flex: 1 }}
            value={audioPrefs.inputDeviceId}
            onChange={(e) => {
              updateAudioPref({ inputDeviceId: e.target.value });
              if (micTesting) { stopMicTest(); setTimeout(startMicTest, 100); }
            }}
          >
            <option value="">Default</option>
            {inputDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
        </div>
        <div className="settings-row" style={{ alignItems: 'center', gap: '10px' }}>
          <button className={`btn-ghost btn-sm ${micTesting ? 'active' : ''}`} onClick={() => micTesting ? stopMicTest() : startMicTest()}>
            {micTesting ? 'Stop Test' : 'Test Mic'}
          </button>
          <div className="mic-test-bar">
            <div className="mic-test-fill" style={{ width: `${micTestLevel * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="settings-group">
        <h4>Output Device</h4>
        <div className="settings-row">
          <select
            className="settings-input"
            style={{ flex: 1 }}
            value={audioPrefs.outputDeviceId}
            onChange={(e) => {
              updateAudioPref({ outputDeviceId: e.target.value });
              applyOutputDevice(e.target.value);
            }}
          >
            <option value="">Default</option>
            {outputDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="settings-group">
        <h4>Voice Processing</h4>
        <div className="settings-row">
          <div className="settings-row-info">
            <label>Echo Cancellation</label>
            <span className="value">Reduces echo from speakers</span>
          </div>
          <button
            className={`toggle-btn ${audioPrefs.echoCancellation ? 'on' : ''}`}
            onClick={() => updateAudioPref({ echoCancellation: !audioPrefs.echoCancellation })}
          >{audioPrefs.echoCancellation ? 'ON' : 'OFF'}</button>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <label>Noise Suppression</label>
            <span className="value">Filters background noise</span>
          </div>
          <button
            className={`toggle-btn ${audioPrefs.noiseSuppression ? 'on' : ''}`}
            onClick={() => updateAudioPref({ noiseSuppression: !audioPrefs.noiseSuppression })}
          >{audioPrefs.noiseSuppression ? 'ON' : 'OFF'}</button>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <label>Auto Gain Control</label>
            <span className="value">Normalizes volume levels</span>
          </div>
          <button
            className={`toggle-btn ${audioPrefs.autoGainControl ? 'on' : ''}`}
            onClick={() => updateAudioPref({ autoGainControl: !audioPrefs.autoGainControl })}
          >{audioPrefs.autoGainControl ? 'ON' : 'OFF'}</button>
        </div>
      </div>

      <div className="settings-group">
        <h4>Input Mode</h4>
        <div className="settings-row">
          <div className="settings-row-info">
            <label>Voice Activity</label>
            <span className="value">Automatically detects when you speak</span>
          </div>
        </div>
      </div>
    </>
  );
}

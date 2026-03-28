import { useEffect, useState } from 'react';
import * as api from '../api';
import Badge, { BadgeRow, type BadgeData } from './Badge';

interface ProfileAppearanceProps {
  user: { id: string; username: string; trust_tier?: number } | null;
  onClose: () => void;
}

export default function ProfileAppearance({ user, onClose }: ProfileAppearanceProps) {
  const [profileBio, setProfileBio] = useState('');
  const [profilePronouns, setProfilePronouns] = useState('');
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [profileAccentColor, setProfileAccentColor] = useState('');
  const [profileBadges, setProfileBadges] = useState<BadgeData[]>([]);
  const [primaryBadgeId, setPrimaryBadgeId] = useState<number | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    api.getProfile().then((res) => {
      setProfileBio(res.bio || '');
      setProfilePronouns(res.pronouns || '');
      setProfileDisplayName(res.display_name || '');
      setProfileAccentColor(res.accent_color || '');
      setProfileBadges(res.badges || []);
      setPrimaryBadgeId(res.primary_badge?.id ?? null);
    }).catch(() => {});
  }, []);

  return (
    <div className="settings-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="profile-editor">
        <div className="profile-editor-header">
          <h3>Profile Appearance</h3>
          <button className="settings-close" onClick={onClose}>×</button>
        </div>
        <div className="profile-editor-body">
          <div className="profile-editor-preview">
            <h4>Preview</h4>
            <div className="profile-preview-card" style={profileAccentColor ? { '--profile-accent': profileAccentColor } as React.CSSProperties : undefined}>
              {profileAccentColor && <div className="profile-accent-bar" />}
              <div className="profile-body">
                <div className="profile-header">
                  <div className="profile-avatar" style={profileAccentColor ? { borderColor: profileAccentColor } : undefined}>
                    {(profileDisplayName || user?.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="profile-identity">
                    <div className="profile-display-name">{profileDisplayName || user?.username}</div>
                    {profileDisplayName && <div className="profile-username">@{user?.username}</div>}
                  </div>
                </div>
                <div className="profile-badges">
                  {profileBadges.length > 0
                    ? <BadgeRow badges={profileBadges} />
                    : <span className="profile-badges-empty">No badges yet</span>}
                </div>
                {profilePronouns && <div className="profile-field"><span className="profile-field-label">Pronouns</span><span>{profilePronouns}</span></div>}
                {profileBio && <div className="profile-field"><span className="profile-field-label">About</span><span className="profile-bio-text">{profileBio}</span></div>}
                {user?.trust_tier != null && <div className="profile-field"><span className="profile-field-label">Trust</span><span>Tier {user.trust_tier}</span></div>}
              </div>
            </div>
          </div>

          <div className="profile-editor-controls">
            <div className="settings-group">
              <h4>Identity</h4>
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
            </div>

            <div className="settings-group">
              <h4>About Me</h4>
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
                <span className="settings-char-count">{profileBio.length}/2000</span>
              </div>
            </div>

            <div className="settings-group">
              <h4>Accent Color</h4>
              <p className="settings-hint">This color tints your profile card and avatar ring.</p>
              <div className="settings-color-row">
                <div className="settings-color-swatches">
                  {['#7ed1a3', '#ffc85c', '#e06a6a', '#7c9cf5', '#c084fc', '#f472b6', '#38bdf8', '#fb923c', ''].map((c) => (
                    <button
                      key={c || 'none'}
                      className={`settings-color-swatch${profileAccentColor === c ? ' active' : ''}`}
                      style={c ? { background: c } : { background: 'var(--surface-tunnel)' }}
                      title={c || 'None'}
                      onClick={() => { setProfileAccentColor(c); setProfileSaved(false); }}
                    >
                      {!c && <span style={{ fontSize: '0.65rem', color: 'var(--text-disabled)' }}>×</span>}
                    </button>
                  ))}
                </div>
                <div className="settings-color-custom">
                  <label>Custom</label>
                  <input
                    type="color"
                    className="settings-color-picker"
                    value={profileAccentColor || '#ffc85c'}
                    onChange={(e) => { setProfileAccentColor(e.target.value); setProfileSaved(false); }}
                  />
                  <input
                    className="settings-input settings-color-hex"
                    value={profileAccentColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                        setProfileAccentColor(v);
                        setProfileSaved(false);
                      }
                    }}
                    placeholder="#7c3aed"
                    maxLength={7}
                  />
                </div>
              </div>
            </div>

            <div className="settings-group">
              <h4>Badges</h4>
              <div className="settings-badges-display">
                {profileBadges.length > 0 ? profileBadges.map(b => (
                  <div key={b.id} className={`settings-badge-item${primaryBadgeId === b.id ? ' settings-badge-primary' : ''}`}>
                    <Badge badge={b} />
                    <div className="settings-badge-info">
                      <span className="settings-badge-name">{b.name}</span>
                      {b.description && <span className="settings-badge-desc">{b.description}</span>}
                    </div>
                    <button
                      className={`btn-sm${primaryBadgeId === b.id ? ' btn-primary' : ''}`}
                      onClick={async () => {
                        try {
                          if (primaryBadgeId === b.id) {
                            await api.clearPrimaryBadge();
                            setPrimaryBadgeId(null);
                          } else {
                            await api.setPrimaryBadge(b.id);
                            setPrimaryBadgeId(b.id);
                          }
                        } catch (err) {
                          console.error('Failed to set primary badge:', err);
                        }
                      }}
                    >
                      {primaryBadgeId === b.id ? 'Primary' : 'Set Primary'}
                    </button>
                  </div>
                )) : <p className="settings-hint">You haven't earned any badges yet. Badges are awarded for contributions and milestones.</p>}
              </div>
            </div>

            <div className="profile-editor-footer">
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
                      accent_color: profileAccentColor || null,
                    });
                    setProfileSaved(true);
                  } catch (err) {
                    console.error('Failed to save profile:', err);
                  } finally {
                    setProfileSaving(false);
                  }
                }}
              >
                {profileSaving ? 'Saving…' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

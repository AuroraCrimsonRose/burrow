import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Switch, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { colors } from '../theme/colors';
import { useAuth } from '../auth/AuthContext';
import {
  getProfile, updateProfile, getSessions, deleteSession,
  createPairingCode, getPairingStatus, setPrimaryBadge, clearPrimaryBadge,
} from '../api/client';
import { HexBadge } from '../components/HexBadge';
import type { BadgeData } from '../components/HexBadge';

interface Profile {
  id: string;
  username: string;
  display_name?: string;
  pronouns?: string;
  bio?: string;
  accent_color?: string;
  friends_only_dms?: boolean;
  trust_tier?: number;
  badges?: BadgeData[];
  primary_badge?: { id: number } | null;
}

interface Session {
  id: string;
  device_label?: string;
  last_active?: string;
  created_at?: string;
  current?: boolean;
}

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [section, setSection] = useState<'main' | 'profile' | 'privacy' | 'sessions' | 'pairing'>('main');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);

  // Profile editing
  const [displayName, setDisplayName] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [bio, setBio] = useState('');
  const [accentColor, setAccentColor] = useState('');
  const [friendsOnlyDMs, setFriendsOnlyDMs] = useState(false);
  const [badges, setBadges] = useState<BadgeData[]>([]);
  const [primaryBadgeId, setPrimaryBadgeId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Pairing
  const [pairingCode, setPairingCode] = useState('');
  const [pairingToken, setPairingToken] = useState('');
  const [pairingId, setPairingId] = useState('');
  const [pairingExpiresAt, setPairingExpiresAt] = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingStatus, setPairingStatus] = useState<'idle' | 'active' | 'claimed' | 'expired'>('idle');
  const [pairingError, setPairingError] = useState('');
  const pairingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generatePairingCode = async () => {
    setPairingLoading(true);
    setPairingError('');
    try {
      const res = await createPairingCode();
      setPairingCode(res.code);
      setPairingToken(res.token);
      setPairingId(res.id);
      setPairingExpiresAt(res.expires_at);
      setPairingStatus('active');
    } catch (e: any) {
      setPairingError(e.message || 'Failed to generate pairing code');
    } finally {
      setPairingLoading(false);
    }
  };

  useEffect(() => {
    if (pairingStatus === 'active' && pairingId) {
      pairingPollRef.current = setInterval(async () => {
        try {
          const res = await getPairingStatus(pairingId);
          if (res.status === 'claimed') {
            setPairingStatus('claimed');
          } else if (res.status === 'expired') {
            setPairingStatus('expired');
          }
        } catch {
          // ignore
        }
      }, 3000);
    }
    return () => {
      if (pairingPollRef.current) clearInterval(pairingPollRef.current);
    };
  }, [pairingStatus, pairingId]);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await getProfile()) as unknown as Profile;
      setProfile(data);
      setDisplayName(data.display_name ?? '');
      setPronouns(data.pronouns ?? '');
      setBio(data.bio ?? '');
      setAccentColor(data.accent_color ?? '');
      setBadges(data.badges ?? []);
      setPrimaryBadgeId(data.primary_badge?.id ?? null);
      setFriendsOnlyDMs(data.friends_only_dms ?? false);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await getSessions();
      const data = raw as unknown as Session[] | { sessions: Session[] };
      setSessions(Array.isArray(data) ? data : data.sessions);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (section === 'profile' || section === 'privacy') fetchProfile();
    if (section === 'sessions') fetchSessions();
  }, [section, fetchProfile, fetchSessions]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile({
        display_name: displayName,
        pronouns,
        bio,
        accent_color: accentColor || null,
      });
      Alert.alert('Saved', 'Profile updated');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrivacy = async () => {
    setSaving(true);
    try {
      await updateProfile({ friends_only_dms: friendsOnlyDMs });
      Alert.alert('Saved', 'Privacy settings updated');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    Alert.alert('Revoke Session', 'End this session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke', style: 'destructive',
        onPress: async () => {
          try {
            await deleteSession(sessionId);
            await fetchSessions();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  if (section === 'profile') {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.contentScroll}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
        <TouchableOpacity onPress={() => setSection('main')}>
          <Text style={styles.backBtn}>{'\u2190'} Back</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Edit Profile</Text>
        {loading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 20 }} />
        ) : (
          <>
            <Text style={styles.label}>Display Name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Display name"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.label}>Pronouns</Text>
            <TextInput
              style={styles.input}
              value={pronouns}
              onChangeText={setPronouns}
              placeholder="Pronouns"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.label}>Bio</Text>
            <TextInput
              style={[styles.input, styles.bioInput]}
              value={bio}
              onChangeText={setBio}
              placeholder="About you"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={2000}
            />
            <Text style={styles.charCount}>{bio.length}/2000</Text>

            <Text style={styles.label}>Accent Color</Text>
            <Text style={styles.accentHint}>This color tints your profile card and avatar ring.</Text>
            <View style={styles.colorSwatches}>
              {['#7ed1a3', '#ffc85c', '#e06a6a', '#7c9cf5', '#c084fc', '#f472b6', '#38bdf8', '#fb923c', ''].map(c => (
                <TouchableOpacity
                  key={c || 'none'}
                  style={[
                    styles.colorSwatch,
                    c ? { backgroundColor: c } : { backgroundColor: colors.bgTertiary },
                    accentColor === c && styles.colorSwatchActive,
                  ]}
                  onPress={() => setAccentColor(c)}
                >
                  {!c && <Text style={styles.colorSwatchNone}>{'\u00D7'}</Text>}
                  {accentColor === c && c !== '' && (
                    <Text style={styles.colorSwatchCheck}>{'\u2713'}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Custom Hex</Text>
            <TextInput
              style={[styles.input, styles.hexInput]}
              value={accentColor}
              onChangeText={(v) => {
                if (v === '' || /^#[0-9a-fA-F]{0,6}$/.test(v)) setAccentColor(v);
              }}
              placeholder="#7c3aed"
              placeholderTextColor={colors.textMuted}
              maxLength={7}
              autoCapitalize="none"
            />
            {accentColor ? (
              <View style={styles.accentPreview}>
                <View style={[styles.accentPreviewBar, { backgroundColor: accentColor }]} />
                <Text style={styles.accentPreviewText}>Preview</Text>
              </View>
            ) : null}

            <Text style={[styles.label, { marginTop: 20 }]}>Badges</Text>
            {badges.length > 0 ? (
              badges.map(b => (
                <View key={b.id} style={[
                  styles.badgeRow,
                  primaryBadgeId === b.id && styles.badgeRowPrimary,
                ]}>
                  <HexBadge badge={b} showTooltip={false} />
                  <View style={styles.badgeInfo}>
                    <Text style={styles.badgeNameText}>{b.name}</Text>
                    {b.description ? <Text style={styles.badgeDesc}>{b.description}</Text> : null}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.badgePrimaryBtn,
                      primaryBadgeId === b.id && styles.badgePrimaryBtnActive,
                    ]}
                    onPress={async () => {
                      try {
                        if (primaryBadgeId === b.id) {
                          await clearPrimaryBadge();
                          setPrimaryBadgeId(null);
                        } else {
                          await setPrimaryBadge(b.id);
                          setPrimaryBadgeId(b.id);
                        }
                      } catch { /* silent */ }
                    }}
                  >
                    <Text style={[
                      styles.badgePrimaryBtnText,
                      primaryBadgeId === b.id && styles.badgePrimaryBtnTextActive,
                    ]}>
                      {primaryBadgeId === b.id ? 'Primary' : 'Set Primary'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <Text style={styles.badgesEmptyText}>
                You haven't earned any badges yet. Badges are awarded for contributions and milestones.
              </Text>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              disabled={saving}
              onPress={handleSaveProfile}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </>
        )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (section === 'privacy') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => setSection('main')}>
          <Text style={styles.backBtn}>{'\u2190'} Back</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Privacy</Text>
        {loading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 20 }} />
        ) : (
          <>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Friends-only DMs</Text>
                <Text style={styles.toggleHint}>Only friends can send you direct messages</Text>
              </View>
              <Switch
                value={friendsOnlyDMs}
                onValueChange={setFriendsOnlyDMs}
                trackColor={{ false: colors.bgAccent, true: colors.brandPrimary }}
                thumbColor="#fff"
              />
            </View>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              disabled={saving}
              onPress={handleSavePrivacy}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    );
  }

  if (section === 'pairing') {
    const resetPairing = () => {
      setPairingCode('');
      setPairingToken('');
      setPairingId('');
      setPairingExpiresAt('');
      setPairingStatus('idle');
      setPairingError('');
    };

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => { resetPairing(); setSection('main'); }}>
          <Text style={styles.backBtn}>{'\u2190'} Back</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Pair a Device</Text>
        <Text style={styles.pairingHint}>
          Generate a code to pair another device to your account. Enter the code on the new device to log in.
        </Text>

        {pairingStatus === 'idle' && (
          <TouchableOpacity
            style={[styles.saveBtn, pairingLoading && styles.saveBtnDisabled]}
            disabled={pairingLoading}
            onPress={generatePairingCode}
          >
            <Text style={styles.saveBtnText}>
              {pairingLoading ? 'Generating...' : 'Generate Pairing Code'}
            </Text>
          </TouchableOpacity>
        )}

        {pairingStatus === 'active' && (
          <View style={styles.pairingPanel}>
            <Text style={styles.pairingLabel}>Pairing Code</Text>
            <Text style={styles.pairingCodeValue}>{pairingCode}</Text>

            <Text style={[styles.pairingLabel, { marginTop: 16 }]}>Full Token</Text>
            <TouchableOpacity
              onPress={() => {
                Clipboard.setStringAsync(pairingToken);
                Alert.alert('Copied', 'Token copied to clipboard');
              }}
            >
              <Text style={styles.pairingTokenValue} numberOfLines={2}>
                {pairingToken}
              </Text>
              <Text style={styles.pairingCopyHint}>Tap to copy</Text>
            </TouchableOpacity>

            <Text style={styles.pairingExpiry}>
              Expires: {new Date(pairingExpiresAt).toLocaleTimeString()}
            </Text>
            <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 12 }} />
            <Text style={styles.pairingWaiting}>Waiting for device to pair...</Text>
          </View>
        )}

        {pairingStatus === 'claimed' && (
          <View style={styles.pairingPanel}>
            <Text style={styles.pairingSuccess}>Device paired successfully!</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={resetPairing}>
              <Text style={styles.saveBtnText}>Generate Another</Text>
            </TouchableOpacity>
          </View>
        )}

        {pairingStatus === 'expired' && (
          <View style={styles.pairingPanel}>
            <Text style={styles.pairingExpired}>Code expired</Text>
            <TouchableOpacity style={styles.saveBtn} onPress={() => { resetPairing(); generatePairingCode(); }}>
              <Text style={styles.saveBtnText}>Generate New Code</Text>
            </TouchableOpacity>
          </View>
        )}

        {pairingError !== '' && (
          <Text style={styles.pairingErrorText}>{pairingError}</Text>
        )}
      </ScrollView>
    );
  }

  if (section === 'sessions') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => setSection('main')}>
          <Text style={styles.backBtn}>{'\u2190'} Back</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Sessions</Text>
        {loading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 20 }} />
        ) : sessions.length === 0 ? (
          <Text style={styles.emptyText}>No active sessions</Text>
        ) : (
          sessions.map(s => (
            <View key={s.id} style={styles.sessionCard}>
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionLabel}>
                  {s.device_label || 'Unknown Device'}
                  {s.current ? ' (current)' : ''}
                </Text>
                {s.last_active && (
                  <Text style={styles.sessionMeta}>
                    Last active: {new Date(s.last_active).toLocaleDateString()}
                  </Text>
                )}
              </View>
              {!s.current && (
                <TouchableOpacity style={styles.revokeBtn} onPress={() => handleRevokeSession(s.id)}>
                  <Text style={styles.revokeBtnText}>Revoke</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>
    );
  }

  // Main settings menu
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.userCard}>
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>
            {(user?.username ?? 'U').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View>
          <Text style={styles.userName}>{user?.username ?? 'Unknown'}</Text>
          <Text style={styles.userId}>ID: {user?.id ?? ''}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <TouchableOpacity style={styles.card} onPress={() => setSection('profile')}>
          <Text style={styles.cardLabel}>Profile</Text>
          <Text style={styles.cardHint}>Display name, pronouns, bio, accent color</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.card} onPress={() => setSection('privacy')}>
          <Text style={styles.cardLabel}>Privacy</Text>
          <Text style={styles.cardHint}>DM settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.card} onPress={() => setSection('sessions')}>
          <Text style={styles.cardLabel}>Sessions</Text>
          <Text style={styles.cardHint}>Manage active sessions</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        <TouchableOpacity style={styles.card} onPress={() => setSection('pairing')}>
          <Text style={styles.cardLabel}>Pair a Device</Text>
          <Text style={styles.cardHint}>Generate a code to link another device</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App</Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Notifications</Text>
          <Text style={styles.cardHint}>Push notification preferences</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Burrow v0.1.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40 },
  contentScroll: { padding: 16, paddingBottom: 120 },
  backBtn: { color: colors.teal, fontSize: 15, marginBottom: 8 },
  pageTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '700', marginBottom: 20 },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 4, marginTop: 12 },
  input: {
    backgroundColor: colors.bgInput, borderRadius: 8, padding: 12,
    color: colors.textPrimary, fontSize: 16,
  },
  bioInput: { minHeight: 80, textAlignVertical: 'top' },
  saveBtn: {
    backgroundColor: colors.brandPrimary, borderRadius: 8, padding: 14,
    alignItems: 'center', marginTop: 20,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: colors.textInverse, fontWeight: '600', fontSize: 16 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgSecondary,
    borderRadius: 10, padding: 14, marginTop: 8,
  },
  toggleInfo: { flex: 1 },
  toggleLabel: { color: colors.textPrimary, fontSize: 16 },
  toggleHint: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  sessionCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgSecondary,
    borderRadius: 10, padding: 14, marginBottom: 8,
  },
  sessionInfo: { flex: 1 },
  sessionLabel: { color: colors.textPrimary, fontSize: 15 },
  sessionMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  revokeBtn: { backgroundColor: colors.danger, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  revokeBtnText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  emptyText: { color: colors.textMuted, fontSize: 14, marginTop: 12 },
  userCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgSecondary,
    borderRadius: 12, padding: 16, marginBottom: 20,
  },
  userAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandPrimary,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  userAvatarText: { color: colors.textInverse, fontSize: 20, fontWeight: '700' },
  userName: { color: colors.textPrimary, fontSize: 18, fontWeight: '600' },
  userId: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  section: { marginBottom: 24 },
  sectionTitle: {
    color: colors.textMuted, fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginLeft: 4,
  },
  card: {
    backgroundColor: colors.bgSecondary, borderRadius: 10, padding: 14, marginBottom: 2,
    borderWidth: 1, borderColor: colors.border,
  },
  cardLabel: { color: colors.textPrimary, fontSize: 16 },
  cardHint: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  logoutBtn: {
    backgroundColor: colors.danger, borderRadius: 10, padding: 14,
    alignItems: 'center', marginTop: 8,
  },
  logoutText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  version: {
    color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 24,
  },
  // Pairing styles
  pairingHint: { color: colors.textSecondary, fontSize: 14, marginBottom: 16, lineHeight: 20 },
  pairingPanel: {
    backgroundColor: colors.bgSecondary, borderRadius: 12, padding: 16, marginTop: 12,
  },
  pairingLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 6 },
  pairingCodeValue: {
    color: colors.brandPrimary, fontSize: 28, fontWeight: '700', letterSpacing: 2, textAlign: 'center',
    fontFamily: 'monospace',
  },
  pairingTokenValue: {
    color: colors.textSecondary, fontSize: 12, fontFamily: 'monospace', lineHeight: 18,
  },
  pairingCopyHint: { color: colors.teal, fontSize: 12, marginTop: 4 },
  pairingExpiry: { color: colors.textMuted, fontSize: 12, marginTop: 12 },
  pairingWaiting: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 8 },
  pairingSuccess: { color: colors.success, fontSize: 16, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  pairingExpired: { color: colors.danger, fontSize: 16, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  pairingErrorText: { color: colors.danger, fontSize: 13, marginTop: 8 },
  // Accent color picker
  charCount: { color: colors.textMuted, fontSize: 11, textAlign: 'right', marginTop: 4 },
  accentHint: { color: colors.textMuted, fontSize: 13, marginBottom: 10 },
  colorSwatches: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12,
  },
  colorSwatch: {
    width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  colorSwatchActive: {
    borderColor: colors.textPrimary,
  },
  colorSwatchNone: { color: colors.textMuted, fontSize: 16, fontWeight: '700' },
  colorSwatchCheck: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hexInput: { fontFamily: 'monospace' },
  accentPreview: {
    marginTop: 8, backgroundColor: colors.bgSecondary, borderRadius: 10, overflow: 'hidden',
  },
  accentPreviewBar: { height: 6 },
  accentPreviewText: { color: colors.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: 8 },
  // Badge management
  badgeRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgSecondary,
    borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: colors.border,
    gap: 12,
  },
  badgeRowPrimary: {
    backgroundColor: 'rgba(255, 200, 92, 0.06)',
    borderColor: 'rgba(255, 200, 92, 0.15)',
  },
  badgeInfo: { flex: 1 },
  badgeNameText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  badgeDesc: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  badgePrimaryBtn: {
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: colors.bgAccent, borderWidth: 1, borderColor: colors.border,
  },
  badgePrimaryBtnActive: {
    backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary,
  },
  badgePrimaryBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  badgePrimaryBtnTextActive: { color: colors.textInverse },
  badgesEmptyText: {
    color: colors.textMuted, fontSize: 13, fontStyle: 'italic', lineHeight: 18, marginTop: 4,
  },
});

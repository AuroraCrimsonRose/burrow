import { colors } from '../theme/colors';
import { clearToken } from '../api/client';

export default function SettingsPage() {
  const handleLogout = () => {
    clearToken();
    window.location.href = '/login';
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Settings</h2>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Account</h3>
        <div style={styles.card}>Profile &amp; preferences</div>
        <div style={styles.card}>Privacy settings</div>
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>App</h3>
        <div style={styles.card}>Appearance</div>
        <div style={styles.card}>Notifications</div>
        <div style={styles.card}>Keybinds</div>
      </section>

      <button style={styles.logout} onClick={handleLogout}>Log Out</button>
      <p style={styles.version}>Burrow Desktop v0.1.0</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 24, maxWidth: 600 },
  heading: { color: colors.textPrimary, margin: 0, marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.bgSecondary,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: '12px 16px',
    color: colors.textPrimary,
    marginBottom: 4,
    cursor: 'pointer',
  },
  logout: {
    backgroundColor: colors.danger,
    border: 'none',
    borderRadius: 8,
    padding: '10px 24px',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
  },
  version: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 24,
  },
};

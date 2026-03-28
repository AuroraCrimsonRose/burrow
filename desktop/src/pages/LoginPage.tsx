import { colors } from '../theme/colors';

export default function LoginPage() {
  // TODO: implement device-bound auth
  return (
    <div style={styles.container}>
      <h1 style={styles.logo}>Burrow</h1>
      <p style={styles.tagline}>Your community platform</p>
      <input
        style={styles.input}
        placeholder="Username"
        type="text"
        autoFocus
      />
      <button style={styles.button}>Sign In</button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: colors.bgPrimary,
  },
  logo: {
    fontSize: 48,
    fontWeight: 700,
    color: colors.brandPrimary,
    margin: 0,
  },
  tagline: {
    color: colors.textSecondary,
    fontSize: 16,
    marginBottom: 40,
  },
  input: {
    width: 320,
    height: 44,
    backgroundColor: colors.bgInput,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: '0 16px',
    color: colors.textPrimary,
    fontSize: 15,
    outline: 'none',
    marginBottom: 12,
  },
  button: {
    width: 320,
    height: 44,
    backgroundColor: colors.brandPrimary,
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

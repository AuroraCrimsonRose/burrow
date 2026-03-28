import { colors } from '../theme/colors';

export default function ServersPage() {
  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Servers</h2>
      <p style={styles.hint}>Your servers will appear here</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 24 },
  heading: { color: colors.textPrimary, margin: 0 },
  hint: { color: colors.textMuted, marginTop: 8 },
};

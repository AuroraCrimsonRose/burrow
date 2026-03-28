import { colors } from '../theme/colors';

export default function DMsPage() {
  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Messages</h2>
      <p style={styles.hint}>Your direct messages will appear here</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 24 },
  heading: { color: colors.textPrimary, margin: 0 },
  hint: { color: colors.textMuted, marginTop: 8 },
};

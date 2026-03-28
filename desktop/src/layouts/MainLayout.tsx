import { Outlet, NavLink } from 'react-router-dom';
import { colors } from '../theme/colors';

const navItems = [
  { to: '/servers', label: 'Servers' },
  { to: '/dms', label: 'Messages' },
  { to: '/friends', label: 'Friends' },
  { to: '/settings', label: 'Settings' },
];

export default function MainLayout() {
  return (
    <div style={styles.layout}>
      <nav style={styles.sidebar}>
        <div style={styles.brand}>B</div>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              ...styles.navItem,
              color: isActive ? colors.brandPrimary : colors.textMuted,
              backgroundColor: isActive ? colors.bgAccent : 'transparent',
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main style={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: 'flex',
    height: '100vh',
    backgroundColor: colors.bgPrimary,
    color: colors.textPrimary,
  },
  sidebar: {
    width: 200,
    backgroundColor: colors.bgSecondary,
    borderRight: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 0',
    flexShrink: 0,
  },
  brand: {
    fontSize: 24,
    fontWeight: 700,
    color: colors.brandPrimary,
    textAlign: 'center',
    padding: '8px 0 16px',
    borderBottom: `1px solid ${colors.border}`,
    marginBottom: 8,
  },
  navItem: {
    display: 'block',
    padding: '10px 16px',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 6,
    margin: '2px 8px',
    transition: 'background 0.15s',
  },
  content: {
    flex: 1,
    overflow: 'auto',
  },
};

import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useStore, useCustomCSS, useActiveTheme, themeToCSS, DEFAULT_THEME } from './store';
import RegisterPage from './pages/RegisterPage';
import LoginPage from './pages/LoginPage';
import RecoverPage from './pages/RecoverPage';
import ChatPage from './pages/ChatPage';
import './App.css';

function CustomStyleInjector() {
  const css = useCustomCSS();
  const theme = useActiveTheme();
  const themeCss = theme.id !== DEFAULT_THEME.id ? themeToCSS(theme) : '';
  const combined = [themeCss, css].filter(Boolean).join('\n');
  if (!combined) return null;
  return <style dangerouslySetInnerHTML={{ __html: combined }} />;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { sessionToken } = useStore();
  if (!sessionToken) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { sessionToken } = useStore();
  if (sessionToken) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RegisterWrapper() {
  const navigate = useNavigate();
  return <RegisterPage onDone={() => navigate('/')} />;
}

function LoginWrapper() {
  const navigate = useNavigate();
  return <LoginPage onDone={() => navigate('/')} />;
}

function RecoverWrapper() {
  const navigate = useNavigate();
  return <RecoverPage onDone={() => navigate('/')} />;
}

function App() {
  return (
    <BrowserRouter>
      <CustomStyleInjector />
      <Routes>
        <Route path="/register" element={<GuestRoute><RegisterWrapper /></GuestRoute>} />
        <Route path="/login" element={<GuestRoute><LoginWrapper /></GuestRoute>} />
        <Route path="/recover" element={<GuestRoute><RecoverWrapper /></GuestRoute>} />
        <Route path="/" element={<AuthRoute><ChatPage /></AuthRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

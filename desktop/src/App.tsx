import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import ServersPage from './pages/ServersPage';
import DMsPage from './pages/DMsPage';
import FriendsPage from './pages/FriendsPage';
import SettingsPage from './pages/SettingsPage';

function App() {
  // TODO: check auth state and redirect accordingly
  const isAuthenticated = !!localStorage.getItem('burrow_token');

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            isAuthenticated ? <MainLayout /> : <Navigate to="/login" replace />
          }
        >
          <Route path="/servers" element={<ServersPage />} />
          <Route path="/dms" element={<DMsPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/servers" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

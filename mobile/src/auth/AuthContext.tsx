import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getToken, setToken, getCachedUser, setCachedUser, clearAll } from './store';

export interface User {
  id: string;
  username: string;
  trust_tier: number;
  is_dev?: boolean;
}

interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  isLoading: true,
  isAuthenticated: false,
  user: null,
  login: async () => {},
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          const cached = await getCachedUser();
          if (cached && cached.id && cached.username) {
            setUser(cached as unknown as User);
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (token: string, u: User) => {
    await setToken(token);
    await setCachedUser(u as unknown as Record<string, unknown>);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    await clearAll();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isAuthenticated: !!user,
        user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

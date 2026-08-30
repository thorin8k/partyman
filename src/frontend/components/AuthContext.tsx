import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface User {
  id: number;
  displayName: string;
  avatarUrl: string | null;
  role: 'admin' | 'participant';
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Get CSRF token from cookie
      const csrfMatch = document.cookie.match(/partyman_csrf=([^;]+)/);
      const csrf = csrfMatch ? csrfMatch[1] : '';

      await fetch('/auth/logout', {
        method: 'POST',
        headers: {
          'X-Partyman-CSRF': csrf,
          'Origin': window.location.origin,
        },
      });
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

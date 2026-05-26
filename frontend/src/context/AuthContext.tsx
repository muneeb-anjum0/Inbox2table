import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiService } from '../services/api';

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string) => Promise<boolean>;
  loginWithGmail: () => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_POPUP_TIMEOUT_MS = 300000;
const AUTH_POPUP_CLOSED_POLL_MS = 500;

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const authTimeoutRef = React.useRef<number | null>(null);
  const authPopupCheckRef = React.useRef<number | null>(null);
  const pendingGmailAuthRef = React.useRef<((success: boolean) => void) | null>(null);

  const clearAuthTimeout = React.useCallback(() => {
    if (authTimeoutRef.current !== null) {
      window.clearTimeout(authTimeoutRef.current);
      authTimeoutRef.current = null;
    }
  }, []);

  const clearAuthPopupCheck = React.useCallback(() => {
    if (authPopupCheckRef.current !== null) {
      window.clearInterval(authPopupCheckRef.current);
      authPopupCheckRef.current = null;
    }
  }, []);

  const finishPendingGmailAuth = React.useCallback((success: boolean) => {
    clearAuthTimeout();
    clearAuthPopupCheck();

    if (pendingGmailAuthRef.current) {
      pendingGmailAuthRef.current(success);
      pendingGmailAuthRef.current = null;
    }
  }, [clearAuthPopupCheck, clearAuthTimeout]);

  useEffect(() => {
    // Ensure API base URL is detected before performing auth-related network actions
    (async () => {
      try {
        await apiService.initialize();
      } catch (e) {
      }
    })();

    // Check for OAuth callback parameters (mobile redirect flow)
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.get('auth') === 'success' && urlParams.get('user_id') && urlParams.get('email')) {
      const userData = {
        id: urlParams.get('user_id')!,
        email: urlParams.get('email')!
      };
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      
      // Clean up URL parameters
      const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
      
      setLoading(false);
      return;
    }
    
    if (urlParams.get('auth') === 'error') {
      // Clean up URL parameters
      const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
      
      setLoading(false);
      return;
    }
    
    // Check for stored user session
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('user');
      }
    }
    
    // Listen for Gmail OAuth callback
    const handleGmailAuthMessage = (event: MessageEvent) => {
      const apiBaseOrigin = apiService.getBaseOrigin();
      
      // Allow the active backend origin plus local development origins.
      const isAllowedOrigin =
        event.origin === apiBaseOrigin ||
        event.origin.startsWith('http://localhost:') || 
        event.origin.startsWith('http://127.0.0.1:') || 
        event.origin.startsWith('http://192.168.') ||
        (event.origin.startsWith('https://') && event.origin.includes('.ngrok-'));
      
      if (!isAllowedOrigin) {
        return;
      }

      if (!event.data || typeof event.data !== 'object') {
        return;
      }
      
      if (event.data.type === 'GMAIL_AUTH_SUCCESS') {
        const userData = event.data.user;
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        setLoading(false);
        finishPendingGmailAuth(true);
      } else if (event.data.type === 'GMAIL_AUTH_ERROR') {
        setLoading(false);
        finishPendingGmailAuth(false);
      }
    };
    
    window.addEventListener('message', handleGmailAuthMessage);
    setLoading(false);
    
    return () => {
      clearAuthTimeout();
      clearAuthPopupCheck();
      window.removeEventListener('message', handleGmailAuthMessage);
    };
  }, [clearAuthPopupCheck, clearAuthTimeout, finishPendingGmailAuth]);

  const loginWithGmail = async (): Promise<boolean> => {
    try {
      await apiService.initialize();

      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (isMobile) {
        const apiBaseOrigin = apiService.getBaseOrigin();
        const mobileAuthUrl = `${apiBaseOrigin}/api/auth/gmail?redirect=1&frontend_origin=${encodeURIComponent(window.location.origin)}`;
        window.location.href = mobileAuthUrl;
        return true;
      }

      const authData = await apiService.getGmailAuthUrl(window.location.origin);
      const popup = window.open(
        authData.auth_url,
        'gmail-auth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );
      
      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }
      
      clearAuthTimeout();
      clearAuthPopupCheck();

      return await new Promise<boolean>((resolve) => {
        pendingGmailAuthRef.current = resolve;

        authTimeoutRef.current = window.setTimeout(() => {
          finishPendingGmailAuth(false);
        }, AUTH_POPUP_TIMEOUT_MS);

        authPopupCheckRef.current = window.setInterval(() => {
          if (popup.closed) {
            finishPendingGmailAuth(false);
          }
        }, AUTH_POPUP_CLOSED_POLL_MS);
      });
    } catch (error) {
      setLoading(false);
      return false;
    }
  };

  const login = async (email: string): Promise<boolean> => {
    try {
      setLoading(true);
      const response = await apiService.login(email);
      
      if (response.success && response.user) {
        const userData = response.user;
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    login,
    loginWithGmail,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

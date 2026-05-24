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
  const apiBaseOrigin = apiService.getBaseOrigin();

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
      
      if (event.data.type === 'GMAIL_AUTH_SUCCESS') {
        const userData = event.data.user;
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        setLoading(false);
      } else if (event.data.type === 'GMAIL_AUTH_ERROR') {
        const errorMsg = event.data.error;
        
        // Handle specific scope errors more gracefully
        if (errorMsg && errorMsg.includes('Scope has changed')) {
          // Don't show error to user, just set loading to false
          setLoading(false);
        } else {
          setLoading(false);
        }
      }
    };
    
    window.addEventListener('message', handleGmailAuthMessage);
    setLoading(false);
    
    return () => {
      window.removeEventListener('message', handleGmailAuthMessage);
    };
  }, [apiBaseOrigin]);

  const loginWithGmail = async (): Promise<boolean> => {
    try {
      setLoading(true);
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (isMobile) {
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
      
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }
      
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setLoading(false);
        }
      }, 1000);
      
      setTimeout(() => {
        clearInterval(checkClosed);
      }, 300000);

      return true;
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

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
        const selected = await apiService.initialize();
        console.log('[Auth] API initialized with base:', selected);
      } catch (e) {
        console.warn('[Auth] API initialization failed, proceeding with defaults', e);
      }
    })();

    // Check for OAuth callback parameters (mobile redirect flow)
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.get('auth') === 'success' && urlParams.get('user_id') && urlParams.get('email')) {
      console.log('[Safari Mobile Debug] OAuth success detected in URL params');
      const userData = {
        id: urlParams.get('user_id')!,
        email: urlParams.get('email')!
      };
      
      console.log('[Safari Mobile Debug] Setting user from URL params:', userData);
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      
      // Clean up URL parameters
      const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
      
      setLoading(false);
      return;
    }
    
    if (urlParams.get('auth') === 'error') {
      console.error('[Safari Mobile Debug] OAuth error detected in URL params:', urlParams.get('error'));
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
      console.log('[Mobile Debug] Received message event:', {
        origin: event.origin,
        data: event.data,
        source: event.source,
        currentOrigin: window.location.origin,
        timestamp: new Date().toISOString()
      });
      
      // Allow messages from any localhost port (for OAuth callback)
      const allowedOrigins = [
        'http://localhost:5000',
        'http://127.0.0.1:5000',
        'http://192.168.100.250:5000',
        apiBaseOrigin,
      ];

      // Allow the active backend origin plus local development origins.
      const isAllowedOrigin =
        event.origin === apiBaseOrigin ||
        event.origin.startsWith('http://localhost:') || 
        event.origin.startsWith('http://127.0.0.1:') || 
        event.origin.startsWith('http://192.168.') ||
        event.origin.startsWith('https://') && event.origin.includes('.ngrok-');
      
      if (!isAllowedOrigin) {
        console.log('[Mobile Debug] Ignoring message from unauthorized origin:', event.origin);
        return;
      }
      
      console.log('[Mobile Debug] Processing authorized message from:', event.origin);
      console.log('[Mobile Debug] Message data:', event.data);
      
      if (event.data.type === 'GMAIL_AUTH_SUCCESS') {
        const userData = event.data.user;
        console.log('[Mobile Debug] Gmail auth successful, setting user:', userData);
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        setLoading(false);
      } else if (event.data.type === 'GMAIL_AUTH_ERROR') {
        const errorMsg = event.data.error;
        console.error('[Mobile Debug] Gmail auth error:', errorMsg);
        
        // Handle specific scope errors more gracefully
        if (errorMsg && errorMsg.includes('Scope has changed')) {
          console.log('[Mobile Debug] Scope mismatch detected - this is usually harmless, retrying...');
          // Don't show error to user, just set loading to false
          setLoading(false);
        } else {
          console.error('[Mobile Debug] Other Gmail auth error:', errorMsg);
          setLoading(false);
        }
      } else {
        console.log('[Mobile Debug] Unknown message type:', event.data.type);
      }
    };
    
    window.addEventListener('message', handleGmailAuthMessage);
    setLoading(false);
    
    return () => {
      window.removeEventListener('message', handleGmailAuthMessage);
    };
  }, []);

  const loginWithGmail = async (): Promise<boolean> => {
    try {
      setLoading(true);
      console.log('Starting Gmail OAuth flow...');
      
      // Detect mobile device
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      console.log('Is mobile device:', isMobile);
      console.log('User agent:', navigator.userAgent);
      console.log('Current origin:', window.location.origin);

      if (isMobile) {
        console.log('Mobile detected: using direct backend redirect for Gmail auth');
        const mobileAuthUrl = `${apiBaseOrigin}/api/auth/gmail?redirect=1&frontend_origin=${encodeURIComponent(window.location.origin)}`;
        window.location.href = mobileAuthUrl;
        return true;
      }

      const authData = await apiService.getGmailAuthUrl(window.location.origin);
      console.log('Got auth URL:', authData.auth_url);
      
      // Try popup first, but have fallback for mobile
      const popup = window.open(
        authData.auth_url,
        'gmail-auth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );
      
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        console.warn('Popup blocked or failed to open, redirecting to full page auth...');
        
        throw new Error('Popup blocked. Please allow popups for this site.');
      }
      
      console.log('Popup opened successfully, waiting for auth completion...');
      
      // Monitor popup closure
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          console.log('Popup was closed by user');
          clearInterval(checkClosed);
          setLoading(false);
        }
      }, 1000);
      
      // Clean up interval after 5 minutes
      setTimeout(() => {
        clearInterval(checkClosed);
      }, 300000);
      
      // The popup will send a message when auth is complete
      return true;
    } catch (error) {
      console.error('Gmail OAuth error:', error);
      setLoading(false);
      return false;
    }
  };

  const login = async (email: string): Promise<boolean> => {
    try {
      setLoading(true);
      console.log('Attempting login with email:', email);
      
      const response = await apiService.login(email);
      console.log('Login response:', response);
      
      if (response.success && response.user) {
        const userData = response.user;
        console.log('Setting user data:', userData);
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        console.log('Login successful');
        return true;
      } else {
        console.error('Login failed - no user data in response:', response);
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
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
import React, { useState } from 'react';
import { Mail, AlertCircle, Calendar } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const LoginScreen: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isExiting, setIsExiting] = useState(false);
  const { loginWithGmail } = useAuth();

  const handleGmailLogin = async () => {
    console.log('[Mobile Debug] Login button clicked');
    console.log('[Mobile Debug] User agent:', navigator.userAgent);
    console.log('[Mobile Debug] Current URL:', window.location.href);
    console.log('[Mobile Debug] Screen dimensions:', {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight
    });
    
    setIsLoading(true);
    setError('');
    try {
      console.log('[Mobile Debug] Starting Gmail login flow...');
      const success = await loginWithGmail();
      console.log('[Mobile Debug] Login flow result:', success);
      
      if (success) {
        console.log('[Mobile Debug] Login successful, starting exit animation');
        // Start exit animation before actual redirect
        setIsExiting(true);
        // Let animation play for a bit before auth context handles the redirect
        setTimeout(() => {
          // The auth context will handle the redirect
          console.log('[Mobile Debug] Exit animation complete');
        }, 300);
      } else {
        console.error('[Mobile Debug] Login failed');
        setError('Gmail authentication failed. Please try again.');
      }
    } catch (error) {
      console.error('[Mobile Debug] Login error caught:', error);
      setError('An error occurred during Gmail authentication. Please try again.');
    } finally {
      if (!isExiting) {
        console.log('[Mobile Debug] Setting loading to false');
        setIsLoading(false);
      }
    }
  };

  return (
    <div className={`login-screen-shell min-h-screen flex items-center justify-center p-4 ${isExiting ? 'animate-login-exit-smooth' : ''}`}>
      <div className="max-w-md w-full relative z-10">
        <div className={`surface-card p-8 shadow-2xl border ${isExiting ? '' : ''}`}>
          <div className="text-center mb-8">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl login-screen-shell__icon text-sky-700">
              <Mail className="h-8 w-8" />
            </div>
            <h1 className="text-3xl font-semibold theme-text-primary mb-2">Welcome back</h1>
            <p className="text-sm theme-text-secondary">Sign in with your Gmail account to access your dashboard.</p>
          </div>

          <button
            onClick={handleGmailLogin}
            disabled={isLoading}
            className="w-full btn-pill btn-pill--white login-button justify-center py-4 px-6 text-base"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-400 border-t-transparent"></div>
                <span className="theme-text-primary">Connecting to Gmail...</span>
              </>
            ) : (
              <>
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl login-screen-shell__mini-icon text-blue-600 shadow-sm">
                  <img src="/gmail.svg" alt="Gmail" className="w-5 h-5" />
                </div>
                <span className="theme-text-primary font-semibold">Continue with Gmail</span>
              </>
            )}
          </button>

          {error && (
            <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-1 h-5 w-5" />
                <div>
                  <p className="font-semibold">{error.includes('Popup blocked') ? 'Authentication blocked' : 'Authentication failed'}</p>
                  <p className="mt-1 text-xs text-red-600">
                    {error.includes('Popup blocked')
                      ? 'Allow popups or try again in the same window on mobile.'
                      : 'Please try again or refresh the page.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 space-y-3 text-sm theme-text-secondary">
            <div className="rounded-3xl border theme-border-soft bg-[color:var(--theme-surface-muted)] p-3">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-slate-500" />
                <span>Clean schedule view for your classes.</span>
              </div>
            </div>
            <div className="rounded-3xl border theme-border-soft bg-[color:var(--theme-surface-muted)] p-3">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-slate-500" />
                <span>Secure Gmail access with your SZABIST account.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
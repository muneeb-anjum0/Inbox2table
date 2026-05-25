import React, { useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, Loader, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BACKEND_WAKE_EVENT } from '../../services/api';
import './LoginScreen.css';

const LEGAL_ACCEPTANCE_KEY = 'inbox2table-legal-accepted';

const LoginScreen: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isExiting, setIsExiting] = useState(false);
  const [wakeMessage, setWakeMessage] = useState('');
  const [hasAcceptedPrivacy, setHasAcceptedPrivacy] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(LEGAL_ACCEPTANCE_KEY) === 'true';
  });
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(LEGAL_ACCEPTANCE_KEY) === 'true';
  });

  const { loginWithGmail } = useAuth();
  const hasAcceptedLegal = hasAcceptedPrivacy && hasAcceptedTerms;

  useEffect(() => {
    const handleBackendWakeState = (event: Event) => {
      const { active, message } = (event as CustomEvent<{ active: boolean; message?: string }>).detail;
      setWakeMessage(active ? message || 'Backend is waking up on Render. First request after inactivity can take about a minute.' : '');
    };

    window.addEventListener(BACKEND_WAKE_EVENT, handleBackendWakeState);
    return () => window.removeEventListener(BACKEND_WAKE_EVENT, handleBackendWakeState);
  }, []);

  const handleGmailLogin = async () => {
    if (isLoading) return;

    if (!hasAcceptedPrivacy || !hasAcceptedTerms) {
      setError('Please accept the Privacy Policy and Terms of Service to continue.');
      return;
    }

    setIsLoading(true);
    setError('');
    window.localStorage.setItem(LEGAL_ACCEPTANCE_KEY, 'true');

    try {
      const success = await loginWithGmail();

      if (success) {
        setIsExiting(true);
      } else {
        setError('Gmail authentication failed. Please try again.');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('[LoginScreen] Gmail login error:', error);
      setError('An error occurred during Gmail authentication. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <main className={`login-page ${isExiting ? 'login-page--exiting' : ''}`}>
      <section className="login-shell">
        <div className="login-visual">
          <div className="orb orb-one" />
          <div className="orb orb-two" />

          <div className="visual-card visual-card-main">
            <div className="visual-card-header">
              <div>
                <span className="visual-label">Today</span>
                <h2>Class Schedule</h2>
              </div>
              <CalendarDays size={22} />
            </div>

            <div className="schedule-list">
              <div className="schedule-item">
                <span className="schedule-time">09:00</span>
                <div>
                  <strong>Software Engineering</strong>
                  <p>Room 204</p>
                </div>
              </div>

              <div className="schedule-item active">
                <span className="schedule-time">11:30</span>
                <div>
                  <strong>Database Systems</strong>
                  <p>Lab 3</p>
                </div>
              </div>

              <div className="schedule-item">
                <span className="schedule-time">02:00</span>
                <div>
                  <strong>Web Engineering</strong>
                  <p>Auditorium</p>
                </div>
              </div>
            </div>
          </div>

          <div className="floating-pill pill-one">
            <ShieldCheck size={17} />
            <span>Secure Gmail Import</span>
          </div>

          <div className="floating-pill pill-two">
            <Sparkles size={17} />
            <span>Clean Timetable View</span>
          </div>
        </div>

        <div className="login-panel">
          <div className="login-copy">
            <p className="eyebrow">Inbox2Table</p>
            <h1>Sign in to organize your class schedule.</h1>
            <p>
              Import your timetable from Gmail and keep your classes, rooms, and timings in one clean place.
            </p>
          </div>

          <button
            type="button"
            className="gmail-btn"
            onClick={handleGmailLogin}
            disabled={isLoading || !hasAcceptedLegal}
            aria-busy={isLoading}
          >
            <span className="gmail-icon-wrap">
              {isLoading ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <img src="/gmail.svg" alt="" className="gmail-mark" />
              )}
            </span>
            <span>{wakeMessage ? 'Waking backend...' : isLoading ? 'Connecting...' : 'Continue with Gmail'}</span>
          </button>

          <div className="legal-consent" role="group" aria-label="Privacy and terms agreement">
            {!hasAcceptedLegal && (
              <p className="legal-consent__title">Review before continuing</p>
            )}

            <div className="legal-consent__checks">
              <label className="legal-consent__check">
                <input
                  type="checkbox"
                  checked={hasAcceptedPrivacy}
                  onChange={(event) => setHasAcceptedPrivacy(event.target.checked)}
                />
                <span>
                  I agree to the <a href="/privacy">Privacy Policy</a>.
                </span>
              </label>

              <label className="legal-consent__check">
                <input
                  type="checkbox"
                  checked={hasAcceptedTerms}
                  onChange={(event) => setHasAcceptedTerms(event.target.checked)}
                />
                <span>
                  I agree to the <a href="/terms">Terms of Service</a>.
                </span>
              </label>
            </div>
          </div>

          {wakeMessage && (
            <div className="wake-box" role="status">
              <Loader className="wake-icon" />
              <div>
                <p className="wake-title">Starting backend</p>
                <p className="wake-desc">{wakeMessage}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="error-box" role="alert">
              <AlertCircle className="err-icon" />
              <div>
                <p className="err-title">
                  {error.includes('Popup blocked') ? 'Authentication blocked' : 'Authentication failed'}
                </p>
                <p className="err-desc">
                  {error.includes('Popup blocked')
                    ? 'Allow popups or try again in the same window.'
                    : 'Please try again or refresh the page.'}
                </p>
              </div>
            </div>
          )}

          <div className="login-footer">
            <div>
              <ShieldCheck size={16} />
              <span>OAuth secured</span>
            </div>
            <div>
              <CalendarDays size={16} />
              <span>Built for students</span>
            </div>
          </div>

          <div className="legal-links">
            <a href="/privacy">Privacy Policy</a>
            <span aria-hidden="true">/</span>
            <a href="/terms">Terms of Service</a>
          </div>
        </div>
      </section>
    </main>
  );
};

export default LoginScreen;

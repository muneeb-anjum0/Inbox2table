import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { BACKEND_WAKE_EVENT, apiService } from './services/api';
import { TimetableData, ApiResponse, StatusData, ConfigData } from './types/api';
import TimetableTable from './components/TimetableTable/TimetableTable';
import SummaryStats from './components/SummaryStats/SummaryStats';
import StatusIndicator from './components/StatusIndicator/StatusIndicator';
import SemesterManager from './components/SemesterManager/SemesterManager';
import LoginScreen from './components/LoginScreen/LoginScreen';
import ThemeToggle from './components/ThemeToggle/ThemeToggle';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChevronDown, Mail, Save } from 'lucide-react';
import { normalizeSemesterLabel, normalizeSemesterKey } from './utils/semesterNormalization';
import { TimetableItem } from './types/api';

const THEME_STORAGE_KEY = 'timetable-theme';

const expandSocialSciencesSemesterItems = (items: TimetableItem[]): TimetableItem[] => {
  const expandedItems: TimetableItem[] = [];

  items.forEach((item) => {
    const deptRaw = `${item.department || item.faculty || ''}`.toLowerCase();
    const rawSemester = `${item.semester_display || item.semester || item.semester_key || item.section || item.class_section || ''}`;

    if (!deptRaw.includes('social') || !deptRaw.includes('science') || !rawSemester.includes('/')) {
      expandedItems.push(item);
      return;
    }

    const parts = rawSemester.split('/').map((part) => part.trim()).filter(Boolean);

    if (parts.length < 2) {
      expandedItems.push(item);
      return;
    }

    parts.forEach((part) => {
      const normalizedDisplay = normalizeSemesterLabel(part);
      const normalizedKey = normalizeSemesterKey(part);

      expandedItems.push({
        ...item,
        semester_display: normalizedDisplay,
        semester: normalizedKey,
        semester_key: normalizedKey,
        section: normalizedDisplay,
        class_section: normalizedDisplay,
        semester_original: part,
      });
    });
  });

  return expandedItems;
};

const getOrdinalSuffix = (day: number) => {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th';

  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
};

const formatLastUpdate = (timestamp: string | null) => {
  if (!timestamp) return { date: 'Never', time: 'Awaiting first sync' };

  try {
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
      return { date: 'Unknown', time: 'Unknown time' };
    }

    const day = date.getDate();
    const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);
    const year = date.getFullYear();
    const time = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    return {
      date: `${day}${getOrdinalSuffix(day)} of ${month}, ${year}`,
      time,
    };
  } catch {
    return { date: 'Unknown', time: 'Unknown time' };
  }
};

const getMatchMedia = (query: string): MediaQueryList | null => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }

  return window.matchMedia(query);
};

function AppContent() {
  const { user, isAuthenticated, logout, loading: authLoading } = useAuth();

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark';

    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;

    return getMatchMedia('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
  });

  const logoutConfirmTimer = useRef<number | null>(null);

  const [logoutConfirmArmed, setLogoutConfirmArmed] = useState(false);
  const [isMobileQuickActions, setIsMobileQuickActions] = useState(() => {
    if (typeof window === 'undefined') return false;
    return getMatchMedia('(max-width: 768px)')?.matches ?? false;
  });

  const [isQuickActionsExpanded, setIsQuickActionsExpanded] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !(getMatchMedia('(max-width: 768px)')?.matches ?? false);
  });

  const [timetableData, setTimetableData] = useState<TimetableData | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [, setIsLoading] = useState(false);
  const [isScraperRunning, setIsScraperRunning] = useState(false);
  const [isSemesterUpdateRunning, setIsSemesterUpdateRunning] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'warning'>('idle');
  const [message, setMessage] = useState('');
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [showSemesterManager, setShowSemesterManager] = useState(false);
  const [operationInProgress, setOperationInProgress] = useState(false);
  const [isBackendWaking, setIsBackendWaking] = useState(false);
  const [personalEmail, setPersonalEmail] = useState('');
  const [isPersonalEmailSaving, setIsPersonalEmailSaving] = useState(false);

  const clearLogoutConfirmTimer = () => {
    if (logoutConfirmTimer.current !== null) {
      window.clearTimeout(logoutConfirmTimer.current);
      logoutConfirmTimer.current = null;
    }
  };

  const armLogoutConfirm = () => {
    clearLogoutConfirmTimer();
    setLogoutConfirmArmed(true);

    logoutConfirmTimer.current = window.setTimeout(() => {
      setLogoutConfirmArmed(false);
      logoutConfirmTimer.current = null;
    }, 4000);
  };

  const handleLogoutClick = () => {
    if (logoutConfirmArmed) {
      clearLogoutConfirmTimer();
      setLogoutConfirmArmed(false);
      logout();
      return;
    }

    armLogoutConfirm();
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    return () => {
      clearLogoutConfirmTimer();
    };
  }, []);

  useEffect(() => {
    const handleBackendWakeState = (event: Event) => {
      const { active, message: wakeMessage } = (event as CustomEvent<{ active: boolean; message?: string }>).detail;
      setIsBackendWaking(active);

      if (active) {
        setStatus('loading');
        setMessage(wakeMessage || 'Backend is waking up on Render. First request after inactivity can take about a minute.');
      }
    };

    window.addEventListener(BACKEND_WAKE_EVENT, handleBackendWakeState);
    return () => window.removeEventListener(BACKEND_WAKE_EVENT, handleBackendWakeState);
  }, []);

  useEffect(() => {
    const mobileQuery = getMatchMedia('(max-width: 768px)');
    if (!mobileQuery) return;

    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobileQuickActions(event.matches);
      setIsQuickActionsExpanded(!event.matches);
    };

    setIsMobileQuickActions(mobileQuery.matches);
    setIsQuickActionsExpanded(!mobileQuery.matches);

    if (mobileQuery.addEventListener) {
      mobileQuery.addEventListener('change', handleChange);
      return () => mobileQuery.removeEventListener('change', handleChange);
    }

    mobileQuery.addListener(handleChange);
    return () => mobileQuery.removeListener(handleChange);
  }, []);

  const configuredSemesters = React.useMemo(() => config?.semester_filter ?? [], [config]);

  const detectedSemesters = React.useMemo(() => {
    if (configuredSemesters.length > 0) return configuredSemesters;
    if (!timetableData?.items) return [];

    const semesterSet = new Set<string>();

    timetableData.items.forEach((item) => {
      const semesterLabel = normalizeSemesterLabel(
        item.semester_display ||
          item.semester ||
          item.semester_key ||
          item.section ||
          item.class_section
      );

      if (semesterLabel) {
        semesterSet.add(semesterLabel);
      }
    });

    return Array.from(semesterSet);
  }, [configuredSemesters, timetableData]);

  const noSemestersConfigured = detectedSemesters.length === 0;

  const loadConfig = async (): Promise<ConfigData | null> => {
    try {
      const response = await apiService.getConfig();

      if (response.success && response.data) {
        setConfig(response.data);
        setPersonalEmail(response.data.personal_email || '');
        return response.data;
      } else {
        console.error('Config load failed:', response);
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }

    return null;
  };

  const checkStatus = async () => {
    try {
      let response: ApiResponse<StatusData>;

      try {
        response = await apiService.getStatus();
      } catch (err) {
        console.warn('Network error when fetching status, attempting API autodetect and retry', err);
        await apiService.initialize();
        response = await apiService.getStatus();
      }

      if (response.success && response.data) {
        setLastUpdate(response.data.last_update);
      }
    } catch (error) {
      console.error('Error checking status:', error);
    }
  };

  const loadLatestTimetable = async (force = false) => {
    if (operationInProgress && !force) {
      return;
    }

    try {
      setStatus('warning');
      setMessage(lastUpdate ? 'Loading cached data...' : 'Loading previous data...');
      setIsLoading(true);
      setOperationInProgress(true);

      let response;

      try {
        response = await apiService.getLatestTimetable();
      } catch (err) {
        console.warn('Network error when fetching timetable, attempting API autodetect and retry', err);
        await apiService.initialize();
        response = await apiService.getLatestTimetable();
      }

      if (response.success && response.data) {
        setTimetableData(response.data);

        if (response.timestamp) {
          setLastUpdate(response.timestamp);
        }

        setStatus('success');
        setMessage(response.cached ? 'Loaded cached data' : 'Data loaded successfully');
      } else {
        setTimetableData(null);
        setStatus('warning');
        setMessage('No timetable data available. Try running a manual scrape.');
      }
    } catch (error) {
      console.error('Error loading timetable:', error);
      setTimetableData(null);
      setStatus('error');
      setMessage('Failed to load timetable data');
    } finally {
      setIsLoading(false);
      setOperationInProgress(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      const bootstrap = async () => {
        await loadConfig();
        await checkStatus();

        await loadLatestTimetable();

      };

      bootstrap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (config && timetableData && noSemestersConfigured && !isScraperRunning && !operationInProgress) {
      setStatus('warning');
      setMessage('No semesters configured. Please add semesters to filter and organize your schedule.');
    }
  }, [config, timetableData, noSemestersConfigured, isScraperRunning, operationInProgress]);

  const getFilteredTimetableItems = () => {
    const sourceItems = timetableData?.items ? expandSocialSciencesSemesterItems(timetableData.items) : [];

    const expandSocialSciencesForConfig = (items: TimetableItem[]) => {
      if (!config?.semester_filter || config.semester_filter.length < 2) return items;

      const expanded: TimetableItem[] = [];

      items.forEach((item) => {
        const deptRaw = (item.department || item.faculty || '').toString().toLowerCase();
        const isSocialSciences = deptRaw.includes('social') && deptRaw.includes('science');

        if (!isSocialSciences) {
          expanded.push(item);
          return;
        }

        const itemSemesterKey = normalizeSemesterKey(
          item.semester_key ||
            item.semester ||
            item.semester_display ||
            item.section ||
            item.class_section
        );

        const matchingConfigSemesters = config.semester_filter.filter((configSemester) => {
          const configSemesterKey = normalizeSemesterKey(configSemester);

          if (!configSemesterKey || !itemSemesterKey) return false;

          return (
            itemSemesterKey === configSemesterKey ||
            itemSemesterKey.endsWith(configSemesterKey) ||
            configSemesterKey.endsWith(itemSemesterKey)
          );
        });

        const targetSemesters = matchingConfigSemesters.length > 0 ? config.semester_filter : [];

        if (targetSemesters.length === 0) {
          expanded.push(item);
          return;
        }

        targetSemesters.forEach((targetSemester) => {
          const normalizedDisplay = normalizeSemesterLabel(targetSemester);
          const normalizedKey = normalizeSemesterKey(targetSemester);

          expanded.push({
            ...item,
            semester_display: normalizedDisplay,
            semester: normalizedKey,
            semester_key: normalizedKey,
            section: normalizedDisplay,
            class_section: normalizedDisplay,
            semester_original: targetSemester,
          });
        });
      });

      return expanded;
    };

    if (!timetableData?.items || !config?.semester_filter || config.semester_filter.length === 0) {
      return sourceItems;
    }

    const filteredItems = sourceItems.filter((item) => {
      const itemSemesterKey = normalizeSemesterKey(
        item.semester_key ||
          item.semester ||
          item.semester_display ||
          item.section ||
          item.class_section
      );

      if (!itemSemesterKey) return false;

      return config.semester_filter.some((configSemester) => {
        const configSemesterKey = normalizeSemesterKey(configSemester);
        if (!configSemesterKey) return false;

        const directMatch =
          itemSemesterKey === configSemesterKey ||
          itemSemesterKey.endsWith(configSemesterKey) ||
          configSemesterKey.endsWith(itemSemesterKey);

        if (directMatch) return true;

        const deptRaw = (item.department || item.faculty || '').toString().toLowerCase();

        if (deptRaw.includes('social') && deptRaw.includes('science')) {
          const rawSemester = (
            item.semester_display ||
            item.semester ||
            item.semester_key ||
            item.section ||
            item.class_section ||
            ''
          ).toString();

          if (rawSemester && rawSemester.includes('/')) {
            const parts = rawSemester.split('/').map((part: string) => part.trim()).filter(Boolean);

            for (const part of parts) {
              const partKey = normalizeSemesterKey(part);
              if (!partKey) continue;

              if (
                partKey === configSemesterKey ||
                partKey.endsWith(configSemesterKey) ||
                configSemesterKey.endsWith(partKey)
              ) {
                return true;
              }
            }
          }
        }

        return false;
      });
    });

    const expandedFilteredItems = expandSocialSciencesForConfig(filteredItems);

    if (expandedFilteredItems.length === 0 && sourceItems.length > 0) {
      return sourceItems;
    }

    return expandedFilteredItems;
  };

  const runScraper = async () => {
    if (isScraperRunning || operationInProgress) {
      return;
    }

    if (!config?.semester_filter || config.semester_filter.length === 0) {
      setStatus('error');
      setMessage('No semesters configured. Please add semesters before running the parser.');
      return;
    }

    try {
      setIsScraperRunning(true);
      setIsLoading(true);
      setOperationInProgress(true);
      setStatus('loading');
      setMessage('Running parser...');

      const response = await apiService.runScraper();

      if (response.success && response.data) {
        setTimetableData(response.data);

        if (response.timestamp) {
          setLastUpdate(response.timestamp);
        }

        setStatus('success');
        setMessage(response.message || 'Parser completed successfully');
        await checkStatus();
      } else {
        setStatus('error');
        setMessage(response.error || 'Parser failed');
        setTimetableData(null);
      }
    } catch (error) {
      console.error('Error running scraper:', error);
      setStatus('error');
      setMessage('Failed to run parser');
      setTimetableData(null);
    } finally {
      setIsScraperRunning(false);
      setIsLoading(false);
      setOperationInProgress(false);
    }
  };

  const runScraperWithSemesters = async (_semestersList: string[]) => {
    if (isScraperRunning || operationInProgress) {
      return;
    }

    try {
      setIsScraperRunning(true);
      setIsLoading(true);
      setOperationInProgress(true);
      setStatus('loading');
      setMessage('Running parser...');

      const response = await apiService.runScraper();

      if (response.success && response.data) {
        setTimetableData(response.data);

        if (response.timestamp) {
          setLastUpdate(response.timestamp);
        }

        setStatus('success');
        setMessage(response.message || 'Parser completed successfully');
        await checkStatus();
      } else {
        setStatus('error');
        setMessage(response.error || 'Parser failed');
        setTimetableData(null);
      }
    } catch (error) {
      console.error('Error running scraper:', error);
      setStatus('error');
      setMessage('Failed to run parser');
      setTimetableData(null);
    } finally {
      setIsScraperRunning(false);
      setIsLoading(false);
      setOperationInProgress(false);
    }
  };

  const handleSavePersonalEmail = async () => {
    if (isPersonalEmailSaving || operationInProgress) {
      return;
    }

    const trimmedEmail = personalEmail.trim();

    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setStatus('error');
      setMessage('Please enter a valid personal email address.');
      return;
    }

    try {
      setIsPersonalEmailSaving(true);
      setStatus('loading');
      setMessage(trimmedEmail ? 'Saving daily email recipient...' : 'Disabling daily email delivery...');

      const response = await apiService.updatePersonalEmail(trimmedEmail);

      if (response.success) {
        setPersonalEmail(trimmedEmail);
        setConfig((currentConfig) => currentConfig ? {
          ...currentConfig,
          personal_email: trimmedEmail,
          daily_email_enabled: Boolean(trimmedEmail),
        } : currentConfig);
        setStatus('success');
        setMessage(
          trimmedEmail
            ? 'Daily timetable email saved. Automation will send it at 8:00 PM.'
            : 'Daily timetable email disabled.'
        );
      } else {
        setStatus('error');
        setMessage(response.error || 'Failed to save daily email recipient');
      }
    } catch (error) {
      console.error('Error saving personal email:', error);
      setStatus('error');
      setMessage('Failed to save daily email recipient');
    } finally {
      setIsPersonalEmailSaving(false);
    }
  };

  const handleSaveSemesters = async (newSemesters: string[]) => {
    if (isSemesterUpdateRunning || operationInProgress) {
      return;
    }

    try {
      setIsSemesterUpdateRunning(true);
      setIsLoading(true);
      setOperationInProgress(true);
      setStatus('loading');
      setMessage('Updating semester settings...');

      const response = await apiService.updateSemesters(newSemesters);

      if (response.success) {
        setConfig((currentConfig) => ({
          gmail_query: currentConfig?.gmail_query || '',
          semester_filter: newSemesters,
          personal_email: currentConfig?.personal_email || personalEmail.trim(),
          daily_email_enabled: Boolean(currentConfig?.personal_email || personalEmail.trim()),
          schedule_time: currentConfig?.schedule_time || '00:00',
          timezone: currentConfig?.timezone || 'Asia/Karachi',
          max_results: currentConfig?.max_results || 50,
        }));

        await loadConfig();
        setTimetableData(null);

        setStatus('success');
        setMessage(`Successfully updated ${newSemesters.length} semester(s). Running parser...`);

        if (newSemesters.length > 0) {
          setTimeout(() => {
            runScraperWithSemesters(newSemesters);
          }, 500);
        } else {
          setStatus('warning');
          setMessage('No semesters configured. Please add semesters to filter your schedule.');
        }
      } else {
        setStatus('error');
        setMessage(response.error || 'Failed to update semesters');
      }
    } catch (error) {
      console.error('Error updating semesters:', error);
      setStatus('error');
      setMessage('Failed to update semesters');
    } finally {
      setIsSemesterUpdateRunning(false);
      setIsLoading(false);
      setOperationInProgress(false);
    }
  };

  if (authLoading) {
    return (
      <div className="app-loading-screen">
        <div className="app-loading-card">
          <div className="app-loading-spinner" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  const lastUpdateDisplay = formatLastUpdate(lastUpdate);
  const loggedInMobileLabel = user?.email ? user.email.split('@')[0] : 'User';
  const quickActionsToggleLabel = isQuickActionsExpanded ? 'Collapse quick actions' : 'Expand quick actions';
  const semesterCount = detectedSemesters.length;

  const runButtonText = isScraperRunning
    ? 'Scraping...'
    : isSemesterUpdateRunning
    ? 'Updating...'
    : 'Run Scraper';

  return (
    <div className="app-shell min-h-screen">
      <div className="app-shell__overlay" />

      <div className="relative z-10">
        <header className="topbar sticky top-0 z-40">
          <div className="layout-shell px-4 sm:px-6 lg:px-8 py-2" />
        </header>

        <main className="layout-shell px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5 sm:space-y-6">
          {isMobileQuickActions ? (
            <section className={`quick-mobile ${isQuickActionsExpanded ? 'quick-mobile--expanded' : 'quick-mobile--collapsed'}`}>
              <button
                type="button"
                className="quick-mobile__top"
                onClick={() => setIsQuickActionsExpanded((current) => !current)}
                aria-expanded={isQuickActionsExpanded}
                aria-label={quickActionsToggleLabel}
              >
                <span>
                  <span className="quick-mobile__eyebrow">Quick Actions</span>
                  <span className="quick-mobile__title">Schedule controls</span>
                </span>

                <span className="quick-mobile__chevron" aria-hidden="true">
                  <ChevronDown className="quick-mobile__chevron-icon" aria-hidden="true" />
                </span>
              </button>

              <div className="quick-mobile__body">
                <div className="quick-mobile__meta">
                  <div className="quick-mobile__meta-card">
                    <span className="quick-mobile__meta-label">Logged in</span>
                    <span className="quick-mobile__meta-value">{loggedInMobileLabel}</span>
                  </div>

                  <div className="quick-mobile__meta-card">
                    <span className="quick-mobile__meta-label">Last update</span>
                    <span className="quick-mobile__meta-value">
                      {lastUpdateDisplay.date}
                    </span>
                    <span className="quick-mobile__meta-subvalue">
                      {lastUpdateDisplay.time}
                    </span>
                  </div>
                </div>

                <div className="quick-mobile__actions">
                  <button
                    onClick={runScraper}
                    disabled={isScraperRunning || operationInProgress}
                    className={`mobile-action mobile-action--primary ${isScraperRunning ? 'mobile-action--running' : ''}`}
                  >
                    <span className="mobile-action__text">{runButtonText}</span>
                  </button>

                  <button
                    onClick={() => setShowSemesterManager(true)}
                    className={`mobile-action mobile-action--neutral ${
                      noSemestersConfigured
                        ? 'mobile-action--attention'
                        : ''
                    }`}
                  >
                    <span className="mobile-action__icon">
                      <img src="/setting.svg" alt="" className="theme-button-icon" />
                    </span>
                    <span className="mobile-action__text">Semesters</span>
                    <span className="mobile-action__count">{semesterCount}</span>
                  </button>

                  <div className="quick-mobile__theme">
                    <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
                    <span>{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
                  </div>

                  <div className="quick-mobile__signout">
                    <button
                      onClick={handleLogoutClick}
                      className={`mobile-action mobile-action--logout ${
                        logoutConfirmArmed ? 'mobile-action--danger' : ''
                      }`}
                    >
                      <span className="mobile-action__icon">
                        <img src="/logout.svg" alt="" className="theme-button-icon" />
                      </span>
                      <span className="mobile-action__text mobile-action__text--wrap">
                        {logoutConfirmArmed ? 'Confirm sign out' : 'Sign out'}
                      </span>
                    </button>

                    {logoutConfirmArmed && (
                      <button
                        onClick={() => {
                          clearLogoutConfirmTimer();
                          setLogoutConfirmArmed(false);
                        }}
                        className="mobile-action-cancel"
                        title="Cancel sign out"
                        aria-label="Cancel sign out"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                <div className="daily-email daily-email--mobile">
                  <div className="daily-email__label">
                    <Mail className="daily-email__icon" aria-hidden="true" />
                    <span>Daily email</span>
                  </div>

                  <div className="daily-email__controls">
                    <input
                      type="email"
                      value={personalEmail}
                      onChange={(event) => setPersonalEmail(event.target.value)}
                      placeholder="Personal email"
                      className="daily-email__input"
                      aria-label="Personal email for daily timetable"
                    />

                    <button
                      type="button"
                      onClick={handleSavePersonalEmail}
                      disabled={isPersonalEmailSaving || operationInProgress}
                      className="daily-email__save"
                      title="Save daily email recipient"
                      aria-label="Save daily email recipient"
                    >
                      <Save className="daily-email__save-icon" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <section className="surface-card p-4 action-panel">
              <div className="action-panel__header">
                <div>
                  <p className="action-panel__title">Quick Actions</p>
                  <h2>Manage your schedule</h2>
                </div>

                <div className="action-panel__meta">
                  <div className="action-panel__meta-item">
                    <span className="meta-label">Logged in</span>
                    <span className="meta-value theme-text-primary">{user?.email}</span>
                  </div>

                  <div className="action-panel__meta-item">
                    <span className="meta-label">Last updated</span>
                    <span className="meta-value meta-value--stacked">
                      <span>{lastUpdateDisplay.date}</span>
                      <span>{lastUpdateDisplay.time}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="action-rail">
                <button
                  onClick={runScraper}
                  disabled={isScraperRunning || operationInProgress}
                  className={`btn-pill btn-pill--primary ${isScraperRunning ? 'btn-pill--running' : ''}`}
                >
                  {runButtonText}
                </button>

                <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />

                <button
                  onClick={() => setShowSemesterManager(true)}
                  className={`btn-pill btn-pill--neutral ${
                    noSemestersConfigured ? 'btn-pill--attention' : ''
                  }`}
                >
                  <img src="/setting.svg" alt="Settings" className="theme-button-icon h-4 w-4 mr-2" />
                  Semesters
                  <span className="count-pill">{semesterCount}</span>
                </button>

                <div className="inline-flex items-center">
                  <button
                    onClick={handleLogoutClick}
                    className={`signout-chip ${logoutConfirmArmed ? 'signout-chip--armed' : 'signout-chip--idle'}`}
                  >
                    <img src="/logout.svg" alt="Logout" className="theme-button-icon signout-chip__icon" />
                    <span className="signout-chip__text">{logoutConfirmArmed ? 'Confirm' : 'Sign Out'}</span>
                  </button>

                  {logoutConfirmArmed && (
                    <button
                      onClick={() => {
                        clearLogoutConfirmTimer();
                        setLogoutConfirmArmed(false);
                      }}
                      className="signout-cancel"
                      title="Cancel sign out"
                      aria-label="Cancel sign out"
                    >
                      <span className="signout-cancel__mark" aria-hidden="true">×</span>
                      <span className="signout-cancel__text">Cancel</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="daily-email">
                <div className="daily-email__copy">
                  <div className="daily-email__label">
                    <Mail className="daily-email__icon" aria-hidden="true" />
                    <span>Daily email</span>
                  </div>
                  <p>Send the formatted timetable to your personal inbox every day at 8:00 PM.</p>
                </div>

                <div className="daily-email__controls">
                  <input
                    type="email"
                    value={personalEmail}
                    onChange={(event) => setPersonalEmail(event.target.value)}
                    placeholder="muneeb.anjum0@gmail.com"
                    className="daily-email__input"
                    aria-label="Personal email for daily timetable"
                  />

                  <button
                    type="button"
                    onClick={handleSavePersonalEmail}
                    disabled={isPersonalEmailSaving || operationInProgress}
                    className="daily-email__save"
                    title="Save daily email recipient"
                    aria-label="Save daily email recipient"
                  >
                    <Save className="daily-email__save-icon" aria-hidden="true" />
                    <span>{isPersonalEmailSaving ? 'Saving' : 'Save'}</span>
                  </button>
                </div>
              </div>
            </section>
          )}

          {(status !== 'idle' || config || isBackendWaking) && (
            <StatusIndicator
              status={
                status === 'loading'
                  ? 'loading'
                  : status === 'success'
                  ? 'success'
                  : status === 'warning'
                  ? 'warning'
                  : status === 'error'
                  ? 'error'
                  : 'success'
              }
              message={
                isBackendWaking
                  ? message || 'Backend is waking up on Render. First request after inactivity can take about a minute.'
                  : message ||
                (detectedSemesters.length > 0
                  ? `${detectedSemesters.length} semester(s) configured`
                  : 'Ready to configure semesters')
              }
            />
          )}

          {timetableData && !isScraperRunning && (
            <section className="animate-timetable-enter">
              <SummaryStats
                data={timetableData}
                config={config || undefined}
                filteredItems={getFilteredTimetableItems()}
              />
            </section>
          )}

          {timetableData && !isScraperRunning && timetableData.items && timetableData.items.length > 0 && (
            <section className="surface-card overflow-hidden animate-timetable-enter">
              <div className="surface-card__header">
                <h3 className="text-lg font-semibold theme-text-primary tracking-tight">Class Schedule</h3>
                <div className="flex items-center gap-2 timetable-count-pill rounded-full px-3 py-1 border">
                  <img src="/pulse.svg" alt="Pulse" className="theme-button-icon h-4 w-4" />
                  <span className="text-sm font-medium">{getFilteredTimetableItems().length} classes</span>
                </div>
              </div>
              <div className="p-0 timetable-container">
                <TimetableTable items={getFilteredTimetableItems()} />
              </div>
            </section>
          )}

          {noSemestersConfigured && !isScraperRunning && (
            <section className="surface-card surface-card--compact surface-card--callout animate-timetable-enter">
              <div className="compact-callout compact-callout--stacked">
                <div className="compact-callout__content">
                  <p className="compact-callout__eyebrow">Schedule setup</p>
                  <h3 className="compact-callout__title">Ready when you are</h3>
                  <p className="compact-callout__text">
                    Configure your semesters in Semester Manager, then run the scraper from Quick Actions to populate and organize your timetable.
                  </p>
                </div>
              </div>
            </section>
          )}
        </main>

        <footer className="bg-transparent border-0">
          <div className="w-full py-2 text-center text-xs theme-text-muted">
            &copy; {new Date().getFullYear()} Timetable Wizard v2.0
          </div>
        </footer>

        <SemesterManager
          isOpen={showSemesterManager}
          onClose={() => setShowSemesterManager(false)}
          currentSemesters={detectedSemesters}
          onSave={handleSaveSemesters}
        />
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

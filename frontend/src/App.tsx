import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { apiService } from './services/api';
import { TimetableData, ApiResponse, StatusData, ConfigData } from './types/api';
import TimetableTable from './components/TimetableTable/TimetableTable';
import SummaryStats from './components/SummaryStats/SummaryStats';
import StatusIndicator from './components/StatusIndicator/StatusIndicator';
import SemesterManager from './components/SemesterManager/SemesterManager';
import LoginScreen from './components/LoginScreen/LoginScreen';
import ThemeToggle from './components/ThemeToggle/ThemeToggle';
import { AuthProvider, useAuth } from './context/AuthContext';
import { normalizeSemesterLabel, normalizeSemesterKey } from './utils/semesterNormalization';
import { TimetableItem } from './types/api';

const THEME_STORAGE_KEY = 'timetable-theme';

const expandSocialSciencesSemesterItems = (items: TimetableItem[]): TimetableItem[] => {
  const expandedItems: TimetableItem[] = [];

  items.forEach(item => {
    const deptRaw = `${item.department || item.faculty || ''}`.toLowerCase();
    const rawSemester = `${item.semester_display || item.semester || item.semester_key || item.section || item.class_section || ''}`;

    if (!deptRaw.includes('social') || !deptRaw.includes('science') || !rawSemester.includes('/')) {
      expandedItems.push(item);
      return;
    }

    const parts = rawSemester.split('/').map(part => part.trim()).filter(Boolean);
    if (parts.length < 2) {
      expandedItems.push(item);
      return;
    }

    parts.forEach(part => {
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
  const [timetableData, setTimetableData] = useState<TimetableData | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isScraperRunning, setIsScraperRunning] = useState(false);
  const [isSemesterUpdateRunning, setIsSemesterUpdateRunning] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'warning'>('idle');
  const [message, setMessage] = useState('');
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [showSemesterManager, setShowSemesterManager] = useState(false);
  const [operationInProgress, setOperationInProgress] = useState(false);

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
    const mobileQuery = getMatchMedia('(max-width: 768px)');
    if (!mobileQuery) {
      return;
    }

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

  // Computed state
  const noSemestersConfigured = config && (!config.semester_filter || config.semester_filter.length === 0);

  // Helper function to filter timetable items based on configured semesters
  const getFilteredTimetableItems = () => {
    const sourceItems = timetableData?.items ? expandSocialSciencesSemesterItems(timetableData.items) : [];

    const expandSocialSciencesForConfig = (items: TimetableItem[]) => {
      if (!config?.semester_filter || config.semester_filter.length < 2) return items;

      const expanded: TimetableItem[] = [];
      items.forEach(item => {
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

        const matchingConfigSemesters = config.semester_filter.filter(configSemester => {
          const configSemesterKey = normalizeSemesterKey(configSemester);
          if (!configSemesterKey) return false;
          if (!itemSemesterKey) return false;
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

        targetSemesters.forEach(targetSemester => {
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
      console.log('📋 Filter info:', {
        hasItems: !!timetableData?.items,
        itemCount: sourceItems.length,
        hasConfig: !!config,
        hasSemesterFilter: !!config?.semester_filter,
        semesterCount: config?.semester_filter?.length || 0
      }); // Debug
      return sourceItems;
    }

    const filteredItems = sourceItems.filter(item => {
      const itemSemesterKey = normalizeSemesterKey(
        item.semester_key ||
        item.semester ||
        item.semester_display ||
        item.section ||
        item.class_section
      );
      if (!itemSemesterKey) return false;
      
      return config.semester_filter.some(configSemester => {
        const configSemesterKey = normalizeSemesterKey(configSemester);
        if (!configSemesterKey) return false;

        console.debug(`🔍 Comparing: "${itemSemesterKey}" vs "${configSemesterKey}"`);

        // Direct match checks
        const directMatch = (
          itemSemesterKey === configSemesterKey ||
          itemSemesterKey.endsWith(configSemesterKey) ||
          configSemesterKey.endsWith(itemSemesterKey)
        );
        if (directMatch) return true;

        // Special-case: Social Sciences often contains slash-separated semester labels
        // like "BSSS 1 / BS Psychology 1" where one part may match the configured
        // semester even if the overall normalized key doesn't. Only apply this
        // heuristic for items from the Social Sciences department to avoid false
        // positives in other faculties.
        const deptRaw = (item.department || item.faculty || '').toString().toLowerCase();
        if (deptRaw.includes('social') && deptRaw.includes('science')) {
          const rawSemester = (item.semester_display || item.semester || item.semester_key || item.section || item.class_section || '').toString();
          if (rawSemester && rawSemester.includes('/')) {
            const parts = rawSemester.split('/').map((p: string) => p.trim()).filter(Boolean);
            for (const part of parts) {
              const partKey = normalizeSemesterKey(part);
              if (!partKey) continue;
              if (
                partKey === configSemesterKey ||
                partKey.endsWith(configSemesterKey) ||
                configSemesterKey.endsWith(partKey)
              ) return true;
            }
          }
        }

        return false;
      });
    });

    const expandedFilteredItems = expandSocialSciencesForConfig(filteredItems);

    if (expandedFilteredItems.length === 0 && sourceItems.length > 0) {
      console.warn('⚠️ Semester filter returned no matches, falling back to showing all timetable items');
      return sourceItems;
    }

    console.log('🎯 Filtered from', sourceItems.length, 'to', expandedFilteredItems.length, 'items'); // Debug
    
    // NOTE: Removed deduplication logic as parser now correctly expands slash-separated
    // sections (e.g., "BS (AF) 6 A / BS (AF) 4 A") into separate items with their own
    // semester_display values. Deduplication would incorrectly remove these legitimate
    // separate entries.
    return expandedFilteredItems;
  };

  // Derive semesters from config or fallback to detected semesters from timetable data
  const detectedSemesters = React.useMemo(() => {
    if (config?.semester_filter && config.semester_filter.length > 0) return config.semester_filter;
    if (!timetableData?.items) return [];

    const set = new Set<string>();
    timetableData.items.forEach(item => {
      const sem = normalizeSemesterLabel(
        item.semester_display || item.semester || item.semester_key || item.section || item.class_section
      );
      if (sem) set.add(sem);
    });

    return Array.from(set);
  }, [config, timetableData]);

  // Load initial data on component mount (must be called before early returns)
  useEffect(() => {
    if (isAuthenticated) {
      loadLatestTimetable();
      loadConfig();
      checkStatus();
    }
  }, [isAuthenticated]);

  // Check for no semesters configured and set warning message
  useEffect(() => {
    if (config && timetableData && noSemestersConfigured && !isScraperRunning && !operationInProgress) {
      setStatus('warning');
      setMessage('No semesters configured. Please add semesters to filter and organize your schedule.');
    }
  }, [config, timetableData, noSemestersConfigured, isScraperRunning, operationInProgress]);

  // Show loading screen while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--theme-page-bg)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="theme-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  const loadConfig = async () => {
    try {
      console.log('🔄 Loading config...'); // Debug
      const response = await apiService.getConfig();
      console.log('📋 Config response:', response); // Debug log
      if (response.success && response.data) {
        console.log('✅ Config loaded successfully:', response.data); // Debug log
        setConfig(response.data);
        console.log('🎯 Config state updated with:', response.data.semester_filter); // Debug
      } else {
        console.error('❌ Config load failed, response:', response);
      }
    } catch (error) {
      console.error('❌ Error loading config:', error);
    }
  };

  const loadLatestTimetable = async (force = false) => {
    if (operationInProgress && !force) {
      console.log('Operation in progress, skipping timetable load');
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
      console.log('📊 Timetable response:', response); // Debug
      if (response.success && response.data) {
        console.log('✅ Timetable data loaded:', response.data.items?.length || 0, 'items'); // Debug
        setTimetableData(response.data);
        // If the API returned a timestamp for the cached data, use it to update Last Updated
        if (response.timestamp) {
          console.log('🕒 Setting last update from timetable response:', response.timestamp);
          setLastUpdate(response.timestamp);
        }
        setStatus('success');
        setMessage(response.cached ? 'Loaded cached data' : 'Data loaded successfully');
      } else {
        console.log('❌ Timetable load failed:', response); // Debug
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

  const runScraper = async () => {
    if (isScraperRunning || operationInProgress) {
      console.log('Scraper already running or operation in progress');
      return;
    }

    // Check if semesters are configured before running scraper
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
      console.log('🔄 Scraper response:', response); // Debug
      if (response.success && response.data) {
        console.log('✅ Scraper completed:', response.data.items?.length || 0, 'items'); // Debug
        setTimetableData(response.data);
        // Use timestamp returned by the scraper response if available
        if (response.timestamp) {
          console.log('🕒 Setting last update from scraper response:', response.timestamp);
          setLastUpdate(response.timestamp);
        }
        setStatus('success');
        setMessage(response.message || 'Parser completed successfully');
        await checkStatus(); // Update last update time
      } else {
        console.log('❌ Scraper failed:', response); // Debug
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

  // Special version of runScraper that bypasses semester validation (used for auto-run after updating semesters)
  const runScraperWithSemesters = async (semestersList: string[]) => {
    if (isScraperRunning || operationInProgress) {
      console.log('Scraper already running or operation in progress');
      return;
    }

    // This version skips the semester validation since we know semesters are configured
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
          console.log('🕒 Setting last update from scraper-with-semesters response:', response.timestamp);
          setLastUpdate(response.timestamp);
        }
        setStatus('success');
        setMessage(response.message || 'Parser completed successfully');
        await checkStatus(); // Update last update time
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

  const handleSaveSemesters = async (newSemesters: string[]) => {
    if (isSemesterUpdateRunning || operationInProgress) {
      console.log('Semester update already running or operation in progress');
      return;
    }
    
    try {
      setIsSemesterUpdateRunning(true);
      setIsLoading(true);
      setOperationInProgress(true);
      setStatus('loading');
      setMessage('Updating semester settings...');
      
      console.log('📤 [handleSaveSemesters] Starting with semesters:', newSemesters); // Debug
      console.log('📤 [handleSaveSemesters] User data from localStorage:', localStorage.getItem('user')); // Debug
      console.log('📤 [handleSaveSemesters] Sending semesters to backend:', newSemesters); // Debug
      
      const response = await apiService.updateSemesters(newSemesters);
      console.log('✅ [handleSaveSemesters] Update response:', response); // Debug
      
      if (response.success) {
        // Update local config immediately so mobile UI does not depend on a follow-up GET.
        setConfig((currentConfig) => ({
          gmail_query: currentConfig?.gmail_query || '',
          semester_filter: newSemesters,
          schedule_time: currentConfig?.schedule_time || '00:00',
          timezone: currentConfig?.timezone || 'Asia/Karachi',
          max_results: currentConfig?.max_results || 50,
        }));
        console.log('✅ [handleSaveSemesters] Local config updated immediately:', newSemesters); // Debug

        console.log('🔄 [handleSaveSemesters] Reloading config after semester update...'); // Debug
        // Reload config to get updated data - MUST await this
        await loadConfig();
        console.log('✅ [handleSaveSemesters] Config reloaded'); // Debug
        
        // Clear old timetable data since filters changed
        setTimetableData(null);
        
        setStatus('success');
        setMessage(`Successfully updated ${newSemesters.length} semester(s). Running parser...`);
        
        // Automatically run parser if there are allowed semesters
        if (newSemesters.length > 0) {
          console.log('⏱️ [handleSaveSemesters] Waiting before running scraper..., semesters:', newSemesters); // Debug
          // Delay to let state updates propagate
          setTimeout(() => {
            console.log('🚀 [handleSaveSemesters] Now running scraper with semesters:', newSemesters); // Debug
            runScraperWithSemesters(newSemesters);
          }, 500); // Reduced timeout since loadConfig already awaited
        } else {
          console.log('⚠️ [handleSaveSemesters] No semesters provided, skipping scraper'); // Debug
          setStatus('warning');
          setMessage('No semesters configured. Please add semesters to filter your schedule.');
        }
      } else {
        console.error('❌ [handleSaveSemesters] Failed to update semesters:', response.error || response); // Debug
        setStatus('error');
        setMessage(response.error || 'Failed to update semesters');
      }
    } catch (error) {
      console.error('❌ [handleSaveSemesters] Error updating semesters:', error);
      setStatus('error');
      setMessage('Failed to update semesters');
    } finally {
      setIsSemesterUpdateRunning(false);
      setIsLoading(false);
      setOperationInProgress(false);
    }
  };

  const lastUpdateDisplay = formatLastUpdate(lastUpdate);
  const loggedInMobileLabel = user?.email ? user.email.split('@')[0] : '';
  const quickActionsToggleLabel = isQuickActionsExpanded ? 'Collapse quick actions' : 'Expand quick actions';

  // Debug log to understand render conditions
  if (config && timetableData) {
    console.log('📱 Render conditions:', {
      hasConfig: !!config,
      noSemestersConfigured: noSemestersConfigured,
      isScraperRunning: isScraperRunning,
      hasTimetableData: !!timetableData,
      hasItems: !!timetableData.items,
      itemCount: timetableData.items?.length || 0,
      shouldShowTable: config && !noSemestersConfigured && !isScraperRunning && timetableData && timetableData.items && timetableData.items.length > 0
    }); // Debug
  }

  return (
    <div className="app-shell min-h-screen">
      <div className="app-shell__overlay"></div>
      <div className="relative z-10">
        <header className="topbar sticky top-0 z-40">
          <div className="layout-shell px-4 sm:px-6 lg:px-8 py-2"></div>
        </header>

        <main className="layout-shell px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5 sm:space-y-6">
          {isMobileQuickActions ? (
            <section className={`surface-card p-4 action-panel ${isQuickActionsExpanded ? 'action-panel--expanded' : 'action-panel--collapsed'}`}>
              <button
                type="button"
                className="action-panel__toggle"
                onClick={() => setIsQuickActionsExpanded((current) => !current)}
                aria-expanded={isQuickActionsExpanded}
                aria-label={quickActionsToggleLabel}
              >
                <span className="action-panel__title">Quick Actions</span>
                <span className="action-panel__chevron" aria-hidden="true">
                  <span className="action-panel__chevron-mark">⌄</span>
                </span>
              </button>
              <div className="action-panel__body">
                <div className="action-panel__meta">
                  <div className="action-panel__meta-item">
                    <span className="meta-label">Logged in</span>
                    <span className="meta-value theme-text-primary">
                      <span className="desktop-only">{user?.email}</span>
                      <span className="mobile-only">{loggedInMobileLabel}</span>
                    </span>
                  </div>
                  <div className="action-panel__meta-item">
                    <span className="meta-label">Last updated</span>
                    <span className="meta-value meta-value--stacked">
                      <span>{lastUpdateDisplay.date}</span>
                      <span>{lastUpdateDisplay.time}</span>
                    </span>
                  </div>
                </div>
                <div className="action-rail">
                  <button
                    onClick={runScraper}
                    disabled={isScraperRunning || operationInProgress}
                    className={`btn-pill btn-pill--primary ${isScraperRunning ? 'btn-pill--running' : ''}`}
                  >
                    <img src="/refresh.svg" alt="Refresh" className={`btn-pill__icon theme-button-icon ${isScraperRunning ? 'animate-spin' : ''}`} />
                    <span className="action-button__label">
                      {isScraperRunning ? 'Scraping...' : isSemesterUpdateRunning ? 'Updating...' : 'Run Scraper'}
                    </span>
                  </button>

                  <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />

                  <button
                    onClick={() => setShowSemesterManager(true)}
                    className={`btn-pill btn-pill--neutral ${
                      timetableData && config && (!config.semester_filter || config.semester_filter.length === 0)
                        ? 'btn-pill--attention'
                        : ''
                    }`}
                  >
                    <img src="/setting.svg" alt="Settings" className="theme-button-icon h-4 w-4 mr-2" />
                    <span className="action-button__label">Semesters</span>
                    <span className="count-pill">{detectedSemesters.length || 0}</span>
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
              </div>
            </section>
          ) : (
            <section className="surface-card p-4 action-panel">
              <div className="action-panel__header">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] theme-text-muted font-semibold">Quick Actions</p>
                  <h2 className="text-xl font-semibold theme-text-primary">Manage your schedule</h2>
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
                  <img src="/refresh.svg" alt="Refresh" className={`btn-pill__icon theme-button-icon ${isScraperRunning ? 'animate-spin' : ''}`} />
                  {isScraperRunning ? 'Scraping...' : isSemesterUpdateRunning ? 'Updating...' : 'Run Scraper'}
                </button>

                <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />

                <button
                  onClick={() => setShowSemesterManager(true)}
                  className={`btn-pill btn-pill--neutral ${
                    timetableData && config && (!config.semester_filter || config.semester_filter.length === 0)
                      ? 'btn-pill--attention'
                      : ''
                  }`}
                >
                  <img src="/setting.svg" alt="Settings" className="theme-button-icon h-4 w-4 mr-2" />
                  Semesters
                  <span className="count-pill">{detectedSemesters.length || 0}</span>
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
            </section>
          )}

          {(status !== 'idle' || config) && (
            <StatusIndicator
              status={status === 'loading' ? 'loading' : status === 'success' ? 'success' : status === 'warning' ? 'warning' : status === 'error' ? 'error' : 'success'}
              message={message || (config?.semester_filter && config.semester_filter.length > 0 ? `${config.semester_filter.length} semester(s) configured` : 'Ready to configure semesters')}
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

          {(config && !timetableData) && (
            <section className="surface-card p-7 sm:p-8 text-center">
              <img src="/pulse.svg" alt="Start" className="theme-button-icon mx-auto h-11 w-11 mb-3 opacity-70" />
              <h3 className="text-lg font-semibold theme-text-primary mb-2">Ready When You Are</h3>
              <p className="theme-text-secondary max-w-xl mx-auto mb-5">
                Configure your semesters and run the scraper to populate the timetable.
              </p>
              <button onClick={runScraper} disabled={isScraperRunning || operationInProgress} className={`btn-pill btn-pill--primary ${isScraperRunning ? 'btn-pill--running' : ''}`}>
                <img src="/refresh.svg" alt="Refresh" className={`btn-pill__icon theme-button-icon ${isScraperRunning ? 'animate-spin' : ''}`} />
                {isScraperRunning ? 'Scraping...' : 'Fetch Schedule'}
              </button>
            </section>
          )}

          {(!isScraperRunning && timetableData && timetableData.items && timetableData.items.length > 0) && (
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

          {(noSemestersConfigured && (timetableData || isScraperRunning)) && (
            <section className="surface-card p-8 text-center animate-timetable-enter">
              <img src="/setting.svg" alt="Setting" className="theme-button-icon mx-auto mb-4 h-12 w-12 opacity-70" />
              <h3 className="text-lg font-semibold theme-text-primary mb-2">Configure Semesters to View Schedule</h3>
              <p className="theme-text-secondary mb-6 max-w-xl mx-auto">
                You have schedule data available, but need semester filters to organize and display your classes cleanly.
              </p>
              <button onClick={() => setShowSemesterManager(true)} className="btn-pill btn-pill--neutral">
                <img src="/add.svg" alt="Add" className="theme-button-icon h-4 w-4 mr-2" />
                Add Semesters
              </button>
            </section>
          )}
        </main>

        <footer className="bg-transparent border-0">
          <div className="w-full py-2 text-center text-xs theme-text-muted">&copy; {new Date().getFullYear()} Timetable Wizard v2.0</div>
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

// Main App component with AuthProvider
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
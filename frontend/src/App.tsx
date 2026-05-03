import React, { useState, useEffect } from 'react';
import './App.css';
import { apiService } from './services/api';
import { TimetableData, ApiResponse, StatusData, ConfigData } from './types/api';
import TimetableTable from './components/TimetableTable/TimetableTable';
import SummaryStats from './components/SummaryStats/SummaryStats';
import StatusIndicator from './components/StatusIndicator/StatusIndicator';
import SemesterManager from './components/SemesterManager/SemesterManager';
import LoginScreen from './components/LoginScreen/LoginScreen';
import { AuthProvider, useAuth } from './context/AuthContext';

function AppContent() {
  const { user, isAuthenticated, logout, loading: authLoading } = useAuth();
  // Custom sign out confirmation dialog
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const handleLogoutClick = () => setShowLogoutConfirm(true);
  const handleLogoutConfirm = () => {
    setShowLogoutConfirm(false);
    logout();
  };
  const handleLogoutCancel = () => setShowLogoutConfirm(false);
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

  // Computed state
  const noSemestersConfigured = config && (!config.semester_filter || config.semester_filter.length === 0);

  const normalizeSemesterKey = (value?: string | null) => {
    if (!value) return '';
    return value.toUpperCase().replace(/[^A-Z0-9]+/g, '');
  };

  // Helper function to filter timetable items based on configured semesters
  const getFilteredTimetableItems = () => {
    if (!timetableData?.items || !config?.semester_filter || config.semester_filter.length === 0) {
      return timetableData?.items || [];
    }

    const filteredItems = timetableData.items.filter(item => {
      const itemSemesterKey = normalizeSemesterKey(item.semester_key || item.semester);
      if (!itemSemesterKey) return false;
      
      return config.semester_filter.some(configSemester => {
        const configSemesterKey = normalizeSemesterKey(configSemester);
        if (!configSemesterKey) return false;

        console.debug(`🔍 Comparing: "${itemSemesterKey}" vs "${configSemesterKey}"`);

        return (
          itemSemesterKey === configSemesterKey ||
          itemSemesterKey.endsWith(configSemesterKey) ||
          configSemesterKey.endsWith(itemSemesterKey)
        );
      });
    });

    // Deduplicate items based on course code, semester, time, and room
    // This prevents duplicate entries for the same class
    const deduplicatedItems = filteredItems.filter((item, index, array) => {
      const semesterKey = normalizeSemesterKey(item.semester_key || item.semester);
      const currentKey = `${semesterKey}-${item.course || item.course_code}-${item.time}-${item.room}`;
      return array.findIndex(otherItem => {
        const otherSemesterKey = normalizeSemesterKey(otherItem.semester_key || otherItem.semester);
        const otherKey = `${otherSemesterKey}-${otherItem.course || otherItem.course_code}-${otherItem.time}-${otherItem.room}`;
        return otherKey === currentKey;
      }) === index;
    });

    console.debug(`🎯 Filtered from ${timetableData.items.length} to ${filteredItems.length} items, deduplicated to ${deduplicatedItems.length} items`);
    
    return deduplicatedItems;
  };

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
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
      const response = await apiService.getConfig();
      console.log('Config response:', response); // Debug log
      if (response.success && response.data) {
        setConfig(response.data);
        console.log('Loaded config:', response.data); // Debug log
      } else {
        console.error('Failed to load config:', response);
      }
    } catch (error) {
      console.error('Error loading config:', error);
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
      const response = await apiService.getLatestTimetable();
      if (response.success && response.data) {
        setTimetableData(response.data);
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

  const checkStatus = async () => {
    try {
      const response: ApiResponse<StatusData> = await apiService.getStatus();
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
      if (response.success && response.data) {
        setTimetableData(response.data);
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
      
      const response = await apiService.updateSemesters(newSemesters);
      if (response.success) {
        // Reload config to get updated data
        await loadConfig();
        
        // Clear old timetable data since filters changed
        setTimetableData(null);
        
        setStatus('success');
        setMessage(`Successfully updated ${newSemesters.length} allowed semesters. Run parser to apply new filters.`);
        
        // Automatically run parser if there are allowed semesters
        if (newSemesters.length > 0) {
          setMessage(`Successfully updated ${newSemesters.length} allowed semesters. Running parser...`);
          // Small delay to let config state update, then run parser
          setTimeout(() => {
            runScraperWithSemesters(newSemesters);
          }, 1000);
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

  const formatLastUpdate = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return 'Unknown';
    }
  };

  return (
    <div className="app-shell min-h-screen">
      <div className="app-shell__overlay"></div>
      <div className="relative z-10">
        <header className="topbar sticky top-0 z-40">
          <div className="layout-shell px-4 sm:px-6 lg:px-8 py-2"></div>
        </header>

        <main className="layout-shell px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5 sm:space-y-6">
          <section className="surface-card p-4 action-panel">
            <div className="action-panel__header">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500 font-semibold">Quick Actions</p>
                <h2 className="text-xl font-semibold text-slate-900">Manage your schedule</h2>
              </div>
              <div className="action-panel__meta">
                <div className="action-panel__meta-item">
                  <span className="meta-label">Logged in</span>
                  <span className="meta-value">{user?.email}</span>
                </div>
                <div className="action-panel__meta-item">
                  <span className="meta-label">Last updated</span>
                  <span className="meta-value">{formatLastUpdate(lastUpdate)}</span>
                </div>
              </div>
            </div>
            <div className="action-rail">
              <button
                onClick={runScraper}
                disabled={isScraperRunning || operationInProgress}
                className="btn-pill btn-pill--primary"
              >
                <img src="/refresh.svg" alt="Refresh" className={`h-4 w-4 mr-2 ${isScraperRunning ? 'animate-spin' : ''}`} />
                {isScraperRunning ? 'Scraping...' : isSemesterUpdateRunning ? 'Updating...' : 'Run Scraper'}
              </button>

              <button
                onClick={() => setShowSemesterManager(true)}
                className={`btn-pill btn-pill--neutral ${
                  timetableData && config && (!config.semester_filter || config.semester_filter.length === 0)
                    ? 'btn-pill--attention'
                    : ''
                }`}
              >
                <img src="/setting.svg" alt="Settings" className="h-4 w-4 mr-2" />
                Semesters
                <span className="count-pill">{config?.semester_filter?.length || 0}</span>
              </button>

              <div className="inline-flex items-center gap-2">
                {!showLogoutConfirm ? (
                  <button onClick={handleLogoutClick} className="btn-pill btn-pill--ghost">
                    <img src="/logout.svg" alt="Logout" className="h-4 w-4 mr-2" />
                    Sign Out
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleLogoutConfirm}
                      className="btn-pill border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                    >
                      Confirm Sign Out?
                    </button>
                    <button
                      onClick={handleLogoutCancel}
                      className="btn-pill border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    >
                      Cancel Sign Out?
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>

          {(status !== 'idle' || config) && (
            <StatusIndicator
              status={status === 'loading' ? 'loading' : status === 'success' ? 'success' : status === 'warning' ? 'warning' : status === 'error' ? 'error' : 'success'}
              message={message || (config?.semester_filter && config.semester_filter.length > 0 ? `${config.semester_filter.length} semester(s) configured` : 'Ready to configure semesters')}
            />
          )}

          {config && timetableData && !isScraperRunning && (
            <SummaryStats
              data={timetableData}
              config={config || undefined}
              filteredItems={getFilteredTimetableItems()}
            />
          )}

          {(config && !timetableData) && (
            <section className="surface-card p-7 sm:p-8 text-center">
              <img src="/pulse.svg" alt="Start" className="mx-auto h-11 w-11 mb-3 opacity-70" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Ready When You Are</h3>
              <p className="text-gray-600 max-w-xl mx-auto mb-5">
                Configure your semesters and run the scraper to populate the timetable.
              </p>
              <button onClick={runScraper} disabled={isScraperRunning || operationInProgress} className="btn-pill btn-pill--primary">
                <img src="/refresh.svg" alt="Refresh" className={`h-4 w-4 mr-2 ${isScraperRunning ? 'animate-spin' : ''}`} />
                {isScraperRunning ? 'Scraping...' : 'Fetch Schedule'}
              </button>
            </section>
          )}

          {config && !noSemestersConfigured && !isScraperRunning && timetableData && timetableData.items && timetableData.items.length > 0 && (
            <section className="surface-card overflow-hidden">
              <div className="surface-card__header">
                <h3 className="text-lg font-semibold text-gray-900 tracking-tight">Class Schedule</h3>
                <div className="flex items-center gap-2 bg-blue-50 rounded-full px-3 py-1 border border-blue-100">
                  <img src="/pulse.svg" alt="Pulse" className="h-4 w-4" />
                  <span className="text-sm text-blue-700 font-medium">{getFilteredTimetableItems().length} classes</span>
                </div>
              </div>
              <div className="p-0 timetable-container">
                <TimetableTable items={getFilteredTimetableItems()} />
              </div>
            </section>
          )}

          {(noSemestersConfigured && (timetableData || isScraperRunning)) && (
            <section className="surface-card p-8 text-center">
              <img src="/setting.svg" alt="Setting" className="mx-auto mb-4 h-12 w-12 opacity-70" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Configure Semesters to View Schedule</h3>
              <p className="text-gray-600 mb-6 max-w-xl mx-auto">
                You have schedule data available, but need semester filters to organize and display your classes cleanly.
              </p>
              <button onClick={() => setShowSemesterManager(true)} className="btn-pill btn-pill--neutral">
                <img src="/add.svg" alt="Add" className="h-4 w-4 mr-2" />
                Add Semesters
              </button>
            </section>
          )}
        </main>

        <footer className="bg-transparent border-0">
          <div className="w-full py-2 text-center text-xs text-gray-300">&copy; {new Date().getFullYear()} Timetable Wizard v2.0</div>
        </footer>

        <SemesterManager
          isOpen={showSemesterManager}
          onClose={() => setShowSemesterManager(false)}
          currentSemesters={config?.semester_filter || []}
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
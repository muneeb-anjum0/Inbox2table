import axios, { AxiosResponse } from 'axios';
import { ApiResponse, TimetableData, ConfigData, StatusData } from '../types/api';

export const BACKEND_WAKE_EVENT = 'backend-wake-state';
const BACKEND_WAKE_DELAY_MS = 4500;

const getBackendWakeMessage = (url?: string) => {
  if (url?.includes('/api/scrape')) {
    return 'Backend is waking up on Render. The parser will start as soon as the service is ready.';
  }

  return 'Backend is waking up on Render. First request after inactivity can take about a minute.';
};

const emitBackendWakeState = (active: boolean, message?: string) => {
  window.dispatchEvent(
    new CustomEvent(BACKEND_WAKE_EVENT, {
      detail: { active, message },
    })
  );
};

// Dynamic API base URL helper
const getLocalApiBaseUrl = () => {
  const hostname = window.location.hostname;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:5000';
  }

  return `http://${hostname}:5000`;
};

const INITIAL_API_BASE = process.env.REACT_APP_API_URL || getLocalApiBaseUrl();

console.log('API initial candidate Base URL:', INITIAL_API_BASE); // Debug

// Create axios instance with initial base - will be overridden if detection finds a better one
const api = axios.create({
  baseURL: INITIAL_API_BASE,
  timeout: 120000,
  withCredentials: true,
});

// Rate limiting for API calls
const rateLimiter = {
  lastCalls: new Map<string, number>(),
  minInterval: 1000, // Minimum 1 second between same API calls
  
  shouldBlock(endpoint: string): boolean {
    const now = Date.now();
    const lastCall = this.lastCalls.get(endpoint);
    
    if (lastCall && (now - lastCall) < this.minInterval) {
      return true;
    }
    
    this.lastCalls.set(endpoint, now);
    return false;
  }
};

// Add request interceptor to include user email in headers
api.interceptors.request.use((config) => {
  const wakeTimer = window.setTimeout(() => {
    emitBackendWakeState(true, getBackendWakeMessage(config.url));
  }, BACKEND_WAKE_DELAY_MS);

  (config as any).metadata = {
    ...((config as any).metadata || {}),
    wakeTimer,
  };

  const user = localStorage.getItem('user');
  if (user) {
    try {
      const userData = JSON.parse(user);
      if (userData.email) {
        config.headers['X-User-Email'] = userData.email;
        console.log('📤 [API REQUEST] Adding X-User-Email header:', userData.email); // Debug log
        console.log('📤 [API REQUEST] URL:', (config.baseURL || '') + (config.url || '')); // Debug
        console.log('📤 [API REQUEST] Method:', config.method?.toUpperCase()); // Debug
        console.log('📤 [API REQUEST] Data:', config.data); // Debug
      }
    } catch (error) {
      console.error('❌ [API] Error parsing user data:', error);
    }
  } else {
    console.warn('⚠️ [API] No user data found in localStorage'); // Debug log
  }
  return config;
});

// Add response interceptor to log all responses
api.interceptors.response.use(
  (response) => {
    const wakeTimer = (response.config as any).metadata?.wakeTimer;
    if (wakeTimer) {
      window.clearTimeout(wakeTimer);
      emitBackendWakeState(false);
    }

    console.log('✅ [API RESPONSE]', response.config.url, 'Status:', response.status, 'Data:', response.data); // Debug
    return response;
  },
  (error) => {
    const wakeTimer = (error.config as any)?.metadata?.wakeTimer;
    if (wakeTimer) {
      window.clearTimeout(wakeTimer);
      emitBackendWakeState(false);
    }

    console.error('❌ [API ERROR]', error.config?.url, 'Status:', error.response?.status, 'Error:', error.response?.data); // Debug
    return Promise.reject(error);
  }
);

export const apiService = {
  // Expose axios instance for advanced usage
  _axiosInstance: api,

  // Initialize and auto-detect a working backend base URL
  initialize: async (): Promise<string> => {
    const candidates: string[] = [];

    if (process.env.REACT_APP_API_URL) candidates.push(process.env.REACT_APP_API_URL);
    candidates.push('http://localhost:5000');
    candidates.push('http://127.0.0.1:5000');

    try {
      const host = window.location.hostname;
      // Try same host with backend port
      candidates.push(`http://${host}:5000`);
    } catch (e) {
      // ignore
    }

    // Remove duplicates
    const uniqCandidates = Array.from(new Set(candidates.filter(Boolean)));

    const timeout = (ms: number) => new Promise(res => setTimeout(res, ms));

    for (const candidate of uniqCandidates) {
      try {
        console.log('🔎 [API INIT] Testing candidate:', candidate);
        const controller = new AbortController();
        const signal = controller.signal;
        const timer = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(`${candidate}/api/health`, { method: 'GET', mode: 'cors', signal });
        clearTimeout(timer);

        if (res.ok) {
          api.defaults.baseURL = candidate;
          console.log('✅ [API INIT] Selected backend base URL:', candidate);
          return candidate;
        }
      } catch (err) {
        console.warn('❌ [API INIT] Candidate failed:', candidate, err?.toString?.() || err);
        // try next
        await timeout(200);
      }
    }

    // If nothing matched, keep initial base
    console.warn('⚠️ [API INIT] No candidate responded. Using initial base:', api.defaults.baseURL);
    return api.defaults.baseURL as string;
  },

  getBaseOrigin: (): string => {
    try {
      if (api.defaults && api.defaults.baseURL) return new URL(api.defaults.baseURL).origin;
    } catch (e) {
      // fallback
    }
    try {
      return new URL(process.env.REACT_APP_API_URL || window.location.origin).origin;
    } catch {
      return window.location.origin;
    }
  },

  // Gmail OAuth Authentication
  getGmailAuthUrl: async (frontendOrigin: string): Promise<{ auth_url: string; state: string }> => {
    const response: AxiosResponse<{ auth_url: string; state: string }> = await api.get('/api/auth/gmail', {
      params: { frontend_origin: frontendOrigin }
    });
    return response.data;
  },

  // Basic Authentication (fallback)
  login: async (email: string): Promise<{ success: boolean; user?: { id: string; email: string }; error?: string }> => {
    const response: AxiosResponse<{ success: boolean; user?: { id: string; email: string }; error?: string }> = await api.post('/api/auth/login', {
      email
    });
    return response.data;
  },

  // Health check
  healthCheck: async (): Promise<ApiResponse> => {
    const response: AxiosResponse<ApiResponse> = await api.get('/api/health');
    return response.data;
  },

  // Get configuration
  getConfig: async (): Promise<ApiResponse<ConfigData>> => {
    const response: AxiosResponse<ConfigData> = await api.get('/api/config');
    return {
      success: true,
      data: response.data,
      timestamp: new Date().toISOString()
    };
  },

  // Update semesters
  updateSemesters: async (semesters: string[]): Promise<ApiResponse> => {
    if (rateLimiter.shouldBlock('/api/config/semesters')) {
      throw new Error('Please wait before updating semesters again');
    }
    console.log('🔄 [updateSemesters] Starting update with semesters:', semesters); // Debug
    const payload = { semesters };
    console.log('🔄 [updateSemesters] Payload:', payload); // Debug
    const response: AxiosResponse<ApiResponse> = await api.post('/api/config/semesters', payload);
    console.log('🔄 [updateSemesters] Response:', response.data); // Debug
    return response.data;
  },

  // Update daily timetable recipient
  updatePersonalEmail: async (personalEmail: string): Promise<ApiResponse<{ personal_email: string; daily_email_enabled: boolean }>> => {
    if (rateLimiter.shouldBlock('/api/config/personal-email')) {
      throw new Error('Please wait before updating your email again');
    }

    const response: AxiosResponse<ApiResponse<{ personal_email: string; daily_email_enabled: boolean }>> = await api.post('/api/config/personal-email', {
      personal_email: personalEmail,
    });
    return response.data;
  },

  // Send a test daily timetable email for the logged-in user
  sendTestTimetableEmail: async (): Promise<ApiResponse<{ items: number; personal_email: string }>> => {
    if (rateLimiter.shouldBlock('/api/automation/send-test-timetable-email')) {
      throw new Error('Please wait before sending another test email');
    }

    const response: AxiosResponse<ApiResponse<{ items: number; personal_email: string }>> = await api.post('/api/automation/send-test-timetable-email');
    return response.data;
  },

  // Run scraper
  runScraper: async (): Promise<ApiResponse<TimetableData>> => {
    if (rateLimiter.shouldBlock('/api/scrape')) {
      throw new Error('Please wait before running the scraper again');
    }
    const user = localStorage.getItem('user');
    const payload = user ? { user_email: JSON.parse(user).email } : {};
    const response: AxiosResponse<ApiResponse<TimetableData>> = await api.post('/api/scrape', payload);
    return response.data;
  },

  // Get latest timetable
  getLatestTimetable: async (): Promise<ApiResponse<TimetableData>> => {
    const response: AxiosResponse<ApiResponse<TimetableData>> = await api.get('/api/timetable');
    return response.data;
  },

  // Get status
  getStatus: async (): Promise<ApiResponse<StatusData>> => {
    const response: AxiosResponse<ApiResponse<StatusData>> = await api.get('/api/status');
    return response.data;
  },
};

export default apiService;

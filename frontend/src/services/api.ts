import axios, { AxiosResponse } from 'axios';
import { ApiResponse, TimetableData, ConfigData, StatusData } from '../types/api';

export const BACKEND_WAKE_EVENT = 'backend-wake-state';
const BACKEND_WAKE_DELAY_MS = 4500;
const PRODUCTION_API_BASE_URL = 'https://timetable-wizard.onrender.com';

const getBackendWakeMessage = (url?: string) =>
  url?.includes('/api/scrape')
    ? 'Backend is waking up on Render. The parser will start as soon as the service is ready.'
    : 'Backend is waking up on Render. First request after inactivity can take about a minute.';

const emitBackendWakeState = (active: boolean, message?: string) => {
  window.dispatchEvent(new CustomEvent(BACKEND_WAKE_EVENT, { detail: { active, message } }));
};

const getLocalApiBaseUrl = () => {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:5000';
  return PRODUCTION_API_BASE_URL;
};

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || getLocalApiBaseUrl(),
  timeout: 120000,
  withCredentials: true,
});

const rateLimiter = {
  lastCalls: new Map<string, number>(),
  minInterval: 1000,

  shouldBlock(endpoint: string): boolean {
    const now = Date.now();
    const lastCall = this.lastCalls.get(endpoint);
    if (lastCall && now - lastCall < this.minInterval) return true;
    this.lastCalls.set(endpoint, now);
    return false;
  },
};

api.interceptors.request.use((config) => {
  const wakeTimer = window.setTimeout(() => {
    emitBackendWakeState(true, getBackendWakeMessage(config.url));
  }, BACKEND_WAKE_DELAY_MS);

  (config as any).metadata = { ...((config as any).metadata || {}), wakeTimer };

  const user = localStorage.getItem('user');
  if (user) {
    try {
      const userData = JSON.parse(user);
      if (userData.email) config.headers['X-User-Email'] = userData.email;
    } catch (error) {
      console.error('Error parsing stored user data:', error);
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    const wakeTimer = (response.config as any).metadata?.wakeTimer;
    if (wakeTimer) {
      window.clearTimeout(wakeTimer);
      emitBackendWakeState(false);
    }
    return response;
  },
  (error) => {
    const wakeTimer = (error.config as any)?.metadata?.wakeTimer;
    if (wakeTimer) {
      window.clearTimeout(wakeTimer);
      emitBackendWakeState(false);
    }
    return Promise.reject(error);
  }
);

const withSettingsData = (responseData: any) => ({
  ...responseData,
  data: {
    personal_email: responseData.personal_email,
    daily_email_enabled: responseData.daily_email_enabled,
  },
});

export const apiService = {
  _axiosInstance: api,

  initialize: async (): Promise<string> => {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const candidates = Array.from(new Set([
      process.env.REACT_APP_API_URL,
      isLocalhost ? 'http://localhost:5000' : undefined,
      isLocalhost ? 'http://127.0.0.1:5000' : undefined,
      PRODUCTION_API_BASE_URL,
    ].filter(Boolean))) as string[];

    for (const candidate of candidates) {
      try {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${candidate}/api/health`, {
          method: 'GET',
          mode: 'cors',
          signal: controller.signal,
        });
        window.clearTimeout(timer);

        if (res.ok) {
          api.defaults.baseURL = candidate;
          return candidate;
        }
      } catch {
        await new Promise((resolve) => window.setTimeout(resolve, 200));
      }
    }

    return api.defaults.baseURL as string;
  },

  getBaseOrigin: (): string => {
    try {
      if (api.defaults.baseURL) return new URL(api.defaults.baseURL).origin;
    } catch {
      return window.location.origin;
    }
    return window.location.origin;
  },

  getGmailAuthUrl: async (frontendOrigin: string): Promise<{ auth_url: string; state: string }> => {
    const response: AxiosResponse<{ auth_url: string; state: string }> = await api.get('/api/auth/gmail', {
      params: { frontend_origin: frontendOrigin },
    });
    return response.data;
  },

  login: async (email: string): Promise<{ success: boolean; user?: { id: string; email: string }; error?: string }> => {
    const response: AxiosResponse<{ success: boolean; user?: { id: string; email: string }; error?: string }> = await api.post('/api/auth/login', { email });
    return response.data;
  },

  healthCheck: async (): Promise<ApiResponse> => {
    const response: AxiosResponse<ApiResponse> = await api.get('/api/health');
    return response.data;
  },

  getConfig: async (): Promise<ApiResponse<ConfigData>> => {
    const response: AxiosResponse<ConfigData> = await api.get('/api/config');
    return { success: true, data: response.data, timestamp: new Date().toISOString() };
  },

  updateSemesters: async (semesters: string[]): Promise<ApiResponse> => {
    if (rateLimiter.shouldBlock('/api/config/semesters')) {
      throw new Error('Please wait before updating semesters again');
    }
    const response: AxiosResponse<ApiResponse> = await api.post('/api/config/semesters', { semesters });
    return response.data;
  },

  updatePersonalEmail: async (personalEmail: string): Promise<ApiResponse<{ personal_email: string; daily_email_enabled: boolean }>> => {
    if (rateLimiter.shouldBlock('/api/config/personal-email')) {
      throw new Error('Please wait before updating your email again');
    }
    const response: AxiosResponse<any> = await api.post('/api/config/personal-email', { personal_email: personalEmail });
    return withSettingsData(response.data);
  },

  updateDailyEmailEnabled: async (enabled: boolean): Promise<ApiResponse<{ personal_email: string; daily_email_enabled: boolean }>> => {
    if (rateLimiter.shouldBlock('/api/config/daily-email-enabled')) {
      throw new Error('Please wait before updating daily email delivery again');
    }
    const response: AxiosResponse<any> = await api.post('/api/config/daily-email-enabled', { daily_email_enabled: enabled });
    return withSettingsData(response.data);
  },

  sendTestTimetableEmail: async (): Promise<ApiResponse<{ items: number; personal_email: string }>> => {
    if (rateLimiter.shouldBlock('/api/automation/send-test-timetable-email')) {
      throw new Error('Please wait before sending another email');
    }
    const response: AxiosResponse<ApiResponse<{ items: number; personal_email: string }>> = await api.post('/api/automation/send-test-timetable-email');
    return response.data;
  },

  runScraper: async (): Promise<ApiResponse<TimetableData>> => {
    if (rateLimiter.shouldBlock('/api/scrape')) {
      throw new Error('Please wait before running the scraper again');
    }
    const user = localStorage.getItem('user');
    const payload = user ? { user_email: JSON.parse(user).email } : {};
    const response: AxiosResponse<ApiResponse<TimetableData>> = await api.post('/api/scrape', payload);
    return response.data;
  },

  getLatestTimetable: async (): Promise<ApiResponse<TimetableData>> => {
    const response: AxiosResponse<ApiResponse<TimetableData>> = await api.get('/api/timetable');
    return response.data;
  },

  getStatus: async (): Promise<ApiResponse<StatusData>> => {
    const response: AxiosResponse<ApiResponse<StatusData>> = await api.get('/api/status');
    return response.data;
  },
};

export default apiService;

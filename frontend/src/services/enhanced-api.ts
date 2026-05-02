/**
 * Enhanced API Service with Performance Improvements
 */
import axios, { AxiosResponse, AxiosError } from 'axios';
import { ApiResponse, TimetableData, ConfigData, StatusData } from '../types/api';

// Configuration
const CONFIG = {
  TIMEOUT: 60000,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  RATE_LIMIT_INTERVAL: 1000,
};

// Enhanced API base URL detection
const getApiBaseUrl = (): string => {
  const hostname = window.location.hostname;
  
  // Development environment detection
  if (process.env.NODE_ENV === 'development') {
    return process.env.REACT_APP_API_URL || `http://${hostname}:5000`;
  }
  
  // Production environment
  return process.env.REACT_APP_API_URL || `https://your-api-domain.com`;
};

const API_BASE_URL = getApiBaseUrl();

// Enhanced error types
interface ApiError extends Error {
  status?: number;
  code?: string;
  details?: any;
}

// Create axios instance with interceptors
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Enhanced rate limiter
class RateLimiter {
  private calls = new Map<string, number>();
  private readonly minInterval: number;

  constructor(minInterval = CONFIG.RATE_LIMIT_INTERVAL) {
    this.minInterval = minInterval;
  }

  async throttle(endpoint: string): Promise<void> {
    const now = Date.now();
    const lastCall = this.calls.get(endpoint);
    
    if (lastCall && now - lastCall < this.minInterval) {
      const delay = this.minInterval - (now - lastCall);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.calls.set(endpoint, Date.now());
  }
}

const rateLimiter = new RateLimiter();

// Enhanced retry logic
const retryRequest = async <T>(
  requestFn: () => Promise<T>,
  maxRetries = CONFIG.MAX_RETRIES,
  delay = CONFIG.RETRY_DELAY
): Promise<T> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      const axiosError = error as AxiosError;
      
      // Don't retry on client errors (4xx)
      if (axiosError.response?.status && axiosError.response.status < 500) {
        throw error;
      }
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      console.warn(`Request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
  
  throw new Error('Max retries exceeded');
};

// Request interceptor
api.interceptors.request.use(
  async (config) => {
    // Rate limiting
    if (config.url) {
      await rateLimiter.throttle(config.url);
    }
    
    // Add user authentication
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const userData = JSON.parse(user);
        if (userData.email) {
          config.headers['X-User-Email'] = userData.email;
        }
      } catch (error) {
        console.error('Error parsing user data:', error);
        localStorage.removeItem('user'); // Clean up corrupted data
      }
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const apiError: ApiError = new Error(error.message);
    apiError.status = error.response?.status;
    apiError.code = error.code;
    apiError.details = error.response?.data;
    
    // Handle specific error cases
    if (error.response?.status === 401) {
      localStorage.removeItem('user');
      window.location.reload(); // Force re-login
    }
    
    return Promise.reject(apiError);
  }
);

// Enhanced API service
export const apiService = {
  // Gmail OAuth Authentication
  getGmailAuthUrl: async (): Promise<{ auth_url: string; state: string }> => {
    return retryRequest(async () => {
      const response: AxiosResponse<{ auth_url: string; state: string }> = 
        await api.get('/api/auth/gmail');
      return response.data;
    });
  },

  // Health check with caching
  healthCheck: async (): Promise<ApiResponse> => {
    const cacheKey = 'health-check';
    const cached = sessionStorage.getItem(cacheKey);
    
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 30000) { // 30 second cache
        return data;
      }
    }
    
    const response: AxiosResponse<ApiResponse> = await api.get('/api/health');
    sessionStorage.setItem(cacheKey, JSON.stringify({
      data: response.data,
      timestamp: Date.now()
    }));
    
    return response.data;
  },

  // Enhanced scraper with progress tracking
  runScraper: async (): Promise<ApiResponse<TimetableData>> => {
    return retryRequest(async () => {
      const user = localStorage.getItem('user');
      const payload = user ? { user_email: JSON.parse(user).email } : {};
      const response: AxiosResponse<ApiResponse<TimetableData>> = 
        await api.post('/api/scrape', payload);
      return response.data;
    }, 1); // Don't retry scraper operations
  },

  // Batch operations
  updateConfiguration: async (config: Partial<ConfigData>): Promise<ApiResponse> => {
    return retryRequest(async () => {
      const response: AxiosResponse<ApiResponse> = 
        await api.put('/api/config', config);
      return response.data;
    });
  },

  // Other methods...
  login: async (email: string): Promise<{ success: boolean; user?: { id: string; email: string }; error?: string }> => {
    const response: AxiosResponse<{ success: boolean; user?: { id: string; email: string }; error?: string }> = 
      await api.post('/api/auth/login', { email });
    return response.data;
  },

  getConfig: async (): Promise<ApiResponse<ConfigData>> => {
    const response: AxiosResponse<ApiResponse<ConfigData>> = await api.get('/api/config');
    return response.data;
  },

  updateSemesters: async (semesters: string[]): Promise<ApiResponse> => {
    const response: AxiosResponse<ApiResponse> = await api.post('/api/config/semesters', { semesters });
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
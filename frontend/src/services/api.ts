import axios, { AxiosResponse } from 'axios';
import { ApiResponse, TimetableData, ConfigData, StatusData } from '../types/api';

// Dynamic API base URL - uses the same host as the frontend but port 5000
const getApiBaseUrl = () => {
  const hostname = window.location.hostname;
  
  // Always use the same hostname but with port 5000 for the API
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:5000';
  }
  
  // For network access (like 192.168.x.x), use the same IP with port 5000
  return `http://${hostname}:5000`;
};

const API_BASE_URL = process.env.REACT_APP_API_URL || getApiBaseUrl();

console.log('API Base URL:', API_BASE_URL); // Debug log

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000, // Increased to 2 minutes for scraper operations
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
  const user = localStorage.getItem('user');
  if (user) {
    try {
      const userData = JSON.parse(user);
      if (userData.email) {
        config.headers['X-User-Email'] = userData.email;
        console.log('Adding X-User-Email header:', userData.email); // Debug log
      }
    } catch (error) {
      console.error('Error parsing user data:', error);
    }
  } else {
    console.log('No user data found in localStorage'); // Debug log
  }
  return config;
});

export const apiService = {
  // Gmail OAuth Authentication
  getGmailAuthUrl: async (): Promise<{ auth_url: string; state: string }> => {
    const response: AxiosResponse<{ auth_url: string; state: string }> = await api.get('/api/auth/gmail');
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
    const response: AxiosResponse<ApiResponse> = await api.post('/api/config/semesters', {
      semesters
    });
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
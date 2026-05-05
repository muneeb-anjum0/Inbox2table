// API types and interfaces
export interface TimetableItem {
  course?: string;
  course_title?: string;
  faculty?: string;
  room?: string;
  time?: string;
  semester?: string;
  campus?: string;
  [key: string]: any;
}

export interface TimetableData {
  for_day: string;
  for_date: string;
  query: string;
  message_id: string | null;
  items: TimetableItem[];
  semesters: string[];
  summary: {
    total_items: number;
    semester_breakdown: Record<string, number>;
    unique_courses: number;
    unique_faculty: number;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: string;
  cached?: boolean;
}

export interface ConfigData {
  gmail_query: string;
  semester_filter: string[];
  schedule_time: string;
  timezone: string;
  max_results: number;
}

export interface StatusData {
  timestamp: string;
  cache_exists: boolean;
  last_update: string | null;
}
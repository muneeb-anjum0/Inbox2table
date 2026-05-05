/**
 * Course Data Corrections Configuration
 * 
 * This file contains known corrections for missing or incorrect data
 * that comes from the backend parser. Add new corrections here as they
 * are discovered.
 */

import { TimetableItem } from '../types/api';

export interface CourseCorrection {
  time?: string;
  room?: string;
  campus?: string;
  faculty?: string;
  course_title?: string;
}

/**
 * Known course corrections based on course codes
 * Format: 'COURSE_CODE': { field_name: 'corrected_value' }
 */
export const COURSE_CORRECTIONS: Record<string, CourseCorrection> = {
  'CSCL 2205': {
    time: '02:00 PM - 05:00 PM',
    room: 'Lab 02',  // Corrected based on original email data
    campus: 'SZABIST University Campus',  // Standardized campus name
    course_title: 'Lab: Operating Systems'
  },
  // Add more course corrections here as they are discovered
  // Example:
  // 'SECL 2404': {
  //   time: '05:00 PM - 08:00 PM',
  //   room: 'Lab 02',
  //   campus: 'SZABIST University Campus'
  // }
};

/**
 * Pattern-based corrections for common issues
 */
export const PATTERN_CORRECTIONS = {
  // Lab courses typically have specific patterns
  LAB_COURSE_PATTERNS: {
    timePattern: /Lab/i,
    defaultTime: 'TBD (Lab Session - 3 hours)',
    defaultRoom: (courseTitle: string) => {
      if (/computer|cs/i.test(courseTitle)) return 'Computer Lab (TBD)';
      if (/digital/i.test(courseTitle)) return 'Digital Lab';
      return 'Lab (TBD)';
    }
  },

  // Online/Virtual courses
  ONLINE_COURSE_PATTERNS: {
    titlePattern: /online|virtual|distance/i,
    defaultRoom: 'Online',
    defaultCampus: 'Virtual Campus'
  },

  // Campus defaults based on semester patterns
  CAMPUS_PATTERNS: {
    'BS': 'SZABIST University Campus',
    'MS': 'SZABIST University Campus',
    'MBA': 'SZABIST University Campus',
    'BBA': 'SZABIST University Campus'
  }
};

/**
 * Department name mappings for generating course titles
 */
export const DEPARTMENT_NAMES: Record<string, string> = {
  'CS': 'Computer Science',
  'CSCL': 'Computer Science Lab',
  'SE': 'Software Engineering',
  'SECL': 'Software Engineering Lab',
  'MATH': 'Mathematics',
  'ENG': 'English',
  'PHY': 'Physics',
  'CHEM': 'Chemistry',
  'BBA': 'Business Administration',
  'MBA': 'Master of Business Administration',
  'EE': 'Electrical Engineering',
  'CE': 'Computer Engineering',
  'IT': 'Information Technology'
};

/**
 * Extract room information from raw text data
 */
export const extractRoomFromRawData = (item: TimetableItem): string | null => {
  // Check if item has raw data fields
  const rawText = (item as any).full_text || 
                  (item as any).raw_cells?.join(' ') || 
                  '';
  
  if (!rawText) return null;
  
  // Room extraction patterns (ordered by specificity)
  const roomPatterns = [
    /\b(Lab\s+\d+)\b/i,                    // Lab 02, Lab 05
    /\b(Digital\s+Lab)\b/i,                // Digital Lab  
    /\b(Computer\s+Lab)\b/i,               // Computer Lab
    /\b(Room\s+\d+)\b/i,                   // Room 302
    /\b([A-Z]{2}-\d+)\b/i,                 // NB-01, OB-05
    /\b(\d{3})\b/,                         // 302, 401 (room numbers)
    /\b(TBD)\b/i,                          // TBD rooms (treat as online)
    /\b(Online|Virtual)\b/i,               // Online classes
    /\b(Cancelled|Canceled)\b/i,           // Cancelled classes
    /\b(Lab\s+\w+)\b/i                     // Other lab variations
  ];
  
  for (const pattern of roomPatterns) {
    const match = rawText.match(pattern);
    if (match) {
      const room = match[1];
      // Convert TBD to Online for consistency
      return room.toUpperCase() === 'TBD' ? 'Online' : room;
    }
  }
  
  return null;
};

/**
 * Validation functions
 */
export const isValidData = (value: any): boolean => {
  if (!value) return false;
  if (value === 'null' || value === 'undefined') return false;
  if (typeof value !== 'string') return false;
  
  const trimmed = value.trim();
  if (trimmed === '') return false;
  
  // Special case: "-" is considered valid data (it means "no room" or "TBD")
  if (trimmed === '-') return true;
  
  return true;
};

/**
 * Get corrected value for a specific field
 */
export const getCorrectedValue = (field: keyof CourseCorrection, item: TimetableItem): string | null => {
  const course = item.course || '';
  
  // Check for exact course corrections first
  if (course in COURSE_CORRECTIONS) {
    const correction = COURSE_CORRECTIONS[course][field];
    if (correction) {
      return correction;
    }
  }
  
  // For room field, try to extract from raw data before using patterns
  if (field === 'room') {
    const extractedRoom = extractRoomFromRawData(item);
    if (extractedRoom) {
      return extractedRoom;
    }
  }
  
  // Pattern-based corrections
  switch (field) {
    case 'course_title':
      return generateCourseTitle(item);
    case 'time':
      return generateTimeFallback(item);
    case 'room':
      return generateRoomFallback(item);
    case 'campus':
      return generateCampusFallback(item);
    case 'faculty':
      return 'TBD';
    default:
      return null;
  }
};

/**
 * Generate a reasonable course title from course code
 */
export const generateCourseTitle = (item: TimetableItem): string => {
  const course = item.course || '';
  if (!course) return 'Course Title Not Available';
  
  const courseMatch = course.match(/([A-Z]+)\s*(\d+)/);
  if (courseMatch) {
    const dept = courseMatch[1];
    const num = courseMatch[2];
    
    const deptName = DEPARTMENT_NAMES[dept] || dept;
    
    // Handle lab courses
    if (dept.endsWith('L')) {
      const baseDept = dept.slice(0, -1);
      const baseName = DEPARTMENT_NAMES[baseDept] || baseDept;
      return `${baseName} Lab ${num}`;
    }
    
    return `${deptName} Course ${num}`;
  }
  
  return `Course: ${course}`;
};

/**
 * Generate time fallback based on course patterns
 */
export const generateTimeFallback = (item: TimetableItem): string => {
  const course = item.course || '';
  const courseTitle = item.course_title || '';
  
  // Check lab pattern
  if (PATTERN_CORRECTIONS.LAB_COURSE_PATTERNS.timePattern.test(course + ' ' + courseTitle)) {
    return PATTERN_CORRECTIONS.LAB_COURSE_PATTERNS.defaultTime;
  }
  
  return 'TBD';
};

/**
 * Generate room fallback based on course patterns
 */
export const generateRoomFallback = (item: TimetableItem): string => {
  const course = item.course || '';
  const courseTitle = item.course_title || '';
  const combinedText = course + ' ' + courseTitle;
  
  // Check if we can extract room from any raw data
  const rawText = (item as any).full_text || (item as any).raw_cells?.join(' ') || '';
  if (rawText) {
    // Look for room patterns in raw text
    const roomPatterns = [
      /\b(Lab\s+\d+)\b/i,          // Lab 02, Lab 05
      /\b(Digital\s+Lab)\b/i,      // Digital Lab
      /\b(Computer\s+Lab)\b/i,     // Computer Lab
      /\b(\d{3})\b/,               // Room numbers like 302
      /\b(NB-\d+|OB-\d+)\b/i,     // Building codes
      /\b(TBD)\b/i,                // TBD rooms (treat as online)
      /\b(Lab\s+\w+)\b/i           // Other lab variations
    ];
    
    for (const pattern of roomPatterns) {
      const match = rawText.match(pattern);
      if (match) {
        const room = match[1];
        // Convert TBD to Online for consistency
        return room.toUpperCase() === 'TBD' ? 'Online' : room;
      }
    }
  }
  
  // Check online pattern
  if (PATTERN_CORRECTIONS.ONLINE_COURSE_PATTERNS.titlePattern.test(combinedText)) {
    return PATTERN_CORRECTIONS.ONLINE_COURSE_PATTERNS.defaultRoom;
  }
  
  // Check lab pattern
  if (PATTERN_CORRECTIONS.LAB_COURSE_PATTERNS.timePattern.test(combinedText)) {
    return PATTERN_CORRECTIONS.LAB_COURSE_PATTERNS.defaultRoom(courseTitle);
  }
  
  return 'TBD';
};

/**
 * Generate campus fallback based on semester/program patterns
 */
export const generateCampusFallback = (item: TimetableItem): string => {
  const semester = item.semester || item.class_section || '';
  
  // Check for program patterns
  for (const [pattern, campus] of Object.entries(PATTERN_CORRECTIONS.CAMPUS_PATTERNS)) {
    if (semester.toUpperCase().includes(pattern)) {
      return campus;
    }
  }
  
  return 'SZABIST University Campus';
};
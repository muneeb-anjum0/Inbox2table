import React from 'react';
import { TimetableData, ConfigData, TimetableItem } from '../../types/api';

interface SummaryStatsProps {
  data: TimetableData;
  config?: ConfigData;
  filteredItems?: TimetableItem[];
}

const SummaryStats: React.FC<SummaryStatsProps> = ({ data, config, filteredItems }) => {
  if (!data || !data.summary) {
    return null;
  }

  // Check if no semesters are configured
  const noSemestersConfigured = !config?.semester_filter || config.semester_filter.length === 0;
  
  // Use filtered items if provided, otherwise fall back to original behavior
  const itemsToAnalyze = filteredItems || data.items || [];
  
  // Calculate summary based on filtered items
  const calculateFilteredSummary = () => {
    if (noSemestersConfigured || itemsToAnalyze.length === 0) {
      return {
        total_items: 0,
        unique_courses: 0,
        unique_faculty: 0,
        semester_breakdown: {}
      };
    }

    const semesterBreakdown: Record<string, number> = {};
    const uniqueCourses = new Set<string>();
    const uniqueFaculty = new Set<string>();

    itemsToAnalyze.forEach(item => {
      // Count semester breakdown
      if (item.semester) {
        semesterBreakdown[item.semester] = (semesterBreakdown[item.semester] || 0) + 1;
      }
      
      // Count unique courses
      if (item.course_code) {
        uniqueCourses.add(item.course_code);
      }
      
      // Count unique faculty
      if (item.faculty && item.faculty.toLowerCase() !== 'cancelled' && item.faculty.toLowerCase() !== 'tbd') {
        uniqueFaculty.add(item.faculty);
      }
    });

    return {
      total_items: itemsToAnalyze.length,
      unique_courses: uniqueCourses.size,
      unique_faculty: uniqueFaculty.size,
      semester_breakdown: semesterBreakdown
    };
  };

  const displaySummary = calculateFilteredSummary();
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="surface-card p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center">
            <img src="/courses.svg" alt="Total Classes" className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Total Classes</p>
            <p className="text-2xl font-semibold text-slate-800 leading-tight">{displaySummary.total_items || 0}</p>
          </div>
        </div>
      </div>

      <div className="surface-card p-4 border-blue-100">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
            <img src="/uniqueCourses.svg" alt="Unique Courses" className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-blue-600">Unique Courses</p>
            <p className="text-2xl font-semibold text-blue-800 leading-tight">{displaySummary.unique_courses || 0}</p>
          </div>
        </div>
      </div>

      <div className="surface-card p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center">
            <img src="/faculty.svg" alt="Faculty Members" className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Faculty Members</p>
            <p className="text-2xl font-semibold text-gray-800 leading-tight">{displaySummary.unique_faculty || 0}</p>
          </div>
        </div>
      </div>

      <div className="surface-card p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center">
            <img src="/day.svg" alt="Day" className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Current Day</p>
            <p className="text-xl font-semibold text-slate-800 leading-tight">{data.for_day || 'Today'}</p>
          </div>
        </div>
      </div>

      <div className="surface-card p-4 md:col-span-2 lg:col-span-4">
        <div className="flex items-center mb-3">
          <div className="bg-slate-100 p-2 rounded-lg border border-slate-200 mr-2">
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <span className="font-semibold text-slate-800 text-base">Semester Breakdown</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(displaySummary.semester_breakdown).length > 0 ? (
            Object.entries(displaySummary.semester_breakdown).map(([semester, count]) => (
              <span key={semester} className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-50 text-slate-700 text-sm font-semibold border border-slate-200">
                <span className="mr-2">{semester}</span>
                <span className="bg-slate-700 text-white rounded-full px-2 py-0.5 text-xs font-bold">{count}</span>
              </span>
            ))
          ) : (
            <span className="text-slate-500 text-sm bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">No semester data available</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SummaryStats;
import React from 'react';
import { TimetableData, ConfigData, TimetableItem } from '../../types/api';
import { normalizeSemesterLabel } from '../../utils/semesterNormalization';

interface SummaryStatsProps {
  data: TimetableData;
  config?: ConfigData;
  filteredItems?: TimetableItem[];
}

const SummaryStats: React.FC<SummaryStatsProps> = ({ data, config, filteredItems }) => {
  if (!data || !data.summary) {
    return null;
  }

  // Use filtered items if provided, otherwise fall back to original behavior
  const itemsToAnalyze = filteredItems || data.items || [];

  // Calculate summary based on filtered items. If no `config` is provided, compute totals
  // based on available timetable items (do not zero-out when config is missing).
  const calculateFilteredSummary = () => {
    if (itemsToAnalyze.length === 0) {
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
      // Count semester breakdown - try several fields to find semester display
      const semKey = normalizeSemesterLabel(
        item.semester_display || item.semester || item.semester_key || item.section || item.class_section
      );
      if (semKey) {
        semesterBreakdown[semKey] = (semesterBreakdown[semKey] || 0) + 1;
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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-2 lg:grid-cols-4 lg:gap-4">
      <div className="surface-card p-3 sm:p-4">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-[color:var(--theme-surface-muted)] flex items-center justify-center shrink-0">
            <img src="/courses.svg" alt="Total Classes" className="theme-card-icon w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs uppercase tracking-wide theme-text-muted">Total Classes</p>
            <p className="text-xl sm:text-2xl font-semibold theme-text-primary leading-tight">{displaySummary.total_items || 0}</p>
          </div>
        </div>
      </div>

      <div className="surface-card p-3 sm:p-4 border theme-border-soft">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-[color:var(--theme-surface-muted)] flex items-center justify-center shrink-0">
            <img src="/uniqueCourses.svg" alt="Unique Courses" className="theme-card-icon w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs uppercase tracking-wide theme-text-muted">Unique Courses</p>
            <p className="text-xl sm:text-2xl font-semibold theme-text-primary leading-tight">{displaySummary.unique_courses || 0}</p>
          </div>
        </div>
      </div>

      <div className="surface-card p-3 sm:p-4">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-[color:var(--theme-surface-muted)] flex items-center justify-center shrink-0">
            <img src="/faculty.svg" alt="Faculty Members" className="theme-card-icon w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs uppercase tracking-wide theme-text-muted">Faculty Members</p>
            <p className="text-xl sm:text-2xl font-semibold theme-text-primary leading-tight">{displaySummary.unique_faculty || 0}</p>
          </div>
        </div>
      </div>

      <div className="surface-card p-3 sm:p-4">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-[color:var(--theme-surface-muted)] flex items-center justify-center shrink-0">
            <img src="/day.svg" alt="Day" className="theme-card-icon w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs uppercase tracking-wide theme-text-muted">Current Day</p>
            <p className="text-lg sm:text-xl font-semibold theme-text-primary leading-tight">{data.for_day || 'Today'}</p>
          </div>
        </div>
      </div>

      <div className="surface-card p-3 sm:p-4 col-span-2 md:col-span-2 lg:col-span-4">
        <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="bg-[color:var(--theme-surface-muted)] p-1.5 sm:p-2 rounded-lg shrink-0">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 theme-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold theme-text-primary text-sm sm:text-base">Semester Breakdown</p>
              <p className="text-[11px] sm:text-sm theme-text-secondary">View class totals by semester in a compact layout.</p>
            </div>
          </div>
          <span className="self-start md:self-auto text-[10px] sm:text-xs uppercase tracking-[0.18em] theme-text-muted font-semibold">{Object.keys(displaySummary.semester_breakdown).length} semesters</span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
          {Object.entries(displaySummary.semester_breakdown).length > 0 ? (
            Object.entries(displaySummary.semester_breakdown).map(([semester, count]) => (
              <div key={semester} className="rounded-2xl bg-[color:var(--theme-surface-elevated)] p-3 sm:p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-2 sm:gap-3">
                  <div>
                    <p className="text-[11px] sm:text-sm font-semibold theme-text-primary leading-tight">{semester}</p>
                    <p className="text-[10px] sm:text-xs theme-text-secondary mt-1">Scheduled classes</p>
                  </div>
                  <div className="inline-flex items-center rounded-full bg-[color:var(--theme-surface-muted)] px-2 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide theme-text-primary shrink-0">
                    {count} classes
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-2 rounded-2xl bg-[color:var(--theme-surface-elevated)] p-3 sm:p-4 theme-text-secondary text-xs sm:text-sm shadow-sm">
              No semester data available. Configure your semester filters or refresh the timetable.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SummaryStats;
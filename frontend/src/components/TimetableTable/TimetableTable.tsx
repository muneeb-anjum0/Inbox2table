import React from 'react';
import { TimetableItem } from '../../types/api';
import { 
  isValidData as validateData, 
  getCorrectedValue, 
  generateCourseTitle as generateTitle,
  extractRoomFromRawData
} from '../../utils/courseCorrections';

interface TimetableTableProps {
  items: TimetableItem[];
}

// Debug logging cache to reduce console spam
let loggedTimes = new Set<string>();
let loggedSemesters = new Set<string>();

// Helper function to parse time and convert to minutes for sorting
const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === '-' || timeStr === 'null') return 0;
  
  // Handle different time formats and extract start time
  // Formats: "08:00 AM - 11:00 AM", "12:00 AM - 02:00 PM", "02:00 PM - 03:30 PM"
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!timeMatch) return 0;
  
  let hours = parseInt(timeMatch[1]);
  const minutes = parseInt(timeMatch[2]);
  const period = timeMatch[3].toUpperCase();
  
  // Convert to 24-hour format
  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }
  
  const totalMinutes = hours * 60 + minutes;
  
  // Reduce debug logging frequency - only log unique time strings
  if (!loggedTimes.has(timeStr)) {
    loggedTimes.add(timeStr);
    console.log(`Time parsing: "${timeStr}" -> ${hours}:${minutes.toString().padStart(2, '0')} (${totalMinutes} minutes)`);
  }
  
  return totalMinutes;
};

// Helper function to get display time with comprehensive fallback
const getDisplayTime = (item: TimetableItem): string => {
  // Check if original data is valid
  if (validateData(item.time)) {
    return item.time!;
  }
  
  // Use centralized correction system
  return getCorrectedValue('time', item) || '-';
};

// Helper function to get display room with comprehensive fallback
const getDisplayRoom = (item: TimetableItem): string => {
  let room = item.room;
  
  // Convert TBD to Online for consistency
  if (room && room.toUpperCase() === 'TBD') {
    room = 'Online';
  }
  
  // For CSCL 2205, always use the corrected value from the original email
  if (item.course === 'CSCL 2205') {
    return getCorrectedValue('room', item) || room || 'TBD';
  }
  
  // For other courses, check if original data is valid (including "-")
  if (validateData(room)) {
    return room!;
  }
  
  // Try to extract from raw data if available
  const extractedRoom = extractRoomFromRawData(item);
  if (extractedRoom) {
    return extractedRoom;
  }
  
  // Use centralized correction system
  return getCorrectedValue('room', item) || 'TBD';
};

// Helper function to get display campus with comprehensive fallback
const getDisplayCampus = (item: TimetableItem): string => {
  let campus = item.campus;
  
  // Check if original data is valid
  if (validateData(campus)) {
    const campusStr = campus!.trim();
    
    // Standardize ALL SZABIST campus names for consistency
    if (campusStr.toLowerCase().includes('szabist') && 
        campusStr.toLowerCase().includes('university')) {
      return 'SZABIST University Campus';
    }
    
    return campusStr;
  }
  
  // Use centralized correction system for missing data
  return getCorrectedValue('campus', item) || '-';
};

// Helper function to get display faculty with fallback
const getDisplayFaculty = (item: TimetableItem): string => {
  if (validateData(item.faculty)) {
    return item.faculty!;
  }
  
  // Use centralized correction system
  return getCorrectedValue('faculty', item) || 'TBD';
};

const getSemesterLabel = (item: TimetableItem): string => {
  return item.semester_display || item.semester || item.semester_key || 'Unknown';
};

// Helper function to validate and clean course title
const getDisplayCourseTitle = (item: TimetableItem): string => {
  if (validateData(item.course_title)) {
    return item.course_title!;
  }
  
  // Use centralized title generation
  return generateTitle(item);
};

// Helper function to check if a row should be highlighted as cancelled
const shouldHighlightRow = (item: TimetableItem): boolean => {
  const displayedTexts = [
    getDisplayCourseTitle(item),
    getDisplayFaculty(item),
    getDisplayRoom(item),
    getDisplayTime(item),
    getDisplayCampus(item),
    getSemesterLabel(item)
  ];
  return displayedTexts.some(text => text.toLowerCase().includes('cancelled'));
};

// Helper function to render text with red color if it contains 'cancelled'
const renderText = (text: string): React.ReactNode => {
  if (text.toLowerCase().includes('cancelled')) {
    return <span className="text-red-600 font-bold">{text}</span>;
  }
  return text;
};

// Helper function to group and sort data
const groupAndSortData = (items: TimetableItem[]) => {
  // Reset debug logging cache for new data
  loggedTimes.clear();
  loggedSemesters.clear();

  // Group by semester
  const grouped = items.reduce((acc, item) => {
    const semester = getSemesterLabel(item);
    if (!acc[semester]) {
      acc[semester] = [];
    }
    acc[semester].push(item);
    return acc;
  }, {} as Record<string, TimetableItem[]>);

  // Sort each group by time with better error handling
  Object.keys(grouped).forEach(semester => {
    grouped[semester].sort((a, b) => {
      const timeA = parseTimeToMinutes(getDisplayTime(a));
      const timeB = parseTimeToMinutes(getDisplayTime(b));
      
      // If times are equal, sort by course code as secondary criteria
      if (timeA === timeB) {
        const courseA = a.course || '';
        const courseB = b.course || '';
        return courseA.localeCompare(courseB);
      }
      
      return timeA - timeB;
    });
    
    // Debug: Log the sorted order for this semester (only once per render)
    if (!loggedSemesters.has(semester)) {
      loggedSemesters.add(semester);
      console.log(`Semester "${semester}" sorted order:`);
      grouped[semester].forEach((item, index) => {
        const displayTime = getDisplayTime(item);
        const timeMinutes = parseTimeToMinutes(displayTime);
        console.log(`  ${index + 1}. ${item.course} - ${displayTime} (${timeMinutes} minutes)`);
      });
    }
  });

  // Sort semesters alphabetically
  const sortedSemesters = Object.keys(grouped).sort();
  
  return { grouped, sortedSemesters };
};

const TimetableTable: React.FC<TimetableTableProps> = ({ items }) => {
  const { grouped, sortedSemesters } = groupAndSortData(items);

  if (!items || items.length === 0) {
    return (
      <div className="bg-white shadow-lg rounded-lg p-8 text-center animate-fade-in">
        <svg className="mx-auto h-16 w-16 text-gray-400 mb-4 animate-gentle-scale" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No timetable data available</h3>
        <p className="text-gray-500 text-sm">
          Configure your semesters and refresh the data to see your schedule.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white">
      {/* Mobile Card View */}
      <div className="block md:hidden">
        <div className="divide-y divide-gray-100">
          {sortedSemesters.map((semester) => (
            <section key={semester} className="bg-white">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">{semester}</h3>
                  <span className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
                    {grouped[semester].length} classes
                  </span>
                </div>
              </div>

              <div className="px-3 py-2 space-y-2">
                {grouped[semester].map((item, itemIndex) => {
                  const roomDisplay = getDisplayRoom(item);
                  const isOnline = roomDisplay.toLowerCase() === 'online';
                  return (
                    <article
                      key={`${semester}-${itemIndex}`}
                      className={`border rounded-xl p-3 bg-white ${shouldHighlightRow(item) ? 'border-red-200 bg-red-50/40' : 'border-gray-200'} animate-fade-in`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 leading-5">{renderText(getDisplayCourseTitle(item))}</p>
                          <p className="text-xs text-gray-600 mt-1">{renderText(item.course || '-')}</p>
                        </div>
                        <span className={`text-xs font-semibold rounded-lg px-2 py-1 border ${isOnline ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                          {renderText(roomDisplay)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-1.5 text-xs text-gray-600">
                        <div><span className="font-semibold text-gray-700">Faculty:</span> {renderText(getDisplayFaculty(item))}</div>
                        <div><span className="font-semibold text-gray-700">Time:</span> {renderText(getDisplayTime(item))}</div>
                        <div><span className="font-semibold text-gray-700">Campus:</span> {renderText(getDisplayCampus(item))}</div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Semester</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Course Title</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Faculty</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Room</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Time</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Campus</th>
            </tr>
          </thead>
          <tbody>
            {sortedSemesters.map((semester) => (
              <React.Fragment key={semester}>
                <tr className="bg-blue-50/60 border-y border-blue-100">
                  <td colSpan={6} className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-blue-900">{semester}</span>
                      <span className="text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded-full px-2 py-0.5">
                        {grouped[semester].length} classes
                      </span>
                    </div>
                  </td>
                </tr>

                {grouped[semester].map((item, itemIndex) => {
                  const roomDisplay = getDisplayRoom(item);
                  const isOnline = roomDisplay.toLowerCase() === 'online';

                  return (
                    <tr
                      key={`${semester}-${itemIndex}`}
                      className={`border-b border-gray-100 transition-colors duration-200 hover:bg-gray-50 ${shouldHighlightRow(item) ? 'bg-red-50/60' : itemIndex % 2 ? 'bg-white' : 'bg-slate-50/30'}`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                          {renderText(getSemesterLabel(item))}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-800 font-medium leading-5 max-w-[460px]">
                        {renderText(getDisplayCourseTitle(item))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{renderText(getDisplayFaculty(item))}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${isOnline ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                          {renderText(roomDisplay)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                          {renderText(getDisplayTime(item))}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap max-w-[260px]">
                        <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600 truncate max-w-[240px]">
                          {renderText(getDisplayCampus(item))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TimetableTable;
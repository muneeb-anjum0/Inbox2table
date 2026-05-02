import React from 'react';
import { TimetableItem } from '../../types/api';
import DataQualityIndicator from '../DataQualityIndicator';
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
  return item.semester_key || item.semester_display || item.semester || 'Unknown';
};

const getSemesterKey = (item: TimetableItem): string => {
  return item.semester_key || item.semester || 'Unknown';
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

  // Debug: Log raw data for CSCL courses
  React.useEffect(() => {
    items.forEach((item, index) => {
      if (item.course && item.course.includes('CSCL')) {
        console.log(`DEBUG ${item.course}:`, {
          course: item.course,
          course_title: item.course_title,
          time: item.time,
          room: item.room,
          campus: item.campus,
          faculty: item.faculty,
          // Add validation checks
          roomValid: validateData(item.room),
          roomType: typeof item.room,
          roomValue: JSON.stringify(item.room),
          // Add display values
          displayTime: getDisplayTime(item),
          displayRoom: getDisplayRoom(item),
          displayCampus: getDisplayCampus(item),
          displayFaculty: getDisplayFaculty(item),
          displayCourseTitle: getDisplayCourseTitle(item),
          rawItem: item
        });
      }
    });
  }, [items]);

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
    <div className="bg-white rounded-lg shadow border border-gray-100 animate-drop-bounce delay-400">
      {/* Mobile Card View (hidden on desktop) */}
      <div className="block md:hidden">
  <div className="divide-y divide-gray-100">
          {sortedSemesters.map((semester, semesterIndex) => (
            <div key={semester} className="bg-white animate-drop-bounce" style={{animationDelay: `${450 + (semesterIndex * 75)}ms`}}>
              {/* Mobile Semester Header */}
              <div className="bg-blue-50 px-4 py-3 border-l-4 border-blue-400 hover:bg-blue-100 transition-all duration-300 hover:shadow-sm hover:scale-105">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-2"></span>
                  <h3 className="text-sm font-semibold text-blue-800">{semester}</h3>
                  <span className="text-xs text-blue-600">({grouped[semester].length} classes)</span>
                </div>
              </div>
              
              {/* Mobile Class Cards */}
              <div className="divide-y divide-gray-100">
                {grouped[semester].map((item, itemIndex) => (
                  <div key={`${semester}-${itemIndex}`} className={`p-4 rounded-md border border-gray-50 mb-2 bg-white hover:bg-blue-50 transition-all duration-300 hover:shadow-md hover:scale-105 animate-drop-subtle${shouldHighlightRow(item) ? ' bg-red-50' : ''}`} style={{animationDelay: `${500 + (semesterIndex * 75) + (itemIndex * 30)}ms`}}>
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-gray-900 truncate">
                            {renderText(item.course || '-')}
                          </h4>
                          <p className="text-xs text-gray-600 mt-1 break-words">
                            {renderText(getDisplayCourseTitle(item))}
                          </p>
                        </div>
                        <div className="ml-2 flex-shrink-0">
                          {(() => {
                            const roomDisplay = getDisplayRoom(item);
                            const isOnline = roomDisplay.toLowerCase() === 'online';
                            return (
                              <span className={isOnline 
                                ? "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 border border-green-300 text-green-800" 
                                : "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                              }>
                                {renderText(roomDisplay)}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                        <div className="flex items-center">
                          <span className="mr-1">👨‍🏫</span>
                          <span>{renderText(getDisplayFaculty(item))}</span>
                        </div>
                        <div className="flex items-center">
                          <span className="mr-1">⏰</span>
                          <span>{renderText(getDisplayTime(item))}</span>
                        </div>
                        <div className="flex items-center">
                          <span className="mr-1">🏫</span>
                          <span className="truncate">{renderText(getDisplayCampus(item))}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop Table View (hidden on mobile) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gradient-to-r from-gray-50 to-blue-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b-2 border-blue-100 w-24">
                Semester
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b-2 border-blue-100">
                Course Title
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b-2 border-blue-100">
                Faculty
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b-2 border-blue-100 w-20">
                Room
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b-2 border-blue-100 w-24">
                Time
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b-2 border-blue-100 w-20">
                Campus
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedSemesters.map((semester, semesterIndex) => (
              <React.Fragment key={semester}>
                {/* Desktop Semester Header Row */}
                <tr className="bg-gradient-to-r from-blue-100 to-indigo-100 border-t-2 border-blue-300">
                  <td colSpan={6} className="px-4 py-3 text-base font-bold text-blue-900 bg-gradient-to-r from-blue-100 to-indigo-100 hover:from-blue-200 hover:to-indigo-200 transition-all duration-300 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="text-blue-900">{semester}</span>
                      <span className="bg-blue-200 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold border border-blue-300">
                        {grouped[semester].length} classes
                      </span>
                    </div>
                  </td>
                </tr>
                {/* Desktop Classes for this semester */}
                {grouped[semester].map((item, itemIndex) => (
                  <tr key={`${semester}-${itemIndex}`} className={`hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-300 hover:shadow-lg border-b border-gray-100 animate-drop-subtle${shouldHighlightRow(item) ? ' bg-red-100' : ''}`} style={{animationDelay: `${550 + (semesterIndex * 75) + (itemIndex * 25)}ms`}}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className="text-purple-700 font-bold bg-gradient-to-r from-purple-100 to-pink-100 px-2 py-1 rounded-lg border border-purple-300 text-xs">{renderText(item.semester || '-')}</span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="break-words leading-5 text-gray-800 font-medium">{renderText(getDisplayCourseTitle(item))}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className="text-gray-700 font-medium">{renderText(getDisplayFaculty(item))}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {(() => {
                        const roomDisplay = getDisplayRoom(item);
                        const isOnline = roomDisplay.toLowerCase() === 'online';
                        return (
                          <span className={`bg-gradient-to-r ${isOnline ? 'from-green-100 to-emerald-100 border-green-300' : 'from-gray-100 to-slate-100 border-gray-300'} border rounded-lg px-2 py-1 text-xs font-bold ${shouldHighlightRow(item) ? 'text-red-800' : isOnline ? 'text-green-800' : 'text-gray-800'}`}>
                            {renderText(roomDisplay)}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className="text-blue-800 font-bold bg-gradient-to-r from-blue-100 to-indigo-100 px-2 py-1 rounded-lg text-xs tracking-wider border border-blue-300">{renderText(getDisplayTime(item))}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className="text-gray-700 font-medium bg-gray-100 px-2 py-1 rounded-lg border border-gray-300 text-xs">{renderText(getDisplayCampus(item))}</span>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TimetableTable;
import React from 'react';
import { TimetableItem } from '../../types/api';
import {
  isValidData as validateData,
  getCorrectedValue,
  generateCourseTitle as generateTitle,
} from '../../utils/courseCorrections';
import { normalizeSemesterLabel } from '../../utils/semesterNormalization';

interface TimetableTableProps {
  items: TimetableItem[];
}

const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === '-' || timeStr === 'null') return 0;

  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!timeMatch) return 0;

  let hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const period = timeMatch[3].toUpperCase();

  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }

  const totalMinutes = hours * 60 + minutes;

  return totalMinutes;
};

const getDisplayTime = (item: TimetableItem): string => {
  if (validateData(item.time)) {
    return item.time!;
  }

  return getCorrectedValue('time', item) || '-';
};

const getDisplayRoom = (item: TimetableItem): string => {
  let room = item.room;

  if (room && room.toUpperCase() === 'TBD') {
    room = 'Online';
  }

  if (item.course === 'CSCL 2205') {
    return getCorrectedValue('room', item) || room || 'TBD';
  }

  if (validateData(room)) {
    return room!;
  }

  return getCorrectedValue('room', item) || 'TBD';
};

const getDisplayCampus = (item: TimetableItem): string => {
  const campus = item.campus;

  if (validateData(campus)) {
    const campusStr = campus!.trim();

    if (
      campusStr.toLowerCase().includes('szabist') &&
      campusStr.toLowerCase().includes('university')
    ) {
      return 'SZABIST University Campus';
    }

    return campusStr;
  }

  return getCorrectedValue('campus', item) || '-';
};

const getDisplayFaculty = (item: TimetableItem): string => {
  if (validateData(item.faculty)) {
    return item.faculty!;
  }

  return getCorrectedValue('faculty', item) || 'TBD';
};

const getSemesterLabel = (item: TimetableItem): string => {
  return normalizeSemesterLabel(
    item.semester_display || item.semester || item.semester_key
  );
};

const getDisplayCourseTitle = (item: TimetableItem): string => {
  if (validateData(item.course_title)) {
    return item.course_title!;
  }

  return generateTitle(item);
};

const getCourseCode = (item: TimetableItem): string => {
  return item.course || item.course_code || '-';
};

const shouldHighlightRow = (item: TimetableItem): boolean => {
  const displayedTexts = [
    getDisplayCourseTitle(item),
    getDisplayFaculty(item),
    getDisplayRoom(item),
    getDisplayTime(item),
    getDisplayCampus(item),
    getSemesterLabel(item),
  ];

  return displayedTexts.some((text) => text.toLowerCase().includes('cancelled'));
};

const renderText = (text: string): React.ReactNode => {
  if (text.toLowerCase().includes('cancelled')) {
    return <span className="timetable-cancelled-text">{text}</span>;
  }

  return text;
};

const groupAndSortData = (items: TimetableItem[]) => {

  const grouped = items.reduce((acc, item) => {
    const semester = getSemesterLabel(item) || 'Unassigned';

    if (!acc[semester]) {
      acc[semester] = [];
    }

    acc[semester].push(item);
    return acc;
  }, {} as Record<string, TimetableItem[]>);

  Object.keys(grouped).forEach((semester) => {
    grouped[semester].sort((a, b) => {
      const timeA = parseTimeToMinutes(getDisplayTime(a));
      const timeB = parseTimeToMinutes(getDisplayTime(b));

      if (timeA === timeB) {
        return getCourseCode(a).localeCompare(getCourseCode(b));
      }

      return timeA - timeB;
    });

    if (!loggedSemesters.has(semester)) {
      loggedSemesters.add(semester);
      console.log(`Semester "${semester}" sorted order:`);

      grouped[semester].forEach((item, index) => {
        const displayTime = getDisplayTime(item);
        const timeMinutes = parseTimeToMinutes(displayTime);

        console.log(
          `  ${index + 1}. ${getCourseCode(item)} - ${displayTime} (${timeMinutes} minutes)`
        );
      });
    }
  });

  const sortedSemesters = Object.keys(grouped).sort();

  return { grouped, sortedSemesters };
};

const TimetableTable: React.FC<TimetableTableProps> = ({ items }) => {
  const { grouped, sortedSemesters } = groupAndSortData(items || []);

  if (!items || items.length === 0) {
    return (
      <>
        <style>{timetableStyles}</style>

        <div className="tw-empty-state">
          <div className="tw-empty-icon" aria-hidden="true">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.6}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>

          <h3>No timetable data available</h3>

          <p>
            Configure your semesters and refresh the data to see your schedule.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{timetableStyles}</style>

      <div className="tw-stage">
        <div className="tw-mobile-view">
          {sortedSemesters.map((semester) => (
            <section key={semester} className="tw-mobile-semester">
              <div className="tw-mobile-semester-head">
                <div>
                  <p className="tw-section-kicker">Semester</p>
                  <h3>{semester}</h3>
                </div>

                <span className="tw-count-pill">
                  {grouped[semester].length} classes
                </span>
              </div>

              <div className="tw-mobile-card-list">
                {grouped[semester].map((item, itemIndex) => {
                  const roomDisplay = getDisplayRoom(item);
                  const isOnline = roomDisplay.toLowerCase() === 'online';
                  const isCancelled = shouldHighlightRow(item);

                  return (
                    <article
                      key={`${semester}-${itemIndex}`}
                      className={`tw-class-card ${
                        isCancelled ? 'tw-class-card--cancelled' : ''
                      }`}
                      style={{ animationDelay: `${itemIndex * 45}ms` }}
                    >
                      <div className="tw-card-top">
                        <div className="tw-course-block">
                          <span className="tw-course-code" title={getCourseCode(item)}>
                            {renderText(getCourseCode(item))}
                          </span>

                          <h4 title={getDisplayCourseTitle(item)}>
                            {renderText(getDisplayCourseTitle(item))}
                          </h4>
                        </div>

                        <span
                          className={`tw-room-pill ${
                            isOnline ? 'tw-room-pill--online' : ''
                          }`}
                        >
                          {renderText(roomDisplay)}
                        </span>
                      </div>

                      <div className="tw-mobile-details">
                        <div className="tw-detail-row">
                          <span className="tw-detail-label">Time</span>
                          <span className="tw-detail-value">
                            {renderText(getDisplayTime(item))}
                          </span>
                        </div>

                        <div className="tw-detail-row">
                          <span className="tw-detail-label">Faculty</span>
                          <span className="tw-detail-value">
                            {renderText(getDisplayFaculty(item))}
                          </span>
                        </div>

                        <div className="tw-detail-row tw-detail-row--full">
                          <span className="tw-detail-label">Campus</span>
                          <span className="tw-detail-value">
                            {renderText(getDisplayCampus(item))}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="tw-desktop-view">
          <div className="tw-table-shell">
            <table className="tw-table">
              <thead>
                <tr>
                  <th>Semester</th>
                  <th>Course Title</th>
                  <th>Faculty</th>
                  <th>Room</th>
                  <th>Time</th>
                  <th>Campus</th>
                </tr>
              </thead>

              <tbody>
                {sortedSemesters.map((semester) => (
                  <React.Fragment key={semester}>
                    <tr className="tw-semester-row">
                      <td colSpan={6}>
                        <div className="tw-semester-title-row">
                          <span className="tw-semester-name">{semester}</span>
                          <span className="tw-count-pill">
                            {grouped[semester].length} classes
                          </span>
                        </div>
                      </td>
                    </tr>

                    {grouped[semester].map((item, itemIndex) => {
                      const roomDisplay = getDisplayRoom(item);
                      const isOnline = roomDisplay.toLowerCase() === 'online';
                      const isCancelled = shouldHighlightRow(item);

                      return (
                        <tr
                          key={`${semester}-${itemIndex}`}
                          className={`tw-table-row ${
                            isCancelled ? 'tw-table-row--cancelled' : ''
                          }`}
                          style={{ animationDelay: `${(itemIndex + 1) * 35}ms` }}
                        >
                          <td>
                            <span className="tw-table-chip">
                              {renderText(getSemesterLabel(item))}
                            </span>
                          </td>

                          <td>
                            <div className="tw-table-course">
                              <span
                                className="tw-table-course-title"
                                title={getDisplayCourseTitle(item)}
                              >
                                {renderText(getDisplayCourseTitle(item))}
                              </span>
                              <span className="tw-table-course-code">
                                {renderText(getCourseCode(item))}
                              </span>
                            </div>
                          </td>

                          <td>
                            <span className="tw-muted-text">
                              {renderText(getDisplayFaculty(item))}
                            </span>
                          </td>

                          <td>
                            <span
                              className={`tw-table-chip ${
                                isOnline ? 'tw-table-chip--online' : ''
                              }`}
                            >
                              {renderText(roomDisplay)}
                            </span>
                          </td>

                          <td>
                            <span className="tw-table-chip tw-table-chip--time">
                              {renderText(getDisplayTime(item))}
                            </span>
                          </td>

                          <td>
                            <span className="tw-campus-chip">
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
      </div>
    </>
  );
};

const timetableStyles = `
  @keyframes twEnter {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.99);
    }

    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes twRowIn {
    from {
      opacity: 0;
      transform: translateY(6px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .tw-stage {
    width: 100%;
    color: var(--theme-text-primary, #0f172a);
    animation: twEnter 220ms cubic-bezier(.2,.8,.2,1);
  }

  .tw-mobile-view {
    display: block;
  }

  .tw-desktop-view {
    display: none;
  }

  .tw-mobile-semester {
    overflow: hidden;
    border-bottom: 1px solid var(--theme-border-soft, rgba(226, 232, 240, 0.9));
    background: transparent;
  }

  .tw-mobile-semester:last-child {
    border-bottom: none;
  }

  .tw-mobile-semester-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 14px 10px;
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--theme-surface-muted, #f8fafc) 76%, transparent),
        color-mix(in srgb, var(--theme-surface, #ffffff) 90%, transparent)
      );
  }

  .tw-section-kicker {
    margin: 0 0 4px;
    color: var(--theme-text-muted, #64748b);
    font-size: 10px;
    line-height: 1;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .tw-mobile-semester-head h3 {
    margin: 0;
    color: var(--theme-text-primary, #0f172a);
    font-size: 15px;
    line-height: 1.1;
    font-weight: 900;
    letter-spacing: -0.025em;
  }

  .tw-count-pill {
    min-height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid var(--theme-border-soft, rgba(226, 232, 240, 0.9));
    background: color-mix(in srgb, var(--theme-surface-elevated, #ffffff) 88%, transparent);
    color: var(--theme-text-secondary, #475569);
    font-size: 11px;
    line-height: 1;
    font-weight: 850;
    white-space: nowrap;
  }

  .tw-mobile-card-list {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 10px 12px 14px;
  }

  .tw-class-card {
    position: relative;
    overflow: hidden;
    border-radius: 22px;
    border: 1px solid var(--theme-border-soft, rgba(226, 232, 240, 0.92));
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--theme-surface, #ffffff) 94%, transparent),
        color-mix(in srgb, var(--theme-surface-muted, #f8fafc) 74%, transparent)
      );
    box-shadow:
      0 9px 24px rgba(15, 23, 42, 0.07),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    padding: 12px;
    animation: twRowIn 190ms cubic-bezier(.2,.8,.2,1) both;
    transition:
      transform 160ms ease,
      box-shadow 160ms ease,
      border-color 160ms ease,
      background 160ms ease;
  }

  .tw-class-card:hover {
    transform: translateY(-1px);
    border-color: var(--theme-border, rgba(148, 163, 184, 0.34));
    box-shadow:
      0 13px 28px rgba(15, 23, 42, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.14);
  }

  .tw-class-card--cancelled {
    border-color: color-mix(in srgb, #ef4444 34%, var(--theme-border-soft, #e5e7eb));
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, #ef4444 8%, var(--theme-surface, #ffffff)),
        color-mix(in srgb, #ef4444 5%, var(--theme-surface-muted, #f8fafc))
      );
  }

  .tw-card-top {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }

  .tw-course-block {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }

  .tw-course-code {
    display: block;
    width: fit-content;
    max-width: 100%;
    min-height: 22px;
    margin-bottom: 7px;
    padding: 5px 9px;
    border-radius: 999px;
    border: 1px solid var(--theme-border-soft, rgba(226, 232, 240, 0.9));
    background: var(--theme-surface-muted, #f8fafc);
    color: var(--theme-text-secondary, #475569);
    font-size: 10.5px;
    line-height: 1.1;
    font-weight: 850;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tw-course-block h4 {
    display: block;
    width: 100%;
    max-width: 100%;
    margin: 0;
    color: var(--theme-text-primary, #0f172a);
    font-size: 14px;
    line-height: 1.35;
    font-weight: 850;
    letter-spacing: -0.012em;
    white-space: normal;
    overflow: visible;
    text-overflow: unset;
    overflow-wrap: anywhere;
  }

  .tw-room-pill {
    min-height: 26px;
    max-width: 112px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid var(--theme-border-soft, rgba(226, 232, 240, 0.9));
    background: color-mix(in srgb, var(--theme-surface-elevated, #ffffff) 86%, transparent);
    color: var(--theme-text-secondary, #475569);
    font-size: 11px;
    line-height: 1;
    font-weight: 850;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tw-room-pill--online {
    color: var(--theme-success, #16a34a);
    background: var(--theme-success-soft, rgba(22, 163, 74, 0.1));
    border-color: color-mix(in srgb, var(--theme-success, #16a34a) 30%, var(--theme-border-soft, #e5e7eb));
  }

  .tw-mobile-details {
    display: grid;
    grid-template-columns: 1fr;
    gap: 7px;
    margin-top: 12px;
  }

  .tw-detail-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 32px;
    padding: 7px 9px;
    border-radius: 999px;
    border: 1px solid var(--theme-border-soft, rgba(226, 232, 240, 0.86));
    background: color-mix(in srgb, var(--theme-surface-muted, #f8fafc) 74%, transparent);
  }

  .tw-detail-row--full {
    align-items: flex-start;
    border-radius: 17px;
  }

  .tw-detail-label {
    flex: 0 0 auto;
    color: var(--theme-text-muted, #64748b);
    font-size: 10px;
    line-height: 1.2;
    font-weight: 900;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .tw-detail-value {
    min-width: 0;
    color: var(--theme-text-primary, #0f172a);
    font-size: 12px;
    line-height: 1.25;
    font-weight: 750;
    text-align: right;
    overflow-wrap: anywhere;
  }

  .tw-empty-state {
    display: grid;
    place-items: center;
    text-align: center;
    padding: 34px 18px;
    border-radius: 24px;
    border: 1px solid var(--theme-border-soft, rgba(226, 232, 240, 0.92));
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--theme-surface, #ffffff) 94%, transparent),
        color-mix(in srgb, var(--theme-surface-muted, #f8fafc) 74%, transparent)
      );
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
  }

  .tw-empty-icon {
    width: 58px;
    height: 58px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 14px;
    border-radius: 999px;
    border: 1px solid var(--theme-border-soft, rgba(226, 232, 240, 0.92));
    background: var(--theme-surface-muted, #f8fafc);
    color: var(--theme-text-muted, #64748b);
  }

  .tw-empty-icon svg {
    width: 30px;
    height: 30px;
  }

  .tw-empty-state h3 {
    margin: 0 0 6px;
    color: var(--theme-text-primary, #0f172a);
    font-size: 16px;
    font-weight: 850;
    letter-spacing: -0.02em;
  }

  .tw-empty-state p {
    margin: 0;
    max-width: 420px;
    color: var(--theme-text-secondary, #475569);
    font-size: 13px;
    line-height: 1.5;
  }

  .timetable-cancelled-text {
    color: #ef4444;
    font-weight: 900;
  }

  @media (min-width: 768px) {
    .tw-mobile-view {
      display: none;
    }

    .tw-desktop-view {
      display: block;
      width: 100%;
      overflow-x: auto;
    }

    .tw-table-shell {
      min-width: 980px;
      overflow: hidden;
      background: transparent;
    }

    .tw-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
    }

    .tw-table thead {
      position: sticky;
      top: 0;
      z-index: 2;
      background:
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--theme-surface-muted, #f8fafc) 88%, transparent),
          color-mix(in srgb, var(--theme-surface, #ffffff) 94%, transparent)
        );
    }

    .tw-table th {
      padding: 14px 16px;
      border-bottom: 1px solid var(--theme-border-soft, rgba(226, 232, 240, 0.92));
      color: var(--theme-text-muted, #64748b);
      font-size: 11px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-align: left;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .tw-semester-row td {
      padding: 12px 16px;
      border-top: 1px solid var(--theme-border-soft, rgba(226, 232, 240, 0.92));
      border-bottom: 1px solid var(--theme-border-soft, rgba(226, 232, 240, 0.92));
      background:
        linear-gradient(
          90deg,
          color-mix(in srgb, var(--theme-surface-muted, #f8fafc) 80%, transparent),
          color-mix(in srgb, var(--theme-surface, #ffffff) 92%, transparent)
        );
    }

    .tw-semester-title-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .tw-semester-name {
      color: var(--theme-text-primary, #0f172a);
      font-size: 13px;
      line-height: 1;
      font-weight: 900;
      letter-spacing: -0.01em;
    }

    .tw-table-row {
      animation: twRowIn 170ms cubic-bezier(.2,.8,.2,1) both;
      transition:
        background 140ms ease,
        box-shadow 140ms ease;
    }

    .tw-table-row td {
      padding: 13px 16px;
      border-bottom: 1px solid var(--theme-border-soft, rgba(226, 232, 240, 0.72));
      background: color-mix(in srgb, var(--theme-surface, #ffffff) 86%, transparent);
      vertical-align: middle;
    }

    .tw-table-row:nth-child(even) td {
      background: color-mix(in srgb, var(--theme-surface-muted, #f8fafc) 44%, var(--theme-surface, #ffffff));
    }

    .tw-table-row:hover td {
      background: var(--theme-surface-elevated, #ffffff);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }

    .tw-table-row--cancelled td {
      background:
        color-mix(in srgb, #ef4444 7%, var(--theme-surface, #ffffff)) !important;
    }

    .tw-table-chip,
    .tw-campus-chip {
      min-height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      max-width: 240px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid var(--theme-border-soft, rgba(226, 232, 240, 0.92));
      background: var(--theme-surface-muted, #f8fafc);
      color: var(--theme-text-secondary, #475569);
      font-size: 12px;
      line-height: 1;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tw-table-chip--online {
      color: var(--theme-success, #16a34a);
      background: var(--theme-success-soft, rgba(22, 163, 74, 0.1));
      border-color: color-mix(in srgb, var(--theme-success, #16a34a) 30%, var(--theme-border-soft, #e5e7eb));
    }

    .tw-table-chip--time {
      color: var(--theme-text-primary, #0f172a);
      background: color-mix(in srgb, var(--theme-surface-muted, #f8fafc) 78%, transparent);
    }

    .tw-table-course {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-width: 480px;
    }

    .tw-table-course-title {
      display: block;
      max-width: 460px;
      color: var(--theme-text-primary, #0f172a);
      font-size: 13px;
      line-height: 1.35;
      font-weight: 850;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tw-table-course-code {
      color: var(--theme-text-muted, #64748b);
      font-size: 11px;
      line-height: 1;
      font-weight: 800;
    }

    .tw-muted-text {
      color: var(--theme-text-secondary, #475569);
      font-size: 13px;
      line-height: 1.35;
      font-weight: 650;
      white-space: nowrap;
    }

    .tw-campus-chip {
      max-width: 280px;
      justify-content: flex-start;
    }
  }

  @media (max-width: 420px) {
    .tw-mobile-semester-head {
      padding: 13px 12px 9px;
    }

    .tw-mobile-semester-head h3 {
      font-size: 14px;
    }

    .tw-count-pill {
      min-height: 24px;
      padding: 0 8px;
      font-size: 10.5px;
    }

    .tw-mobile-card-list {
      padding: 9px 10px 12px;
      gap: 9px;
    }

    .tw-class-card {
      border-radius: 20px;
      padding: 11px;
    }

    .tw-card-top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: 8px;
    }

    .tw-course-block {
      min-width: 0;
      overflow: hidden;
    }

    .tw-course-code {
      display: block;
      width: fit-content;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tw-course-block h4 {
      font-size: 13.5px;
      white-space: normal;
      overflow: visible;
      text-overflow: unset;
      overflow-wrap: anywhere;
    }

    .tw-room-pill {
      max-width: 92px;
    }

    .tw-detail-row {
      min-height: 30px;
      padding: 7px 8px;
    }

    .tw-detail-value {
      font-size: 11.5px;
    }
  }
`;

export default TimetableTable;
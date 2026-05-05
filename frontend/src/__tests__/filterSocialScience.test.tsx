import React from 'react';
import { render, screen } from '@testing-library/react';
import TimetableTable from '../components/TimetableTable/TimetableTable';

const mockItems = [
  {
    row_number: 1,
    department: 'Social Sciences',
    program: 'BSSS & BS PSY',
    section: 'BSSS 1',
    semester_display: 'BSSS 1',
    course: 'SS 1201 Introduction to Social Sciences',
    course_title: 'Introduction to Social Sciences',
    faculty: 'Abdul Hanan Sami',
    room: '204',
    time: '08:00 AM - 11:00 AM',
    campus: 'SZABIST University H-8/4 ISB Campus',
  },
  {
    row_number: 2,
    department: 'Social Sciences',
    program: 'BSSS & BS PSY',
    section: 'BS Psychology 1',
    semester_display: 'BS Psychology 1',
    course: 'SS 1201 Introduction to Social Sciences',
    course_title: 'Introduction to Social Sciences',
    faculty: 'Abdul Hanan Sami',
    room: '204',
    time: '08:00 AM - 11:00 AM',
    campus: 'SZABIST University H-8/4 ISB Campus',
  },
];

test('TimetableTable displays separate Social Sciences semesters correctly', () => {
  render(<TimetableTable items={mockItems as any} />);

  // Both semester headings should be present
  expect(screen.getAllByText(/BSSS 1/i).length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText(/BS Psychology 1/i).length).toBeGreaterThanOrEqual(1);

  // Course title should be visible for both entries
  expect(screen.getAllByText(/Introduction to Social Sciences/i).length).toBeGreaterThanOrEqual(2);
});

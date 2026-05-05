import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

if (typeof window.matchMedia === 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

jest.mock('../services/api', () => {
  const mockItems = [
    {
      row_number: 1,
      department: 'Social Sciences',
      program: 'BSSS & BS PSY',
      section: 'BSSS 1 / BS Psychology 1',
      semester_display: 'BSSS 1 / BS Psychology 1',
      semester: '',
      semester_key: '',
      class_section: 'BSSS 1 / BS Psychology 1',
      course: 'SS 1201 Introduction to Social Sciences',
      course_title: 'Introduction to Social Sciences',
      course_code: 'SS 1201',
      faculty: 'Abdul Hanan Sami',
      room: '204',
      time: '08:00 AM - 11:00 AM',
      campus: 'SZABIST University H-8/4 ISB Campus',
    },
    {
      row_number: 2,
      department: 'Social Sciences',
      program: 'BSSS & BS PSY',
      section: 'BSSS 1 / BS Psychology 1',
      semester_display: 'BSSS 1 / BS Psychology 1',
      semester: '',
      semester_key: '',
      class_section: 'BSSS 1 / BS Psychology 1',
      course: 'SS 1104 Introduction to Community Development and Philanthropy',
      course_title: 'Introduction to Community Development and Philanthropy',
      course_code: 'SS 1104',
      faculty: 'Abdul Hanan Sami',
      room: '301',
      time: '11:10 AM - 2:10 PM',
      campus: 'SZABIST University H-8/4 ISB Campus',
    },
  ];

  return {
    apiService: {
      initialize: jest.fn().mockResolvedValue('http://localhost:5000'),
      getLatestTimetable: jest.fn().mockResolvedValue({ success: true, data: { items: mockItems }, cached: true }),
      getConfig: jest.fn().mockResolvedValue({ success: true, data: { semester_filter: ['BSSS1', 'BS Psychology 1'] } }),
      getStatus: jest.fn().mockResolvedValue({ success: true, data: {} }),
      runScraper: jest.fn().mockResolvedValue({ success: true, data: { items: mockItems } }),
      updateSemesters: jest.fn().mockResolvedValue({ success: true }),
      getBaseOrigin: () => 'http://localhost:5000',
      getGmailAuthUrl: jest.fn(),
      _axiosInstance: {},
    },
  };
});

beforeEach(() => {
  localStorage.setItem('user', JSON.stringify({ id: 'test-user', email: '2380223@szabist-isb.pk' }));
});

test('App shows Social Sciences timetable in both semester sections', async () => {
  const App = require('../App').default;
  render(<App />);

  // match semester headers flexibly (may render without spaces or split across nodes)
  await waitFor(() => expect(screen.getAllByText((content) => /BSSS\s*1/i.test(content)).length).toBeGreaterThanOrEqual(1));
  await waitFor(() => expect(screen.getAllByText((content) => /BS\s*Psychology\s*1/i.test(content)).length).toBeGreaterThanOrEqual(1));

  expect(screen.getAllByText(/Introduction to Social Sciences/i).length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText(/Introduction to Community Development and Philanthropy/i).length).toBeGreaterThanOrEqual(1);
});

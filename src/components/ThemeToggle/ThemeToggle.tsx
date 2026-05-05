import React from 'react';
import { MoonStar, SunMedium } from 'lucide-react';

interface ThemeToggleProps {
  theme: 'light' | 'dark';
  onToggle: () => void;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle }) => {
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={onToggle}
      className="theme-toggle"
      aria-pressed={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className="theme-toggle__track" data-active={isDark ? 'true' : 'false'}>
        <span className="theme-toggle__glow" />
        <span className="theme-toggle__thumb">
          <SunMedium className="theme-toggle__icon theme-toggle__icon--sun" />
          <MoonStar className="theme-toggle__icon theme-toggle__icon--moon" />
        </span>
      </span>
    </button>
  );
};

export default ThemeToggle;

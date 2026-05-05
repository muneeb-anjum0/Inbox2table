import React from 'react';
import { AlertCircle, CheckCircle, Clock, Loader } from 'lucide-react';

interface StatusIndicatorProps {
  status: 'loading' | 'success' | 'error' | 'warning';
  message: string;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, message }) => {
  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader className="animate-spin h-5 w-5" />;
      case 'success':
        return <CheckCircle className="h-5 w-5" />;
      case 'error':
        return <AlertCircle className="h-5 w-5" />;
      case 'warning':
        return <Clock className="h-5 w-5" />;
      default:
        return <AlertCircle className="h-5 w-5" />;
    }
  };

  const getStatusTheme = () => {
    switch (status) {
      case 'loading':
        return {
          accent: 'status-indicator--loading',
          icon: 'status-indicator__icon-surface',
          badge: 'status-indicator__badge-surface',
          title: 'theme-text-primary',
          subtitle: 'theme-text-secondary',
        };
      case 'success':
        return {
          accent: 'status-indicator--success',
          icon: 'status-indicator__icon-surface',
          badge: 'status-indicator__badge-surface',
          title: 'theme-text-primary',
          subtitle: 'theme-text-secondary',
        };
      case 'error':
        return {
          accent: 'status-indicator--error',
          icon: 'status-indicator__icon-surface',
          badge: 'status-indicator__badge-surface',
          title: 'theme-text-primary',
          subtitle: 'theme-text-secondary',
        };
      case 'warning':
        return {
          accent: 'status-indicator--warning',
          icon: 'status-indicator__icon-surface',
          badge: 'status-indicator__badge-surface',
          title: 'theme-text-primary',
          subtitle: 'theme-text-secondary',
        };
      default:
        return {
          accent: 'status-indicator--idle',
          icon: 'status-indicator__icon-surface',
          badge: 'status-indicator__badge-surface',
          title: 'theme-text-primary',
          subtitle: 'theme-text-secondary',
        };
    }
  };

  const theme = getStatusTheme();

  const statusLabel =
    status === 'loading'
      ? 'Running scraper'
      : status === 'success'
      ? 'Ready'
      : status === 'warning'
      ? 'Attention needed'
      : status === 'error'
      ? 'Action required'
      : 'Status';

  return (
    <div className={`status-indicator surface-card border shadow-sm overflow-hidden ${theme.accent}`}>
      <div className="status-indicator__inner flex items-center gap-2 p-2.5">
        <div className={`status-indicator__icon flex h-9 w-9 items-center justify-center rounded-2xl ${theme.icon} ${status === 'loading' ? 'status-indicator__icon--loading' : ''}`}>
          {getStatusIcon()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className={`text-[0.82rem] font-semibold leading-tight ${theme.title}`}>{statusLabel}</p>
            <span className={`status-indicator__badge rounded-full border px-1.5 py-0.5 text-[0.64rem] font-semibold ${theme.badge}`}>
              {status.toUpperCase()}
            </span>
          </div>
          <p className={`mt-0.5 text-[0.78rem] leading-snug ${theme.subtitle} truncate`}>{message}</p>
        </div>
      </div>
    </div>
  );
};

export default StatusIndicator;
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
          accent: 'bg-blue-500/10 border-blue-200',
          icon: 'bg-blue-100 text-blue-600',
          badge: 'bg-blue-100 text-blue-700 border-blue-200',
          title: 'text-slate-900',
          subtitle: 'text-slate-600',
        };
      case 'success':
        return {
          accent: 'bg-green-500/10 border-green-200',
          icon: 'bg-green-100 text-green-600',
          badge: 'bg-green-100 text-green-700 border-green-200',
          title: 'text-slate-900',
          subtitle: 'text-slate-600',
        };
      case 'error':
        return {
          accent: 'bg-red-500/10 border-red-200',
          icon: 'bg-red-100 text-red-600',
          badge: 'bg-red-100 text-red-700 border-red-200',
          title: 'text-slate-900',
          subtitle: 'text-slate-600',
        };
      case 'warning':
        return {
          accent: 'bg-amber-500/10 border-amber-200',
          icon: 'bg-amber-100 text-amber-600',
          badge: 'bg-amber-100 text-amber-700 border-amber-200',
          title: 'text-slate-900',
          subtitle: 'text-slate-600',
        };
      default:
        return {
          accent: 'bg-slate-100 border-slate-200',
          icon: 'bg-slate-100 text-slate-600',
          badge: 'bg-slate-100 text-slate-700 border-slate-200',
          title: 'text-slate-900',
          subtitle: 'text-slate-600',
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
    <div className={`surface-card border shadow-sm transition-all duration-300 overflow-hidden ${theme.accent}`}>
      <div className="flex items-center gap-2 p-2.5">
        <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${theme.icon}`}>
          {getStatusIcon()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className={`text-[0.82rem] font-semibold leading-tight ${theme.title}`}>{statusLabel}</p>
            <span className={`rounded-full border px-1.5 py-0.5 text-[0.64rem] font-semibold ${theme.badge}`}>
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
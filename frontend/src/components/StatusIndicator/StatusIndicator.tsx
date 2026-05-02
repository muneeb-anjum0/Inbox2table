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

  const getStatusColors = () => {
    switch (status) {
      case 'loading':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'success':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className={`flex items-center p-4 rounded-xl border transition-all duration-300 shadow-sm ${getStatusColors()}`}>
      <div>
        {getStatusIcon()}
      </div>
      <span className="ml-3 text-sm font-medium">{message}</span>
    </div>
  );
};

export default StatusIndicator;
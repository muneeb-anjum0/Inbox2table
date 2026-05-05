import React, { useState, useEffect } from 'react';
import { Plus, X, Save, Settings } from 'lucide-react';

interface SemesterManagerProps {
  isOpen: boolean;
  onClose: () => void;
  currentSemesters: string[];
  onSave: (semesters: string[]) => void;
}

const SemesterManager: React.FC<SemesterManagerProps> = ({ 
  isOpen, 
  onClose, 
  currentSemesters = [], 
  onSave 
}) => {
  const [semesters, setSemesters] = useState<string[]>(currentSemesters);
  const [newSemester, setNewSemester] = useState('');

  useEffect(() => {
    console.log('SemesterManager received currentSemesters:', currentSemesters); // Debug log
    setSemesters(currentSemesters);
  }, [currentSemesters]);

  const addSemester = () => {
    if (newSemester.trim() && !semesters.includes(newSemester.trim())) {
      setSemesters([...semesters, newSemester.trim()]);
      setNewSemester('');
    }
  };

  const removeSemester = (index: number) => {
    setSemesters(semesters.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    await onSave(semesters);
    onClose();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addSemester();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 theme-modal-overlay flex items-center justify-center z-50 animate-fade-in">
      <div className="surface-card shadow-2xl w-full max-w-md mx-4 animate-modal-drop">
        <div className="surface-card__header">
          <div className="flex items-center">
            <Settings className="h-5 w-5 text-blue-600 mr-3" />
            <h3 className="text-lg font-semibold theme-text-primary tracking-tight">
              Manage Allowed Semesters
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 theme-text-muted hover:bg-[color:var(--theme-surface-muted)] transition-all duration-200 hover:scale-105"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 animate-drop-subtle">
          <div className="mb-4">
            <label className="block text-sm font-medium theme-text-secondary mb-2">
              Add New Semester
            </label>
            <div className="flex">
              <input
                type="text"
                value={newSemester}
                onChange={(e) => setNewSemester(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="e.g., BS (SE) - 5C or 7A"
                className="flex-1 block w-full rounded-l-full border theme-border-soft shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-4 py-2 bg-[color:var(--theme-surface-muted)] theme-text-primary"
              />
              <button
                onClick={addSemester}
                disabled={!newSemester.trim()}
                className="btn-pill btn-pill--neutral ml-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Add semester"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Examples: "BS (SE) - 5C", "MS (CS) - 1A", "7A", "3B"
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium theme-text-secondary mb-2">
              Current Semesters ({semesters.length})
            </label>
            <div className="max-h-48 overflow-y-auto border theme-border-soft rounded-xl bg-[color:var(--theme-surface-muted)]">
              {semesters.length === 0 ? (
                <div className="p-4 text-center theme-text-muted text-sm">
                  No semesters configured. Add some semesters above.
                </div>
              ) : (
                <div className="divide-y divide-[color:var(--theme-border-soft)]">
                  {semesters.map((semester, index) => (
                    <div key={index} className="flex items-center justify-between p-3 hover:bg-[color:var(--theme-surface-elevated)] rounded-xl transition-all duration-200 hover:shadow-sm">
                      <span className="text-sm theme-text-primary">{semester}</span>
                      <button
                        onClick={() => removeSemester(index)}
                        className="btn-pill btn-pill--ghost"
                        title="Remove semester"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t theme-border-soft flex justify-end gap-2">
          <button
            onClick={onClose}
            className="btn-pill btn-pill--neutral"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="btn-pill btn-pill--primary"
          >
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default SemesterManager;
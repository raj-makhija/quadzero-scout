'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Clock, Save } from 'lucide-react';

const TIMEOUT_PRESETS = [
  { label: '30 minutes', value: 1800 },
  { label: '1 hour', value: 3600 },
  { label: '4 hours', value: 14400 },
  { label: '8 hours', value: 28800 },
  { label: '12 hours', value: 43200 },
  { label: '24 hours', value: 86400 },
  { label: '48 hours', value: 172800 },
  { label: '7 days', value: 604800 },
  { label: '30 days', value: 2592000 },
];

function formatTimeout(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  return `${Math.round(seconds / 86400)} days`;
}

export default function AdminSettingsPage() {
  const [currentTimeout, setCurrentTimeout] = useState<number | null>(null);
  const [selectedTimeout, setSelectedTimeout] = useState<number>(86400);
  const [customTimeout, setCustomTimeout] = useState<string>('');
  const [isCustom, setIsCustom] = useState(false);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await api.getSessionSettings();
        const timeout = data.settings.sessionTimeoutSeconds;
        setCurrentTimeout(timeout);
        setSelectedTimeout(timeout);

        // Check if it matches a preset
        const isPreset = TIMEOUT_PRESETS.some((p) => p.value === timeout);
        if (!isPreset) {
          setIsCustom(true);
          setCustomTimeout(String(timeout));
        }
      } catch (err) {
        console.error('Failed to load session settings:', err);
        setMessage({ type: 'error', text: 'Failed to load current settings.' });
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  const handlePresetChange = (value: string) => {
    if (value === 'custom') {
      setIsCustom(true);
      setCustomTimeout(String(selectedTimeout));
    } else {
      setIsCustom(false);
      setSelectedTimeout(Number(value));
    }
  };

  const handleSave = async () => {
    const timeoutValue = isCustom ? Number(customTimeout) : selectedTimeout;

    if (isNaN(timeoutValue) || timeoutValue < 1800 || timeoutValue > 2592000) {
      setMessage({
        type: 'error',
        text: 'Timeout must be between 1800 seconds (30 minutes) and 2592000 seconds (30 days).',
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const result = await api.updateSessionSettings(
        { sessionTimeoutSeconds: timeoutValue },
        description || undefined
      );
      setCurrentTimeout(timeoutValue);
      setSelectedTimeout(timeoutValue);
      setDescription('');
      setMessage({
        type: 'success',
        text: `Session timeout updated to ${formatTimeout(timeoutValue)} (version ${result.version}). Changes will take effect within 5 minutes.`,
      });
    } catch (err) {
      console.error('Failed to update session settings:', err);
      setMessage({ type: 'error', text: 'Failed to update session settings.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Settings
      </h1>

      <div className="card p-6">
        <div className="flex items-center gap-3 mb-6">
          <Clock className="w-6 h-6 text-primary-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Session Timeout
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Automatically log out users after a period of inactivity. Current:{' '}
              <span className="font-medium">
                {currentTimeout ? formatTimeout(currentTimeout) : 'Loading...'}
              </span>
            </p>
          </div>
        </div>

        <div className="space-y-4 max-w-md">
          <div>
            <label
              htmlFor="timeout-select"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Timeout Duration
            </label>
            <select
              id="timeout-select"
              value={isCustom ? 'custom' : String(selectedTimeout)}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {TIMEOUT_PRESETS.map((preset) => (
                <option key={preset.value} value={String(preset.value)}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">Custom...</option>
            </select>
          </div>

          {isCustom && (
            <div>
              <label
                htmlFor="custom-timeout"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Custom Timeout (seconds)
              </label>
              <input
                id="custom-timeout"
                type="number"
                min={1800}
                max={2592000}
                value={customTimeout}
                onChange={(e) => setCustomTimeout(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="e.g. 86400 for 24 hours"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Min: 1800 (30 min) | Max: 2592000 (30 days)
                {customTimeout && !isNaN(Number(customTimeout)) && Number(customTimeout) >= 1800 && (
                  <> | = {formatTimeout(Number(customTimeout))}</>
                )}
              </p>
            </div>
          )}

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Change Description (optional)
            </label>
            <input
              id="description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="e.g. Increased timeout for remote team"
              maxLength={500}
            />
          </div>

          {message && (
            <div
              className={`p-3 rounded-lg text-sm ${
                message.type === 'success'
                  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
              }`}
            >
              {message.text}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

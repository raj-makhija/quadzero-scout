'use client';

import { useState, useEffect } from 'react';
import { api, JobSource } from '@/lib/api';
import { Pencil, Trash2, Plus, X } from 'lucide-react';

const VALID_TYPES = ['stub', 'greenhouse', 'lever'];
const VALID_CADENCES = ['daily', 'weekly'];

type FormState = {
  type: string;
  identifier: string;
  url: string;
  cadence: string;
  enabled: boolean;
};

const EMPTY_FORM: FormState = {
  type: 'greenhouse',
  identifier: '',
  url: '',
  cadence: 'daily',
  enabled: true,
};

export default function ScanSourcesPage() {
  const [sources, setSources] = useState<JobSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await api.listJobSources();
      setSources(res.sources);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load sources' });
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setMessage(null);
  }

  function openEdit(source: JobSource) {
    setEditingId(source.source_id);
    setForm({
      type: source.type,
      identifier: source.identifier,
      url: source.url,
      cadence: source.cadence,
      enabled: source.enabled,
    });
    setShowForm(true);
    setMessage(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      if (editingId) {
        const res = await api.updateJobSource(editingId, form);
        setSources((prev) => prev.map((s) => (s.source_id === editingId ? res.source : s)));
        setMessage({ type: 'success', text: 'Source updated.' });
      } else {
        const res = await api.createJobSource(form);
        setSources((prev) => [...prev, res.source]);
        setMessage({ type: 'success', text: 'Source created.' });
      }
      closeForm();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEnabled(source: JobSource) {
    try {
      const res = await api.updateJobSource(source.source_id, { enabled: !source.enabled });
      setSources((prev) => prev.map((s) => (s.source_id === source.source_id ? res.source : s)));
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Toggle failed' });
    }
  }

  async function handleDelete(source: JobSource) {
    if (!confirm(`Delete source "${source.identifier}" (${source.type})? This cannot be undone.`)) return;
    setDeletingId(source.source_id);
    try {
      await api.deleteJobSource(source.source_id);
      setSources((prev) => prev.filter((s) => s.source_id !== source.source_id));
      setMessage({ type: 'success', text: 'Source deleted.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Delete failed' });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Scan Sources</h1>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Source
        </button>
      </div>

      {message && (
        <p className={`mb-4 text-sm ${message.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {message.text}
        </p>
      )}

      {showForm && (
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {editingId ? 'Edit Source' : 'New Source'}
            </h2>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                {VALID_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">Identifier</label>
              <input
                type="text"
                required
                value={form.identifier}
                onChange={(e) => setForm({ ...form, identifier: e.target.value })}
                placeholder="e.g. acme-corp"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="col-span-2">
              <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">URL</label>
              <input
                type="url"
                required
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://boards.greenhouse.io/acme-corp"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">Cadence</label>
              <select
                value={form.cadence}
                onChange={(e) => setForm({ ...form, cadence: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                {VALID_CADENCES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input
                id="enabled-toggle"
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="enabled-toggle" className="text-sm text-gray-700 dark:text-gray-300">Enabled</label>
            </div>
            <div className="col-span-2 flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
              <button type="button" onClick={closeForm} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400 animate-pulse">Loading...</p>
      ) : sources.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No scan sources configured. Add one to get started.</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Identifier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Cadence</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Enabled</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Scanned</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {sources.map((source) => (
                <tr key={source.source_id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-mono">{source.type}</td>
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{source.identifier}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{source.cadence}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleEnabled(source)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                        source.enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                      title={source.enabled ? 'Click to disable' : 'Click to enable'}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          source.enabled ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {source.last_scanned_at
                      ? new Date(source.last_scanned_at).toLocaleString()
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(source)}
                        className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(source)}
                        disabled={deletingId === source.source_id}
                        className="text-red-500 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

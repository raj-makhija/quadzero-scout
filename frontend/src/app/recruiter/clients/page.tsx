'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/Header';
import { api, ClientSummary } from '@/lib/api';
import { formatEngagementModel, formatPayroll } from '@/lib/utils';

const PAYMENT_TERMS_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: '30', label: 'Net 30' },
  { value: '45', label: 'Net 45' },
  { value: '60', label: 'Net 60' },
  { value: '90', label: 'Net 90' },
];

const ENGAGEMENT_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'full_time_regular', label: 'Full-Time Regular' },
  { value: 'full_time_contract', label: 'Full-Time Contract' },
  { value: 'part_time_contract', label: 'Part-Time Contract' },
];

const PAYROLL_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'quadzero', label: 'Quadzero' },
  { value: 'client', label: 'Client' },
];

export default function ClientsPage() {
  const router = useRouter();
  const { status } = useSession();

  if (status === 'unauthenticated') {
    router.push('/auth/signin?callbackUrl=' + encodeURIComponent('/recruiter/clients'));
    return null;
  }

  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    defaultPaymentTermsDays?: string;
    defaultEngagementModel?: string;
    defaultPayroll?: string;
    notes?: string;
  }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;
    loadClients();
  }, [status]);

  const loadClients = async () => {
    try {
      setLoading(true);
      const data = await api.listClients();
      setClients(data.clients);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (client: ClientSummary) => {
    setEditingId(client.clientId);
    setEditValues({
      defaultPaymentTermsDays: client.defaultPaymentTermsDays?.toString() || '',
      defaultEngagementModel: client.defaultEngagementModel || '',
      defaultPayroll: client.defaultPayroll || '',
      notes: client.notes || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEdit = async (clientId: string) => {
    setSaving(true);
    try {
      await api.updateClient(clientId, {
        defaultPaymentTermsDays: editValues.defaultPaymentTermsDays
          ? parseInt(editValues.defaultPaymentTermsDays)
          : undefined,
        defaultEngagementModel: editValues.defaultEngagementModel || undefined,
        defaultPayroll: editValues.defaultPayroll || undefined,
        notes: editValues.notes || undefined,
      });
      setEditingId(null);
      setEditValues({});
      await loadClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header>
        <nav className="flex items-center space-x-4">
          <span className="text-sm text-primary-600 dark:text-primary-400 font-medium">
            Clients
          </span>
        </nav>
      </Header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Client Master</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage default settings per client. These auto-populate when creating new requirements.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {loading && (
          <div className="card p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto" />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading clients...</p>
          </div>
        )}

        {!loading && clients.length === 0 && (
          <div className="card p-8 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">No clients yet</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Client defaults are created automatically when posting requirements. Toggle &quot;Save client defaults&quot; on the new requirement form.
            </p>
            <button
              onClick={() => router.push('/recruiter/requirements/new')}
              className="btn-primary mt-4"
            >
              Post New Requirement
            </button>
          </div>
        )}

        {!loading && clients.length > 0 && (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Payment Terms</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Engagement</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Payroll</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Notes</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {clients.map((client) => (
                    <tr key={client.clientId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{client.clientName}</span>
                      </td>

                      {editingId === client.clientId ? (
                        <>
                          <td className="px-4 py-3">
                            <select
                              value={editValues.defaultPaymentTermsDays || ''}
                              onChange={(e) => setEditValues({ ...editValues, defaultPaymentTermsDays: e.target.value })}
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            >
                              {PAYMENT_TERMS_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={editValues.defaultEngagementModel || ''}
                              onChange={(e) => setEditValues({ ...editValues, defaultEngagementModel: e.target.value })}
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            >
                              {ENGAGEMENT_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={editValues.defaultPayroll || ''}
                              onChange={(e) => setEditValues({ ...editValues, defaultPayroll: e.target.value })}
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            >
                              {PAYROLL_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={editValues.notes || ''}
                              onChange={(e) => setEditValues({ ...editValues, notes: e.target.value })}
                              placeholder="Notes..."
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => saveEdit(client.clientId)}
                                disabled={saving}
                                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium"
                              >
                                {saving ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 font-medium"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {client.defaultPaymentTermsDays ? `Net ${client.defaultPaymentTermsDays}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {client.defaultEngagementModel ? formatEngagementModel(client.defaultEngagementModel) : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {client.defaultPayroll ? formatPayroll(client.defaultPayroll) : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                            {client.notes || '-'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => startEdit(client)}
                              className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium"
                            >
                              Edit
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

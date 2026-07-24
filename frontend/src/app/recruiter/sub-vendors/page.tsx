'use client';

import { Fragment, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/Header';
import { api, SubVendorSummary, SubmissionByVendor } from '@/lib/api';

export default function SubVendorsPage() {
  const router = useRouter();
  const { status } = useSession();

  if (status === 'unauthenticated') {
    router.push('/auth/signin?callbackUrl=' + encodeURIComponent('/recruiter/sub-vendors'));
    return null;
  }

  const [subVendors, setSubVendors] = useState<SubVendorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    contactPersonName?: string;
    contactPersonPhone?: string;
    contactPersonEmail?: string;
    notes?: string;
  }>({});
  const [saving, setSaving] = useState(false);

  // Add new sub-vendor state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSubVendor, setNewSubVendor] = useState({
    subVendorName: '',
    contactPersonName: '',
    contactPersonPhone: '',
    contactPersonEmail: '',
    notes: '',
  });
  const [adding, setAdding] = useState(false);

  // Per-submission tracking (#576): count per vendor + inline drill-down.
  const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({});
  const [expandedVendorId, setExpandedVendorId] = useState<string | null>(null);
  const [submissionsByVendor, setSubmissionsByVendor] = useState<Record<string, SubmissionByVendor[]>>({});
  const [loadingSubmissions, setLoadingSubmissions] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    loadSubVendors();
  }, [status]);

  const loadSubVendors = async () => {
    try {
      setLoading(true);
      const data = await api.listSubVendors();
      setSubVendors(data.subVendors);
      loadSubmissionCounts(data.subVendors);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sub-vendors');
    } finally {
      setLoading(false);
    }
  };

  // Fetch each vendor's submission count in parallel (keyed by sub_vendor_id).
  const loadSubmissionCounts = async (vendors: SubVendorSummary[]) => {
    const entries = await Promise.all(
      vendors.map(async (sv) => {
        try {
          const res = await api.getSubVendorSubmissions(sv.subVendorId);
          return [sv.subVendorId, res.submissions.length] as const;
        } catch {
          return [sv.subVendorId, 0] as const;
        }
      })
    );
    setSubmissionCounts(Object.fromEntries(entries));
  };

  const toggleVendorSubmissions = async (subVendorId: string) => {
    if (expandedVendorId === subVendorId) {
      setExpandedVendorId(null);
      return;
    }
    setExpandedVendorId(subVendorId);
    if (!submissionsByVendor[subVendorId]) {
      setLoadingSubmissions(subVendorId);
      try {
        const res = await api.getSubVendorSubmissions(subVendorId);
        setSubmissionsByVendor((prev) => ({ ...prev, [subVendorId]: res.submissions }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load submissions');
      } finally {
        setLoadingSubmissions(null);
      }
    }
  };

  const startEdit = (sv: SubVendorSummary) => {
    setEditingId(sv.subVendorId);
    setEditValues({
      contactPersonName: sv.contactPersonName || '',
      contactPersonPhone: sv.contactPersonPhone || '',
      contactPersonEmail: sv.contactPersonEmail || '',
      notes: sv.notes || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEdit = async (subVendorId: string) => {
    setSaving(true);
    try {
      await api.updateSubVendor(subVendorId, {
        contactPersonName: editValues.contactPersonName || null,
        contactPersonPhone: editValues.contactPersonPhone || null,
        contactPersonEmail: editValues.contactPersonEmail || null,
        notes: editValues.notes || null,
      });
      setEditingId(null);
      setEditValues({});
      await loadSubVendors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!newSubVendor.subVendorName.trim()) {
      setError('Sub-vendor name is required');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await api.saveSubVendor({
        subVendorName: newSubVendor.subVendorName.trim(),
        contactPersonName: newSubVendor.contactPersonName.trim() || undefined,
        contactPersonPhone: newSubVendor.contactPersonPhone.trim() || undefined,
        contactPersonEmail: newSubVendor.contactPersonEmail.trim() || undefined,
        notes: newSubVendor.notes.trim() || undefined,
      });
      setShowAddForm(false);
      setNewSubVendor({ subVendorName: '', contactPersonName: '', contactPersonPhone: '', contactPersonEmail: '', notes: '' });
      await loadSubVendors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add sub-vendor');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header>
        <nav className="flex items-center space-x-4">
          <span className="text-sm text-primary-600 dark:text-primary-400 font-medium">
            Sub-Vendors
          </span>
        </nav>
      </Header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Sub-Vendor Master</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage sub-vendor partners. Sub-vendors can be linked to candidates during profile submission.
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn-primary"
          >
            {showAddForm ? 'Cancel' : '+ Add Sub-Vendor'}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {showAddForm && (
          <div className="card p-6 mb-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Add New Sub-Vendor</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Sub-Vendor Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newSubVendor.subVendorName}
                  onChange={(e) => setNewSubVendor({ ...newSubVendor, subVendorName: e.target.value })}
                  placeholder="Company name"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact Person</label>
                <input
                  type="text"
                  value={newSubVendor.contactPersonName}
                  onChange={(e) => setNewSubVendor({ ...newSubVendor, contactPersonName: e.target.value })}
                  placeholder="Contact name"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                <input
                  type="text"
                  value={newSubVendor.contactPersonPhone}
                  onChange={(e) => setNewSubVendor({ ...newSubVendor, contactPersonPhone: e.target.value })}
                  placeholder="Phone number"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={newSubVendor.contactPersonEmail}
                  onChange={(e) => setNewSubVendor({ ...newSubVendor, contactPersonEmail: e.target.value })}
                  placeholder="Email address"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <input
                  type="text"
                  value={newSubVendor.notes}
                  onChange={(e) => setNewSubVendor({ ...newSubVendor, notes: e.target.value })}
                  placeholder="Optional notes..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleAdd}
                disabled={adding}
                className="btn-primary"
              >
                {adding ? 'Adding...' : 'Add Sub-Vendor'}
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="card p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto" />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading sub-vendors...</p>
          </div>
        )}

        {!loading && subVendors.length === 0 && !showAddForm && (
          <div className="card p-8 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">No sub-vendors yet</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Add sub-vendor partners to link them with candidate profiles.
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="btn-primary mt-4"
            >
              + Add Sub-Vendor
            </button>
          </div>
        )}

        {!loading && subVendors.length > 0 && (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Sub-Vendor</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Submissions</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Contact Person</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Notes</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {subVendors.map((sv) => (
                    <Fragment key={sv.subVendorId}>
                    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{sv.subVendorName}</span>
                      </td>

                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleVendorSubmissions(sv.subVendorId)}
                          className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 hover:underline"
                          title="View submitted candidates"
                        >
                          {submissionCounts[sv.subVendorId] ?? 0}
                          <span className="ml-1 text-xs">{expandedVendorId === sv.subVendorId ? '▲' : '▼'}</span>
                        </button>
                      </td>

                      {editingId === sv.subVendorId ? (
                        <>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={editValues.contactPersonName || ''}
                              onChange={(e) => setEditValues({ ...editValues, contactPersonName: e.target.value })}
                              placeholder="Contact name"
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={editValues.contactPersonPhone || ''}
                              onChange={(e) => setEditValues({ ...editValues, contactPersonPhone: e.target.value })}
                              placeholder="Phone"
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="email"
                              value={editValues.contactPersonEmail || ''}
                              onChange={(e) => setEditValues({ ...editValues, contactPersonEmail: e.target.value })}
                              placeholder="Email"
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
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
                                onClick={() => saveEdit(sv.subVendorId)}
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
                            {sv.contactPersonName || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {sv.contactPersonPhone || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {sv.contactPersonEmail || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                            {sv.notes || '-'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => startEdit(sv)}
                              className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium"
                            >
                              Edit
                            </button>
                          </td>
                        </>
                      )}
                    </tr>

                    {expandedVendorId === sv.subVendorId && (
                      <tr className="bg-gray-50 dark:bg-gray-800/40">
                        <td colSpan={7} className="px-4 py-3">
                          {loadingSubmissions === sv.subVendorId ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Loading submissions...</p>
                          ) : (submissionsByVendor[sv.subVendorId]?.length ?? 0) === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">No submissions recorded for this vendor yet.</p>
                          ) : (
                            <ul className="space-y-1">
                              {submissionsByVendor[sv.subVendorId].map((s) => (
                                <li key={s.internetMessageId + s.candidateId} className="text-sm flex items-center gap-3">
                                  <a
                                    href={`/recruiter/locate/${s.candidateId}`}
                                    className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
                                  >
                                    {s.candidateId}
                                  </a>
                                  <span className="text-gray-500 dark:text-gray-400">
                                    {new Date(s.submittedAt).toLocaleDateString()}
                                  </span>
                                  {s.wasFirstSubmitter && (
                                    <span className="badge bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs">
                                      First submitter
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
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

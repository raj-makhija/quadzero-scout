'use client';

import { useState, useEffect } from 'react';
import { api, PromptSummary, PromptVersion } from '@/lib/api';
import { Save, History, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const PROMPT_LABELS: Record<string, string> = {
  resume_parser: 'Resume Parser',
  jd_parser: 'Job Description Parser',
  resume_formatter: 'Resume Formatter',
  screening_questions: 'Screening Questions',
  linkedin_post_generator: 'LinkedIn Post — Text',
  linkedin_image_generator: 'LinkedIn Post — Image',
  candidate_reranker: 'Candidate Re-ranker',
  vendor_jd_rewriter: 'Vendor JD Rewriter',
};

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptSummary[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [editContent, setEditContent] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const { toast } = useToast();

  const loadPrompts = async () => {
    try {
      setLoading(true);
      const response = await api.listPrompts();
      setPrompts(response.prompts);

      // Auto-select first prompt if none selected
      if (!selectedPrompt && response.prompts.length > 0) {
        selectPrompt(response.prompts[0].promptKey);
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load prompts',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const selectPrompt = async (promptKey: string) => {
    setSelectedPrompt(promptKey);
    setShowVersions(false);

    try {
      setLoadingVersions(true);
      const response = await api.getPromptVersions(promptKey);
      setVersions(response.versions);

      // Load the active version's content
      const activeVersion = response.versions.find((v) => v.isActive);
      if (activeVersion) {
        setEditContent(activeVersion.content);
        setEditDescription(activeVersion.description || '');
      } else {
        setEditContent('');
        setEditDescription('');
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to load prompt versions',
        variant: 'error',
      });
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPrompt || !editContent.trim()) {
      toast({
        title: 'Error',
        description: 'Prompt content is required',
        variant: 'error',
      });
      return;
    }

    try {
      setSaving(true);
      await api.updatePrompt(selectedPrompt, editContent, editDescription || undefined);

      toast({
        title: 'Saved',
        description: 'Prompt updated successfully. Changes will take effect within 5 minutes.',
        variant: 'success',
      });

      // Refresh prompts and versions
      await loadPrompts();
      await selectPrompt(selectedPrompt);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save prompt',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const loadVersionContent = (version: PromptVersion) => {
    setEditContent(version.content);
    setEditDescription(version.description || '');
    setShowVersions(false);
  };

  useEffect(() => {
    loadPrompts();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const activeVersion = versions.find((v) => v.isActive);
  const hasChanges = activeVersion
    ? editContent !== activeVersion.content ||
      (editDescription || '') !== (activeVersion.description || '')
    : editContent.trim().length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Prompts Management
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Edit LLM prompts for resume and job description parsing
          </p>
        </div>
        <button onClick={loadPrompts} disabled={loading} className="btn-secondary">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="card p-8 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Prompt List */}
          <div className="lg:col-span-1">
            <div className="card p-4">
              <h2 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Prompts</h2>
              <div className="space-y-2">
                {prompts.map((prompt) => (
                  <button
                    key={prompt.promptKey}
                    onClick={() => selectPrompt(prompt.promptKey)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedPrompt === prompt.promptKey
                        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <div className="font-medium">
                      {PROMPT_LABELS[prompt.promptKey] || prompt.promptKey}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      v{prompt.activeVersion}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Editor */}
          <div className="lg:col-span-3">
            {selectedPrompt ? (
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    {PROMPT_LABELS[selectedPrompt] || selectedPrompt}
                  </h2>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setShowVersions(!showVersions)}
                      className="btn-secondary text-sm"
                    >
                      <History className="w-4 h-4 mr-1" />
                      History
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || !hasChanges}
                      className="btn-primary text-sm"
                    >
                      <Save className="w-4 h-4 mr-1" />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>

                {/* Version History Panel */}
                {showVersions && (
                  <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Version History
                    </h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {versions.map((version) => (
                        <button
                          key={version.version}
                          onClick={() => loadVersionContent(version)}
                          className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                            version.isActive
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              Version {version.version}
                              {version.isActive && (
                                <span className="ml-2 text-xs bg-green-200 dark:bg-green-800 px-1.5 py-0.5 rounded">
                                  Active
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatDate(version.createdAt)}
                            </span>
                          </div>
                          {version.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {version.description}
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {loadingVersions ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="label">Description (optional)</label>
                      <input
                        type="text"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Brief description of changes..."
                        className="input mt-1"
                      />
                    </div>

                    <div>
                      <label className="label">Prompt Content</label>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={20}
                        className="input mt-1 font-mono text-sm"
                        placeholder="Enter the prompt content..."
                      />
                    </div>

                    {hasChanges && (
                      <p className="text-sm text-amber-600 dark:text-amber-400">
                        You have unsaved changes.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="card p-12 text-center">
                <p className="text-gray-500 dark:text-gray-400">
                  Select a prompt from the list to edit
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

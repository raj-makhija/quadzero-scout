'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api, BulkImportStatus, BulkImportFileStatus } from '@/lib/api';
import { Upload, X, CheckCircle, XCircle, Clock, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const POLL_INTERVAL = 5000; // 5 seconds
const STALL_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

interface SelectedFile {
  id: string;
  file: File;
}

type Phase = 'select' | 'uploading' | 'processing' | 'done';

export default function BulkImportPage() {
  const [phase, setPhase] = useState<Phase>('select');
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, 'pending' | 'uploading' | 'done' | 'failed'>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<BulkImportStatus | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  // Check localStorage for an existing batch on mount
  useEffect(() => {
    const savedBatchId = localStorage.getItem('bulkImportBatchId');
    if (savedBatchId) {
      setBatchId(savedBatchId);
      setPhase('processing');
    }
  }, []);

  // Poll for batch status
  const pollStatus = useCallback(async (id: string) => {
    try {
      const status = await api.getBulkImportStatus(id);
      setBatchStatus(status);

      if (status.status === 'completed') {
        setPhase('done');
        localStorage.removeItem('bulkImportBatchId');
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch (err) {
      console.error('Failed to poll batch status:', err);
    }
  }, []);

  useEffect(() => {
    if (batchId && (phase === 'processing' || phase === 'done')) {
      // Initial fetch
      pollStatus(batchId);

      // Start polling
      if (phase === 'processing') {
        pollRef.current = setInterval(() => pollStatus(batchId), POLL_INTERVAL);
      }
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [batchId, phase, pollStatus]);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return 'Only PDF and DOCX files are supported';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File size exceeds 10MB limit';
    }
    return null;
  };

  const addFiles = (fileList: FileList) => {
    const newFiles: SelectedFile[] = [];
    const errors: string[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const validationError = validateFile(file);
      if (validationError) {
        errors.push(`${file.name}: ${validationError}`);
        continue;
      }
      // Avoid duplicates by name
      const isDuplicate = selectedFiles.some(sf => sf.file.name === file.name);
      if (isDuplicate) {
        errors.push(`${file.name}: Already added`);
        continue;
      }
      newFiles.push({ id: crypto.randomUUID(), file });
    }

    if (errors.length > 0) {
      toast({
        title: 'Some files were skipped',
        description: errors.join('\n'),
        variant: 'error',
      });
    }

    if (newFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (id: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const startImport = async () => {
    if (selectedFiles.length === 0) return;

    setPhase('uploading');
    const initialProgress: Record<string, 'pending' | 'uploading' | 'done' | 'failed'> = {};
    selectedFiles.forEach(f => { initialProgress[f.id] = 'pending'; });
    setUploadProgress(initialProgress);
    setUploadErrors({});

    const uploadedFiles: Array<{ s3Key: string; fileName: string }> = [];

    // Upload files to S3 serially
    for (const sf of selectedFiles) {
      setUploadProgress(prev => ({ ...prev, [sf.id]: 'uploading' }));

      try {
        const { uploadUrl, s3Key } = await api.getUploadUrl(sf.file.name, sf.file.type);
        await fetch(uploadUrl, {
          method: 'PUT',
          body: sf.file,
          headers: { 'Content-Type': sf.file.type },
        });
        uploadedFiles.push({ s3Key, fileName: sf.file.name });
        setUploadProgress(prev => ({ ...prev, [sf.id]: 'done' }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setUploadProgress(prev => ({ ...prev, [sf.id]: 'failed' }));
        setUploadErrors(prev => ({ ...prev, [sf.id]: msg }));
      }
    }

    if (uploadedFiles.length === 0) {
      toast({
        title: 'Upload failed',
        description: 'No files were uploaded successfully. Please try again.',
        variant: 'error',
      });
      setPhase('select');
      return;
    }

    // Start the batch
    try {
      const result = await api.startBulkImport(uploadedFiles);
      setBatchId(result.batchId);
      localStorage.setItem('bulkImportBatchId', result.batchId);
      setPhase('processing');

      if (uploadedFiles.length < selectedFiles.length) {
        toast({
          title: 'Partial upload',
          description: `${uploadedFiles.length} of ${selectedFiles.length} files uploaded. Failed files were skipped.`,
          variant: 'error',
        });
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to start import',
        variant: 'error',
      });
      setPhase('select');
    }
  };

  const handleResume = async () => {
    if (!batchId) return;
    try {
      const result = await api.resumeBulkImport(batchId);
      if (result.resumed) {
        toast({ title: 'Resumed', description: 'Processing has been resumed.', variant: 'success' });
        setPhase('processing');
        pollStatus(batchId);
      } else {
        toast({ title: 'Info', description: result.message || 'Batch is not stalled.', variant: 'default' });
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to resume',
        variant: 'error',
      });
    }
  };

  const handleImportMore = () => {
    setPhase('select');
    setSelectedFiles([]);
    setUploadProgress({});
    setUploadErrors({});
    setBatchId(null);
    setBatchStatus(null);
    localStorage.removeItem('bulkImportBatchId');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isStalled = batchStatus &&
    batchStatus.status === 'processing' &&
    Date.now() - new Date(batchStatus.updatedAt).getTime() > STALL_THRESHOLD_MS &&
    batchStatus.files.some(f => f.status === 'pending' || f.status === 'processing');

  const processedCount = batchStatus
    ? batchStatus.completedCount + batchStatus.failedCount
    : 0;
  const progressPercent = batchStatus && batchStatus.totalFiles > 0
    ? Math.round((processedCount / batchStatus.totalFiles) * 100)
    : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Bulk Import
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Upload multiple resumes for automated processing
        </p>
      </div>

      {/* Phase: Select Files */}
      {phase === 'select' && (
        <>
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`card p-12 border-2 border-dashed cursor-pointer transition-colors text-center ${
              dragOver
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
          >
            <Upload className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
            <p className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
              Drag & drop resume files here
            </p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              or click to browse. Accepts PDF and DOCX files up to 10MB each.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
          </div>

          {/* Selected files list */}
          {selectedFiles.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
                </h2>
                <button
                  onClick={startImport}
                  className="btn-primary"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Start Import
                </button>
              </div>

              <div className="card overflow-hidden">
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {selectedFiles.map(sf => (
                    <div key={sf.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {sf.file.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatFileSize(sf.file.size)}
                        </p>
                      </div>
                      <button
                        onClick={() => removeFile(sf.id)}
                        className="ml-4 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Phase: Uploading to S3 */}
      {phase === 'uploading' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Uploading files to storage...
          </h2>
          <div className="space-y-2">
            {selectedFiles.map(sf => (
              <div key={sf.id} className="flex items-center gap-3 py-2">
                <StatusIcon status={uploadProgress[sf.id] || 'pending'} />
                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">
                  {sf.file.name}
                </span>
                {uploadErrors[sf.id] && (
                  <span className="text-xs text-red-500">{uploadErrors[sf.id]}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase: Processing (polling) */}
      {(phase === 'processing' || phase === 'done') && batchStatus && (
        <>
          {/* Summary counters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <CounterCard label="Total" value={batchStatus.totalFiles} color="gray" />
            <CounterCard label="Succeeded" value={batchStatus.completedCount} color="green" />
            <CounterCard label="Failed" value={batchStatus.failedCount} color="red" />
            <CounterCard
              label="Remaining"
              value={batchStatus.totalFiles - processedCount}
              color="blue"
            />
          </div>

          {/* Progress bar */}
          <div className="card p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {phase === 'done' ? 'Import complete' : 'Processing resumes...'}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {processedCount} / {batchStatus.totalFiles} ({progressPercent}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
              <div
                className="bg-primary-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Stall warning + Resume button */}
          {isStalled && (
            <div className="card p-4 mb-6 border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    Processing appears to have stalled
                  </p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                    No updates received in the last 3 minutes.
                  </p>
                </div>
                <button onClick={handleResume} className="btn-secondary">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Resume
                </button>
              </div>
            </div>
          )}

          {/* Import More button when done */}
          {phase === 'done' && (
            <div className="mb-6">
              <button onClick={handleImportMore} className="btn-primary">
                <Upload className="w-4 h-4 mr-2" />
                Import More
              </button>
            </div>
          )}

          {/* Per-file results table */}
          <div className="card overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    File
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Candidate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {batchStatus.files.map((file, i) => (
                  <FileRow key={i} file={file} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Loading state when polling hasn't returned yet */}
      {(phase === 'processing') && !batchStatus && (
        <div className="card p-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading batch status...</span>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
    case 'done':
      return <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />;
    case 'failed':
      return <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />;
    case 'processing':
    case 'uploading':
      return <Loader2 className="w-5 h-5 text-primary-500 animate-spin flex-shrink-0" />;
    default:
      return <Clock className="w-5 h-5 text-gray-400 flex-shrink-0" />;
  }
}

function CounterCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorClasses: Record<string, string> = {
    gray: 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
  };

  return (
    <div className={`card p-4 ${colorClasses[color] || colorClasses.gray}`}>
      <p className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function FileRow({ file }: { file: BulkImportFileStatus }) {
  const confidenceColor = (c: number | undefined) => {
    if (c === undefined) return '';
    if (c >= 0.7) return 'text-green-600 dark:text-green-400';
    if (c >= 0.5) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <tr>
      <td className="px-6 py-4">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[200px]">
          {file.fileName}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <StatusIcon status={file.status} />
          <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
            {file.status}
          </span>
          {file.isUpdate && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
              Updated
            </span>
          )}
        </div>
        {file.error && (
          <p className="text-xs text-red-500 mt-1">{file.error}</p>
        )}
      </td>
      <td className="px-6 py-4">
        <div className="text-sm text-gray-900 dark:text-gray-100">
          {file.candidateName || '—'}
        </div>
      </td>
      <td className="px-6 py-4">
        {file.confidence !== undefined ? (
          <span className={`text-sm font-medium ${confidenceColor(file.confidence)}`}>
            {Math.round(file.confidence * 100)}%
          </span>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </td>
    </tr>
  );
}

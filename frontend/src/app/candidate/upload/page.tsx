'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { api } from '@/lib/api';
import { SUPPORTED_FILE_TYPES } from '@/lib/utils';

type UploadState = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error';

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileSelect = (selectedFile: File) => {
    setError(null);

    if (!SUPPORTED_FILE_TYPES.includes(selectedFile.type)) {
      setError('Please upload a PDF or Word document');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;

    const isLocal = process.env.NEXT_PUBLIC_STAGE === 'local';

    try {
      setUploadState('uploading');
      setProgress(10);

      let extractedProfile;
      let confidence: number;
      let s3Key: string;

      if (isLocal) {
        // Local dev: send file directly to backend (bypasses S3 + Textract)
        setProgress(30);
        setUploadState('analyzing');
        const result = await api.uploadAndAnalyze(file);
        extractedProfile = result.extractedProfile;
        confidence = result.confidence;
        s3Key = `local-dev/${file.name}`;
        setProgress(100);
      } else {
        // Production: upload to S3 via pre-signed URL, then analyze with Textract
        const uploadResult = await api.getUploadUrl(file.name, file.type);
        s3Key = uploadResult.s3Key;
        setProgress(30);

        const uploadResponse = await fetch(uploadResult.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload file');
        }
        setProgress(60);

        setUploadState('analyzing');
        const analyzeResult = await api.analyzeResume(s3Key);
        extractedProfile = analyzeResult.extractedProfile;
        confidence = analyzeResult.confidence;
        setProgress(100);
      }

      // Store in session for review page
      sessionStorage.setItem('extractedProfile', JSON.stringify(extractedProfile));
      sessionStorage.setItem('s3Key', s3Key);
      sessionStorage.setItem('confidence', confidence.toString());

      setUploadState('complete');

      // Navigate to review page
      setTimeout(() => {
        router.push('/candidate/review');
      }, 500);
    } catch (err) {
      setUploadState('error');
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <Header>
        <span className="text-sm text-gray-500 dark:text-gray-400">Step 1 of 3: Upload Resume</span>
      </Header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Upload Your Resume</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Our AI will extract your skills and experience automatically
          </p>
        </div>

        <div className="card p-8">
          {/* File Drop Zone */}
          <div
            className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              dragActive
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : file
                ? 'border-green-500 bg-green-50 dark:border-green-400 dark:bg-green-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {file ? (
              <div>
                <svg
                  className="mx-auto h-12 w-12 text-green-500 dark:text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <button
                  onClick={() => setFile(null)}
                  className="mt-4 text-sm text-primary-600 hover:text-primary-700"
                >
                  Choose a different file
                </button>
              </div>
            ) : (
              <div>
                <svg
                  className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">
                  Drop your resume here
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">or click to browse</p>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            )}
          </div>

          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
            Supported formats: PDF, DOC, DOCX (max 10MB)
          </p>

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Progress Bar */}
          {(uploadState === 'uploading' || uploadState === 'analyzing') && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {uploadState === 'uploading' ? 'Uploading...' : 'Analyzing with AI...'}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Upload Button */}
          <div className="mt-6 flex justify-center">
            <button
              onClick={handleUpload}
              disabled={!file || uploadState !== 'idle'}
              className="btn-primary px-8 py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadState === 'idle' && 'Upload & Analyze'}
              {uploadState === 'uploading' && 'Uploading...'}
              {uploadState === 'analyzing' && 'Analyzing...'}
              {uploadState === 'complete' && 'Complete!'}
              {uploadState === 'error' && 'Try Again'}
            </button>
          </div>
        </div>

        {/* Info Cards */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Secure Upload</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Encrypted & private</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0 w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">AI Extraction</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Powered by Claude AI</p>
              </div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0 w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Review & Edit</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Full control over data</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

'use client';

import { useState, useRef, useCallback, DragEvent } from 'react';
import { Upload, X, AlertCircle } from 'lucide-react';
import { cn, SUPPORTED_FILE_TYPES } from '@/lib/utils';
import { FilePreview } from './FilePreview';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onCancel?: () => void;
  accept?: string[];
  maxSize?: number; // in bytes
  uploading?: boolean;
  progress?: number;
  className?: string;
  disabled?: boolean;
}

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function FileUpload({
  onFileSelect,
  onCancel,
  accept = SUPPORTED_FILE_TYPES,
  maxSize = DEFAULT_MAX_SIZE,
  uploading = false,
  progress = 0,
  className,
  disabled = false,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file type
      if (!accept.includes(file.type)) {
        return 'Unsupported file format. Please upload a PDF or Word document.';
      }

      // Check file size
      if (file.size > maxSize) {
        return `File size exceeds ${formatFileSize(maxSize)}. Please upload a smaller file.`;
      }

      return null;
    },
    [accept, maxSize]
  );

  const handleFile = useCallback(
    (file: File) => {
      const error = validateFile(file);
      if (error) {
        setSelectedFile(file);
        setValidationError(error);
        return;
      }

      setSelectedFile(file);
      setValidationError(null);
    },
    [validateFile]
  );

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled && !uploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled || uploading) return;

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleUploadClick = () => {
    if (selectedFile && !validationError) {
      onFileSelect(selectedFile);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setValidationError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCancel = () => {
    handleRemoveFile();
    onCancel?.();
  };

  const openFilePicker = () => {
    if (!disabled && !uploading) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Drop zone */}
      {!uploading && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={!selectedFile ? openFilePicker : undefined}
          className={cn(
            'relative border-2 border-dashed rounded-lg p-8 text-center transition-colors',
            isDragging
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : selectedFile
              ? validationError
                ? 'border-red-300 dark:border-red-700'
                : 'border-green-300 dark:border-green-700'
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500',
            !selectedFile && !disabled && 'cursor-pointer',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept.join(',')}
            onChange={handleInputChange}
            className="hidden"
            disabled={disabled}
          />

          {!selectedFile ? (
            <>
              <Upload className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
              <p className="mt-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                {isDragging ? 'Drop your file here' : 'Drag and drop your resume'}
              </p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                or click to browse
              </p>
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                PDF, DOCX up to {formatFileSize(maxSize)}
              </p>
            </>
          ) : (
            <FilePreview
              file={selectedFile}
              onRemove={handleRemoveFile}
              error={validationError || undefined}
            />
          )}
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="space-y-3">
          {selectedFile && (
            <FilePreview file={selectedFile} />
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {progress < 100 ? 'Uploading...' : 'Processing...'}
              </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {progress}%
              </span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-600 transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {onCancel && (
            <button
              onClick={handleCancel}
              className="btn-secondary w-full"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Validation warning before upload */}
      {validationError && !uploading && (
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Cannot upload this file
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
              {validationError}
            </p>
          </div>
        </div>
      )}

      {/* Upload button */}
      {selectedFile && !validationError && !uploading && (
        <button
          onClick={handleUploadClick}
          className="btn-primary w-full"
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload Resume
        </button>
      )}
    </div>
  );
}

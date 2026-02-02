import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { mockMatchMedia, ALL_VIEWPORTS, setViewport } from '@/test/test-utils';

import { FileUpload } from '../FileUpload';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('FileUpload responsive behavior', () => {
  const onFileSelect = vi.fn();

  beforeEach(() => {
    onFileSelect.mockClear();
    mockMatchMedia(375);
  });

  describe.each(ALL_VIEWPORTS)('at $name viewport ($width x $height)', ({ name }) => {
    beforeEach(() => {
      setViewport(name);
    });

    it('renders drop zone with upload instruction text', () => {
      render(<FileUpload onFileSelect={onFileSelect} />);
      expect(screen.getByText('Drag and drop your resume')).toBeInTheDocument();
    });

    it('renders "or click to browse" hint', () => {
      render(<FileUpload onFileSelect={onFileSelect} />);
      expect(screen.getByText('or click to browse')).toBeInTheDocument();
    });

    it('renders file type info', () => {
      render(<FileUpload onFileSelect={onFileSelect} />);
      expect(screen.getByText(/PDF, DOC, DOCX/)).toBeInTheDocument();
    });
  });

  describe('file input', () => {
    it('has a hidden file input element', () => {
      render(<FileUpload onFileSelect={onFileSelect} />);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).not.toBeNull();
      expect(fileInput.className).toContain('hidden');
    });

    it('accepts correct file types', () => {
      render(<FileUpload onFileSelect={onFileSelect} />);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput.accept).toBeTruthy();
    });
  });

  describe('disabled state', () => {
    it('applies disabled styling classes when disabled', () => {
      render(<FileUpload onFileSelect={onFileSelect} disabled />);
      const dropZone = screen.getByText('Drag and drop your resume').closest('.border-dashed');
      expect(dropZone!.className).toContain('opacity-50');
      expect(dropZone!.className).toContain('cursor-not-allowed');
    });

    it('file input is disabled when component is disabled', () => {
      render(<FileUpload onFileSelect={onFileSelect} disabled />);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput.disabled).toBe(true);
    });
  });

  describe('upload progress', () => {
    it('shows progress bar when uploading', () => {
      render(
        <FileUpload onFileSelect={onFileSelect} uploading progress={50} />
      );
      expect(screen.getByText('Uploading...')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('shows "Processing..." at 100%', () => {
      render(
        <FileUpload onFileSelect={onFileSelect} uploading progress={100} />
      );
      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    it('hides drop zone when uploading', () => {
      render(
        <FileUpload onFileSelect={onFileSelect} uploading progress={50} />
      );
      expect(screen.queryByText('Drag and drop your resume')).not.toBeInTheDocument();
    });

    it('shows cancel button when onCancel is provided during upload', () => {
      const onCancel = vi.fn();
      render(
        <FileUpload onFileSelect={onFileSelect} onCancel={onCancel} uploading progress={30} />
      );
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  describe('file selection', () => {
    it('shows file preview after file is selected via input', () => {
      render(<FileUpload onFileSelect={onFileSelect} />);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

      const file = new File(['test content'], 'resume.pdf', { type: 'application/pdf' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByText('resume.pdf')).toBeInTheDocument();
    });

    it('shows upload button after valid file is selected', () => {
      render(<FileUpload onFileSelect={onFileSelect} />);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

      const file = new File(['test content'], 'resume.pdf', { type: 'application/pdf' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByText('Upload Resume')).toBeInTheDocument();
    });

    it('shows validation error for unsupported file type', () => {
      render(<FileUpload onFileSelect={onFileSelect} />);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

      const file = new File(['test'], 'image.png', { type: 'image/png' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByText('Cannot upload this file')).toBeInTheDocument();
      expect(screen.getAllByText(/Unsupported file format/).length).toBeGreaterThan(0);
    });

    it('shows validation error for oversized file', () => {
      render(<FileUpload onFileSelect={onFileSelect} maxSize={1024} />);
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

      const content = new Array(2048).fill('x').join('');
      const file = new File([content], 'big.pdf', { type: 'application/pdf' });
      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.getByText('Cannot upload this file')).toBeInTheDocument();
      expect(screen.getAllByText(/File size exceeds/).length).toBeGreaterThan(0);
    });
  });
});

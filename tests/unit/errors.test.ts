import {
  isValidMimeType,
  isValidFileSize,
  createFileTypeError,
  createFileSizeError,
  sanitizeFilename,
  truncateErrorMessage,
  wrapUnknownError,
  MAX_FILE_SIZE,
  MAX_FILENAME_LENGTH,
  ALLOWED_MIME_TYPES,
} from '../../src/utils/errors';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import type { INode } from 'n8n-workflow';

// Mock node for testing error creation functions
const mockNode: INode = {
  id: 'test-node-id',
  name: 'Deep-OCR',
  type: 'n8n-nodes-deep-ocr.deepOcr',
  typeVersion: 1,
  position: [0, 0],
  parameters: {},
};

describe('Error Utilities', () => {
  describe('constants', () => {
    it('should have MAX_FILE_SIZE as 10MB', () => {
      expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
    });

    it('should have MAX_FILENAME_LENGTH as 255', () => {
      expect(MAX_FILENAME_LENGTH).toBe(255);
    });

    it('should have correct allowed MIME types', () => {
      expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
      expect(ALLOWED_MIME_TYPES).toContain('image/png');
      expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
      expect(ALLOWED_MIME_TYPES).toContain('image/jpg');
      expect(ALLOWED_MIME_TYPES).toContain('image/webp');
    });
  });

  describe('isValidMimeType', () => {
    it('should return true for valid MIME types', () => {
      expect(isValidMimeType('application/pdf')).toBe(true);
      expect(isValidMimeType('image/png')).toBe(true);
      expect(isValidMimeType('image/jpeg')).toBe(true);
      expect(isValidMimeType('image/jpg')).toBe(true);
      expect(isValidMimeType('image/webp')).toBe(true);
    });

    it('should return false for invalid MIME types', () => {
      expect(isValidMimeType('text/plain')).toBe(false);
      expect(isValidMimeType('application/json')).toBe(false);
      expect(isValidMimeType('image/gif')).toBe(false);
    });

    it('should return false for undefined MIME type', () => {
      expect(isValidMimeType(undefined)).toBe(false);
    });

    it('should return false for empty string MIME type', () => {
      expect(isValidMimeType('')).toBe(false);
    });

    it('should accept MIME types case-insensitively', () => {
      expect(isValidMimeType('image/JPEG')).toBe(true);
      expect(isValidMimeType('APPLICATION/PDF')).toBe(true);
      expect(isValidMimeType('Image/PNG')).toBe(true);
    });
  });

  describe('isValidFileSize', () => {
    it('should return true for files within limit', () => {
      expect(isValidFileSize(1024)).toBe(true);
      expect(isValidFileSize(5 * 1024 * 1024)).toBe(true);
      expect(isValidFileSize(MAX_FILE_SIZE)).toBe(true);
    });

    it('should return false for files exceeding limit', () => {
      expect(isValidFileSize(MAX_FILE_SIZE + 1)).toBe(false);
      expect(isValidFileSize(11 * 1024 * 1024)).toBe(false);
    });
  });

  describe('createFileTypeError', () => {
    it('should create error with correct message', () => {
      const error = createFileTypeError(mockNode, 'text/plain', 0);
      expect(error.message).toContain('Unsupported file type: text/plain');
    });

    it('should include itemIndex in error context', () => {
      const error = createFileTypeError(mockNode, 'application/json', 5);
      expect(error.context).toBeDefined();
      expect(error.context?.itemIndex).toBe(5);
    });

    it('should include description about supported types', () => {
      const error = createFileTypeError(mockNode, 'image/gif', 0);
      expect(error.description).toContain('not supported');
    });
  });

  describe('createFileSizeError', () => {
    it('should create error with correct message', () => {
      const error = createFileSizeError(mockNode, 15 * 1024 * 1024, 0);
      expect(error.message).toContain('exceeds maximum allowed size of 10MB');
    });

    it('should include file size in MB in message', () => {
      const error = createFileSizeError(mockNode, 15 * 1024 * 1024, 0);
      expect(error.message).toContain('15MB');
    });

    it('should include itemIndex in error context', () => {
      const error = createFileSizeError(mockNode, 11 * 1024 * 1024, 3);
      expect(error.context).toBeDefined();
      expect(error.context?.itemIndex).toBe(3);
    });
  });

  describe('sanitizeFilename', () => {
    it('should strip path traversal sequences', () => {
      expect(sanitizeFilename('../../etc/passwd.pdf')).not.toContain('..');
    });

    it('should replace forward slashes with underscores', () => {
      expect(sanitizeFilename('path/to/file.pdf')).not.toContain('/');
    });

    it('should replace backslashes with underscores', () => {
      expect(sanitizeFilename('path\\to\\file.pdf')).not.toContain('\\');
    });

    it('should strip control characters', () => {
      expect(sanitizeFilename('file\x00name.pdf')).not.toContain('\x00');
    });

    it('should truncate to MAX_FILENAME_LENGTH', () => {
      const longName = 'a'.repeat(300) + '.pdf';
      expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(MAX_FILENAME_LENGTH);
    });

    it('should fall back to document for empty result', () => {
      // '..' is entirely consumed by the traversal-sequence strip, leaving an empty string
      expect(sanitizeFilename('..')).toBe('document');
    });

    it('should apply NFKD normalization', () => {
      // ﬁ ligature (U+FB01) decomposes to "fi" after NFKD normalization
      const result = sanitizeFilename('\uFB01le.pdf');
      expect(result).toBe('file.pdf');
    });
  });

  describe('truncateErrorMessage', () => {
    it('should return message unchanged if within limit', () => {
      const msg = 'short error';
      expect(truncateErrorMessage(msg)).toBe(msg);
    });

    it('should truncate messages longer than 200 characters', () => {
      const msg = 'a'.repeat(300);
      const result = truncateErrorMessage(msg);
      expect(result.length).toBeLessThanOrEqual(200);
      expect(result.endsWith('…')).toBe(true);
    });

    it('should respect custom maxLength', () => {
      const msg = 'a'.repeat(100);
      const result = truncateErrorMessage(msg, 50);
      expect(result.length).toBeLessThanOrEqual(50);
      expect(result.endsWith('…')).toBe(true);
    });
  });

  describe('wrapUnknownError', () => {
    it('should wrap Error instances in NodeApiError', () => {
      const original = new Error('network timeout');
      const wrapped = wrapUnknownError(mockNode, original, 0);
      expect(wrapped.message).toContain('Failed to process document with Deep-OCR API');
    });

    it('should wrap non-Error values in NodeApiError', () => {
      const wrapped = wrapUnknownError(mockNode, 'string error', 0);
      expect(wrapped.message).toContain('Failed to process document with Deep-OCR API');
    });

    it('should include itemIndex in error context', () => {
      const wrapped = wrapUnknownError(mockNode, new Error('fail'), 3);
      expect(wrapped.context?.itemIndex).toBe(3);
    });

    it('should pass NodeApiError through unchanged', () => {
      const original = new NodeApiError(mockNode, { message: 'upstream failure' });
      const result = wrapUnknownError(mockNode, original, 0);
      expect(result).toBe(original);
    });

    it('should pass NodeOperationError through unchanged', () => {
      const original = new NodeOperationError(mockNode, 'bad input');
      const result = wrapUnknownError(mockNode, original, 0);
      expect(result).toBe(original);
    });
  });
});

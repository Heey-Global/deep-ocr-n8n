import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import type { INode } from 'n8n-workflow';

/**
 * Maximum file size in bytes (10MB)
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Maximum safe filename length in bytes (POSIX limit)
 */
export const MAX_FILENAME_LENGTH = 255;

/**
 * Allowed MIME types for document processing
 */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];

/**
 * Creates a NodeOperationError for invalid file types
 */
export function createFileTypeError(
  node: INode,
  mimeType: string,
  itemIndex?: number,
): NodeOperationError {
  return new NodeOperationError(
    node,
    `Unsupported file type: ${mimeType}. Supported types: PDF, PNG, JPG, JPEG, WebP`,
    {
      itemIndex,
      description: `The file has MIME type "${mimeType}" which is not supported by the Deep-OCR API.`,
    },
  );
}

/**
 * Creates a NodeOperationError for files exceeding size limit
 */
export function createFileSizeError(
  node: INode,
  sizeBytes: number,
  itemIndex?: number,
): NodeOperationError {
  const sizeMB = Math.round(sizeBytes / 1024 / 1024);
  return new NodeOperationError(
    node,
    `File size (${sizeMB}MB) exceeds maximum allowed size of 10MB`,
    {
      itemIndex,
      description: 'Please reduce the file size or use a smaller document.',
    },
  );
}

/**
 * Validates MIME type against allowed types — case-insensitive to handle
 * non-standard capitalisation from HTTP clients (e.g. image/JPEG).
 * Rejects undefined/empty to prevent silent bypass.
 */
export function isValidMimeType(mimeType: string | undefined): boolean {
  if (mimeType === undefined || mimeType.trim() === '') {
    return false;
  }
  return ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Validates file size against maximum limit
 */
export function isValidFileSize(sizeBytes: number): boolean {
  return sizeBytes <= MAX_FILE_SIZE;
}

/**
 * Sanitizes a filename to prevent path traversal and header injection.
 * Applies NFKD Unicode normalization first to neutralize homograph attacks,
 * then strips traversal sequences, path separators, and control characters.
 * Falls back to 'document' if the result is empty.
 */
export function sanitizeFilename(filename: string): string {
  return (
    filename
      .normalize('NFKD')
      .replace(/\.\./g, '')
      .replace(/[/\\]/g, '_')
      .replace(/[<>:"|?*\x00-\x1f]/g, '')
      .substring(0, MAX_FILENAME_LENGTH) || 'document'
  );
}

/**
 * Truncates an error message to prevent verbose API errors from leaking
 * document content into workflow logs.
 */
export function truncateErrorMessage(message: string, maxLength = 200): string {
  return message.length > maxLength ? message.substring(0, maxLength) + '…' : message;
}

/**
 * Wraps an unknown caught value into a NodeApiError for n8n.
 * Used for unexpected errors that are neither NodeApiError nor NodeOperationError.
 */
export function wrapUnknownError(node: INode, error: unknown, itemIndex?: number): NodeApiError {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return new NodeApiError(node, { message }, {
    message: 'Failed to process document with Deep-OCR API',
    itemIndex,
  });
}

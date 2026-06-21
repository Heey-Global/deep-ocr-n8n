import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import type { INode } from 'n8n-workflow';

/**
 * Maximum file size in bytes (100MB) — mirrors the API's documented
 * upload limit from EXTRACTIONS_API_CONTRACT (`104_857_600 bytes`).
 * Keep this in lockstep with the API: rejecting locally what the API
 * would accept is exactly the contract drift this constant exists to
 * avoid.
 */
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

/** MAX_FILE_SIZE rendered as a "100MB" string for error messages. */
export const MAX_FILE_SIZE_MB = Math.round(MAX_FILE_SIZE / 1024 / 1024);

/**
 * Maximum safe filename length in characters (enforced on UTF-16 code units, not bytes)
 */
export const MAX_FILENAME_LENGTH = 255;

/**
 * Allowed MIME types for document processing. Mirrors the API allowlist
 * (PDF + PNG / JPEG / WebP / TIFF).
 */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/tiff',
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
    `Unsupported file type: ${mimeType}. Supported types: PDF, PNG, JPG, JPEG, WebP, TIFF`,
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
    `File size (${sizeMB}MB) exceeds maximum allowed size of ${MAX_FILE_SIZE_MB}MB`,
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
  if (message.length <= maxLength) return message;
  if (maxLength <= 0) return '';
  if (maxLength === 1) return '…';
  return message.substring(0, maxLength - 1) + '…';
}

/**
 * Wraps an unknown caught value into an n8n error.
 *
 * Pass-through for values that are already NodeApiError or NodeOperationError —
 * preserving the original lets the @n8n/community-nodes/require-node-api-error
 * rule see a single typed throw site at the caller instead of an `instanceof`
 * rethrow branch it can't statically prove safe.
 */
export function wrapUnknownError(
  node: INode,
  error: unknown,
  itemIndex?: number,
): NodeApiError | NodeOperationError {
  if (error instanceof NodeApiError || error instanceof NodeOperationError) {
    return error;
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return new NodeApiError(node, { message }, {
    message: 'Failed to process document with Deep-OCR API',
    itemIndex,
  });
}

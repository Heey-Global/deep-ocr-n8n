import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import type { INode } from 'n8n-workflow';
/**
 * Maximum file size in bytes (10MB)
 */
export declare const MAX_FILE_SIZE: number;
/**
 * Maximum safe filename length in characters (enforced on UTF-16 code units, not bytes)
 */
export declare const MAX_FILENAME_LENGTH = 255;
/**
 * Allowed MIME types for document processing
 */
export declare const ALLOWED_MIME_TYPES: string[];
/**
 * Creates a NodeOperationError for invalid file types
 */
export declare function createFileTypeError(node: INode, mimeType: string, itemIndex?: number): NodeOperationError;
/**
 * Creates a NodeOperationError for files exceeding size limit
 */
export declare function createFileSizeError(node: INode, sizeBytes: number, itemIndex?: number): NodeOperationError;
/**
 * Validates MIME type against allowed types — case-insensitive to handle
 * non-standard capitalisation from HTTP clients (e.g. image/JPEG).
 * Rejects undefined/empty to prevent silent bypass.
 */
export declare function isValidMimeType(mimeType: string | undefined): boolean;
/**
 * Validates file size against maximum limit
 */
export declare function isValidFileSize(sizeBytes: number): boolean;
/**
 * Sanitizes a filename to prevent path traversal and header injection.
 * Applies NFKD Unicode normalization first to neutralize homograph attacks,
 * then strips traversal sequences, path separators, and control characters.
 * Falls back to 'document' if the result is empty.
 */
export declare function sanitizeFilename(filename: string): string;
/**
 * Truncates an error message to prevent verbose API errors from leaking
 * document content into workflow logs.
 */
export declare function truncateErrorMessage(message: string, maxLength?: number): string;
/**
 * Wraps an unknown caught value into a NodeApiError for n8n.
 * Used for unexpected errors that are neither NodeApiError nor NodeOperationError.
 */
export declare function wrapUnknownError(node: INode, error: unknown, itemIndex?: number): NodeApiError;
//# sourceMappingURL=errors.d.ts.map
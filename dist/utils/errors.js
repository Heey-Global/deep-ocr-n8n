"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_MIME_TYPES = exports.MAX_FILENAME_LENGTH = exports.MAX_FILE_SIZE = void 0;
exports.createFileTypeError = createFileTypeError;
exports.createFileSizeError = createFileSizeError;
exports.isValidMimeType = isValidMimeType;
exports.isValidFileSize = isValidFileSize;
exports.sanitizeFilename = sanitizeFilename;
exports.truncateErrorMessage = truncateErrorMessage;
exports.wrapUnknownError = wrapUnknownError;
const n8n_workflow_1 = require("n8n-workflow");
/**
 * Maximum file size in bytes (10MB)
 */
exports.MAX_FILE_SIZE = 10 * 1024 * 1024;
/**
 * Maximum safe filename length in characters (enforced on UTF-16 code units, not bytes)
 */
exports.MAX_FILENAME_LENGTH = 255;
/**
 * Allowed MIME types for document processing
 */
exports.ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
];
/**
 * Creates a NodeOperationError for invalid file types
 */
function createFileTypeError(node, mimeType, itemIndex) {
    return new n8n_workflow_1.NodeOperationError(node, `Unsupported file type: ${mimeType}. Supported types: PDF, PNG, JPG, JPEG, WebP`, {
        itemIndex,
        description: `The file has MIME type "${mimeType}" which is not supported by the Deep-OCR API.`,
    });
}
/**
 * Creates a NodeOperationError for files exceeding size limit
 */
function createFileSizeError(node, sizeBytes, itemIndex) {
    const sizeMB = Math.round(sizeBytes / 1024 / 1024);
    return new n8n_workflow_1.NodeOperationError(node, `File size (${sizeMB}MB) exceeds maximum allowed size of 10MB`, {
        itemIndex,
        description: 'Please reduce the file size or use a smaller document.',
    });
}
/**
 * Validates MIME type against allowed types — case-insensitive to handle
 * non-standard capitalisation from HTTP clients (e.g. image/JPEG).
 * Rejects undefined/empty to prevent silent bypass.
 */
function isValidMimeType(mimeType) {
    if (mimeType === undefined || mimeType.trim() === '') {
        return false;
    }
    return exports.ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase());
}
/**
 * Validates file size against maximum limit
 */
function isValidFileSize(sizeBytes) {
    return sizeBytes <= exports.MAX_FILE_SIZE;
}
/**
 * Sanitizes a filename to prevent path traversal and header injection.
 * Applies NFKD Unicode normalization first to neutralize homograph attacks,
 * then strips traversal sequences, path separators, and control characters.
 * Falls back to 'document' if the result is empty.
 */
function sanitizeFilename(filename) {
    return (filename
        .normalize('NFKD')
        .replace(/\.\./g, '')
        .replace(/[/\\]/g, '_')
        .replace(/[<>:"|?*\x00-\x1f]/g, '')
        .substring(0, exports.MAX_FILENAME_LENGTH) || 'document');
}
/**
 * Truncates an error message to prevent verbose API errors from leaking
 * document content into workflow logs.
 */
function truncateErrorMessage(message, maxLength = 200) {
    if (message.length <= maxLength)
        return message;
    if (maxLength <= 0)
        return '';
    if (maxLength === 1)
        return '…';
    return message.substring(0, maxLength - 1) + '…';
}
/**
 * Wraps an unknown caught value into a NodeApiError for n8n.
 * Used for unexpected errors that are neither NodeApiError nor NodeOperationError.
 */
function wrapUnknownError(node, error, itemIndex) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new n8n_workflow_1.NodeApiError(node, { message }, {
        message: 'Failed to process document with Deep-OCR API',
        itemIndex,
    });
}
//# sourceMappingURL=errors.js.map
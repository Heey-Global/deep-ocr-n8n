/**
 * n8n-nodes-heey-ocr
 *
 * Entry point for the Heey OCR n8n community node package.
 * Exports the node and credentials for n8n to discover.
 */

// Node exports
export { HeeyOcr } from './nodes/HeeyOcr/HeeyOcr.node';

// Credential exports
export { HeeyOcrApi } from './credentials/HeeyOcrApi.credentials';

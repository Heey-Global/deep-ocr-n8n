/**
 * n8n-nodes-deep-ocr
 *
 * Entry point for the Deep-OCR n8n community node package.
 * Exports the node and credentials for n8n to discover.
 */

// Node exports
export { DeepOcr } from './nodes/DeepOcr/DeepOcr.node';

// Credential exports
export { DeepOcrApi } from './credentials/DeepOcrApi.credentials';

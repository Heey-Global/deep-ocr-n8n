"use strict";
/**
 * n8n-nodes-heey-ocr
 *
 * Entry point for the Heey OCR n8n community node package.
 * Exports the node and credentials for n8n to discover.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeeyOcrApi = exports.HeeyOcr = void 0;
// Node exports
var HeeyOcr_node_1 = require("./nodes/HeeyOcr/HeeyOcr.node");
Object.defineProperty(exports, "HeeyOcr", { enumerable: true, get: function () { return HeeyOcr_node_1.HeeyOcr; } });
// Credential exports
var HeeyOcrApi_credentials_1 = require("./credentials/HeeyOcrApi.credentials");
Object.defineProperty(exports, "HeeyOcrApi", { enumerable: true, get: function () { return HeeyOcrApi_credentials_1.HeeyOcrApi; } });
//# sourceMappingURL=index.js.map
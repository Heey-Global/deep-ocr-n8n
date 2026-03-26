"use strict";
/**
 * n8n-nodes-deep-ocr
 *
 * Entry point for the Deep-OCR n8n community node package.
 * Exports the node and credentials for n8n to discover.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepOcrApi = exports.DeepOcr = void 0;
// Node exports
var DeepOcr_node_1 = require("./nodes/DeepOcr/DeepOcr.node");
Object.defineProperty(exports, "DeepOcr", { enumerable: true, get: function () { return DeepOcr_node_1.DeepOcr; } });
// Credential exports
var DeepOcrApi_credentials_1 = require("./credentials/DeepOcrApi.credentials");
Object.defineProperty(exports, "DeepOcrApi", { enumerable: true, get: function () { return DeepOcrApi_credentials_1.DeepOcrApi; } });
//# sourceMappingURL=index.js.map
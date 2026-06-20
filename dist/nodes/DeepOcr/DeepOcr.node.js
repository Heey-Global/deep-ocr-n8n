"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepOcr = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const errors_1 = require("../../utils/errors");
// Single source of truth for the published version — keeps the client
// identifier strings in lockstep with semantic-release bumps without a
// hardcoded version literal anywhere.
const package_json_1 = require("../../../package.json");
/** Deep-OCR API endpoint */
const API_ENDPOINT = 'https://api.deep-ocr.com/v1/ocr';
/**
 * Client identifier the API logs and attributes traffic by.
 * Format pinned with deep-ocr-api: `deep-ocr-n8n/<semver>` (e.g.
 * `deep-ocr-n8n/1.9.0`). Sent on EVERY outbound API call as:
 *   - `User-Agent` header (web-standard; surfaces in request_logs.user_agent)
 *   - `X-Deep-OCR-Client` header (canonical, custom — defence in depth in
 *     case a future n8n version resets the UA)
 * The API parser uses X-Deep-OCR-Client as the authoritative source, with
 * User-Agent as the fallback for callers that can't set custom headers.
 */
const CLIENT_ID = `deep-ocr-n8n/${package_json_1.version}`;
// Frozen so any downstream mutation attempt throws under strict mode rather
// than silently polluting the shared constant across executions. The call
// site also spreads into a fresh object — belt + braces.
const CLIENT_HEADERS = Object.freeze({
    'User-Agent': CLIENT_ID,
    'X-Deep-OCR-Client': CLIENT_ID,
});
const ALLOWED_DOCUMENT_TYPES = [
    'auto',
    'bank_statement',
    'contract',
    'delivery_note',
    'generic',
    'handwriting',
    'id_document',
    'invoice',
    'payslip',
    'purchase_order',
    'receipt',
];
/**
 * Deep-OCR Node
 *
 * AI-powered OCR for invoices, receipts, contracts, IDs, bank statements
 * and more — returns structured JSON ready to use.
 * Supports PDF, PNG, JPG, JPEG, and WebP formats up to 10MB.
 */
class DeepOcr {
    description = {
        displayName: 'Deep-OCR',
        name: 'deepOcr',
        icon: 'file:deepocr.svg',
        group: ['transform'],
        version: 1,
        subtitle: '={{$parameter["documentType"]}}',
        description: 'AI-powered OCR for invoices, receipts, contracts, IDs, bank statements and more — returns structured JSON ready to use',
        defaults: {
            name: 'Deep-OCR',
        },
        inputs: [n8n_workflow_1.NodeConnectionTypes.Main],
        outputs: [n8n_workflow_1.NodeConnectionTypes.Main],
        usableAsTool: true,
        credentials: [
            {
                name: 'deepOcrApi',
                required: true,
            },
        ],
        properties: [
            {
                displayName: 'Binary Property',
                name: 'binaryPropertyName',
                type: 'string',
                default: 'data',
                required: true,
                description: 'Name of the binary property containing the document to process',
                placeholder: "e.g. 'data', 'file', 'document'",
            },
            {
                displayName: 'Document Type',
                name: 'documentType',
                type: 'options',
                options: [
                    {
                        name: 'Auto-Detect',
                        value: 'auto',
                        description: 'Let the API classify the document automatically (one extra API call)',
                    },
                    {
                        name: 'Bank Statement',
                        value: 'bank_statement',
                        description: 'Extract account info, balances, and transaction list from bank statements',
                    },
                    {
                        name: 'Contract',
                        value: 'contract',
                        description: 'Extract parties, terms, and obligations from contracts',
                    },
                    {
                        name: 'Delivery Note',
                        value: 'delivery_note',
                        description: 'Extract sender, recipient, items, quantities, and tracking info',
                    },
                    {
                        name: 'Generic',
                        value: 'generic',
                        description: 'Flexible extraction for any document — use when no specific type fits',
                    },
                    {
                        name: 'Handwriting',
                        value: 'handwriting',
                        description: 'Transcribe handwritten text with confidence rating',
                    },
                    {
                        name: 'ID Document',
                        value: 'id_document',
                        description: 'Extract personal data from passports, ID cards, and driving licences',
                    },
                    {
                        name: 'Invoice',
                        value: 'invoice',
                        description: 'Extract vendor, line items, tax breakdown, totals, and payment terms',
                    },
                    {
                        name: 'Payslip',
                        value: 'payslip',
                        description: 'Extract employer, employee, earnings, deductions, and net salary',
                    },
                    {
                        name: 'Purchase Order',
                        value: 'purchase_order',
                        description: 'Extract buyer, supplier, ordered items, and totals from purchase orders',
                    },
                    {
                        name: 'Receipt',
                        value: 'receipt',
                        description: 'Extract merchant, items, tax breakdown, totals, and payment method',
                    },
                ],
                default: 'invoice',
                description: 'Type of document — determines the extraction schema',
            },
        ],
    };
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            try {
                const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data');
                const documentType = this.getNodeParameter('documentType', itemIndex, 'invoice');
                // Validate documentType against known values (guards against crafted workflow JSON)
                if (!ALLOWED_DOCUMENT_TYPES.includes(documentType)) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Invalid document type: "${documentType}"`, { itemIndex });
                }
                // Get binary data
                const binaryData = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
                // Validate MIME type — case-insensitive; reject undefined/empty to prevent silent bypass
                if (!(0, errors_1.isValidMimeType)(binaryData.mimeType)) {
                    throw (0, errors_1.createFileTypeError)(this.getNode(), binaryData.mimeType ?? 'unknown', itemIndex);
                }
                // Early size check from metadata before loading the full buffer into memory (DoS prevention).
                // Only accepts strict digit strings — parseInt would partially parse "123abc" → 123 or "1e9" → 1,
                // which could let oversized files bypass this guard. Non-matching values fall through to the
                // authoritative buffer-length check below.
                const rawFileSize = binaryData.fileSize;
                const metaSize = typeof rawFileSize === 'string' && /^[0-9]+$/.test(rawFileSize)
                    ? Number(rawFileSize)
                    : 0;
                if (metaSize > 0 && Number.isFinite(metaSize) && !(0, errors_1.isValidFileSize)(metaSize)) {
                    throw (0, errors_1.createFileSizeError)(this.getNode(), metaSize, itemIndex);
                }
                // Load buffer
                const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
                // Authoritative size check on actual buffer length
                if (!(0, errors_1.isValidFileSize)(buffer.length)) {
                    throw (0, errors_1.createFileSizeError)(this.getNode(), buffer.length, itemIndex);
                }
                // Sanitize filename to prevent path traversal and homograph attacks in multipart headers
                const safeFilename = (0, errors_1.sanitizeFilename)(binaryData.fileName ?? 'document');
                // Make API request — document_type as query param, file as multipart.
                // When documentType is 'auto', omit the parameter entirely so the API
                // classifies the document automatically.
                const form = new FormData();
                form.append('file', new Blob([buffer], { type: binaryData.mimeType }), safeFilename);
                const rawResponse = await this.helpers.httpRequestWithAuthentication.call(this, 'deepOcrApi', {
                    method: 'POST',
                    url: API_ENDPOINT,
                    qs: documentType !== 'auto' ? { document_type: documentType } : {},
                    body: form,
                    // Spread into a fresh object so n8n's auth pipeline (which merges
                    // the credential's Authorization header into requestOptions.headers
                    // via Object.assign in some code paths) can't accumulate on the
                    // shared module-level constant across executions.
                    headers: { ...CLIENT_HEADERS },
                });
                // Validate response structure before accessing fields
                if (rawResponse === null || rawResponse === undefined || typeof rawResponse !== 'object') {
                    throw new n8n_workflow_1.NodeApiError(this.getNode(), { message: 'Unexpected response format from Deep-OCR API' }, { itemIndex });
                }
                const response = rawResponse;
                // API always returns structured JSON in response.content
                const content = response.content ?? {};
                returnData.push({
                    json: {
                        ...content,
                        filename: response.filename,
                        document_type: response.document_type,
                        metadata: response.metadata,
                    },
                    pairedItem: { item: itemIndex },
                });
            }
            catch (error) {
                if (this.continueOnFail()) {
                    const raw = error instanceof Error ? error.message : 'Unknown error occurred';
                    returnData.push({
                        json: { error: (0, errors_1.truncateErrorMessage)(raw) },
                        pairedItem: { item: itemIndex },
                    });
                    continue;
                }
                throw (0, errors_1.wrapUnknownError)(this.getNode(), error, itemIndex);
            }
        }
        return [returnData];
    }
}
exports.DeepOcr = DeepOcr;
//# sourceMappingURL=DeepOcr.node.js.map